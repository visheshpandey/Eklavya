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
