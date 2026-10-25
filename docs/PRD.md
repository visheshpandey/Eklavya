# StudyPilot Voice — PRD

Oct 25, 2026

Sections 1–13 are the base PRD. Sections 14–15 are the v2 addition (conversational voice tutor, video plan) and override the base where they conflict. Repo reality: the code is Python FastAPI (not Node/Express); the stack tables below reflect what we build.

## 1. Summary

StudyPilot Voice is a voice-first, multilingual (English, Hindi, Hinglish) adaptive learning platform. A student uploads notes, asks doubts by voice, gets spoken explanations grounded in their own material, takes voice quizzes, and receives a personalized study mission based on the exact misconception detected.

**Hackathon goal:** a working demo of one uninterrupted journey — upload notes → voice doubt → spoken explanation → voice quiz → misconception detected → study mission → mastery rises (e.g. 38% → 67%).

**Build strategy:** extend the existing StudyAI repo (FastAPI + LLM), which already handles PDF upload, text extraction and quiz generation, instead of starting from scratch.

## 2. Problem, Goals and Non-Goals

**Problem:** Students have plenty of material but don't know what to study next, why they keep making the same mistakes, or whether they've improved. Notes are scattered, explanations are mostly English-only, and students hesitate to ask repeated doubts in class.

### Goals
1. Let students ask doubts by voice in English, Hindi or Hinglish and hear the answer spoken back.
2. Ground every explanation in the student's own uploaded notes.
3. Diagnose the root misconception behind wrong answers, not just mark right/wrong.
4. Tell the student exactly what to study next, as a short timed mission.
5. Show measurable improvement in topic mastery.

### Non-goals (for the hackathon)
- Native mobile apps
- Regional languages beyond English, Hindi and Hinglish
- Teacher / coaching-institute dashboards
- Payments, subscriptions, multi-tenant accounts
- Migrating to Next.js (pitched as production architecture only)

## 3. Target Users
| Persona | Context | Primary need |
| --- | --- | --- |
| College student (CS / ML) | Studies from lecture PDFs and notes | Clear concept explanations and knowing weak topics |
| Competitive-exam aspirant | Large syllabus, fixed exam date | Prioritized, time-boxed study plan |
| Regional-language learner | More comfortable in Hindi / Hinglish | Explanations in their own language, by voice |
| Coaching institute (future) | Many students, one syllabus | Class-level misconception analytics |

## 4. User Stories
| # | As a student, I want to… | So that… |
| --- | --- | --- |
| US1 | upload my PDF or notes | the tutor answers from my own material |
| US2 | ask a doubt by speaking in Hinglish | I don't have to type or switch to English |
| US3 | hear the explanation read aloud | I can learn hands-free |
| US4 | answer quiz questions by voice | practice feels like a conversation |
| US5 | be told *why* my answer was wrong | I fix the root confusion, not one question |
| US6 | get a short study mission | I know exactly what to do next |
| US7 | see my mastery per topic over time | I know whether I'm actually improving |
| US8 | see why the AI chose my mission | I trust the recommendation |

## 5. Functional Requirements
P0 = required for the demo · P1 = strengthens judging · P2 = post-hackathon.

