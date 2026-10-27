# Smoke tests (real browser)

Two scripts that drive the real app in Chrome. Run them before a release or a deploy. Unlike the unit tests, these
talk to the real backend and to real Gemini, so they need a key and they cost a little quota.

| Script | Checks |
|---|---|
| `ui.mjs` | First-time guide, Today plan, exam planner, Hindi labels, concept map, flashcards (Gemini), photo of notes (Gemini), phone layout, axe-core accessibility on every screen |
| `qa.mjs [nav\|lang\|notes\|quiz\|ui]` | Acceptance checks from the manual QA pass: list buttons open topics (no call), Quick revision uses the open topic, language survives reload, Hindi empty state, demo button single-flight, friendly photo error, the 3-question test with a wrong answer and a typed follow-up (needs `DB_PATH` set to the backend's database to read the right answers), feedback timing, step done state, mission in Study, study pack, mistake flashcards, topic switch, debate form, 16-topic map, phone width, Tab focus rings. Prints PASS/FAIL per check |
| `prompts.py [viva\|gender\|language\|debate]` | Python: the tutor prompts against the real Gemini Live API through the WebSocket (typed turns): an off-topic viva answer scores 0, no gendered Hindi forms, the session language holds, the debate opener is grounded. Prints what the tutor said; a check with no tutor speech counts as a problem, never a pass |
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
