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

## 2026-10-25 (frontend + real Live verification)
- New frontend (`frontend/index.html`, `css/styles.css`, `js/{api,dom,voice,audio-worklet,emotion,quiz,mission,dashboard,language,app}.js`): orb to start/stop a Gemini Live session, live transcript bubbles, emotion meters, tappable quiz card, mastery bars, misconception alerts, mission card, decision log. Old summary page kept as `legacy.html`. JS syntax-checked; mic/speaker behaviour NOT tested (no mic available to the agent).
- Real Gemini Live check through our app, typed input: Hinglish greeting (~0.8-1.3 s to first audio), notes-grounded explanation with spoken numbers, quiz read aloud with options, server-side grading via tool, spoken reaction naming the confusion, emotion reports, barge-in works.
- Findings: a tool call ends the model's turn with `turn_complete`; the spoken reply arrives in the next turn (UI handles this, since `turn_complete` just refreshes the dashboard). The tutor repeated its greeting after calling report_learner_state on it -> persona now forbids that.
- Text model switched to `gemini-3.1-flash-lite` (`gemini-flash-latest` and `gemini-3.x-flash` returned 503/timeouts under load); Gemini calls now time out after 30 s (-> 502).
- Gotcha: `uvicorn --reload` left an old server child bound to port 5000; kill all python uvicorn processes before restarting.
- Demo numbers: from 38%, three correct answers reach ~57%, not the PRD's 67%; tune seed/start values if the story must match exactly.

## 2026-10-25 (learn-then-test flow)
- Problem reported: choosing a topic did nothing and the tutor was an open chat; the student wants "teach me the topic, then test me by voice".
- Built: `GET /api/topics/{id}` (notes, mastery, open misconceptions); WS params `mode=learn|test` + `topic_id`; a session plan injected into the persona (teach in 3-4 steps -> 3-question voice test -> spoken summary -> mission); tools keep the quiz on the chosen topic, never repeat a question, report test completion; new events `phase`, `test_summary`, numbered `quiz_question`.
- Frontend: tap a topic -> notes card with "Teach me this, then test me (voice)" / "Just test me (voice)"; phase bar, question n of 3, summary card, recent-answers list, labelled decision log (Saw / Decided / Did).
- Tests: 16 passing (new `tests/test_learn.py`).
- PRD check (original PRD vs build) gaps still open: PDF export of the study pack (F19; only in legacy.html), progress graph over time (F15, US7), image upload (F16), seed mastery maths does not reach 38 -> 67 (about 57 after 3 correct), decision log has no explicit "result" step, mission title is Gemini-written (not always "Fix Precision vs Recall Confusion").

