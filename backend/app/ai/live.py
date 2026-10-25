"""Gemini Live (native audio) tutor session: browser <-> backend <-> Gemini.

Wire format with the browser (see docs/TEAM_PLAN.md):
  binary frames   mic audio in (PCM16 mono 16 kHz) / tutor audio out (PCM16 mono 24 kHz)
  JSON frames     transcript, emotion, interrupted, mastery, mission, quiz_question, turn_complete, error
  client JSON     {"type":"user_text","text":...} | {"type":"audio_stream_end"} | {"type":"end"}
Gemini is the only model; any failure is sent to the client as {"type":"error","message":...}.
"""
import asyncio
import json
import logging
from typing import Optional

from fastapi import WebSocket
from google import genai
from google.genai import types

from app import db
from app.ai import prompts
from app.ai.tools import TOOLS, ToolContext, dispatch
from app.config import settings

log = logging.getLogger(__name__)

INPUT_AUDIO_MIME = "audio/pcm;rate=16000"   # browser -> Gemini
LANGUAGE_NAMES = {"english": "English", "hindi": "Hindi", "hinglish": "Hinglish (Hindi and English mixed)"}


def session_plan(mode: str, topic_name: str, total: int = 3) -> str:
    """Extra instructions when the student picked a topic: teach it step by step, then test by voice."""
    if mode == "learn":
        return (f'# This session\'s plan: LEARN, then TEST. Topic: "{topic_name}"\n'
                f'The student chose to learn "{topic_name}". Follow these steps in order, in short spoken turns:\n'
                f'1. Right away call search_notes with "{topic_name}" and teach the topic from what it returns, in 3-4 small steps. '
                'One idea per turn, each with a simple everyday example. After each step ask ONE quick question to check they got it, '
                'wait for their answer, and adapt if they are confused.\n'
                f'2. When the topic is covered, say you will now take a short voice test ({total} questions) and check they are ready.\n'
                '3. Test: call ask_quiz_question (it stays on this topic), read the question and the four options, wait for the spoken '
                'answer, call grade_answer, then react as described in Quiz mode. Then ask the next question.\n'
                '4. When a tool result says test_complete, give a short warm spoken summary of how they did, then call get_mission '
                'and tell them what to do next.\n'
                'Do not skip steps and do not start the test before teaching.')
    if mode == "test":
        return (f'# This session\'s plan: TEST. Topic: "{topic_name}"\n'
                f'The student chose to be tested on "{topic_name}" by voice ({total} questions). Do not teach first.\n'
                '1. Say one short line that you will start, then call ask_quiz_question, read the question and the four options, '
                'wait for the spoken answer, call grade_answer, react as described in Quiz mode, and ask the next question.\n'
                '2. When a tool result says test_complete, give a short warm spoken summary, then call get_mission and tell them what to do next.')
    return ""


def build_system_prompt(language: str, topics: list, mode: str = "free", focus_topic: Optional[dict] = None) -> str:
    text = prompts.load("persona_eklavya.md")
    plan = session_plan(mode, focus_topic["topic_name"]) if focus_topic and mode in ("learn", "test") else ""
    return (text.replace("{{LANGUAGE}}", LANGUAGE_NAMES.get(language, LANGUAGE_NAMES["hinglish"]))
                .replace("{{TOPICS}}", ", ".join(t["topic_name"] for t in topics) or "not specified")
                .replace("{{SESSION_PLAN}}", plan))


def opening_message(language: str, mode: str, focus_topic: Optional[dict]) -> str:
    lang = LANGUAGE_NAMES.get(language, "Hinglish")
    if focus_topic and mode == "learn":
        return (f'[The student chose to learn "{focus_topic["topic_name"]}". Say one short friendly line in {lang} that you will '
                'teach it step by step and then take a short voice test, then start step 1 right away.]')
    if focus_topic and mode == "test":
        return (f'[The student chose to be tested on "{focus_topic["topic_name"]}" by voice. Say one short line in {lang}, '
                'then start the test.]')
    return (f"[The student just joined. Greet them warmly in {lang}, in one or two short sentences, "
            "and ask what they want to work on.]")


def build_config(system_prompt: str) -> types.LiveConnectConfig:
    kwargs = dict(
        response_modalities=["AUDIO"],
        system_instruction=system_prompt,
        tools=TOOLS,
        speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=settings.live_voice))),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        realtime_input_config=types.RealtimeInputConfig(
            automatic_activity_detection=types.AutomaticActivityDetection(silence_duration_ms=700)),
    )
    if settings.live_affective_dialog:
        kwargs["enable_affective_dialog"] = True
    return types.LiveConnectConfig(**kwargs)


def default_connect(system_prompt: str):
    """Real Gemini Live connection (an async context manager). Replaced in tests."""
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not set in backend/.env")
    client = genai.Client(api_key=settings.gemini_api_key, http_options=types.HttpOptions(api_version="v1beta"))
    return client.aio.live.connect(model=settings.gemini_live_model, config=build_config(system_prompt))


