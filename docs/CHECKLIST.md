# Eklavya: build checklist

Stack: FastAPI + SQLite + Gemini (text, Live voice, embeddings) backend; plain HTML/CSS/ES-module frontend.
Legend: [x] done and verified · [ ] to do. Details of each step are in [LOG.md](LOG.md).

## Foundations
- [x] Gemini only (text JSON mode, retries, 10-minute cache; failures shown as errors, no fallback content)
- [x] `GEMINI_API_KEY` in `backend/.env`; model IDs confirmed with a real request (`gemini-3.1-flash-lite`, `gemini-3.8-live`, `gemini-embedding-001`)
- [x] Layered backend, componentised frontend with a state store, central error handling, docs (`CODEBASE.md`, `DESIGN.md`)
- [x] Language selector (English / Hindi / Hinglish) sent with every session; Hindi interface labels

## Notes and retrieval
- [x] Upload PDF / TXT; several documents; Remove with in-page confirm
- [x] Photo of notes (Gemini multimodal) becomes a notes document
- [x] Topics by Gemini; marker/sentence chunking for PDFs; chunk-to-topic filing
- [x] Search: BM25 + Gemini embeddings (cutoff measured on real data)

## Voice tutor (Gemini Live)
- [x] Mic capture, gap-free playback, barge-in, numbered sessions (no crash on quick restarts)
- [x] Live transcript, tone meters, captions mode, orb halo that follows the voice level
- [x] Learn then test, test only, quick revision (spaced), free conversation
- [x] Whiteboard: formulas, steps, tables drawn while Eklavya talks
- [x] Viva practice: examiner persona, timer, marks out of 10, report card
- [x] Debate: debater persona (tough or friendly), live argument scoreboard, verdict card, saved results
- [x] Snap a doubt: photo shown to Eklavya during a call
- [ ] By-ear checks: tone differs after a wrong vs a right answer; Hindi voice quality

## Progress and planning
- [x] Mastery rule, misconception diagnosis, missions, decision log
- [x] Today screen: streak, due revisions, today's plan, last session
- [x] Mastery chart (own SVG, table view), concept map, flashcards, viva/debate history, printable study pack
- [x] Exam-date planner
- [x] First-run guide, celebrations for real wins

## Added after the first release
- [x] Accounts: email + password, Google sign-in (needs a client id), forgot / change password, delete account, demo as guest
- [x] Flashcard review (spaced repetition), scanned PDFs, notes from YouTube and web links, daily reminders (push, email)
- [x] Tutor choice: calm mentor or friendly senior (own personality line and voice), remembered per device
- [x] Ask tab: typed questions answered from your notes, follow-ups remember the chat; searchable doubt history
- [x] Mock exam: timed paper across all topics, marked per topic, history, moves mastery
- [x] Badges (15) on Progress
- [x] Study groups: join by code, share notes (copied into a friend's library), weekly leaderboard
- [x] Animated avatar (drawn in the browser, free): mouth follows the voice, face follows the moment; one look per tutor
- [x] Full-screen call screen (opens by itself on phones; Full screen button elsewhere)
- [x] Challenge a friend: 5 questions on one topic by code, one try each, best score wins

## Quality
- [x] Unit tests: backend 97, frontend 82 (no network in tests)
- [x] Real-browser smoke tests in `tools/smoke/` (UI flow + voice modes against real Gemini)
- [x] axe-core: 0 violations on the guide, Today, Study, Progress, phone layouts

## Still to do
- [ ] Demo run-through under 4 minutes; demo numbers: the PRD's 38% -> 67% needs more than one 3-question test (a perfect test reaches about 62%)
- [ ] Separate demo Gemini key (rate limits; Gemini returned 503/504 under load during testing)
- [ ] Put the backend online (Render or similar: WebSocket + persistent disk), point the Vercel frontend at it
- [ ] Sign-in (Google) before sharing the link with other students
- [ ] Installable app on phones: manifest and service worker are in; test install on a real Android phone over https
- [x] New frontend design applied (docs/design/new-frontend): rail layout, opening animation, 3D desk hero, route, subjects, orbit picker, flip-card flashcards tab, concept map detail card, Ask with source passages, sound toggle
- [ ] Design screens not built yet: dark debate screen, first-run mic screen, side-by-side Progress layout
- [ ] Hindi text for the new Today hero, study modes, Ask, flashcard review
- [ ] Later (optional, paid): realistic video avatar from a vendor; the drawn avatar sits behind its own component so it can be swapped
