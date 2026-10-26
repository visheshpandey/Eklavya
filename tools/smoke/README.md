# Smoke tests (real browser)

Two scripts that drive the real app in Chrome. Run them before a release or a deploy. Unlike the unit tests, these
talk to the real backend and to real Gemini, so they need a key and they cost a little quota.

| Script | Checks |
|---|---|
| `ui.mjs` | First-time guide, Today plan, exam planner, Hindi labels, concept map, flashcards (Gemini), photo of notes (Gemini), phone layout, axe-core accessibility on every screen |
| `voice.mjs [viva\|debate\|revise\|photo]` | Live voice modes with a fake microphone: viva marks and timer, debate scoreboard, quick revision with the whiteboard, a photo shown during a call. With no argument it runs all four |

## Run

Use a throwaway backend with its own database: the flows load demo notes and save answers.

```
cd backend
set PORT=5099
set DB_PATH=%TEMP%\eklavya-smoke.db
python main.py

cd frontend
set FRONTEND_PORT=3099
python serve.py

cd tools\smoke
npm install
set FRONT=http://localhost:3099
set API=http://localhost:5099
npm run ui
npm run voice
```

`CHROME` overrides the Chrome path; screenshots go to `tools/smoke/out` (or `OUT`). Each script prints what it saw
and the browser errors it caught (expected: `errors: []`).

If Gemini is overloaded (HTTP 503/504 in the backend log), the app correctly shows the error instead of invented
content and the run times out: run it again a little later.
