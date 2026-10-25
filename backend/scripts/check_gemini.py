"""Day-0 check of the real Gemini setup. Run from backend/:  python scripts/check_gemini.py

1. lists the models your key can use (so you can set GEMINI_MODEL / GEMINI_LIVE_MODEL)
2. one text JSON call with GEMINI_MODEL
3. one Gemini Live round trip with GEMINI_LIVE_MODEL: sends text, expects spoken audio back,
   and a tool call (search_notes) that we answer, then reports audio bytes + transcripts.
Nothing here is mocked; it needs GEMINI_API_KEY in backend/.env.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from google import genai  # noqa: E402
from google.genai import types  # noqa: E402

from app.ai.gemini import llm_json  # noqa: E402
from app.ai.live import build_config, build_system_prompt  # noqa: E402
from app.config import settings  # noqa: E402
from app.errors import LLMError  # noqa: E402


def step(title):
    print(f"\n=== {title}")


async def live_check(client):
    topics = [{"topic_name": "Precision"}, {"topic_name": "Recall"}]
    prompt = build_system_prompt("hinglish", topics)
    audio = 0
    transcript, calls = "", []
    async with client.aio.live.connect(model=settings.gemini_live_model, config=build_config(prompt)) as s:
        await s.send_realtime_input(text="Namaste! Mujhe precision samjhao, short mein.")
        for _ in range(3):  # a few turns: the model may call search_notes first
            async for m in s.receive():
                sc = m.server_content
                if sc is not None:
                    for p in (getattr(sc.model_turn, "parts", None) or []):
                        if p.inline_data and p.inline_data.data:
                            audio += len(p.inline_data.data)
                            rate = p.inline_data.mime_type
                    if sc.output_transcription and sc.output_transcription.text:
                        transcript += sc.output_transcription.text
                if m.tool_call:
                    resp = []
                    for fc in m.tool_call.function_calls:
                        calls.append(fc.name)
                        resp.append(types.FunctionResponse(name=fc.name, id=fc.id, response={
                            "found": True, "results": [{"topic": "Precision", "section": "Precision",
                                                        "text": "Precision = TP / (TP + FP): of everything predicted positive, how much was truly positive."}]}
                            if fc.name == "search_notes" else {"ok": True}))
                    await s.send_tool_response(function_responses=resp)
                if sc is not None and sc.turn_complete:
                    break
            if audio:
                break
    print(f"audio bytes received: {audio}  (mime: {rate if audio else 'n/a'})")
    print(f"tool calls made: {calls}")
    print(f"tutor said: {transcript!r}")
    return audio > 0


def main():
    if not settings.gemini_api_key:
        sys.exit("GEMINI_API_KEY is not set in backend/.env")
    client = genai.Client(api_key=settings.gemini_api_key, http_options=types.HttpOptions(api_version="v1beta"))

    step("models available to this key (flash / live / audio)")
    names = [m.name for m in client.models.list()]
    for n in names:
        if any(k in n.lower() for k in ("flash", "live", "audio")):
            print(" ", n)
    print(f"\nconfigured: GEMINI_MODEL={settings.gemini_model}  GEMINI_LIVE_MODEL={settings.gemini_live_model}")

    step("text JSON call")
    try:
        print(llm_json("Reply with valid JSON only.", 'Return {"ok": true, "word": "namaste"}', required_keys=("ok",)))
    except LLMError as e:
        print("FAILED:", e)

    step("Gemini Live round trip (voice + tool call)")
    try:
        ok = asyncio.run(live_check(client))
        print("LIVE OK" if ok else "LIVE connected but no audio came back")
    except Exception as e:  # noqa: BLE001
        print("LIVE FAILED:", type(e).__name__, e)
        print("Check GEMINI_LIVE_MODEL against the list above; set LIVE_AFFECTIVE_DIALOG=false if unsupported.")


if __name__ == "__main__":
    main()
