# Eklavya: full project handoff

Everything about the project as of 2026-11-02 (the frontend was rebuilt on the design in `docs/design/new-frontend/`; see section 9), written so a new frontend can be built against it without reading the old one.
The backend and its contract stay; the frontend is replaceable. (The old design brief and the old design file were removed when the new frontend went in: this file and `DESIGN.md` replace them.)

Sections: 1 Product · 2 Features · 3 Stack and deployment · 4 Identity · 5 REST API · 6 Voice WebSocket · 7 Rules and numbers ·
8 Data model · 9 The current frontend · 10 Gotchas · 11 Not built / waiting on you · 12 Running and testing

---

## 1. The product

Eklavya is a **voice-first study mentor** for Indian college students (18 to 24, mostly on phones, often late at night, mixed
Hindi and English). The student uploads their own notes; Eklavya splits them into topics and then *talks* with them, in English,
Hindi or Hinglish. It teaches a topic step by step while drawing on a whiteboard, tests them by voice, listens to how they sound
(confused, confident, frustrated), names the exact misconception behind a wrong answer, tracks mastery per topic, and plans what to
study next. Everything it says is grounded in the student's own notes.

The one thing to get right: the voice call must feel like talking to someone, not using a chatbot.

Everything the AI does uses **Google Gemini only** (text, Live voice, embeddings). There is no fallback model and no canned
content: when Gemini fails the user sees a plain error.

## 2. Features (everything that exists today)

### Notes
- Upload PDF or TXT, several documents, remove one (with its progress). Scanned PDFs (no text layer) are read by Gemini.
- Photo of notes (png, jpg, webp, heic) is read by Gemini into text.
- Import from a link: a YouTube video (Gemini watches it) or a web article (fetched server-side with SSRF protection).
- "Demo notes": a ready ML dataset (5 topics) for trying the app.
- Gemini names the topics (up to 30); text is cut into about 200-word chunks and filed under topics. Search is BM25 plus Gemini embeddings.

### Voice tutor (Gemini Live, speech to speech)
- Barge-in (the student can interrupt), live transcript, tone readings, captions mode, photo during a call ("snap a doubt").
- Modes: **learn** (teach in steps with whiteboard, then a 3-question voice test, summary, mission), **test**, **revise** (5-minute
  recap board plus 2 questions), **viva** (examiner persona, 5 questions, marks out of 10, report card), **debate** (the student
  argues against Eklavya, per-argument scores, verdict), **free** (open conversation across all notes).
- Tutor choice: **mentor** (calm) or **senior** (upbeat), each with its own personality line and Gemini voice.
- Whiteboard: formula, steps or table cards drawn while the tutor talks; saved for the study pack.
- Dropped-call recovery (see 6.6).

