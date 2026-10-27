"""Gemini Live (native audio) tutor session: browser <-> backend <-> Gemini.

Wire format with the browser (see docs/TEAM_PLAN.md):
  binary frames   mic audio in (PCM16 mono 16 kHz) / tutor audio out (PCM16 mono 24 kHz)
  JSON frames     transcript, emotion, interrupted, mastery, mission, quiz_question, turn_complete, error
  client JSON     {"type":"user_text","text":...} | {"type":"audio_stream_end"} | {"type":"end"}
Gemini is the only model; any failure is sent to the client as {"type":"error","message":...}.
"""
import asyncio
import base64
import binascii
import json
import re
import logging
from typing import Optional

from fastapi import WebSocket
from google import genai
from google.genai import types

from app import db
from app.ai import prompts
from app.ai.tools import ToolContext, dispatch, tools_for
from app.domain.scoring import VIVA_QUESTIONS
from app.config import settings

log = logging.getLogger(__name__)

INPUT_AUDIO_MIME = "audio/pcm;rate=16000"   # browser -> Gemini
PHOTO_TYPES = ("image/jpeg", "image/png", "image/webp")
MAX_PHOTO_BYTES = 4 * 1024 * 1024            # a phone photo after the browser shrinks it is far smaller
# markers Gemini's transcription sometimes writes instead of words, e.g. "<no speech>{pause}": never shown
TRANSCRIPT_MARKERS = re.compile(r"<\s*no speech\s*>|<\s*noise\s*>|\{\s*pause\s*\}", re.I)
FOCUSED_MODES = ("learn", "test", "revise", "viva", "debate")   # modes that need a topic
REVISE_QUESTIONS = 2
DEBATE_STYLES = {
    "tough": ("Tough opponent. Press hard on every weak spot, ask for proof every time, and concede almost nothing. "
              "Stay respectful."),
    "friendly": ("Friendly sparring partner. Still never agree by default and still argue your side every turn, but use "
                 "a lighter tone, one challenge per turn, and give the student a moment to think. Good for a first debate."),
}
LANGUAGE_NAMES = {"english": "English", "hindi": "Hindi", "hinglish": "Hinglish (Hindi and English mixed)"}


