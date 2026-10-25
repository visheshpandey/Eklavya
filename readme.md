# Eklavya (StudyPilot Voice)

A voice-first, multilingual (English / Hindi / Hinglish) study mentor. Pick a topic from your notes and
Eklavya teaches it out loud, then tests you by voice, names the exact misconception behind your
mistakes, gives you a short study mission, and shows your mastery rising.

Gemini is the only model and vendor (text agents + Gemini Live voice). There are no fallback models:
if Gemini fails, the app shows the error.

## Docs

| File | What |
|---|---|
| [docs/CODEBASE.md](docs/CODEBASE.md) | **Start here:** layout, layering rules, config, errors, how to extend |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Voice session design and key decisions |
| [docs/PRD.md](docs/PRD.md) | Product requirements |
| [docs/TEAM_PLAN.md](docs/TEAM_PLAN.md) | Work split and frozen contracts |
| [docs/CHECKLIST.md](docs/CHECKLIST.md) / [docs/LOG.md](docs/LOG.md) | Progress and decisions |

## Project structure

```
backend/    FastAPI + SQLite: app/{api, services, agents, domain, ai, prompts}, tests/, scripts/
frontend/   plain HTML/CSS/ES modules: js/{components, controllers, services, state, lib}, tests/
samples/    ml_notes.txt (demo notes)
docs/
```

## Run it (Windows cmd)

```cmd
:: 1. backend
cd backend
pip install -r requirements.txt
copy .env.example .env
:: edit .env: set GEMINI_API_KEY (free key: https://aistudio.google.com/apikey)
python main.py

:: 2. frontend (second terminal)
cd frontend
python serve.py
```

Open http://localhost:3000 in **Chrome**, click **Load demo notes**, tap a topic, then
**Teach me this, then test me (voice)**. Use headphones.

Ports: backend `PORT` in `backend/.env` (default 5000); frontend `PORT` in `frontend/serve.py`
(default 3000); the page finds the backend through `apiBase` in `frontend/config.js`. The backend
port and `apiBase` must match.

## Test

```cmd
cd backend  && pip install -r requirements-dev.txt && python -m pytest tests -q
cd frontend && npm test
python backend\scripts\check_gemini.py    :: real-key check of model IDs and a live voice round trip
```

## Rules

- Keys live only in `backend/.env` (never committed); only `app/config.py` reads the environment.
- Gemini is called from the backend only. No fallback content: failures return a clear error.
- Demo uses one seeded student (`user_id = 1`), no login.