| ID | Requirement | Priority | Status |
| --- | --- | --- | --- |
| F1 | Upload PDF / TXT and extract text | P0 | Done (pdfplumber) |
| F2 | Extract topics and subtopics at upload | P0 | Not started |
| F3 | Chunk notes and retrieve top-k chunks per question | P0 | Not started |
| F4 | Voice input via Gemini Live (s14) | P0 | Not started |
| F5 | Spoken output via Gemini Live (s14) | P0 | Not started |
| F6 | Language selection (English / Hindi / Hinglish) passed to every prompt | P0 | Not started |
| F7 | Tutor answers a doubt from notes with a follow-up question | P0 | Not started |
| F8 | Adaptive quiz on the current weak topic | P0 | Partial (static MCQs) |
| F9 | Server-side answer evaluation (typed or spoken) | P0 | Not started |
| F10 | Misconception detection with type and severity | P0 | Not started |
| F11 | Per-topic mastery and confidence scores, persisted | P0 | Not started |
| F12 | Study mission generation (title, duration, priority, reason, tasks) | P0 | Not started |
| F13 | Dashboard: mission, weak topics, alerts, mastery %, quiz history | P0 | Not started |
| F14 | Agent decision log (observation → diagnosis → decision → action → result) | P0 | Not started |
| F15 | Progress graph over time | P1 | Not started |
| F16 | Image / screenshot upload with OCR or multimodal model | P1 | Not started |
| F17 | Whisper / other speech models | P1 | Dropped: Gemini is the only model (s15) |
| F18 | Embedding-based retrieval (vs keyword) | P1 | Not started |
| F19 | PDF export of study pack | P2 | Done (jsPDF) |
| F20 | User accounts and login | P2 | Not started |
| F21 | Exam-date-aware planning | P2 | Not started |

## 6. Non-Functional Requirements
| Area | Requirement |
| --- | --- |
| Latency | Tutor answer starts speaking within 5 s of the student finishing (s14 tightens to ~1.5 s for live voice) |
| Reliability | Every LLM call returns validated JSON; on parse failure, retry once, then show a friendly error |
| Demo safety | A seeded demo dataset (ML notes + student profile) can be loaded in one click |
| Browser support | Chrome desktop (mic access) |
| Privacy | API keys only on the server; uploaded notes not shared beyond the LLM call |
| Cost | Free tiers for the demo; no paid services required |
| Security | Escape all model output before rendering |

## 7. Technical Approach

### Hackathon stack vs production stack
| Layer | Hackathon (build now) | Production (pitch) |
| --- | --- | --- |
| Frontend | HTML, CSS, vanilla JS | Next.js, TypeScript, Tailwind |
| Backend | Python FastAPI | FastAPI + workers |
| LLM | Gemini Flash | Gemini (multimodal) |
| Voice | Gemini Live native audio | Gemini Live / Whisper + managed TTS |
| Retrieval | Keyword / BM25 over in-memory chunks | Sentence Transformers + ChromaDB |
| Database | SQLite | PostgreSQL / Supabase |
| Hosting | Render | Vercel + Render/Railway |

### Agent pipeline
Seven agents run as backend-controlled LLM calls, each returning structured JSON and writing to `agent_logs`:
1. **Document Intelligence** — extract text, chunk, build topics.
2. **Learner Profile** — read language, study time, mastery.
3. **Voice Tutor** — retrieve chunks, explain in the chosen language, ask a follow-up.
4. **Quiz** — generate questions on the weakest topic.
5. **Evaluation** — grade the answer and confidence, update mastery.
6. **Misconception Detection** — name and classify the root error.
7. **Study Mission** — rank by weakness, prerequisites, exam importance and time; produce a mission.

## 8. API Contracts
| Method | Endpoint | Input | Output (key fields) |
| --- | --- | --- | --- |
| POST | `/api/upload-document` | file (PDF/TXT/image) | document_id, status, topics_found[] |
| POST | `/api/tutor/ask` | user_id, question, language, subject | answer, source_document, follow_up_question |
| POST | `/api/quiz/generate` | user_id, topic_id, count, difficulty | questions[] |
| POST | `/api/quiz/submit` | user_id, question_id, student_answer, confidence | is_correct, misconception, mastery_before, mastery_after, recommended_action |
| POST | `/api/missions/generate` | user_id | mission_title, duration_minutes, priority, reason, tasks[] |
| GET | `/api/dashboard` | user_id | mastery[], weak_topics[], alerts[], mission, quiz_history[], agent_log[] |
| WS | `/ws/voice` | PCM audio + control JSON | see TEAM_PLAN.md (added in s15) |

All LLM-backed endpoints use JSON mode and validate required keys before responding.

