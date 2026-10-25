# Team Plan — 3 people, 1 chunk each

| Person | Chunk |
|---|---|
| **P1 — Frontend** | The whole frontend |
| **P2 — Backend half 1** | Data, RAG and learning logic |
| **P3 — Backend half 2** | Voice, LLM and agents |

Nobody waits: P1 builds against **mock JSON**, P3 uses **stubs** for P2's functions until they land. Contracts at the bottom are frozen on Day 0.

## Day 0 — all three (1–2 h)
- [ ] Add `GEMINI_API_KEY`; P3 confirms text + Live model IDs
- [ ] Freeze contracts (bottom) in `backend/schemas.py`
- [ ] Branches `fe`, `be-data`, `be-voice`; merge to `main` often
- [ ] Agree demo script and seed data

## P1 — Frontend (everything in `frontend/`)
- [ ] Split `index.html` into `css/` + `js/` modules; `api.js`; app shell with tabs Talk / Quiz / Mission / Dashboard
- [ ] Upload screen + topic list
- [ ] Language toggle (English / Hindi / Hinglish)
- [ ] Voice: `audio-worklet.js` + `voice.js` (mic -> PCM, WebSocket, playback queue, barge-in flush); live transcript
- [ ] `emotion.js`: emotion chips per student turn
- [ ] Voice quiz UI, mastery before/after animation, mission card
- [ ] Dashboard: mastery bars, weak topics, alerts, decision log, quiz history, Chart.js progress graph
- [ ] Show Gemini errors clearly (`error` message / HTTP 502) with a retry button; typed-text input goes to the same Gemini session; escape all model output
- [ ] `presenter.js` interface (audio-only now, avatar later)
- [ ] Done when: the full demo journey runs in the UI against real endpoints

## P2 — Backend half 1: Data, RAG, learning logic
- [ ] `db.py`: all tables incl. `learner_state`, `voice_sessions`, `transcripts`
- [ ] `retrieval.py`: chunking + BM25 + 10-question test set (8/10 must hit)
- [ ] `POST /api/upload-document` (chunks + topics) and `POST /api/tutor/ask` (text channel, same Gemini)
- [ ] `POST /api/quiz/generate` and `/api/quiz/submit` (server-side grading)
- [ ] Misconception taxonomy + `agents/misconception.py`
- [ ] `mastery.py` (+15·(1−m/100) correct, −10·confidence wrong) with tests
- [ ] `POST /api/missions/generate`, `agents/logger.py` (`agent_logs`)
- [ ] `GET /api/dashboard`; `seed.py` + `POST /api/demo/seed` (38% start); register routers in `main.py`
- [ ] Done when: wrong answer returns named misconception + before/after mastery + mission; dashboard JSON complete

## P3 — Backend half 2: Voice, LLM, agents
- [ ] `gemini.py` verified with the real key (errors raise `LLMError`, no canned content)
- [ ] `prompts/persona_eklavya.md` written and tested in AI Studio
- [ ] `live.py` Gemini Live session + `routers/voice_ws.py` (audio in/out, transcripts, `interrupted`)
- [ ] `tools.py`: `search_notes`, `report_learner_state`, `ask_quiz_question`, `grade_answer`, `get_mission` (call P2's functions)
- [ ] WS events: `emotion`, `mastery`, `mission`, `error`
- [ ] Session cap and clean error handling on quota/connection loss/silence (send `error`, no other model)
- [ ] Done when: a quiz works by voice, tone changes after wrong vs right, and killing the Live connection ends with a clear `error`, not a crash

## Joint finish (last, all three)
- [ ] Remove mocks; run the full journey (mastery 38% -> 67%) in under 4 min
- [ ] Latency ~1.5 s, interrupt ~300 ms; test on the demo laptop (Chrome, mic, Wi-Fi, Hindi voice)
- [ ] Rehearse x3, record backup video, deploy to Render, update `readme.md`

## Hand-offs
P3's `search_notes` needs P2's `retrieve()`; P3's quiz tools need P2's grading and mastery. P2 should push those functions first.

## Frozen contracts
REST (PRD s8): `/api/upload-document`, `/api/tutor/ask`, `/api/quiz/generate`, `/api/quiz/submit`, `/api/missions/generate`, `/api/dashboard`, `/api/demo/seed`.

WebSocket `/ws/voice?user_id=1&lang=hinglish` — binary = PCM audio; browser can also send JSON `{"type":"user_text","text":"..."}` (typed message to the same Gemini tutor), `{"type":"audio_stream_end"}` (mic paused >1 s) or `{"type":"end"}`. Server JSON:
- `{"type":"transcript","role":"user|tutor","text":"...","final":false|true}` — `final:false` are live chunks to append; `final:true` carries the full turn text (replace the chunks with it)
- `{"type":"quiz_question","question_id":1,"topic":"...","question":"...","options":["A. ..","B. ..","C. ..","D. .."]}` — sent when the tutor asks a quiz question (never contains the answer)
- `{"type":"turn_complete"}` — tutor finished speaking this turn
- `{"type":"emotion","topic":"...","confusion":0-1,"confidence":0-1,"frustration":0-1,"note":"..."}`
- `{"type":"interrupted"}`
- `{"type":"mastery","topic":"...","before":38,"after":67,"is_correct":true,"misconception":{"label","text","severity"}|null,"misconceptions_resolved":0}`
- `{"type":"mission","title":"...","duration_minutes":15,"priority":"High","reason":"...","tasks":["..."]}`
- `{"type":"error","message":"..."}` (Gemini unavailable or quota hit; client shows it and offers retry)
- Audio format (live mode): browser -> server PCM16 mono 16 kHz; server -> browser PCM16 mono 24 kHz; chunks about 20–40 ms
- Single demo student: `user_id = 1`, no login

## Python interface P2 gives P3 (freeze Day 0, in `backend/schemas.py` / module docstrings)
- `retrieval.retrieve(document_id: int, query: str, k: int = 4) -> list[{text, topic, page, score}]`
- `quiz.next_question(user_id: int, topic_id: int | None = None) -> {question_id, question, options, topic}`
- `evaluation.grade(user_id: int, question_id: int, student_answer: str, confidence: float) -> {is_correct, misconception, mastery_before, mastery_after}`
- `study_mission.current(user_id: int) -> {title, duration_minutes, priority, reason, tasks}`
- `logger.log_agent(user_id, agent_name, observation, decision, action, confidence)`
- `db.save_learner_state(user_id, topic_id, confusion, confidence, frustration, note)`

## Shared rules
- Keys only in `backend/.env`; Gemini is the only model/vendor and is called from the backend only. No fallback models or canned content.
- Every agent/tool step writes to `agent_logs`.
- Small PRs to `main`; update `docs/CHECKLIST.md` and `docs/LOG.md` when you finish an item.
