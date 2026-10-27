# Eklavya

A voice-first, multilingual (English / Hindi / Hinglish) study mentor. Pick a topic from your notes and
Eklavya teaches it out loud while drawing on a whiteboard, then tests you by voice, names the exact
misconception behind your mistakes, gives you a short study mission, and shows your mastery rising.

What you can do:

* **Today**: a short plan for the day, your streak, topics due for revision, days left to your exam.
* **Learn / test / quick revision** by voice, with the whiteboard drawing formulas, steps and tables as Eklavya talks.
* **Viva practice**: an examiner asks 5 questions, probes your answers, and gives marks out of 10 with a report card.
* **Debate**: argue against Eklavya (tough or friendly); a live scoreboard rates each argument; verdict at the end.
* **Snap a doubt**: photograph a page or a question, during a call or as new notes.
* **Exam planner**, **concept map** of your topics, **flashcards** from your notes and mistakes, a printable **study pack**.
* Hindi interface labels, captions mode, installable on phones.

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
tools/      smoke/ (real-browser checks)
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

Open http://localhost:3000 in **Chrome**. The first-time guide asks for your language and notes (try the demo
notes), then **Today** shows what to do. Or pick a topic and choose **Teach me this, then test me**, **Viva
practice**, **Quick revision** or **Debate**. Use headphones.

Ports: backend `PORT` in `backend/.env` (default 5000); frontend `PORT` in `frontend/serve.py`
(default 3000); the page finds the backend through `apiBase` in `frontend/config.js`. The backend
port and `apiBase` must match.

## Test

```cmd
cd backend  && pip install -r requirements-dev.txt && python -m pytest tests -q
cd frontend && npm test
python backend\scripts\check_gemini.py    :: real-key check of model IDs and a live voice round trip
```

Real-browser smoke tests (Chrome, fake microphone, real Gemini): see [tools/smoke/README.md](tools/smoke/README.md).

## Rules

- Keys live only in `backend/.env` (never committed); only `app/config.py` reads the environment.
- Gemini is called from the backend only. No fallback content: failures return a clear error.
- Demo uses one seeded student (`user_id = 1`), no login.
