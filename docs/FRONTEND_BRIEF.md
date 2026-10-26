# Eklavya: frontend design brief

Everything a designer (or Claude Design) needs to redesign the Eklavya web app: what it is, who it is for,
every screen and component with its states and real copy, the visual system, and the data each part shows.
The backend and its data contract stay as they are; the design must be able to show exactly this data.

---

## 1. The product in one paragraph

Eklavya is a **voice-first study mentor** for Indian college students. A student uploads their own notes
(PDF or text). Eklavya splits them into topics, then **talks** with the student out loud, in English, Hindi or
Hinglish (mixed), like a friendly senior: it teaches a topic step by step, **draws on a whiteboard while it
talks**, tests the student by voice, notices *how* they sound (confused, confident, frustrated), finds the exact
misconception behind a wrong answer, tracks mastery per topic, and plans what to study next. A **debate mode**
lets the student argue against Eklavya on a topic. Everything Eklavya says comes from the student's own notes.

**Audience:** college students (18-24) in India, often on phones, often studying late, mixed Hindi/English,
exam pressure. Must feel friendly and calm, never childish, never corporate.

**The one thing to get right:** the voice conversation. The student should feel they are *talking to someone*,
not using a chatbot.

## 2. Core user journey

1. Open app → load notes (upload a PDF/TXT, or "Try the demo notes").
2. Notes become a list of topics, each with a mastery %, the weakest one tagged.
3. Pick a topic → see what the notes say about it → choose:
   - **Teach me this, then test me** (lesson in 3-4 spoken steps with whiteboard → 3-question voice test → summary → next mission)
   - **Just test me** (3-question voice test → summary)
   - **Debate Eklavya on this topic** (choose Eklavya's side, optional motion → spoken debate → verdict)
   - Or just tap the mic and ask anything (free conversation across all notes).
4. During the call: live transcript, whiteboard, quiz card with tappable options, tone reading, mastery changes.
5. Progress section: next mission, mastery-over-time chart, misconceptions, recent answers, "why the tutor did that" log.

## 3. Information architecture and layout

Three sections. Default is **Study**.

| Section | Job | Wide screens (≥ 1024 px) | Phones / tablets |
|---|---|---|---|
| **Notes** | upload, search, pick a topic, remove a document | always-visible left sidebar (~352 px) | one tab of three |
| **Study** | the voice session and everything during it | main area | one tab of three (default) |
| **Progress** | mission, chart, misconceptions, history, decision log | main area | one tab of three |

- **Top bar** (all sizes): brand mark + "Eklavya" + tagline "Your voice study mentor"; on wide screens the
  Study / Progress tabs; language select (Hinglish · English · हिन्दी); theme button (system → light → dark).
- **Phones:** fixed **bottom tab bar** with Notes / Study / Progress (icon + label), 44 px+ targets.
- Choosing a topic always jumps to Study.
- Content max width for reading ~68 characters.

```
Wide:
┌──────────────────────────────────────────────────────────────┐
│ [E] Eklavya            Study | Progress   [Hinglish ▾] [◐]   │
├───────────────┬──────────────────────────────────────────────┤
│ Your notes    │ Study header (topic, actions)                │
│ [Upload][Demo]│ Voice stage (orb + status + steps)           │
│ [Search…]     │ Whiteboard                                   │
│ ▾ ml_notes    │ Quiz card / Test summary                     │
│   Precision 38│ Conversation (transcript)                    │
│   Recall   42 │ [Type a message…] [Send]                     │
│   ...         │ How you sound (tone meters)                  │
└───────────────┴──────────────────────────────────────────────┘
Phone: top bar · one section · bottom tabs [Notes][Study][Progress]
```

## 4. Visual system (current; keep or evolve, but keep it one system)

**Palette** (user-chosen): Lilac Ash `#BCABAE`, Onyx `#0F0F0F`, Graphite `#2D2E2E`, Dim Grey `#716969`, White `#FBFBFB`.

| Token | Light | Dark | Use |
|---|---|---|---|
| bg | `#f2eeef` | `#0f0f0f` | page |
| surface | `#fbfbfb` | `#1a1b1b` | cards, panels |
| surface-2 | `#ebe5e6` | `#2d2e2e` | hover, inset |
| ink / ink-2 / ink-3 | `#0f0f0f` / `#3d3a3b` / `#6a6263` | `#fbfbfb` / `#d3cbcd` / `#a99fa2` | text levels |
| line / line-strong | `#ddd5d7` / `#bcabae` | `#323333` / `#4d4849` | borders |
| accent-fill (buttons, orb) | `#2d2e2e` (Graphite) | `#bcabae` (Lilac Ash) | primary actions |
| on-accent | `#fbfbfb` | `#0f0f0f` | text on accent |
| accent-soft | `#ece3e5` | `#2a2526` | selected row, current step |
| ok / bad / warn text | `#1f6b43` / `#a8281f` / `#7a4f00` | `#7fd1a0` / `#ff9a94` / `#e8b25a` | correct / wrong / weakest |
| speak | `#2a7a52` | `#7fd1a0` | orb while Eklavya speaks |
| chart series 1-4 | `#2a78d6 #eb6834 #1baf7a #eda100` | `#3987e5 #d95926 #199e70 #c98500` | chart lines only |

- **Type:** system UI stack with Devanagari support (Segoe UI Variable / system-ui / Nirmala UI / Noto Sans
  Devanagari). Scale 12 / 14 / 16 / 18 / 22 / 28 px. **Sentence case** everywhere, no ALL-CAPS labels.
- **Shape:** radius 8 (controls) and 12 (panels); pills only for status chips. Borders, not shadows.
- **Spacing:** 4 px base (4, 8, 12, 16, 24, 32, 48).
- **Icons:** Phosphor (regular weight), one family.
- **Motion:** only meaningful motion (orb states, board reveal, mastery change). Respect reduced motion.
- **Hindi:** must render Devanagari well; UI copy may later switch to Hindi labels.

## 5. Components, screen by screen

Each component: what it shows, states, and real copy. Copy in quotes is current UI text.

### 5.1 App shell
- **Top bar** (above). Theme button label: "Theme: follow system / light / dark".
- **Tabs**: Notes · Study · Progress (tablist, arrow-key navigation, selected state).
- **Banner** (top, red-toned, dismissible by next action): errors, e.g. "Microphone permission was denied.",
  "Gemini Live failed: …", "Upload your notes first, then start the voice session."
- **Toasts** (bottom-right; above the bottom bar on phones): short confirmations, kinds ok / bad / info.
  e.g. "Demo notes loaded. Tap a topic to start learning.", "Precision: 38% → 47.3%".
- **Skip link** "Skip to the study area"; a hidden live region announces tutor replies and new boards.

### 5.2 Notes library (sidebar / Notes tab)
- Title "Your notes"; buttons **"Upload notes"** (primary, upload icon; accepts .pdf, .txt) and **"Try the demo notes"** (quiet).
- **Search** "Search topics" (filters across documents; shows "3 of 5" per document; "No topics match "xyz".").
- **Document group** (one per uploaded file): collapsible header with file name ("ml_notes.txt"),
  "5 topics", a **Remove** text button → in-place confirm: "Remove "ml_notes.txt" and your progress on its topics?"
  **"Yes, remove"** / Cancel.
- **Topic row** (button): name, mastery % (right), thin mastery bar, **"Weakest"** tag on the lowest topic,
  selected state for the open topic.
- States: loading "Loading your notes...", empty "No notes yet" + "Upload a PDF or text file, or try the demo
  notes, and your topics will appear here.", uploading (button busy), error (banner).

### 5.3 Study header
- **No topic picked:** card "Pick a topic to study" + "Choose one from your notes. Eklavya teaches it step by
  step, then tests you by voice. Or tap the microphone and ask anything." + phone-only button "Open my notes".
- **Loading:** "Opening the topic...".
- **Topic open:** title (e.g. "Precision"); meta line "Mastery 38%", "From ml_notes.txt", "3 practice questions ready";
  optional callout "To fix: Confuses precision with recall"; actions **"Teach me this, then test me"** (primary,
  play icon) and **"Just test me"** (secondary); expandable **"Debate Eklavya on this topic"**; expandable
  **"What your notes say"** (passages from the notes; if none were filed: "Nothing is filed under this topic,
  so these are the closest passages in your notes.").
- **Debate panel** (inside the expandable): hint "You talk, Eklavya argues back using your notes, then says who
  won and why."; radio group "Eklavya argues": "For the motion (you argue against)" / "Against the motion (you
  argue for)"; text field "Motion (optional, Eklavya picks one if you leave it empty)" with placeholder
  "e.g. Precision matters more than anything else in this unit"; button **"Start the debate"** (chat icon).
  The panel collapses when the debate starts.

### 5.4 Voice stage (the heart of the app)
- **Orb** (big round button, mic icon ↔ stop icon) + status text + hint "Headphones work best."
- States and status text:
  | State | Orb | Status |
  |---|---|---|
  | idle | accent fill, mic icon | "Tap to talk to Eklavya" |
  | connecting | pulsing | "Connecting..." |
  | listening | accent, stop icon, soft ring | "Listening. Just talk." |
  | speaking | **green**, animated ring | "Eklavya is speaking. Talk to interrupt." |
- The student can **interrupt** Eklavya by talking; the transcript marks the cut-off reply.
- **Lesson stepper** (learn/test sessions only): numbered steps **Learn → Test → Summary** (test-only: Test →
  Summary), current step highlighted, done steps checked.
- **Debate tag** (debate only): "Debate: Precision · Motion: Precision matters more than recall · Eklavya argues against".
- Opportunity: real voice-level animation on the orb, big live captions mode.

### 5.5 Whiteboard (signature feature)
Appears while Eklavya explains; the content arrives live from the tutor. Label "Whiteboard", board title, body:
- **Formula:** large type with stacked fractions, e.g. `Precision = TP / (TP + FP)` drawn as a fraction;
  "where" lines ("TP = spam correctly caught"); an **Example** row ("8 / (8 + 2) = 0.8").
- **Steps:** numbered list; the step being spoken is highlighted, earlier ones muted.
- **Table:** small comparison (2-5 columns, ≤ 8 rows), first column as row labels.
- **History chips:** earlier boards of this session as pills; tap to look again; current one pressed.
- Boards stay after the call ends; cleared when a new session starts. One reveal animation per new board.

### 5.6 Quiz card (during a voice test)
- Head: "Question 1 of 3" (or "Quiz question") + topic name.
- Question text; four **tappable options** "A. …" to "D. …" (student can tap or say the answer).
- After grading, a result block: **"Correct"** (check icon, green) or **"Not quite"** (warning icon, red);
  "Precision mastery 38% to 47.3% (+9.3)"; optional "Misconception: Uses recall's denominator for precision";
  optional "Misconception resolved". Picked option shows correct / wrong styling.

### 5.7 Test summary card (after the last question)
"Test complete"; big score "2 of 3 correct"; "Mastery 38% → 56%"; "Mistakes to fix:" bullet list;
"1 misconception(s) resolved".

### 5.8 Conversation (transcript)
- Bubbles: **Eklavya** (left) and **You** (right), each with a small name label; text streams in word by word;
  an interrupted reply is marked as cut.
- Empty: "Try saying: “Mujhe precision aur recall simple example se samjhao”".
- **Composer** under it: "Or type a message to Eklavya" + **Send** (enabled only during a call).

### 5.9 "How you sound" (tone card)
Three meters with % : **Confused**, **Confident**, **Frustrated** (0-100), plus Eklavya's short note,
e.g. "Hesitant on the denominator, slowing down." Updates after each student turn. Never judgemental in tone.

### 5.10 Progress section
- Title "Your progress".
- **Mission card:** "Next mission, 15 minutes"; priority pill "High priority" / "Medium" / "Low"; title
  ("Mastering Recall Calculation and Application"); reason paragraph; numbered task list (3 tasks).
- **Mastery over time chart:** one line per topic (≤ 4 coloured, others folded into "more topics (see the
  table)"), y 0-100 "Mastery %", x "Answer number" from "start"; filled dot = correct answer, hollow dot =
  wrong; legend; summary sentence above ("Precision went from 38% to 57.7% over 4 answers, and you practised 2
  other topics."); hover/arrow-key readout "After answer 6 · Precision 50.2% · F1 Score 61.8%"; button
  **"View as table"** ↔ **"View as chart"**.
- **Misconceptions** (from `alerts`): open misconceptions and weak-topic warnings, each with severity (high / medium / low), topic and message; empty
  "No misconceptions detected yet."; when some were fixed: "2 misconception(s) resolved. Nice work."
- **Recent answers:** cards "Correct: Precision" / "Wrong: Recall" (green/red edge), question text,
  "Mastery 41.4% to 50.2%"; empty "Answer a quiz question and your history shows up here."
- **Why the tutor did that** (agent decision log): cards with agent name (e.g. "Study Mission", "Evaluation",
  "Voice tutor", "Learner profile"), "Saw: …", "Decided: …", "Did: …". Shows the AI's reasoning chain
  (observation → decision → action); judges love this, keep it readable.

## 6. Data the UI shows (real shapes)

`GET /api/dashboard`
```json
{
  "mastery": [{"topic_id": 3, "topic_name": "Precision", "document_id": 1, "document": "ml_notes.txt", "mastery_score": 38.0, "confidence_score": 0.5}],
  "weak_topics": [{"topic_id": 3, "topic_name": "Precision", "mastery_score": 38.0}],
  "alerts": [{"type": "misconception", "severity": "high", "topic": "Precision", "message": "Uses recall's denominator for precision"},
             {"type": "weak_topic", "severity": "medium", "topic": "Recall", "message": "Recall mastery is 42%"}],
  "mission": {"mission_title": "Fix Precision vs Recall confusion", "duration_minutes": 15, "priority": "High", "reason": "…", "tasks": ["…", "…", "…"]},
  "quiz_history": [{"topic_name": "Precision", "question": "Which formula gives precision?", "student_answer": "B", "is_correct": true, "mastery_before": 50.2, "mastery_after": 57.7, "answered_at": "…"}],
  "progress": [{"attempt_id": 1, "topic_id": 3, "topic_name": "Precision", "mastery_before": 38, "mastery_after": 31, "is_correct": false, "answered_at": "…"}],
  "misconceptions_resolved": 2,
  "learner_state": [{"confusion": 0.2, "confidence": 0.8, "frustration": 0.1, "note": "…"}],
  "agent_log": [{"agent_name": "study_mission", "observation": "Weakest: Recall at 45%", "decision": "Prioritise Recall (High)", "action_taken": "Created mission: …", "confidence": 0.8}]
}
```
`GET /api/topics/{id}` → `{topic_id, topic_name, document_id, mastery, question_count, open_misconceptions:[{misconception_text}], notes:[{heading, text}], notes_are_related}`

Other actions: `POST /api/upload-document` (multipart file upload), `DELETE /api/documents/{id}`, `POST /api/demo/seed`.

Voice: WebSocket `/ws/voice?mode=free|learn|test|debate&topic_id=&side=&motion=&lang=`. Live events the UI reacts to:
`transcript` (role, text, final) · `interrupted` · `emotion` (confusion, confidence, frustration, note) ·
`phase` (teaching / test / summary / debate) · `board` (whiteboard card) · `quiz_question` (question, options,
number, total, topic) · `mastery` (topic, before, after, is_correct, misconception) · `test_summary` ·
`mission` · `turn_complete` · `error` (message).

Demo topics: Classification in Machine Learning 70%, Confusion Matrix 65%, Precision 38% (Weakest),
Recall 42%, F1 Score 55%.

## 7. States every screen must design

Empty (no notes), loading (notes, topic, upload), connecting to voice, listening, speaking, interrupted,
quiz waiting / correct / wrong, test complete, debate running, error banner (mic denied, Gemini failed, session
time limit "Session time limit reached. Start a new session to continue."), offline backend, long content
(long topic names, long formulas, Hindi text), light and dark.

## 8. Accessibility and quality bar (must keep)

WCAG 2.1 AA contrast in both themes; 44 × 44 px minimum targets; visible focus ring; full keyboard use
(tabs with arrows, chart readout with arrows); screen-reader announcements for tutor replies, new boards and
connection changes; formulas readable as text; reduced-motion respected; no horizontal scroll at 390 px;
works at 200 % zoom. Current build: axe-core 0 violations on desktop, tablet and phone.

## 9. Voice of the copy

Plain, warm, short, sentence case, second person ("Your notes", "Tap to talk to Eklavya"). Hinglish examples
are welcome. Errors say what happened and what to do. No exclamation-mark hype, no emoji, no "AI-powered".

## 10. Coming next (leave room in the design)

**Today** home screen (greeting, streak, "Your 10-minute plan", one big Start button) · first-run onboarding
(language → notes → say hello, with a mic-permission explainer) · voice-reactive orb and big captions ·
Hindi UI labels · installable phone app (PWA) · **Viva practice** (examiner persona, timer, marks out of 10,
report card) · **Debate scoreboard** (live argument-strength meter, verdict card) · **Snap a doubt** (photo of
a textbook page) · spaced revision ("due today") · concept map of topics coloured by mastery · exam-date
planner · flashcards and PDF study pack · sign-in.

## 11. Constraints for the build

The current frontend is plain HTML + CSS + JavaScript modules, no build step, served as static files. A new
design can be any static frontend, but it must keep the data contract in section 6, keep everything readable
in light and dark, and keep the accessibility bar in section 8. Do not put API keys in the frontend; the
backend address lives in `frontend/config.js` (`apiBase`).
