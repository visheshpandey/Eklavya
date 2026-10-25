# StudyPilot Voice (Eklavya)

A voice-first, multilingual (English / Hindi / Hinglish) adaptive learning tutor. The student uploads notes, talks with a tutor ("Eklavya") that answers from those notes, takes a spoken quiz, gets the exact misconception named, receives a short study mission, and sees mastery rise.

Status: early build. The original StudyAI summary/quiz generator works as a base; the voice tutor, RAG, mastery and dashboard are being built (see `docs/CHECKLIST.md`).

## Docs
| File | What |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Full PRD (base + conversational voice + video plan) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, voice flow, file layout |
| [docs/TEAM_PLAN.md](docs/TEAM_PLAN.md) | 3 people, 1 chunk each, frozen contracts |
| [docs/CHECKLIST.md](docs/CHECKLIST.md) | What is done / todo |
| [docs/LOG.md](docs/LOG.md) | Progress log |

## Stack
FastAPI (Python) · SQLite · Gemini (text + Live native audio) · vanilla JS frontend. Gemini is the only model and vendor: no fallback models or services.

## Project structure
```
backend/    main.py, gemini.py, live.py, tools.py, db.py, retrieval.py, mastery.py,
            seed.py, schemas.py, config.py, pdf_extract.py, agents/, routers/
frontend/   index.html, css/, js/ (voice, audio-worklet, emotion, presenter, quiz, mission, dashboard)
prompts/    master_prompt.md, persona_eklavya.md, misconception_taxonomy.md
samples/    ml_notes.txt
docs/       PRD, architecture, team plan, checklist, log
```
Many files are stubs for now; see the checklist.

## Run locally
```bash
git clone https://github.com/visheshpandey/Eklavya.git
cd Eklavya/backend
pip install -r requirements.txt
cp .env.example .env        # add GEMINI_API_KEY (free key: aistudio.google.com)
python -m uvicorn main:app --port 5000

# second terminal
cd ../frontend
python -m http.server 3000  # open http://localhost:3000 in Chrome
```
Check `http://localhost:5000/` returns `{"status":"StudyAI API is running"}`.

## Rules
- API keys only in `backend/.env` (never committed).
- Gemini is the only model. There are no fallback models, canned answers or second vendors: if Gemini fails the API returns a 502 and the UI shows the error.
- All Gemini calls are made from the backend only (10-minute cache, one retry on bad JSON).
- Demo uses one seeded student (`user_id = 1`), no login.
- Use Chrome (mic access) for the demo.