### Practice and progress
- **Today**: streak, topics due for revision, today's plan (from the exam planner or built automatically), cards due, last session.
- **Exam planner**: exam date plus minutes per day produces a day-by-day plan.
- **Mastery** per topic, mastery-over-time chart, misconceptions (open and fixed), recent answers, "why the tutor did that" decision log.
- **Concept map**: topics as nodes, linked when one topic's notes mention another.
- **Flashcards**: made from notes plus the student's own mistakes; spaced-repetition review (Leitner boxes).
- **Missions**: a short study task chosen from the weakest topic and open misconception.
- **Mock exam**: timed paper across all topics, scored per topic, history, moves mastery.
- **Badges**: 15 achievements.
- **Study pack**: printable page (mission, mastery, mistakes, today's whiteboards, flashcards).
- **Viva and debate history**.

### Ask (text)
- Type a question, get an answer from the notes; follow-ups remember the last 2 turns. Every question is saved as a **doubt**,
  searchable and deletable.

### Social (needs a real account)
- **Study groups**: 6-letter join code, share notes (copied into a friend's library), weekly points leaderboard.
- **Challenge a friend**: 5 questions on one topic by code, one try each, best score wins (ties go to the faster player).

### Accounts and reminders
- Email plus password, Google sign-in, forgot / reset / change password, delete account, demo as guest, sign-in rate limits.
- Daily reminders by web push and email (a scheduler calls the backend once a day).

### Platform
- Installable PWA (manifest, service worker, offline page shell). English and Hindi interface (Hinglish uses the English labels).
  Light and dark themes. Keyboard shortcuts and a command menu (Ctrl+K).

## 3. Stack and deployment

| Part | Technology |
|---|---|
| Backend | Python 3.11, FastAPI, uvicorn. Layers: `api` (thin) -> `services`/`agents` -> `domain` (pure rules), `db`, `ai` (Gemini) |
| Database | SQLite locally (`backend/data/eklavya.db`, WAL); Postgres when `DATABASE_URL` is set (production uses Neon) |
| AI | `gemini-3.1-flash-lite` (text), `gemini-3.8-live` (voice), `gemini-embedding-001` (search); client lib `google-genai` |
| Frontend (current) | Plain HTML, CSS and ES modules, no build step, no framework. One store/reducer, controllers, components |
| Auth | scrypt password hashes, HMAC-signed 30-day bearer tokens |
| Push / email | `pywebpush` (VAPID), Gmail SMTP |
| Hosting | Frontend on Vercel (manual CLI deploy), backend on Render free plan (auto-deploys on push to `main`), database on Neon |

Production addresses: frontend `https://eklavya-lime.vercel.app`, backend `https://eklavya-api-1bhf.onrender.com` (Singapore, free plan:
it sleeps after about 15 minutes idle and the first request then takes about a minute). Local: backend `:5002` (or any `PORT`),
frontend `:3000`. The frontend finds the backend from `frontend/config.js` (`?api=http://localhost:5099` overrides it for a test).

Backend settings (all in `app/config.py`, nothing else reads the environment; examples in `backend/.env.example`):
`GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_LIVE_MODEL`, `GEMINI_EMBED_MODEL`, `GEMINI_TIMEOUT_MS`, `GEMINI_LONG_TIMEOUT_MS`,
`LIVE_VOICE` (default Kore), `LIVE_AFFECTIVE_DIALOG`, `SESSION_CAP_SECONDS` (840), `HOST`, `PORT`, `RELOAD`, `CORS_ORIGINS`, `LOG_LEVEL`,
`MAX_UPLOAD_MB` (10), `DATABASE_URL`, `DB_SCHEMA`, `DB_PATH`, `SAMPLES_DIR`, `DEMO_USER_ID` (1), `APP_TIMEZONE` (Asia/Kolkata), `AUTH_SECRET`,
`APP_URL`, `GOOGLE_CLIENT_ID`, `SMTP_HOST/PORT/USER/PASSWORD/FROM`, `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT`, `CRON_SECRET`.

Run the server with `python main.py` (uvicorn with `ws_ping_interval=20, ws_ping_timeout=60`, no websocket compression). Do not use `--reload` on Windows.

## 4. Identity, headers and errors

- **Guest = demo student** (user id 1, shared by everyone, data reset by "Load demo notes"). No token means guest.
- **Signed in**: `Authorization: Bearer <token>` on REST; `?token=<token>` on the WebSocket. A bad or expired token gives **401**; the
  client should sign out and show the login screen. Any `user_id` sent in a body or query is **ignored** (old clients still send it).
- `X-Timezone: <IANA name>` (for example `Asia/Kolkata`) on every REST request. "Today", streaks, plans and the study pack use it.
- Groups, challenges and reminders **refuse the guest** (400 "needs your own account").
- CORS is open to `CORS_ORIGINS` (default all). All bodies are JSON except uploads (`multipart/form-data`).
- **Errors** are always `{"error": "<plain sentence>", "code": "<machine code>"}` (validation errors add `fields`). Codes seen:
  `bad_request` 400, `unauthorized` 401, `not_found` 404, `too_many_requests` 429, `payload_too_large` 413, `invalid_request` 422 (adds `fields`),
  `llm_unavailable` 502 (Gemini failed or busy; the message is already friendly), `internal_error` 500, `http_error` (anything else). Provider text never appears in a message.
- Rate limits (in memory, 15-minute window): login 5 per email and 30 per IP, signup 10 per IP, forgot 3 per email and 10 per IP,
  Google 30 per IP. The 6th wrong login returns 429.

## 5. REST API

`auth` column: **G** = works for the guest, **U** = needs a signed-in user. Shapes are abbreviated to the fields a UI needs.

### 5.1 Accounts
| Method and path | Auth | Body | Returns |
|---|---|---|---|
| GET `/api/auth/config` | any | | `{google_client_id \| null, email: bool, push_key \| null}` what the server has switched on |
| POST `/api/auth/signup` | none | `{name?, email, password}` (8+ chars) | `{token, user:{id,name,email,guest:false}}` |
| POST `/api/auth/login` | none | `{email, password}` | same |
| POST `/api/auth/google` | none | `{credential}` (Google ID token) | same; links by email |
| GET `/api/auth/me` | G | | `{id,name,email,guest, has_password, google}` |
| POST `/api/auth/password` | U | `{current_password?, new_password}` | `{changed:true}` (Google-only accounts may omit the current one) |
| POST `/api/auth/forgot` | none | `{email}` | always the same polite `{sent:true,message}` (needs email set up, else 400) |
| POST `/api/auth/reset` | none | `{token, password}` | login result; the token comes from the emailed link `/?reset=<token>` (valid 30 minutes) |
| POST `/api/auth/delete` | U | `{password?, confirm?}` | `{deleted:true}`; erases everything |

### 5.2 Reminders
| GET `/api/reminders` | U | | `{push, email, devices, push_available, email_available, push_key}` |
|---|---|---|---|
| PUT `/api/reminders` | U | `{push?, email?}` | same |
| POST `/api/push/subscribe` | U | a browser `PushSubscription` `{endpoint, keys:{p256dh,auth}}` | settings |
| POST `/api/push/unsubscribe` | U | `{endpoint, keys}` | settings |
| POST `/api/reminders/test` | U | | `{push: n, email: bool}` sends one now |
| POST `/api/reminders/run` | secret | header `X-Cron-Secret` | `{users,push,email,skipped}`; a GitHub Actions cron calls it daily at 13:30 UTC |

### 5.3 Notes and topics
| POST `/api/upload-document` | G | multipart `file` (pdf, txt, image) or form `text` | `{document_id, status, topics_found:[{id,topic_name}]}` |
|---|---|---|---|
| POST `/api/import-link` | G | `{url}` (YouTube or article) | same as upload |
| DELETE `/api/documents/{id}` | G | | `{deleted}`; also deletes the progress on its topics |
| POST `/api/demo/seed` | G | | `{seeded:true, user_id, document_id, ...}` resets the demo student with the sample notes |
| GET `/api/dashboard` | G | | see 5.3.1 |
| GET `/api/topics/{id}` | G | | `{topic_id, topic_name, document_id, mastery, notes:[{heading,text}], notes_are_related, open_misconceptions:[{misconception_text,severity}], question_count}` |

**5.3.1 Dashboard** (one payload for Notes, Progress and the library):
`mastery:[{topic_id, topic_name, document_id, document, mastery_score, confidence_score}]` (grouped by document, newest first),
`weak_topics` (mastery under 60, weakest first), `alerts:[{type:"misconception"|"weak_topic", severity, topic, message}]`,
`mission` (or null), `quiz_history` (last 20 answers), `progress:[{attempt_id,topic_id,topic_name,mastery_before,mastery_after,is_correct,answered_at}]`
(oldest first, for the chart), `misconceptions_resolved`, `learner_state` (last 10 tone readings), `agent_log:[{agent_name,observation,decision,action_taken,confidence,created_at}]`
(the "why the tutor did that" list), `mistakes:[{topic,text,resolved,detected_at}]`.

### 5.4 Today, plan, map, history
| GET `/api/today` | G | | `{date, name, streak, week:[7 booleans, oldest first, today last], cards_total, has_notes, due:[{topic_id,topic,mastery,overdue_days}], plan:[{kind:"revise"\|"learn"\|"test", topic_id, topic, minutes, reason}], plan_minutes, last_session:{mode,mode_name,topic,turns,date}\|null, exam_date, exam_days_left, cards_due}` |
|---|---|---|---|
| GET `/api/plan` | G | | `{exam_date\|null, minutes_per_day, plan:{days_left, unscheduled, days:[{date, items:[...]}]}\|null}` |
| PUT `/api/plan` | G | `{exam_date:"YYYY-MM-DD", minutes_per_day:15-240}` | same as GET (400 if the date is not after today) |
| DELETE `/api/plan` | G | | same |
| GET `/api/concept-map` | G | | `{nodes:[{id,topic,document_id,mastery}], links:[{source,target,weight}]}` |
| GET `/api/history` | G | | `{vivas:[{id,topic,marks,out_of,strengths,improve,finished_at}], debates:[{id,topic,motion,tutor_side,style,winner,student_score,tutor_score,strength,improve,finished_at}]}` |
| GET `/api/boards` | G | | `{boards:[board cards drawn today]}` (study pack) |
| POST `/api/missions/generate` | G | | `{mission_id,topic_id,topic,mission_title,duration_minutes,priority,reason,tasks:[..]}` |

### 5.5 Quiz, flashcards
| POST `/api/quiz/generate` | G | `{topic_id, count 1-20, difficulty}` | `{questions:[{question_id,topic_id,topic,question,options:["A. ..",..],difficulty}]}` (never the answer) |
|---|---|---|---|
| POST `/api/quiz/submit` | G | `{question_id, student_answer, confidence?}` | `{is_correct, chosen, correct_answer, explanation, topic, topic_id, misconception:{label,text,severity,source}\|null, misconceptions_resolved, confidence_used, mastery_before, mastery_after, recommended_action, attempt_id}`; if the answer cannot be mapped to A-D: `{unclear:true, message}` |
| GET `/api/flashcards?topic_id=` | G | | `{cards:[{id,topic_id,topic,front,back,source:"notes"\|"mistake",box,due_on}]}` |
| POST `/api/flashcards/generate` | G | `{topic_id}` | `{cards}` (replaces that topic's deck; slow, calls Gemini) |
| GET `/api/flashcards/due` | G | | `{cards:[...]}` due today |
| POST `/api/flashcards/{id}/review` | G | `{knew: bool, hard?: bool}` | `{id, box, due_on, due_count}`. Got it (`knew`) moves up a box, Again resets to box 0, Hard (`knew:false, hard:true`) steps back one box |
| POST `/api/flashcards/reset` | G | | `{due_count}`: every card comes back as new, due now |

### 5.6 Ask and doubts
| POST `/api/tutor/ask` | G | `{question (max 2000), language:"english"\|"hindi"\|"hinglish", document_id?}` | `{answer, follow_up_question, source_topic, source_document, grounded: bool, doubt_id, sources:[{document,topic,heading,text}] (the 2 best passages), terms:[question words to highlight], searched (passages searched), ms (search time), match:"strong"\|"partial"\|"none"}` (`grounded:false` means "not in your notes") |
|---|---|---|---|
| GET `/api/doubts?q=` | G | | `{doubts:[{id,question,answer,follow_up,topic,grounded,created_at}], total, query}` every word of `q` must match |
| DELETE `/api/doubts/{id}`, DELETE `/api/doubts` | G | | `{deleted}` / `{cleared}` |

### 5.7 Mock exam, badges
| POST `/api/mock-exam/start` | G | `{count 3-30, minutes 3-90}` | `{exam_id, minutes, total, questions:[{position,question_id,topic,question,options}]}` weakest topics first |
|---|---|---|---|
| POST `/api/mock-exam/{id}/submit` | G | `{answers:{"1":"A","2":"C"}}` (missing = unanswered) | report (below). Handing in more than 2 minutes late grades nothing. Submitting twice returns the same report |
| GET `/api/mock-exam/{id}` | G | | report: `{exam_id, finished, minutes, seconds, correct, total, percent, answered, topics:[{topic,topic_id,correct,total}], weak_topics:[..], review:[{position,topic,question,answer,correct,is_correct,options,explanation}], started_at}` |
| GET `/api/mock-exams` | G | | `{exams:[{exam_id,minutes,total,correct,percent,seconds,started_at}]}` last 20 |
| GET `/api/badges` | G | | `{badges:[{id,title,description,icon,earned,progress,goal}], earned, total}` (15, fixed order) |

### 5.8 Groups and challenges (all U)
| GET `/api/groups` | | `{groups:[{id,name,code,members,owner}]}` |
|---|---|---|
| POST `/api/groups` | `{name}` | group detail |
| POST `/api/groups/join` | `{code}` | group detail (case and spaces ignored) |
| GET `/api/groups/{id}` | | `{id,name,code,owner, leaderboard:[{rank,name,you,points,correct,answers,cards,sessions,streak,mastery}], notes:[{document_id,file_name,topics,shared_by,mine,added,shared_at}], points:{correct,answer,card,session}}` |
| DELETE `/api/groups/{id}/members/me` | | `{left, groups}`; the last member out removes the group; ownership passes to the longest-standing member |
| POST `/api/groups/{id}/notes` | `{document_id}` | group detail (share my notes) |
| DELETE `/api/groups/{id}/notes/{doc}` | | group detail (only the sharer or the owner) |
| POST `/api/groups/{id}/notes/{doc}/add` | | `{document_id, topics, already}` copies topics, passages, vectors and questions into my library |
| POST `/api/challenges` | `{topic_id}` | `{code, topic, mine, played, total, standings}` |
| GET `/api/challenges` | | `{challenges:[{code,topic,created_at,players}]}` mine |
| GET `/api/challenges/{code}` | | `{code,topic,played,total,questions:[{position,question,options}]}` (no answers) |
| POST `/api/challenges/{code}/play` | `{answers:{"1":"A"}, seconds}` | result (below); one try each |
| GET `/api/challenges/{code}/result` | | `{code,topic,mine,played,total, standings:[{rank,name,you,correct,total,seconds}], review:[{position,question,options,correct}]}` standings and review appear only after you have played |

## 6. Voice WebSocket: `/ws/voice`

### 6.1 Connect
`ws(s)://<api>/ws/voice?token=<token>&lang=hinglish&tutor=mentor|senior&mode=free|learn|test|revise|viva|debate&topic_id=N`
plus for debates `&side=for|against&motion=<up to 200 chars>&style=tough|friendly` (`side` is the side **Eklavya** argues), and `&resume=<id>` to
pick a dropped call up again. No `token` means the demo student. Modes other than `free` need `topic_id`. The student needs notes first.

### 6.2 Audio (binary frames)
- Browser to server: mic audio, PCM16 mono **16 kHz**, small chunks (about 20 to 40 ms). Capture with an AudioWorklet, `echoCancellation`, `noiseSuppression`, `autoGainControl`.
- Server to browser: tutor audio, PCM16 mono **24 kHz**; queue the chunks for gap-free playback. When `interrupted` arrives, drop everything queued (barge-in).
- Create the AudioContexts inside the click that starts the call (browsers block them otherwise).

### 6.3 Browser to server (JSON text frames)
`{"type":"user_text","text":"..."}` typed turn or a tapped quiz option letter · `{"type":"photo","mime":"image/jpeg|png|webp","data":"<base64>","note":""}` (under 4 MB; shrink first) ·
`{"type":"audio_stream_end"}` · `{"type":"end"}` (the student ended the call; the call can then not be resumed).

### 6.4 Server to browser (JSON text frames, unknown types must be ignored)
| `type` | Fields |
|---|---|
| `session` | `id`: token for resuming this call |
| `transcript` | `role` ("user"\|"tutor"), `text`, `final`, `replace?`. A non-final event with `replace:true` carries the whole turn so far (replace the bubble); `final:true` carries the finished turn; a final with empty text means "drop that bubble" |
| `phase` | `phase` (teaching, test, summary, revise, viva, debate), `topic`; debate also `side, motion, style` |
| `quiz_question` | `question_id, topic, question, options[], number?, total?` (never the answer) |
| `mastery` | `topic, before, after, is_correct, misconception:{label,text,severity}\|null, misconceptions_resolved, chosen, correct_answer, question_id, retry` |
| `test_summary` | `topic, correct, total, mastery_before, mastery_after, misconceptions[], resolved` (can be re-sent if the last answer is retried) |
| `mission` | `title, duration_minutes, priority, reason, tasks[]` |
| `emotion` | `topic, confusion, confidence, frustration` (0 to 1), `note` |
| `board` | `kind:"formula"` `{title, formula, items[], result}` · `"steps"` `{title, items[], highlight}` · `"table"` `{title, headers[], rows[][]}`. Same title and kind again means update that card |
| `viva_question` | `number, total, question, seconds, topic` |
| `viva_mark` | `number, mark, out_of, feedback, mastery_before, mastery_after` |
| `viva_report` | `topic, marks, out_of, percent, strengths, improve, answers[{question,mark,feedback}]` |
| `debate_score` | `round, evidence, logic, rebuttal, strength, note, average` |
| `debate_verdict` | `winner ("student"\|"eklavya"\|"draw"), student_score, eklavya_score, strength, improve, rounds` |
| `interrupted`, `turn_complete` | no fields |
| `reconnecting` | `attempt`: Gemini's side dropped; the server is retrying by itself. Keep the call UI, show a small notice |
| `error` | `code, retryable, message` (English fallback; write your own copy per code) |

Tools the tutor can call, per mode (the UI never calls these): `search_notes`, `report_learner_state`, `show_board` (all modes); learn/test/free also
`ask_quiz_question`, `grade_answer`, `get_mission`; viva also `ask_viva_question`, `mark_viva_answer`, `finish_viva`; debate also `score_argument`, `finish_debate`.

### 6.5 Error codes (`error.code`)
`upstream_unavailable` (retryable), `quota` (retryable), `not_configured`, `session_limit` (14 minutes total, then start a new call), `bad_photo`, `need_notes`, `need_topic`.
A transport close that is not code 1000 and not caused by the student is a **lost connection**: offer Reconnect.

### 6.6 Dropped calls
- If Gemini's side drops, the server reconnects once by itself and tells the tutor where the quiz, viva or debate was. The browser only sees `reconnecting`.
- If the browser's side drops, reconnect with `&resume=<the last session id>`. The server restores the questions asked, graded results, viva marks and debate
  rounds (kept 10 minutes, usable once, same student only). Keep the quiz/viva/debate on screen while reconnecting, and **re-send the last answer** if no
  `mastery`/`viva_mark`/`debate_score` arrived for it.

### 6.7 Language and personality
The language (`lang`) and tutor (`tutor`) are fixed per call. Hinglish is Hindi in Roman letters only. The tutor addresses everyone as "aap",
never assumes gender and never says bhai/yaar/dost. These rules live in `backend/app/prompts/` (`persona_eklavya.md`, `persona_examiner.md`,
`persona_debater.md`, `language_rules.md`, `debate_plan.md`, `misconception_taxonomy.md`) and are not the frontend's concern.

## 7. Rules and numbers (so a UI can explain them)

- **Mastery** per topic starts at 50. Right: `+15 x (1 - mastery/100)`. Wrong: `-10 x confidence`. Clamped 0 to 100. Confidence comes from the
  tutor's tone reading (default 0.5). A confident wrong answer is a stronger misconception: confidence at least 0.7 means severity "high", 0.4 "medium", else "low".
- **Misconceptions** have a label from a fixed list (`prompts/misconception_taxonomy.md`) and are marked resolved when that topic is next answered right.
- **Revision spacing**: topic mastery under 40 returns after 1 day, under 60 after 2, under 75 after 4, under 90 after 7, otherwise 14. Never-practised topics are "new", not "due".
- **Streak**: consecutive days with an answer, a voice session with turns, or a flashcard review; a streak survives until the day is over.
- **Flashcards**: Leitner boxes 0 to 5 returning after 0, 1, 3, 7, 14, 30 days. Knew it moves up one box, did not know resets to 0.
- **Viva**: 5 questions, 0 to 2 marks each in half marks, total out of 10. An answer that does not address the question scores 0. At least 1 mark counts as "right" for mastery.
- **Debate**: each student argument gets evidence, logic, rebuttal (0 to 10) and their mean; the verdict is a draw when the final scores are within 0.5.
- **Focused test** (learn/test): 3 distinct questions, graded server-side; revise has 2. Typing "A" to "D" or the option text answers a quiz question.
- **Mock exam**: weakest topics first, an unanswered question counts wrong and does not move mastery, a topic under 60% shows as "work on next".
- **Group points** (rolling 7 days): 10 per right answer, 2 per other answer, 1 per flashcard review, 5 per voice session with turns. Group limits: 10 groups per person, 50 members.
- **Badges** (id: how to earn): first-notes (1 document), first-answer, sharp-50 (50 right), streak-3/7/30, mastered-1/5 (a topic at 80%), viva, debate-win, cards-25, mock-80 (80% on 5+ questions),
  curious (10 doubts), team (join a group), challenger (win a challenge). They are computed on request, nothing is stored.
- **Reminder text** is built from Today: topics due, cards to review, or the streak to keep.

## 8. Data model (tables)

`users` (id, name, email unique, preferred_language, daily_study_minutes, target_exam_date, password_hash, google_sub, remind_push, remind_email, last_reminded_on) ·
`documents` (user_id, file_name, copied_from) · `topics` · `chunks` · `chunk_embeddings` · `learner_mastery` (user, topic, score, confidence; unique pair) ·
`quiz_questions` (options JSON, correct letter, explanation, per-wrong-option misconceptions JSON) · `quiz_attempts` · `misconceptions` · `study_missions` · `agent_logs` ·
`learner_state` · `voice_sessions` · `transcripts` · `vivas` + `viva_answers` · `debates` + `debate_rounds` · `boards` (whiteboard JSON) · `flashcards` (box, due_on, reviewed_at) ·
`password_resets` (hashed token, expiry) · `push_subscriptions` · `doubts` · `mock_exams` + `mock_exam_items` · `study_groups` + `group_members` + `group_documents` ·
`challenges` (questions JSON including answers, server-side only) + `challenge_attempts`.
Timestamps are UTC text (`YYYY-MM-DD HH:MM:SS`); the API turns them into the student's own calendar day with `X-Timezone`.

## 9. The current frontend (for reference and for what to keep)

**Rebuilt on 2026-11-02 from the design in `docs/design/new-frontend/` (`index.html`, `styles.css`, `app.js`: a standalone prototype with sample data).** The look and layout are the design's; the data and every earlier feature are the real app's. Seven screens: Today, My notes, Study room, Ask Eklavya, Progress, Flashcards (new tab), Study groups. New in this version, all on real data: the opening book animation; the 3D desk hero with your next session; today's three-step route (remembered per day); subject cards; the orbiting topic picker and six study modes; drag-and-drop notes; Ask showing the passages it used (highlighted, with match strength and search time); the concept map's legend, hover highlighting and "Study this / Ask about it" card; the flip-card flashcard review (Again / Hard / Got it, Space to flip, reset deck, practice-only mock round); the sound toggle (page-turn sounds, "Listen" on answers); the streak card with the last seven days; search-palette extras (mock round, "ask your notes" when nothing matches); hash links (`#progress`). Fonts: DM Sans, DM Mono, Instrument Serif (bundled).

New files: `css/shell.css` (the layout and the design's classes, renamed where older components used the same name), `js/components/{today-home,study-launch,flashcard-review,mastery-rows,rail,intro}.js`, `js/lib/{greeting,route,orbit,highlight,subjects,sound}.js`. Rewritten: `index.html`, `main.js`, `ask-view.js`, `concept-map.js`, `stat-tiles.js`, `alerts-list.js`, `header-controls.js`. Removed: `css/layout.css` (replaced by `shell.css`).

`frontend/`: `index.html` (skeleton, element ids), `config.js`, `sw.js`, `manifest.webmanifest`, `css/` (tokens, base, layout, components, skin, print), `js/` (`main.js` wires
everything; `lib/` helpers and strings; `services/` the only code that does I/O: `api-client.js`, `voice-client.js`, `audio-worklet.js`, `photo.js`; `state/` store, actions, reducer,
selectors; `controllers/` logic without DOM: notes, session, home, notifier; `components/` one file per UI piece). `npm test` runs 120 dependency-free tests.

Tabs (a left rail on desktop, a bottom bar on phones): Today, My notes, Study room, Ask Eklavya, Progress, Flashcards, Study groups. Dialogs: login (login, signup, forgot, reset), account (reminders, password, delete, sign out),
command menu, exam, first-run guide. Overlays: full-screen call (opens by itself on phones). Avatar: drawn SVG face, mouth follows the voice level, expression follows tone and the last answer.

**Store state**: `voiceStatus` (idle, connecting, listening, speaking), `banner`, `toasts`, `dashboard`, `selectedTopicId`, `topicDetail`, `mission`,
`session {mode, topicId, phase, messages, emotion, question, result, summary, boards, boardIndex, viva, debateScores, verdict, mission, lost}`, `today`, `history`, `plan`, `conceptMap`,
`flashcards`, `ui {view, librarySearch, collapsedDocs, captions, language, onboarding, celebration, theme}`. Every change is an action handled by one pure reducer.

**Look**: paper background `#f2efe7`, forest green `#29483e`, terracotta `#b8604a`, amber for "tutor is speaking" `#e8a33d`, dark theme, fonts DM Sans, DM Mono, Instrument Serif and Kalam for the whiteboard (bundled in `frontend/fonts`).
The reference design is `docs/design/new-frontend/` (see `DESIGN.md`). Radii are small: 4px panels, 6px controls.

**Accessibility already done** (keep it): tabs follow the WAI-ARIA pattern, every dialog is a real `<dialog>`, a polite live region announces finished tutor turns, whiteboard cards, call state
and a lost connection, the concept map nodes are keyboard buttons, reduced-motion is respected, axe-core reported 0 violations on the main screens.

**Rules the code follows** (worth keeping): model output is only ever written with `textContent`, never HTML; components render state and report intent, only services touch the
network; async work must never outlive its session (the voice client numbers every session and ignores late leftovers).

## 10. Gotchas learned the hard way

1. **Never put `backdrop-filter` (or `filter`, `transform`) on a parent of a `position: fixed` element**: it becomes the containing block. This put the phone tab bar at the top. Put the blur on a pseudo-element.
2. **Transcripts**: a non-final `transcript` with `replace:true` is the whole turn so far. Appending it duplicates text ("Hello! Aaj kaunsaHello! Aaj kaunsa…"). A turn that ends with empty text must remove its bubble.
3. **Do not show provider text**. Show your own sentence per `error.code`. The HTTP `error` string is already plain; the WebSocket `message` is an English fallback.
4. **Typed answers and quiz taps** are just `user_text` (for example "B"). If the call is down, keep the answer and send it after reconnecting.
5. **Photos**: shrink before sending (the old client uses `services/photo.js`); the voice call takes the image as a normal turn.
6. **Phones**: seven tabs at 390 px work as a bottom bar with short labels; the top bar needs icon-only buttons and compact selectors to stay on one row; there must be no sideways scroll. Give the page bottom padding for the fixed bar plus the safe-area inset.
6b. **Do not name two CSS variables the same**: `--rail` was once both a colour and a width, and the colour silently disappeared (the phone bar turned transparent). Widths use `--rail-w`.
6c. **A fixed-position child needs a parent with no filter**, see 1. The intro and the first-run guide must not open at the same time: the guide waits for the intro (`intro.whenDone`).
7. **The free Render backend sleeps**; the first request takes up to a minute. Show a calm "waking up" state, not an error.
8. **Slow endpoints** (30 s or more): uploads, link import, flashcard generation, mock exam start, challenge create, demo seed, mission generate. Show progress and disable the button.
9. **A 401 on any REST call with a token** means sign out and reload (the old client does exactly this).
10. **Push** needs permission, a service worker and HTTPS; it cannot be tested in headless browsers. Google sign-in needs `GOOGLE_CLIENT_ID` on the server.
11. **Voice sessions are capped at 14 minutes**; the cap counts across reconnects and ends with `session_limit`.
12. **Hindi**: only the labels in `js/lib/strings.js` are translated (tab names, the phone bar, rail, search, notes); the newer screens' own text (Today hero and route, study modes, Ask, flashcard review, Groups, mock exam, challenges) is still English.

## 11. Not built / waiting on you

Not built: dark debate screen, first-run microphone-permission screen, side-by-side Progress layout (from the design file); a realistic video avatar (a paid vendor; the drawn
avatar sits behind its own component so it can be swapped); Hindi text for the newer screens; email verification at signup; per-user Gemini usage limits (guests can currently
use Gemini freely); error tracking; CI on push; a privacy policy and terms; data export; Play Store packaging (last).

Waiting on you: GitHub secrets `API_URL` and `CRON_SECRET` (daily reminders), a Gmail app password (email), a Google OAuth client id (Google button), rotating the Render API key and the
Neon password that were shared in chat. **Nothing from the last two sessions (accounts aside) is committed or deployed yet.**

## 12. Running and testing

```
cd backend && pip install -r requirements.txt && copy .env.example .env   # put GEMINI_API_KEY in .env
python main.py                                                            # PORT from .env
cd frontend && python serve.py                                            # http://localhost:3000
cd backend && python -m pytest tests -q                                   # 178 tests, Gemini is faked
cd frontend && npm test                                                   # 120 tests
```
`python scripts/check_gemini.py` checks model IDs and a real Live round trip. `backend/app/lag_monitor.py` logs when the server's event loop is blocked: read it first if voice calls drop.
Other docs: `CODEBASE.md` (code layout and protocol in more depth), `ARCHITECTURE.md`, `PRD.md`, `DESIGN.md`, `CHECKLIST.md`, `LOG.md`.
