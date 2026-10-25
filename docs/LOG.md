# Project Log

## 2026-10-25
- Read the project: FastAPI + Groq backend, single-file vanilla JS frontend. Servers start; `/` and the static page respond.
- Found blocker: `llama-3.3-70b-versatile` returns 404 for the current Groq key.
- Compared repo with the StudyPilot Voice PRD: only F1 (upload/extract) and F19 (PDF export) done, about 15% of P0. The PRD's duplicate `exportBtn` bug does not exist in this repo (it targets a different Node/Express codebase).
- Decisions: keep FastAPI (no rewrite to Express); use Gemini Flash instead of Groq; single seeded student, no login.
- Rewrote `backend/gemini.py` for Gemini (JSON mode, retry, 10-min cache). Updated `requirements.txt`. Not yet tested: no Gemini key available.
- Deleted untracked `backend/h.txt` and `frontend/python`.
- Scaffolded full structure: `backend/{config,db,schemas,retrieval,mastery,seed}.py`, `agents/` (8 modules), `routers/` (6), `frontend/{css,js}`, `docs/`, `samples/ml_notes.txt`.
- Committed `fbb12f3` and pushed `main` to github.com/visheshpandey/Eklavya (remote `eklavya`; `origin` still points at the upstream studyai repo).
- Reviewed hackathon-refs: OCR.Space (F16), Chart.js (progress graph), Free Dictionary (terms), IBM TTS / ResponsiveVoice (TTS fallbacks).

### Next
1. Add `GEMINI_API_KEY`; verify model ID; one test request.
2. Phase 1 voice.

## 2026-10-25 (voice v2)
- Requirement: voice must be a person-to-person conversation with tone/emotion, not a chatbot; video model planned for later.
- Researched options (web, vendor-sourced): Gemini Live native audio (Hindi, barge-in, tools; affective-dialog status unclear across docs), Sarvam Bulbul v3/v4 for Indic emotional TTS, Tavus / HeyGen LiveAvatar for avatars.
- Added PRD section 14-15 (voice tutor, video plan), rewrote ARCHITECTURE.md, scaffolded live.py, tools.py, tts.py, fallback/, voice_ws.py, presenter/emotion/audio-worklet JS, persona + taxonomy prompts, checklist items.

## 2026-10-25 (P2 backend: data, RAG, learning logic)
- Built: `db.py` (all tables + `quiz_questions`), `retrieval.py` (paragraph chunking + BM25, Hinglish stopwords), `mastery.py`, agents `document_intelligence` / `quiz` / `misconception` / `evaluation` / `study_mission` / `voice_tutor` / `learner_profile` / `logger`, routers for documents, tutor, quiz, missions, dashboard, demo seed; routers registered in `main.py`.
- Misconception diagnosis is deterministic first: every wrong option stored with its own misconception (seed questions curated), LLM only as second step; a Gemini failure raises (no generic fallback).
- Confidence for mastery falls back to the latest `learner_state` (voice tone) when the caller sends none.
- Tests: `backend/tests/test_core.py` (5 passing, LLM disabled): mastery math, answer parsing, chunking, upload, and the full demo journey (seed -> ask -> wrong answer -> misconception -> mission -> remediation -> resolved).
- Smoke-tested on a real uvicorn: seed, tutor ask, dashboard.
- NOT yet verified: any real Gemini call (no key): topic extraction, question top-up, tutor wording, mission wording and LLM misconception classification.
- Contracts for P3: `retrieval.retrieve`, `agents.quiz.next_question`, `agents.evaluation.grade`, `agents.study_mission.current`, `agents.logger.log_agent`, `db.save_learner_state`.

## 2026-10-25 (decision: Gemini only, no fallbacks)
- Decision: Gemini is the only model/vendor. Removed all fallback paths: heading-based topic fallback on upload, canned tutor/mission/misconception content, the Sarvam TTS and browser-speech cascade (deleted `tts.py`, `fallback/`), and the fallback chain from PRD V11 / architecture / team plan.
- Behaviour now: any Gemini failure raises `LLMError` -> HTTP 502 (voice: `error` message). Grading classifies before writing so a failure leaves no partial state.
- Seed demo still loads its own section titles as topics and curated questions; that is seed data, not a fallback.
- Tests use a Gemini test double (6 passing), including an outage test that asserts 502, no canned content and no DB writes.

## 2026-10-25 (P3 backend: voice, LLM, agents)
- Built: `persona_eklavya.md`; `tools.py` (5 Gemini function declarations + async dispatcher: search_notes, report_learner_state, ask_quiz_question, grade_answer, get_mission, each logging to agent_logs and emitting a UI event); `live.py` (Gemini Live session: audio both ways, input/output transcription, barge-in, tool-call loop, session cap, persisted `voice_sessions`/`transcripts`); `routers/voice_ws.py` (`WS /ws/voice`); config for `GEMINI_LIVE_MODEL`, voice, affective dialog, session cap; `scripts/check_gemini.py`.
- Events beyond the original contract (documented in TEAM_PLAN): `final` flag on transcripts, `quiz_question`, `turn_complete`, richer `mastery`/`mission`/`emotion` payloads, client `user_text` / `audio_stream_end` / `end`.
- Tests: `tests/test_live.py` (5, scripted fake of the Gemini Live session) + P2 tests = 11 passing, stable over 5 runs. These prove our event mapping, tool dispatch, barge-in, persistence and error handling.
- NOT verified (needs GEMINI_API_KEY): that the real Gemini Live API behaves as the fake does. Specifically unconfirmed: the live model ID (`gemini-3.8-live` is from one docs page; another says 3.1 Flash Live lacks affective dialog, so `LIVE_AFFECTIVE_DIALOG` defaults to false), Hindi/Hinglish voice quality, latency, function-calling behaviour, 15-minute audio session cap. Run `python backend/scripts/check_gemini.py` first.
- Note: `get_mission` and wrong-answer classification make a second (text) Gemini call inside a tool call, which adds latency to the spoken turn.

## 2026-10-25 (real Gemini check passed)
- `scripts/check_gemini.py` with the real key: text JSON call OK; Gemini Live OK on `gemini-3.8-live` (658,560 bytes of 24 kHz PCM audio back, mime `audio/pcm;rate=24000`, tools `search_notes` and `report_learner_state` called by the model, Hinglish reply grounded in the notes).
- Models on this key include `gemini-3.8-live`, `gemini-3.1-flash-live-preview`, `gemini-2.5-flash-native-audio-*`, `gemini-3.8-flash`, `gemini-flash-latest`. Defaults kept: `GEMINI_MODEL=gemini-flash-latest`, `GEMINI_LIVE_MODEL=gemini-3.8-live`.
- Observed: output transcription chunks can join without a space ("kitneactually"); watch for this when finalizing tutor text in `live.py` / the UI.
- Still unjudged: Hindi/Hinglish voice quality by ear, spoken latency, interrupt behaviour on a real mic, session limits.