## 2026-10-25 (codebase restructure)
- Request: clean structure, separate logic from UI, remove dead/duplicate code, consistent naming, proper error handling, config separated from code, modular components, state management, documentation.
- Backend: flat modules moved (git mv, history kept) into `backend/app/{api, services, agents, domain, ai, prompts}`; `backend/main.py` is now a shim so `uvicorn main:app` and `python main.py` still work. Layering: api -> services/agents -> domain/db/ai.
- Config: `app/config.py` is the only reader of environment variables (frozen `Settings`, validated, fail-fast `ConfigError`); new settings HOST, PORT, RELOAD, CORS_ORIGINS, LOG_LEVEL, MAX_UPLOAD_MB, GEMINI_TIMEOUT_MS, DEMO_USER_ID, DB_PATH, SAMPLES_DIR; `.env.example` documents all.
- Errors: `app/errors.py` (BadRequest 400, NotFound 404, PayloadTooLarge 413, LLM 502) + handlers so every failure is `{"error","code"}`; 422 validation names fields; unexpected errors are logged and answered generically; DB writes roll back; PDF/upload validation (type, size, unreadable); blocking Gemini work moved off the event loop (`run_in_threadpool`) so it cannot stall the voice WebSocket; prompts loaded via a cached loader with a clear missing-file error.
- Dead code removed: legacy summary page + `/api/generate`, `build_prompt`/`generate_study_content`, unused `learner_profile` agent, stale `master_prompt.md`, empty frontend stubs (`tutor.js`, `presenter.js`, `language.js`), duplicated LABELS, repeated try/except boilerplate in routes.
- Frontend: split into `lib/ services/ state/ controllers/ components/`; one-way flow (click/event -> controller -> action -> reducer -> store -> component); pure reducer + tiny store; 15 single-purpose components; `config.js` holds the backend URL (`?api=` overrides); `serve.py` now uses a threaded server (the earlier single-threaded version stalled Chrome's parallel connections).
- Tests: backend 25 (new `test_errors.py`), frontend 31 (`npm test`: reducer, store, controllers, API client).
- Docs: new `docs/CODEBASE.md`, rewritten readme, architecture paths updated.

## 2026-10-25 (several notes documents; real PDFs)
- Report: after uploading a syllabus PDF the page still showed the old ML topics mixed with the new ones, and the topics had no notes.
- Causes found: (1) the dashboard listed topics of every document with no grouping, and the tutor searched only the newest document, so tapping an older topic failed with "Pick a topic"; (2) a PDF without blank lines became ONE 4,400-word chunk, so only one topic had notes; (3) only the first 8,000 characters were sent for topics (8 topics for a 6-subject booklet); (4) PDF glyph junk ("&amp;", bullets, broken apostrophes); (5) Gemini sometimes answers a quiz request with a bare list, which failed validation.
- Fixes: topics grouped per document with Remove (`DELETE /api/documents/{id}`); learn/test use the topic's own document, free chat searches all notes; demo seed replaces only the demo document; marker/sentence chunking (51 chunks instead of 1 for the real syllabus); whole-document topic extraction (30 topics across 6 subjects); weighted topic assignment; closest-passages fallback; PDF text clean-up; list-or-object parsing; background question warm-up; UI shows "Test questions are written from your notes" instead of "0 ready", no duplicated unit titles.
- Verified with the user's real syllabus text through the real UI + real Gemini: upload, topic notes differ per topic, Remove, and teach-then-test on "TOC: Turing Machines" (question from the notes, graded, mastery 50 -> 57.5). Tests: backend 53, frontend 37.
- To use it on the existing data: press Remove next to `5th sem_syllabus.pdf` and upload the PDF again (the old copy was stored as one chunk and is not reprocessed automatically).
- Observed: Gemini sometimes times out (504, 30 s limit); a retry usually succeeds. Browser test harness flaked twice (page made no API calls); the app itself was fine on reruns.
- Remove on a notes group is now a visible button with an in-page confirmation (Yes, remove / Cancel) instead of a small link plus a browser pop-up that can be blocked.

## 2026-10-25 (microphone error, Gemini retries, stricter topic filing)
- Report: "Could not start the microphone: Cannot read properties of null (reading 'audioWorklet')" after tapping Teach me / Test me.
- Cause: `VoiceClient` cleanup was per-instance, so a slow leftover from an OLD session (its socket's `close` event, or a start cancelled while the mic prompt was open) wiped the audio objects of the NEW session while it was starting.
- Fix: sessions are numbered; every async continuation checks it is still the current session and releases only its own resources; a socket's handlers act only if it is still the live socket; a start cancelled by stop() resolves quietly. Teardown helper also swallows rejected promises (closing a closed AudioContext rejects).
- Tests: `tests/voice-client.test.js` (8, fake audio/socket/mic; 3 of them fail on the old code with the exact reported message) + a real-Chrome run: quick double start, switching topic/mode mid-session, stop right after start, fresh start after that, console clean.
- Gemini: up to 3 attempts with a growing pause for transient errors (503/504/429/overloaded); whole-document topic extraction uses `GEMINI_LONG_TIMEOUT_MS` (90 s) instead of 30 s.
- Topic filing: a chunk is filed under a topic only when >= 50% of the topic's weighted words match (heading words count 3x); weak one-word matches stay unfiled; the closest-passages fallback drops runner-ups scoring under 40% of the best.
- Tests now: backend 58, frontend 45.

## Frontend redesign: three sections, design tokens, accessible chart
- Information architecture: Notes (sidebar on wide screens), Study, Progress; bottom tab bar on phones. State: `ui.view`, library search, collapsed documents, theme.
- Styles split into `tokens.css`, `base.css`, `layout.css`, `components.css`; light/dark/system theme toggle; Phosphor icons inline.
- New components: library, study-header, stepper, nav-tabs, theme-toggle, announcer, mastery-chart (SVG, hover + arrow keys, table view). Old mastery-list, topic-card, phase-bar removed.
- `/api/dashboard` progress rows now carry attempt id, topic name and before/after mastery for the chart.
- Fix: `.gitignore` ignored every `lib/` folder, so `frontend/js/lib/*` was never committed; the rule is now anchored to the repo root.
- Checks: axe-core 0 violations (desktop light/dark, tablet, phone), no horizontal scroll, all controls at least 44 px. Tests: backend 59, frontend 56. See `docs/DESIGN.md`.

## Debate mode
- Student and Eklavya debate a topic by voice. `Debate Eklavya on this topic` panel in the Study section: choose which side Eklavya argues, optionally type a motion (otherwise Eklavya states one), start.
- Backend: `mode=debate&side=&motion=` on `/ws/voice`; rules in `app/prompts/debate_plan.md` (notes as evidence, opening, three rebuttal exchanges, closing, spoken verdict with one strength and one improvement); `phase` event carries side and motion. No quiz warm-up in this mode.
- Frontend: `SESSION_MODE.DEBATE`, `onDebate` flow, `debate-tag` component (motion and side while the debate runs).
- Verified in real Chrome with the real Gemini Live: tag shown, Eklavya opens with a notes-based argument, a typed rebuttal gets a counter-argument. Tests: backend 62, frontend 59.