class LiveTutorSession:
    def __init__(self, ws: WebSocket, user_id: int, language: str, document_id: Optional[int],
                 topics: list, connect=None, mode: str = "free", focus_topic: Optional[dict] = None):
        self.ws, self.user_id, self.language = ws, user_id, language
        self.topics = topics
        self.mode, self.focus_topic = mode, focus_topic
        self.connect = connect or default_connect
        self.ctx = ToolContext(user_id=user_id, document_id=document_id, emit=self.emit, topics=topics,
                               focus_topic_id=focus_topic["id"] if focus_topic else None, mode=mode)
        self.user_buf, self.tutor_buf = "", ""
        self.turns = 0
        self.session_id = None
        self.closed = False

    # ---- browser-facing helpers
    async def emit(self, event: dict):
        if self.closed:
            return
        try:
            await self.ws.send_json(event)
        except Exception:  # noqa: BLE001 - the browser disconnected mid-send
            log.debug("Client gone while sending event %s", event.get("type"))
            self.closed = True

    async def _send_audio(self, data: bytes):
        if self.closed:
            return
        try:
            await self.ws.send_bytes(data)
        except Exception:  # noqa: BLE001 - the browser disconnected mid-send
            log.debug("Client gone while sending audio")
            self.closed = True

    async def _final(self, role: str):
        buf = self.user_buf if role == "user" else self.tutor_buf
        text = buf.strip()
        if role == "user":
            self.user_buf = ""
        else:
            self.tutor_buf = ""
        if text:
            await asyncio.to_thread(db.execute, "INSERT INTO transcripts (session_id, role, text) VALUES (?, ?, ?)",
                                    (self.session_id, role, text))
            await self.emit({"type": "transcript", "role": role, "text": text, "final": True})

    # ---- Gemini -> browser
    async def _handle(self, session, msg):
        sc = getattr(msg, "server_content", None)
        if sc is not None:
            if getattr(sc, "interrupted", False):
                await self._final("tutor")
                await self.emit({"type": "interrupted"})
            it = getattr(sc, "input_transcription", None)
            if it is not None and getattr(it, "text", None):
                self.user_buf += it.text
                await self.emit({"type": "transcript", "role": "user", "text": it.text, "final": False})
            ot = getattr(sc, "output_transcription", None)
            if ot is not None and getattr(ot, "text", None):
                await self._final("user")
                self.tutor_buf += ot.text
                await self.emit({"type": "transcript", "role": "tutor", "text": ot.text, "final": False})
            mt = getattr(sc, "model_turn", None)
            for part in (getattr(mt, "parts", None) or []):
                inline = getattr(part, "inline_data", None)
                if inline is not None and getattr(inline, "data", None):
                    await self._final("user")
                    await self._send_audio(inline.data)
            if getattr(sc, "turn_complete", False):
                await self._final("user")
                await self._final("tutor")
                self.turns += 1
                await self.emit({"type": "turn_complete"})

        tc = getattr(msg, "tool_call", None)
        if tc is not None and getattr(tc, "function_calls", None):
            responses = []
            for fc in tc.function_calls:
                result = await dispatch(self.ctx, fc.name, dict(fc.args or {}))
                responses.append(types.FunctionResponse(name=fc.name, id=fc.id, response=result))
            await session.send_tool_response(function_responses=responses)

        if getattr(msg, "go_away", None) is not None:
            await self.emit({"type": "error", "message": "Gemini is ending this voice session. Please start it again."})
            raise _SessionEnded()

    async def _gemini_to_browser(self, session):
        while True:  # receive() yields one turn at a time
            async for msg in session.receive():
                await self._handle(session, msg)

    # ---- browser -> Gemini
    async def _browser_to_gemini(self, session):
        while True:
            m = await self.ws.receive()
            if m["type"] == "websocket.disconnect":
                return
            if m.get("bytes"):
                await session.send_realtime_input(audio=types.Blob(data=m["bytes"], mime_type=INPUT_AUDIO_MIME))
            elif m.get("text"):
                try:
                    data = json.loads(m["text"])
                except ValueError:
                    log.debug("Ignoring a client message that is not valid JSON")
                    continue
                kind = data.get("type")
                if kind == "end":
                    return
                if kind == "audio_stream_end":
                    await session.send_realtime_input(audio_stream_end=True)
                elif kind == "user_text" and str(data.get("text", "")).strip():
                    text = str(data["text"]).strip()
                    self.user_buf = text
                    await self._final("user")
                    await session.send_realtime_input(text=text)

    async def run(self):
        self.session_id = await asyncio.to_thread(
            db.execute, "INSERT INTO voice_sessions (user_id, mode, language) VALUES (?, ?, ?)",
            (self.user_id, "gemini-live", self.language))
        try:
            prompt = build_system_prompt(self.language, self.topics, self.mode, self.focus_topic)
            async with self.connect(prompt) as session:
                if self.focus_topic and self.mode in ("learn", "test"):
                    await self.emit({"type": "phase", "phase": "teaching" if self.mode == "learn" else "test",
                                     "topic": self.focus_topic["topic_name"]})
                await session.send_realtime_input(text=opening_message(self.language, self.mode, self.focus_topic))
                tasks = [asyncio.create_task(self._gemini_to_browser(session)),
                         asyncio.create_task(self._browser_to_gemini(session)),
                         asyncio.create_task(asyncio.sleep(settings.session_cap_seconds))]
                try:
                    done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                    for t in done:
                        if t is tasks[2]:
                            await self.emit({"type": "error", "message": "Session time limit reached. Start a new session to continue."})
                        else:
                            exc = t.exception()
                            if exc is not None and not isinstance(exc, _SessionEnded):
                                raise exc
                finally:
                    for t in tasks:
                        t.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)
        except Exception as e:  # noqa: BLE001 - tell the client, never hide it
            log.exception("Live session failed")
            await self.emit({"type": "error", "message": f"Gemini Live failed: {e}"})
        finally:
            await self._final("user")
            await self._final("tutor")
            await asyncio.to_thread(
                db.execute, "UPDATE voice_sessions SET ended_at = CURRENT_TIMESTAMP, turns = ? WHERE id = ?",
                (self.turns, self.session_id))
            self.closed = True


class _SessionEnded(Exception):
    pass