## 9. Data Model
| Table | Key columns | Purpose |
| --- | --- | --- |
| `users` | id, name, email, preferred_language, daily_study_minutes, target_exam_date | Learner profile |
| `documents` | id, user_id, file_name, uploaded_at, processed_status | Uploaded files |
| `chunks` | id, document_id, topic_id, text, embedding (P1) | Retrieval units |
| `topics` | id, document_id, topic_name, parent_topic_id | Topic tree and prerequisites |
| `learner_mastery` | id, user_id, topic_id, mastery_score, confidence_score, last_updated | Mastery per topic |
| `quiz_attempts` | id, user_id, topic_id, question, student_answer, is_correct, answered_at | Answer history |
| `misconceptions` | id, user_id, topic_id, misconception_text, severity, detected_at, resolved | Detected errors |
| `study_missions` | id, user_id, topic_id, mission_title, reason, duration_minutes, status, created_at | Missions |
| `agent_logs` | id, user_id, agent_name, observation, decision, action_taken, confidence, created_at | Decision log |

**Mastery update rule (demo):** correct answer +15 × (1 − mastery/100), wrong answer −10 × confidence, clamped to 0–100.

## 10. Build Phases
See `TEAM_PLAN.md` (3 people, 1 chunk each) and `CHECKLIST.md`. Original phases: 0 Fix, 1 Voice, 2 Tutor + retrieval, 3 Diagnose + plan, 4 Dashboard, 5 Demo polish.

## 11. Success Metrics and Demo Acceptance

### Demo acceptance (must all pass live)
- [ ] Upload the ML notes and see topics listed (Classification, Confusion Matrix, Precision, Recall, F1 Score)
- [ ] Ask "Mujhe precision aur recall simple example se samjhao" by voice; transcript appears
- [ ] Explanation is spoken in Hinglish and cites the uploaded notes
- [ ] Voice quiz question is asked and a spoken answer is graded
- [ ] Wrong answer shows a named misconception (confusing real-world condition with model prediction)
- [ ] Mission card appears: Fix Precision vs Recall Confusion, 15 min, High priority, with reason
- [ ] After remediation, a correct answer moves mastery (e.g. 38% → 67%) and marks the misconception resolved
- [ ] Decision log shows observation → diagnosis → decision → action → result
- [ ] Full journey runs end to end in under 4 minutes

### Product metrics (post-hackathon pilot, 50–100 students)
| Metric | Target |
| --- | --- |
| Mastery gain, diagnostic quiz → final quiz | +20 percentage points average |
| Misconceptions resolved within one mission | ≥ 60% |
| Missions started that are completed | ≥ 50% |
| Students using Hindi or Hinglish | Tracked |
| Day-7 return rate | ≥ 30% |

## 12. Risks and Mitigations
| Risk | Impact | Mitigation |
| --- | --- | --- |
| Speech recognition mishears Hinglish or fails on venue Wi-Fi/mic | Demo breaks | Quiet room; pre-tested mic; Chrome only; backup video of a good run |
| LLM returns invalid JSON or slow responses | Stalls the demo | JSON mode, schema check, one retry; on failure show the error and retry (no canned content) |
| Misconception output is vague | Weakens core differentiator | Few-shot prompt with a fixed taxonomy |
| API rate limits during judging | Errors on stage | Separate demo API key; cache last good responses |
| Scope creep across 7 agents | Unfinished demo | Agents can share one call; P0 list is the cutline |
| Stack mismatch with the pitched architecture | Judges question depth | Present hackathon stack honestly; production stack as roadmap |

## 13. Open Questions
- Which hackathon and what is the submission deadline?
- Gemini vs other for image support (F16)? (Decided: Gemini.)
- Who owns frontend, backend data, backend voice? (Plan: P1 / P2 / P3.)
- Login for the demo? (Decided: single seeded student, no login.)
- Will the demo laptop run Chrome with mic access at the venue?

---


## 14. Conversational Voice Tutor (replaces F4/F5 as the voice core)

