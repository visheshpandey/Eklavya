# StudyPilot Voice — Build Checklist

Stack: FastAPI + SQLite + Gemini Flash backend, vanilla JS frontend, browser speech APIs.
Legend: [x] done · [ ] todo · (P0 demo-critical, P1 nice, P2 later)

## Phase 0 — Unblock
- [x] Replace Groq with Gemini client (`backend/gemini.py`, `call_llm_json`)
- [x] JSON mode + one retry + 10-min cache (Gemini only, `LLMError` on failure, no fallback content)
- [x] Remove stray files, add `.env.example`, `samples/ml_notes.txt`
- [x] Full file structure scaffolded (stubs)
- [x] Pushed to github.com/visheshpandey/Eklavya
- [ ] Add `GEMINI_API_KEY` to `backend/.env`
- [ ] Confirm exact Gemini Flash model ID, run one test request
- [ ] Update `readme.md` (still describes Groq)

## Phase 1 — Language (F6); voice itself is "Voice v2" below (Gemini Live only)
- [ ] Language toggle English / Hindi / Hinglish sent with every request
- [ ] Load `css/` and `js/` modules from `index.html`

## Voice v2 — conversational tutor (PRD s14) · P0
- [x] Verified 2026-10-25 with a real key (text + Live + tool calls work; Hindi quality by ear and latency still to judge): run `python backend/scripts/check_gemini.py` (model IDs, Live audio + tool call, Hindi quality, free-tier limits, affective-dialog flag)
- [x] `persona_eklavya.md` written (still to tune by ear in AI Studio / a live session)
- [x] `live.py` + `routers/voice_ws.py` (WS proxy, barge-in)
- [x] `tools.py`: search_notes, report_learner_state, ask_quiz_question, grade_answer, get_mission
- [ ] Browser: AudioWorklet capture, PCM playback queue, interruption flush
- [ ] Emotion chips + live transcript
- [x] `learner_state` / `voice_sessions` / `transcripts` tables
- [x] Session cap + clear `error` on Gemini outage/quota (no other model)
- [ ] Demo checks: interrupt works; tone differs after wrong vs right answer

## Video v2 — avatar tutor (planned, later)
- [ ] Pick vendor (Tavus / HeyGen LiveAvatar): pricing, latency, Hindi lip-sync
- [ ] `presenter.js` AvatarPresenter + `routers/avatar.py`

## Phase 2 — Tutor + retrieval (F2, F3, F7) · P0
- [x] `db.py`: 9 tables + `init_db()`
- [x] `retrieval.py`: chunking + top-k keyword scoring
- [x] `POST /api/upload-document` (text, chunks, topics saved)
- [x] `POST /api/tutor/ask` (grounded answer, source, follow-up question)
- [x] Wire routers into `main.py`

## Phase 3 — Diagnose + plan (F8–F12) · P0
- [x] `POST /api/quiz/generate` on weakest topic
- [x] `POST /api/quiz/submit`: server-side grading (typed or spoken)
- [x] Misconception taxonomy + few-shot prompt, type and severity
- [x] `mastery.py`: +15*(1-m/100) correct, -10*confidence wrong, clamp 0-100
- [x] `POST /api/missions/generate` (title, duration, priority, reason, tasks)
- [x] `agents/logger.py` writes every step to `agent_logs`

## Phase 4 — Dashboard (F13, F14, F15)
- [x] `GET /api/dashboard` (P0)
- [ ] Mastery bars, weak topics, alerts, mission card, quiz history (P0)
- [ ] Decision log: observation -> diagnosis -> decision -> action -> result (P0)
- [ ] Progress graph with Chart.js (P1)

## Phase 5 — Demo polish
- [x] One-click seed (student at 38% on Precision/Recall)
- [ ] Separate demo Gemini API key (rate limits)
- [ ] Rehearse; full journey under 4 minutes
- [ ] Deploy to Render

## P1 / P2 (only if time)
- [ ] F16 image upload (OCR.Space or Gemini multimodal)
- [ ] F18 embeddings
- [ ] F20 login · F21 exam-date planning

## Demo acceptance (PRD s11) — all must pass live
- [ ] Upload ML notes; topics listed (Classification, Confusion Matrix, Precision, Recall, F1)
- [ ] Voice doubt in Hinglish; transcript shown
- [ ] Hinglish spoken explanation citing the notes
- [ ] Voice quiz question asked; spoken answer graded
- [ ] Wrong answer shows named misconception
- [ ] Mission card: Fix Precision vs Recall Confusion, 15 min, High
- [ ] After remediation mastery 38% -> 67%, misconception resolved
- [ ] Decision log shows full chain
- [ ] End to end under 4 minutes

## Open questions
- Hackathon name and deadline?
- Who owns frontend/voice, backend/agents, dashboard?
- Chrome with mic at the venue?
