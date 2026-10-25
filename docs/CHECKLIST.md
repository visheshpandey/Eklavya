# StudyPilot Voice — Build Checklist

Stack: FastAPI + SQLite + Gemini Flash backend, vanilla JS frontend, browser speech APIs.
Legend: [x] done · [ ] todo · (P0 demo-critical, P1 nice, P2 later)

## Phase 0 — Unblock
- [x] Replace Groq with Gemini client (`backend/gemini.py`, `call_llm_json`)
- [x] JSON mode + one retry + 10-min cache
- [x] Remove stray files, add `.env.example`, `samples/ml_notes.txt`
- [x] Full file structure scaffolded (stubs)
- [x] Pushed to github.com/visheshpandey/Eklavya
- [ ] Add `GEMINI_API_KEY` to `backend/.env`
- [ ] Confirm exact Gemini Flash model ID, run one test request
- [ ] Fallback response when the LLM fails
- [ ] Update `readme.md` (still describes Groq)

## Phase 1 — Browser voice (F4, F5, F6): now the FALLBACK path; primary is "Voice v2" below
- [ ] Mic button with SpeechRecognition (en-IN / hi-IN)
- [ ] Spoken answers with speechSynthesis; check Hindi voice on demo laptop
- [ ] Language toggle English / Hindi / Hinglish sent with every request
- [ ] Typed-input fallback for non-Chrome
- [ ] Load `css/` and `js/` modules from `index.html`

## Voice v2 — conversational tutor (PRD s14) · P0
- [ ] Verify Gemini Live model ID, Hindi quality, free-tier limits, affective-dialog flag
- [ ] `persona_eklavya.md` written and tested in AI Studio
- [ ] `live.py` + `routers/voice_ws.py` (WS proxy, barge-in)
- [ ] `tools.py`: search_notes, report_learner_state, ask_quiz_question, grade_answer, get_mission
- [ ] Browser: AudioWorklet capture, PCM playback queue, interruption flush
- [ ] Emotion chips + live transcript
- [ ] `learner_state` / `voice_sessions` / `transcripts` tables
- [ ] Cascade fallback + Sarvam TTS listening test
- [ ] Demo checks: interrupt works; tone differs after wrong vs right answer

## Video v2 — avatar tutor (planned, later)
- [ ] Pick vendor (Tavus / HeyGen LiveAvatar): pricing, latency, Hindi lip-sync
- [ ] `presenter.js` AvatarPresenter + `routers/avatar.py`

## Phase 2 — Tutor + retrieval (F2, F3, F7) · P0
- [ ] `db.py`: 9 tables + `init_db()`
- [ ] `retrieval.py`: chunking + top-k keyword scoring
- [ ] `POST /api/upload-document` (text, chunks, topics saved)
- [ ] `POST /api/tutor/ask` (grounded answer, source, follow-up question)
- [ ] Wire routers into `main.py`

## Phase 3 — Diagnose + plan (F8–F12) · P0
- [ ] `POST /api/quiz/generate` on weakest topic
- [ ] `POST /api/quiz/submit`: server-side grading (typed or spoken)
- [ ] Misconception taxonomy + few-shot prompt, type and severity
- [ ] `mastery.py`: +15*(1-m/100) correct, -10*confidence wrong, clamp 0-100
- [ ] `POST /api/missions/generate` (title, duration, priority, reason, tasks)
- [ ] `agents/logger.py` writes every step to `agent_logs`

## Phase 4 — Dashboard (F13, F14, F15)
- [ ] `GET /api/dashboard` (P0)
- [ ] Mastery bars, weak topics, alerts, mission card, quiz history (P0)
- [ ] Decision log: observation -> diagnosis -> decision -> action -> result (P0)
- [ ] Progress graph with Chart.js (P1)

## Phase 5 — Demo polish
- [ ] One-click seed (student at 38% on Precision/Recall)
- [ ] Cached fallback responses; separate demo API key
- [ ] Rehearse; full journey under 4 minutes
- [ ] Deploy to Render

## P1 / P2 (only if time)
- [ ] F16 image upload (OCR.Space or Gemini multimodal)
- [ ] F17 Whisper fallback · F18 embeddings
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
