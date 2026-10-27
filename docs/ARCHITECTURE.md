# Architecture — Eklavya (v2)

Stack: FastAPI + SQLite + Gemini (text and Live audio), vanilla JS frontend. See `PRD.md` section 14 for requirements.

## 1. System diagram

```
Browser (Chrome)
 ├─ Presenter  (audio-only now │ avatar later)        (planned) frontend/js/components
 ├─ Mic ─ AudioWorklet ─ PCM16 16 kHz ─┐
 ├─ Speaker ◄─ PCM 24 kHz ◄────────────┤  WebSocket /ws/voice   frontend/js/services/voice-client.js
 ├─ Transcript + emotion chips · Quiz · Mission · Dashboard
 └─ REST (upload, dashboard, text channel)
                  │
                  ▼
FastAPI (backend/app/main.py)
 ├─ api/routes/voice_ws.py ── session proxy ──► Gemini Live API (native audio)
 │      ▲  tool calls                                 │ audio + transcripts + tool calls
 │      └────────── ai/tools.py (dispatcher) ◄────────┘
 │             ├─ search_notes        → domain/retrieval.py → SQLite chunks
 │             ├─ report_learner_state→ learner_state + agent_logs
 │             ├─ ask_quiz_question   → agents/quiz.py
 │             ├─ grade_answer        → agents/evaluation.py + misconception.py + domain/mastery.py
 │             └─ get_mission         → agents/study_mission.py
 ├─ api/routes/{documents,tutor,quiz,missions,dashboard,topics,demo}.py   (REST)
 └─ db.py (SQLite)   ai/gemini.py (llm_json, cache)
```

The browser never sees the API key; the backend holds the Live session (keys, tool execution and logging stay server-side, matching the API rules).

## 2. Voice session flow
1. Student clicks "Talk" → browser opens `WS /ws/voice?user_id=1&lang=hinglish`.
2. Backend opens a Gemini Live session with: persona system prompt (`prompts/persona_eklavya.md`), tool declarations, language hint, session cap.
3. Mic audio streams browser → backend → Gemini; model audio streams back and plays immediately.
4. Barge-in: Gemini signals interruption → backend forwards `interrupted` → browser flushes its audio queue.
5. Model calls tools mid-conversation; backend runs them (DB/LLM) and returns results; model continues speaking.
6. Each student turn: model calls `report_learner_state`; backend stores it, logs to `agent_logs`, pushes an emotion chip to the UI.
7. Quiz: `ask_quiz_question` → tutor asks aloud → student answers → `grade_answer` → mastery update, misconception named, tutor reacts emotionally accordingly.
8. End: transcript saved, mission generated, dashboard refreshed.

WebSocket messages (JSON control + binary audio):
`{type:"transcript", role, text}` · `{type:"emotion", confusion, confidence, frustration}` · `{type:"interrupted"}` · `{type:"mastery", topic, before, after}` · `{type:"mission", ...}` · `{type:"error", message}`

## 3. Failure handling (PRD V11): no fallbacks
Gemini is the only model and vendor. If it fails (connection, quota, bad JSON after one retry):
- REST: `LLMError` -> HTTP 502 `{"error": "Gemini request failed: ..."}`; no canned or partial content is returned, and nothing is written to the database (grading classifies before it writes).
- Voice WS: send `{type:"error", message}`, close the session cleanly; the UI shows the message with a retry button.
- Protect the free tier with a session length cap and a separate demo API key.

## 4. File layout

The current tree, the layering rules and how to extend each layer are in [CODEBASE.md](CODEBASE.md).
In short: `backend/app/{api, services, agents, domain, ai, prompts}` and
`frontend/js/{components, controllers, services, state, lib}`.

## 5. Data model changes
Base 9 tables unchanged, plus:
- `learner_state(id, user_id, topic_id, confusion, confidence, frustration, note, created_at)`
- `voice_sessions(id, user_id, started_at, ended_at, mode, language, turns)` and `transcripts(session_id, role, text, ts)`
`agent_logs` also records tool calls and emotion signals.

## 6. Video upgrade path (Phase V2, not built now)
`Presenter` interface keeps the UI independent of how the tutor is shown:
- `AudioPresenter` (now): plays PCM, shows waveform.
- `AvatarPresenter` (later): WebRTC avatar (Tavus or HeyGen LiveAvatar) rendered in a `<video>`.
Backend impact: add `routers/avatar.py` to create the avatar session token; persona, tools, retrieval, emotion logging stay identical. Decision pending (verify vendor pricing, Hindi lip-sync): vendor-driven voice with our LLM as brain, vs piping Gemini Live audio into the avatar.

## 7. Key decisions and why
| Decision | Why |
|---|---|
| Gemini Live native audio over STT→LLM→TTS | Hears tone, natural turn-taking and barge-in, lower latency, one vendor |
| Backend proxy for the Live session | Keeps key off the browser, lets tools hit DB/RAG, enables logging |
| Emotion as tool-reported data | Makes tone auditable, drives mastery and the dashboard, not just flavour |
| SQLite + FastAPI kept | Already in place, enough for demo |

## 8. Risks / verify before building
- Gemini Live model ID, preview status, free-tier limits, Hindi quality, and whether affective dialog is a flag or default in the chosen model (sources conflict).
- Browser audio on venue hardware; test the AudioWorklet path in Chrome.
- Avatar vendors: all pricing and latency numbers so far are vendor-sourced.