### 14.1 Problem with the v1 voice plan
The earlier idea used browser SpeechRecognition + speechSynthesis: the student speaks, text comes back, a robotic voice reads it. That is a chatbot with a microphone. It cannot hear *how* the student sounds, cannot be interrupted, and cannot sound warm or concerned.

### 14.2 Goal
A **person-to-person discussion**: the tutor ("Eklavya") talks with the student in natural spoken Hindi / English / Hinglish, reacts to tone as well as words, and responds with matching emotion. Not question-in / answer-out.

### 14.3 Behaviour requirements
| ID | Requirement | Priority |
|---|---|---|
| V1 | Speech-to-speech conversation over a live audio stream (no push-to-talk per turn) | P0 |
| V2 | Barge-in: the student can interrupt mid-answer and the tutor stops and listens | P0 |
| V3 | Short conversational turns (1–3 sentences), backchannels ("hmm, right"), one question at a time; never a lecture dump | P0 |
| V4 | Tone-aware: infer confusion / frustration / hesitation / confidence from voice **and** words, and adapt (slow down, reassure, simplify, challenge) | P0 |
| V5 | Emotional delivery: voice pace, warmth and emphasis match the situation (encouraging after a mistake, upbeat on a win) | P0 |
| V6 | Socratic style: asks the student to attempt before revealing; follow-up questions tied to the detected misconception | P0 |
| V7 | Code-switches naturally between Hindi and English mid-sentence (Hinglish), following the student's language | P0 |
| V8 | Every factual claim grounded in the student's notes via a `search_notes` tool call; cites the source | P0 |
| V9 | Learner state signal (confusion, confidence, frustration) saved per turn and used in the mastery rule | P0 |
| V10 | Voice quiz inside the conversation: tutor asks, student answers aloud, answer graded server-side | P0 |
| V11 | No fallback models: if Gemini fails or hits quota the UI shows a clear error with retry; no canned or alternate-vendor content | P0 |
| V12 | Live transcript shown on screen, with an emotion chip per student turn | P1 |
| V13 | Persona and voice selectable (calm mentor / friendly senior) | P2 |

### 14.4 Model choice
| Role | Choice | Why | Risk / to verify |
|---|---|---|---|
| Primary: live voice | **Gemini Live API (native audio)**, Gemini Flash family | One model hears audio directly (tone, not just transcript), speaks back, supports barge-in, tool calling and Hindi; already our LLM vendor; free tier exists | Sources conflict on whether "affective dialog" is a flag or default in the newest model; exact model ID, Hindi quality and free-tier limits must be checked against current docs before building |

Emotion is handled in two layers: (1) the native-audio model hears tone and adjusts its own delivery; (2) the tutor calls `report_learner_state` each turn so the emotion becomes **data** (stored, logged, shown on the dashboard) rather than only a vibe.

### 14.5 Persona (system prompt requirements)
Name Eklavya. Warm senior-student mentor, not a teacher or assistant. Speaks in the student's language, Hinglish by default. Rules: keep turns short; react to feelings first, content second; never say "As an AI"; praise effort specifically; on a wrong answer, stay calm, ask a guiding question, do not reveal immediately; always call `search_notes` before explaining notes content.

### 14.6 Tools exposed to the live model
| Tool | Purpose |
|---|---|
| `search_notes(query)` | Retrieve top-k chunks + source from the student's document |
| `report_learner_state(topic, confusion, confidence, frustration, note)` | Persist tone/emotion signal; feeds mastery and agent log |
| `ask_quiz_question(topic_id)` | Pull the next adaptive question to ask aloud |
| `grade_answer(question_id, student_answer, confidence)` | Server-side grading, misconception, mastery update |
| `get_mission()` | Tutor speaks the current study mission |

### 14.7 Mastery rule change
Confidence is no longer a UI input. It is derived: `confidence = 1 - hesitation/confusion` from the latest `report_learner_state`, defaulting to 0.5 when absent. Wrong answers given confidently (high confidence + wrong) are flagged as likely misconceptions with higher severity. Formula otherwise unchanged (+15·(1−m/100) / −10·confidence).