def session_plan(mode: str, topic_name: str, total: int = 3) -> str:
    """Extra instructions when the student picked a topic: teach it step by step, then test by voice."""
    if mode == "learn":
        return (f'# This session\'s plan: LEARN, then TEST. Topic: "{topic_name}"\n'
                f'The student chose to learn "{topic_name}". Follow these steps in order, in short spoken turns:\n'
                f'1. Right away call search_notes with "{topic_name}" and teach the topic from what it returns, in 3-4 small steps. '
                'One idea per turn, each with a simple everyday example. In EVERY step call show_board at the same moment you speak '
                '(the definition as steps, the formula with a worked example from the notes, or a small comparison table), so the '
                'student sees it while hearing it. After each step ask ONE quick question to check they got it, '
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
    if mode == "revise":
        return (f'# This session\'s plan: QUICK REVISION (about 5 minutes). Topic: "{topic_name}"\n'
                f'The student practised "{topic_name}" before and it is due for revision, so it does not fade.\n'
                f'1. Call search_notes for "{topic_name}", then call show_board with the single most important formula or idea '
                '(with a worked example from the notes) and recap it in two or three short sentences. No long lesson.\n'
                f'2. Then a {total}-question check: call ask_quiz_question, read the question and options, wait, call grade_answer, '
                'react in one line, next question.\n'
                '3. When a tool result says test_complete, say in one or two sentences how it went and that Eklavya will bring '
                'this topic back at the right time. Do not start anything new.\n'
                'Keep speaking the session language in every turn, the recap and the questions included.')
    return ""


def viva_plan(topic_name: str) -> str:
    return (f'# This session\'s plan: VIVA. Topic: "{topic_name}"\n'
            f'Take a {VIVA_QUESTIONS}-question viva on "{topic_name}" only.\n'
            '1. Greet the student in one line like an examiner, say there will be five questions and a report card at the end, '
            'and ask if they are ready.\n'
            f'2. Call search_notes for "{topic_name}". Then for each of the {VIVA_QUESTIONS} questions: ask it aloud and call '
            'ask_viva_question at the same time, listen, probe at most twice, call mark_viva_answer, say a neutral one-liner, '
            'move on.\n'
            '3. After the last mark call finish_viva with honest strengths and one thing to improve, then tell the student '
            'their marks out of ten, what went well and what to work on, warmly. That is the only time you may encourage them.')


def debate_scoring_rules() -> str:
    return ("\n\n# Scoring (silent)\n"
            "- Right after each argument the student makes, call score_argument with fair 0-10 scores for evidence, logic and "
            "rebuttal. Never say the scores aloud; they appear on the student's screen.\n"
            "- After both closing statements and before the verdict, call finish_debate with honest overall scores for the "
            "student and for yourself. If the student argued better, say so: an honest verdict is part of the game.")


def debate_plan(topic_name: str, side: str, motion: str) -> str:
    """The debate rules for the live tutor: the topic, which side it argues, and the motion (or ask it to pick one)."""
    stated = motion or f'none given, so pick one clear, debatable one-sentence motion about "{topic_name}" and say it in your first turn'
    return (prompts.load("debate_plan.md").replace("{{TOPIC}}", topic_name)
            .replace("{{SIDE}}", side).replace("{{MOTION}}", stated))


def build_system_prompt(language: str, topics: list, mode: str = "free", focus_topic: Optional[dict] = None,
                        debate: Optional[dict] = None) -> str:
    persona = "persona_eklavya.md"
    plan = ""
    if focus_topic and mode in ("learn", "test"):
        plan = session_plan(mode, focus_topic["topic_name"])
    elif focus_topic and mode == "revise":
        plan = session_plan(mode, focus_topic["topic_name"], REVISE_QUESTIONS)
    elif focus_topic and mode == "viva":
        persona, plan = "persona_examiner.md", viva_plan(focus_topic["topic_name"])
    elif focus_topic and mode == "debate" and debate:
        persona = "persona_debater.md"
        plan = debate_plan(focus_topic["topic_name"], debate["side"], debate["motion"]) + debate_scoring_rules()
    style = DEBATE_STYLES.get((debate or {}).get("style"), DEBATE_STYLES["tough"])
    return (prompts.load(persona).replace("{{LANGUAGE}}", LANGUAGE_NAMES.get(language, LANGUAGE_NAMES["hinglish"]))
            .replace("{{TOPICS}}", ", ".join(t["topic_name"] for t in topics) or "not specified")
            .replace("{{STYLE}}", style)
            .replace("{{SESSION_PLAN}}", plan))


def opening_message(language: str, mode: str, focus_topic: Optional[dict]) -> str:
    lang = LANGUAGE_NAMES.get(language, "Hinglish")
    if focus_topic and mode == "debate":
        return (f'[The student wants to debate "{focus_topic["topic_name"]}" with you. Say one short, friendly, competitive line in {lang}, '
                'then give your opening statement right away.]')
    if focus_topic and mode == "learn":
        return (f'[The student chose to learn "{focus_topic["topic_name"]}". Say one short friendly line in {lang} that you will '
                'teach it step by step and then take a short voice test. Then start step 1 right away: call search_notes, then '
                'call show_board with the first idea (a formula with a worked example, or the definition as steps) and talk '
                'the student through the board. Keep using show_board in every step after this.]')
    if focus_topic and mode == "test":
        return (f'[The student chose to be tested on "{focus_topic["topic_name"]}" by voice. Say one short line in {lang}, '
                'then start the test.]')
    if focus_topic and mode == "revise":
        return (f'[Quick revision of "{focus_topic["topic_name"]}". Say one short line in {lang}, then call search_notes and '
                f'show_board right away and give the recap, all in {lang}.]')
    if focus_topic and mode == "viva":
        return (f'[The student is ready for a viva on "{focus_topic["topic_name"]}". Greet them as the examiner in one line in '
                f'{lang} and begin.]')
    return (f"[The student just joined. Greet them warmly in {lang}, in one or two short sentences, "
            "and ask what they want to work on.]")


def build_config(system_prompt: str, tools=None) -> types.LiveConnectConfig:
    kwargs = dict(
        response_modalities=["AUDIO"],
        system_instruction=system_prompt,
        tools=tools or tools_for("free"),
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


def default_connect(system_prompt: str, tools=None):
    """Real Gemini Live connection (an async context manager). Replaced in tests."""
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not set in backend/.env")
    client = genai.Client(api_key=settings.gemini_api_key, http_options=types.HttpOptions(api_version="v1beta"))
    return client.aio.live.connect(model=settings.gemini_live_model, config=build_config(system_prompt, tools))


class LiveTutorSession:
    def __init__(self, ws: WebSocket, user_id: int, language: str, document_id: Optional[int],
                 topics: list, connect=None, mode: str = "free", focus_topic: Optional[dict] = None,
                 debate: Optional[dict] = None):
        self.ws, self.user_id, self.language = ws, user_id, language
        self.topics = topics
        self.mode, self.focus_topic, self.debate = mode, focus_topic, debate   # debate: {"side": "for"|"against", "motion": str}
        self.connect = connect or default_connect
        self.ctx = ToolContext(user_id=user_id, document_id=document_id, emit=self.emit, topics=topics,
                               focus_topic_id=focus_topic["id"] if focus_topic else None, mode=mode, debate=debate,
                               test_total=REVISE_QUESTIONS if mode == "revise" else 3)
        self.user_buf, self.tutor_buf = "", ""
        self.shown = {"user": False, "tutor": False}   # a partial bubble for this role is on screen and needs a final
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
        text = TRANSCRIPT_MARKERS.sub("", buf).strip()
        if role == "user":
            self.user_buf = ""
        else:
            self.tutor_buf = ""
        if text:
            await asyncio.to_thread(db.execute, "INSERT INTO transcripts (session_id, role, text) VALUES (?, ?, ?)",
                                    (self.session_id, role, text))
            await self.emit({"type": "transcript", "role": role, "text": text, "final": True})
        elif self.shown[role]:
            # the turn was only a marker such as "<no speech>": tell the browser to drop the bubble it started
            await self.emit({"type": "transcript", "role": role, "text": "", "final": True})
        self.shown[role] = False

    async def _partial(self, role: str, chunk: str):
        """Stream one transcript chunk. Markers can arrive split over chunks ("<no" + " speech>"), so the text shown is
        the cleaned whole turn so far, sent as a replacement, never the raw chunk."""
        buf = self.user_buf if role == "user" else self.tutor_buf
        text = TRANSCRIPT_MARKERS.sub("", buf)
        text = re.sub(r"<[^>]*$", "", text)     # an unfinished "<no sp..." at the end waits for the next chunk
        if text.strip():
            await self.emit({"type": "transcript", "role": role, "text": text.strip(), "final": False, "replace": True})
            self.shown[role] = True

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
                await self._partial("user", it.text)
            ot = getattr(sc, "output_transcription", None)
            if ot is not None and getattr(ot, "text", None):
                await self._final("user")
                self.tutor_buf += ot.text
                await self._partial("tutor", ot.text)
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
                    await self._final("tutor")       # close Eklavya's open bubble first, so the typed turn lands after it
                    self.user_buf = text
                    await self._final("user")
                    await session.send_realtime_input(text=text)
                elif kind == "photo":
                    await self._send_photo(session, data)

    async def _send_photo(self, session, data: dict):
        """A photo from the student's camera or files ("snap a doubt"), sent as a normal user turn (image + instruction).

        Not as a realtime video frame: Gemini Live ignores a single frame sent that way ("I cannot see the image"),
        checked against the real API; a client-content turn with the image part is seen and read correctly."""
        mime = str(data.get("mime", ""))
        try:
            raw = base64.b64decode(str(data.get("data", "")), validate=True)
        except (binascii.Error, ValueError):
            raw = b""
        if mime not in PHOTO_TYPES or not raw or len(raw) > MAX_PHOTO_BYTES:
            await self.emit({"type": "error", "message": "That photo could not be sent. Use a JPG, PNG or WebP under 4 MB."})
            return
        note = " ".join(str(data.get("note", "")).split())[:300]
        instruction = ("[The student just showed you this photo (a textbook page, notes or a question). Look at it carefully. "
                       "Say in one line what you see, then help with it: if it is a question, guide them to solve it step by "
                       "step; use show_board for any formula or working." + (f' The student said: "{note}"' if note else "") + "]")
        await session.send_client_content(
            turns=types.Content(role="user", parts=[types.Part.from_bytes(data=raw, mime_type=mime), types.Part(text=instruction)]),
            turn_complete=True)

    async def _save_ending(self):
        await self._final("user")
        await self._final("tutor")
        self.closed = True       # nothing more goes to the browser; what is left is saving what happened
        # a direct write, not a thread: it is one tiny UPDATE, and it must not depend on the event loop's executor
        # still being alive while the connection is being torn down
        db.execute("UPDATE voice_sessions SET ended_at = CURRENT_TIMESTAMP, turns = ? WHERE id = ?", (self.turns, self.session_id))

    async def run(self):
        self.session_id = await asyncio.to_thread(
            db.execute, "INSERT INTO voice_sessions (user_id, mode, language, study_mode, topic_id) VALUES (?, ?, ?, ?, ?)",
            (self.user_id, "gemini-live", self.language, self.mode, self.focus_topic["id"] if self.focus_topic else None))
        try:
            prompt = build_system_prompt(self.language, self.topics, self.mode, self.focus_topic, self.debate)
            async with self.connect(prompt, tools_for(self.mode)) as session:
                if self.focus_topic and self.mode in ("learn", "test"):
                    await self.emit({"type": "phase", "phase": "teaching" if self.mode == "learn" else "test",
                                     "topic": self.focus_topic["topic_name"]})
                elif self.focus_topic and self.mode == "debate" and self.debate:
                    await self.emit({"type": "phase", "phase": "debate", "topic": self.focus_topic["topic_name"],
                                     "side": self.debate["side"], "motion": self.debate["motion"],
                                     "style": self.debate.get("style", "tough")})
                elif self.focus_topic and self.mode in ("viva", "revise"):
                    await self.emit({"type": "phase", "phase": self.mode, "topic": self.focus_topic["topic_name"]})
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
            # shielded: if this handler is cancelled (server shutdown, a dropped connection) the end time and the turn
            # count are still written, so the session is never left looking unfinished
            await asyncio.shield(self._save_ending())


class _SessionEnded(Exception):
    pass
