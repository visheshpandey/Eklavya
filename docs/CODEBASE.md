# Codebase guide

How the code is organised, the rules it follows, and how to extend it. For *what* the product does see
[PRD.md](PRD.md); for the voice session design see [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Layout

```
studyai/
├── backend/                      Python 3.11, FastAPI, SQLite
│   ├── main.py                   entry shim: `uvicorn main:app` / `python main.py`
│   ├── app/
│   │   ├── main.py               create_app(): CORS, error handlers, routers
│   │   ├── config.py             Settings from environment (the ONLY place env is read)
│   │   ├── errors.py             AppError hierarchy + the HTTP error handlers
│   │   ├── db.py                 SQLite connection, schema, tiny query helpers
│   │   ├── api/                  HTTP/WebSocket layer (thin)
│   │   │   ├── schemas.py        request bodies (validation)
│   │   │   └── routes/           one file per resource: documents, tutor, quiz, missions,
│   │   │                         dashboard, topics, demo, today (+history), plan (+concept map),
│   │   │                         flashcards, voice_ws
│   │   ├── services/             orchestration for the API: dashboard, topic detail, demo seed, documents,
│   │   │                         search (words + meaning), today, study_plan (exam plan, concept map),
│   │   │                         history, progress_data (shared reads, UTC -> local days)
│   │   ├── agents/               the learning "agents": each = rules + (optionally) one Gemini call
│   │   │                         document_intelligence, voice_tutor, quiz, evaluation,
│   │   │                         misconception, study_mission, flashcards, logger
│   │   ├── domain/               pure rules, no network: mastery maths, retrieval (BM25),
│   │   │                         misconception labels, file text extraction (pdf), whiteboard cards (board),
│   │   │                         streak, revision (spacing), planner (exam plan), concept_map, scoring
│   │   │                         (viva marks, debate scores)
│   │   ├── ai/                   everything that talks to Gemini
│   │   │   ├── gemini.py         text client (JSON mode, cache, retry) + read_image (photo of notes)
│   │   │   ├── embeddings.py     gemini-embedding-001 vectors for note search (overload: friendly messages,
│   │   │                         see BUSY_MESSAGE / PHOTO_BUSY_MESSAGE in gemini.py)
│   │   │   ├── live.py           Gemini Live voice session (browser <-> Gemini)
│   │   │   ├── tools.py          tools the live tutor can call (a different set per mode)
│   │   │   └── prompts.py        loads app/prompts/*.md
│   │   └── prompts/              persona_eklavya.md (tutor), persona_debater.md, debate_plan.md,
│   │                             persona_examiner.md (viva), misconception_taxonomy.md
│   ├── tests/                    pytest (Gemini replaced by test doubles)
│   ├── scripts/check_gemini.py   real-key check of model IDs, text, and a Live round trip
│   ├── data/                     SQLite file (gitignored)
│   ├── .env.example              every setting, documented
│   └── requirements*.txt
├── frontend/                     plain HTML/CSS/ES modules, no build step
│   ├── index.html                page skeleton (element ids the components mount on)
│   ├── config.js                 environment config: backend URL, user id
│   ├── serve.py                  static dev server (set PORT inside)
│   ├── manifest.webmanifest, sw.js, icons/   installable app (offline start of the page shell)
│   ├── css/                      tokens.css (colours, type, spacing, light/dark), base.css (reset, focus,
│   │                             reduced motion), layout.css (sidebar + workspace, bottom tabs on phones),
│   │                             components.css (buttons, library, quiz, chart, lists), print.css (study
│   │                             pack). See docs/DESIGN.md
│   ├── js/
│   │   ├── main.js               entry: wires store + services + controllers + components
│   │   ├── lib/                  config.js, protocol.js (shared names), dom.js (el, svgEl, render),
│   │   │                         format.js, icons.js, theme.js, chart-data.js (pure series maths),
│   │   │                         formula.js (pure: formula text -> stacked fractions), strings.js
│   │   │                         (interface text in English and Hindi, t()), language.js (remembered
│   │   │                         language), feedback-hold.js (keeps a quiz result readable)
│   │   ├── services/             api-client.js (HTTP), voice-client.js (mic/WebSocket/audio, voice level),
│   │   │                         audio-worklet.js (mic capture processor), photo.js (shrink a photo)
│   │   ├── state/                store.js, actions.js, reducer.js, selectors.js
│   │   ├── controllers/          notes-controller, session-controller, home-controller (Today, plan, map,
│   │   │                         flashcards, history), notifier (business logic)
│   │   └── components/           one file per UI piece (render state, report clicks): shell (banner, toasts,
│   │                             announcer, i18n, nav-tabs, theme-toggle, onboarding), today (today-view,
│   │                             exam-planner), library, study (study-header, session-orb, stage-tools,
│   │                             celebration, stepper, debate-tag, whiteboard, viva-card, debate-score,
│   │                             quiz-card, summary-card, chat, text-input, emotion-card), progress
│   │                             (mission-card, mastery-chart, concept-map, flashcards, results-list,
│   │                             study-pack, alerts-list, history-list, decision-log)
│   └── tests/                    node:test, no dependencies: `npm test`
├── samples/ml_notes.txt          demo notes (also uploadable to try the upload flow)
├── tools/smoke/                  real-browser smoke tests (Chrome + fake mic + real Gemini), see its README
└── docs/                         PRD, architecture, this guide, team plan, checklist, log
```

## 2. Backend rules

**Dependency direction** (a layer may import only from layers below it):

```
api  ->  services / agents  ->  domain, db, ai
```

* `api/routes` validate input, call one agent or service, return its result. No business logic, no
  `try/except` for expected failures.
* `domain` is pure (no network, no framework): easy to unit test.
* `ai` is the only package that talks to Gemini. Gemini is the **only** model; there is **no fallback
  content**. A failed call raises `LLMError` and the API answers 502.
* Anything the model decides lives in a prompt file (`app/prompts/*.md`), not in Python strings.

**Configuration:** `app/config.py` reads the environment once into a frozen `Settings` object. Other
modules do `from app.config import settings`; nobody calls `os.getenv`. Bad values (e.g. `PORT=abc`)
raise `ConfigError` at startup. Settings are listed in `backend/.env.example`:

| Variable | Default | Meaning |
|---|---|---|
| `GEMINI_API_KEY` | (none) | required for any Gemini call |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | text agents |
| `GEMINI_LIVE_MODEL` | `gemini-3.8-live` | live voice tutor |
| `GEMINI_TIMEOUT_MS` | `30000` | a slow call becomes a 502 |
| `LIVE_VOICE`, `LIVE_AFFECTIVE_DIALOG`, `SESSION_CAP_SECONDS` | `Kore`, `false`, `840` | live session |
| `HOST`, `PORT`, `RELOAD` | `0.0.0.0`, `5000`, `false` | used by `python main.py` |
| `CORS_ORIGINS` | `*` | comma-separated allowed origins |
| `LOG_LEVEL`, `MAX_UPLOAD_MB` | `INFO`, `10` | |
| `DB_PATH`, `SAMPLES_DIR`, `DEMO_USER_ID` | `data/studypilot.db`, `../samples`, `1` | |

**Errors:** raise from `app/errors.py`: `BadRequestError` (400), `NotFoundError` (404),
`PayloadTooLargeError` (413), `LLMError` (502). One handler turns every failure, including validation
(422) and unexpected exceptions (500, details logged, never sent to the client), into
`{"error": "<message>", "code": "<machine_code>"}`. Database writes roll back on error. The live
session reports problems to the browser as `{"type": "error", "message": ...}` and never crashes.

**Naming:** modules, functions and variables are `snake_case`; classes `PascalCase`; constants
`UPPER_SNAKE`. One agent per file named after its job. Routes are named after the resource.

### Extending the backend

| To add... | Do this |
|---|---|
| an endpoint | add a file in `api/routes/`, register it in `api/__init__.py`, put logic in an agent or service |
| an agent | add `agents/<job>.py`; call `llm_json` for model output; log with `log_agent`; raise `AppError`s |
| a live-tutor tool | declare it in `ai/tools.py` (`TOOL_DECLARATIONS`), write an async handler, add it to `HANDLERS`, mention it in `prompts/persona_eklavya.md` |
| a setting | add a field to `Settings` in `config.py` and a line to `.env.example` |
| a prompt | add a `.md` under `app/prompts/` and load it with `prompts.load("name.md")` |

## 3. Frontend rules

State flows one way:

```
user click / server event
        │
        ▼
 controller  ── calls ──►  service (api-client, voice-client)
        │
        ▼ dispatch(action)
     store (state/reducer.js, pure)
        │
        ▼ select(slice)
 component renders the slice  ──►  user
```

* **components/** only render state and report user intent through callbacks. No `fetch`, no business
  rules. They find their element through ids from `index.html` and use `store.select(selector, render)`.
* **controllers/** hold the logic: what to do when a button is pressed or a server event arrives.
  They never touch the DOM, so they are tested with fakes (`tests/controllers.test.js`).
* **services/** are the only code that does I/O (`fetch`, microphone, WebSocket, audio playback).
* **state/** is the single source of truth. `reducer.js` is a pure function; every possible change is
  an action in `actions.js`.
* **lib/** holds pure helpers and shared names (`protocol.js` mirrors the backend's event names).
* Model output is only ever written with `textContent`, never HTML.
* **Async work must not outlive its session.** `services/voice-client.js` numbers every session; anything that finishes later
  (a socket closing, a mic prompt being answered) first checks it still belongs to the current session, so a slow leftover
  can never tear down a newer one. Follow the same rule for any new service that holds browser resources.
* **Config:** `config.js` (loaded before the app) sets `apiBase`; `?api=http://localhost:5099` in the URL
  overrides it for one-off tests. It must match the backend `PORT`.

**Naming:** files are `kebab-case.js`; functions/variables `camelCase`; constants `UPPER_SNAKE`;
`mountXxx` for components, `createXxx` for factories, `selectXxx` for selectors.

### Extending the frontend

| To add... | Do this |
|---|---|
| a UI piece | add `components/<name>.js` exporting `mountName({store, root, ...callbacks})`, add its element id to `index.html`, mount it in `main.js` |
| new state | add an `ActionType` + creator in `actions.js`, handle it in `reducer.js`, add a selector, add a test |
| a server event | add its name to `lib/protocol.js`, handle it in `session-controller.js`, dispatch an action |
| an API call | add a method to `backend` in `services/api-client.js` |

## 3b. Notes, chunking and topics

* A student can have **several notes documents**. The dashboard groups topics by document (newest first) and
  each group has a Remove button (`DELETE /api/documents/{id}`, which also deletes the progress on its topics).
  "Load demo notes" replaces only the demo document; uploads are kept.
* A topic picked for **learn/test** is taught from its own document. The **open conversation** searches all notes.
* `domain/retrieval.chunk_text` splits notes into ~200-word chunks. A long block with no blank lines (typical of
  PDF text) is cut at `Unit-I / Module 2 / Chapter 3 / Course Objective` markers, then at sentence ends, and the
  marker title becomes the chunk heading.
* `agents/document_intelligence` sends up to 60,000 characters to Gemini for topics (max 30; names get a subject
  prefix such as "DBMS: Normalization" when the notes cover several subjects), then files each chunk under the
  topic whose words match its heading/text best (rare words weigh more). A topic with no chunk of its own shows
  its closest passages (`notes_are_related`).
* Gemini may answer `{"questions": [...]}` or a bare list; `ai.gemini.extract_list` accepts both.
* When a lesson starts, `quiz.warm_up` writes the topic's test questions in the background so the test does not
  wait for Gemini.

## 4. WebSocket protocol (`/ws/voice`)

`ws://<api>/ws/voice?user_id=1&lang=hinglish[&mode=learn|test|revise|viva|debate&topic_id=N&side=for|against&motion=...&style=tough|friendly]`

Modes: `learn` (teach, then a 3-question test), `test`, `revise` (recap board + 2 questions, for spaced revision),
`viva` (examiner persona, 5 questions with probing, marks out of 10, report card), `debate` (below), free (no mode).
Each mode gets its own tool set (`tools.declarations_for`), e.g. a viva cannot start a multiple-choice quiz.

`debate`: the student debates Eklavya on the topic. `side` is the side **Eklavya** argues (default `for`); `motion` is optional free text up to 200 characters (empty = Eklavya picks one). The rules live in `app/prompts/debate_plan.md`. The server sends `{"type":"phase","phase":"debate","topic","side","motion"}` first.

Binary frames: mic audio up (PCM16 mono 16 kHz), tutor audio down (PCM16 mono 24 kHz).

| Direction | JSON message |
|---|---|
| browser to server | `{"type":"user_text","text":"..."}`, `{"type":"photo","mime":"image/jpeg","data":"<base64>","note":""}`, `{"type":"audio_stream_end"}`, `{"type":"end"}` |
| server to browser | `transcript` (`role`, `text`, `final`), `emotion`, `phase`, `quiz_question`, `mastery`, `test_summary`, `mission`, `board`, `viva_question`, `viva_mark`, `viva_report`, `debate_score`, `debate_verdict`, `interrupted`, `turn_complete`, `error` |

`board` (whiteboard card, sent when the tutor calls the `show_board` tool; cleaned by `app/domain/board.py`):
`{"type":"board","kind":"formula","title","formula","items":[...],"result"}`,
`{"type":"board","kind":"steps","title","items":[...],"highlight":0..n}` or
`{"type":"board","kind":"table","title","headers":[...],"rows":[[...],...]}`. The same title and kind again updates
the card on screen (for example the next highlighted step) instead of adding a new one.

A `photo` reaches Gemini Live as a normal user turn (image part + instruction), not as a video frame: the Live
API ignores a single frame sent as video. Transcription markers such as `<no speech>` or `{pause}` are removed
before anything is shown.

HTTP endpoints added with the study features: `GET /api/today`, `GET /api/history`, `GET|PUT|DELETE /api/plan`,
`GET /api/concept-map`, `GET /api/flashcards`, `POST /api/flashcards/generate`; `POST /api/upload-document` also
accepts a photo of notes (png, jpg, webp, heic), read by Gemini.

Field-level details: [TEAM_PLAN.md](TEAM_PLAN.md) ("Frozen contracts").

## 5. Running and testing

All commands from Windows `cmd`; replace ports to taste (the two ports must match, see `config.js`).

```cmd
:: backend (terminal 1)
cd studyai\backend
pip install -r requirements.txt
copy .env.example .env          &:: then put GEMINI_API_KEY in .env
python main.py                  &:: or: python -m uvicorn main:app --port 5000

:: frontend (terminal 2)
cd studyai\frontend
python serve.py                 &:: open http://localhost:3000 in Chrome

:: tests
cd studyai\backend  && pip install -r requirements-dev.txt && python -m pytest tests -q
cd studyai\frontend && npm test
```

* Do not use `uvicorn --reload` on Windows: it can leave an old server bound to the port.
* `python scripts/check_gemini.py` verifies model IDs, JSON mode and a real Live round trip.

## 6. Tests

* Backend: Gemini is replaced by a fake (`call_llm_json`, and a scripted Live session), so tests are
  fast and free. They prove our logic, not Gemini's behaviour: use `check_gemini.py` for that.
* Frontend: the reducer, store, controllers and API client are unit tested with fakes.
  UI rendering is checked in a real browser (see LOG.md).