### 14.8 Non-functional additions
| Area | Requirement |
|---|---|
| Latency | Tutor audio starts within ~1.5 s of the student stopping (target; measure on venue Wi-Fi) |
| Interruption | Tutor audio stops within ~300 ms of barge-in |
| Privacy | Mic audio streams browser -> our backend -> Gemini only; not stored; transcripts stored per user. API keys only on server |
| Safety | Wrap-up if no speech for 30 s; hard cap on session length to protect free-tier quota |
| Cost | Free tier only for demo; session cap |

### 14.8b Learn-then-test flow (topic picker)
The student picks a topic and the tutor runs a guided lesson, not an open chat.

| ID | Requirement | Priority |
|---|---|---|
| V14 | Tapping a topic shows what the student's own notes say about it, its mastery, any open misconception, and two actions: "Teach me this, then test me" and "Just test me" | P0 |
| V15 | Learn mode: the tutor teaches the topic from the notes in 3-4 small spoken steps (one idea, one everyday example, one quick check question each), then announces a 3-question voice test | P0 |
| V16 | Test mode: 3 distinct questions on that topic only, read aloud with options, answered by voice, graded server-side; never repeats a question in a session | P0 |
| V17 | After the last answer: a spoken summary (what went well, the misconception found, mastery change), then the study mission is spoken; the screen shows a summary card (score, mastery before -> after, mistakes, resolved) | P0 |
| V18 | The UI shows the current phase (Learning / Voice test / Summary) and "Question n of 3" | P1 |

API: `GET /api/topics/{id}`; `WS /ws/voice?mode=learn|test&topic_id=N`; events `phase`, `test_summary`, and `number`/`total` on `quiz_question`.

## 14.9 Video tutor (planned, not in hackathon scope)
Phase V2 adds a talking avatar so the tutor has a face. Same brain, new "body".

- Approach: keep one **Presenter** interface in the frontend (`audio-only` today, `avatar` later). The persona prompt, tools, retrieval and emotion logging do not change.
- Candidates for a real-time WebRTC avatar: **Tavus** (developer-oriented, free tier reported ~25 min) and **HeyGen LiveAvatar** (paid starter reported). Both are vendor-sourced figures; verify pricing, latency, Hindi lip-sync quality and whether they accept our own LLM/voice or need to own the voice.
- Integration choice to decide later: (a) avatar vendor drives voice itself with our LLM as the "brain", or (b) our Gemini Live audio is piped into the avatar for lip-sync. (b) preserves emotional delivery but is harder.
- Optional input side: student camera for engagement/confusion cues (privacy opt-in only).
- Acceptance for V2: avatar responds to the same demo journey with visible lip-sync and no added delay beyond ~1 s.

## 15. Changes to base PRD
- **F4, F5 (voice in/out)**: now P0 via section 14 and handled entirely by Gemini Live; no browser or third-party speech models.
- **F6 language toggle**: becomes the starting language only; tutor follows the student's language mid-conversation.
- **F7 tutor**: replaced by the live conversation + `search_notes` tool; `/api/tutor/ask` kept as a text channel to the same Gemini model.
- **F9/F10/F11**: confidence comes from `report_learner_state` (14.7).
- **F14 agent log**: also records emotion signals and tool calls.
- **F17 Whisper fallback**: dropped: Gemini Live is the only speech path.
- **New API**: `WS /ws/voice` (live session proxy). Existing REST endpoints stay.
- **New table**: `learner_state(id, user_id, topic_id, confusion, confidence, frustration, note, created_at)`.
- **New risks**: live-model preview instability or quota; Hindi voice quality; mic/Wi-Fi at venue (mitigated by testing on the demo laptop and a recorded backup demo; no fallback models).
- **Demo acceptance**: add "student interrupts the tutor mid-sentence and it stops", and "tutor's tone visibly changes after a wrong answer (reassuring) vs a right one (upbeat)".
