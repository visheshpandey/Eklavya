# Design guide

How the Eklavya interface is organised and styled. The code is in `frontend/css/` and
`frontend/js/components/`.

## Structure: four sections

| Section | Job | Wide screens (64rem and up) | Phones and tablets |
|---|---|---|---|
| Today | greeting, streak, days to exam, today's plan with one Start button, due revisions, exam planner | main area (default) | one tab of four (default) |
| Notes | pick a topic, upload (PDF, text or a photo), search, remove a document | always-visible sidebar | one tab of four |
| Study | learn, test, quick revision, viva, debate by voice; whiteboard; captions; show a photo | main area | one tab of four |
| Progress | mission, mastery over time, concept map, flashcards, viva/debate results, misconceptions, recent answers, decision log, study pack | main area | one tab of four |

`#app[data-view]` decides which section shows. Choosing a topic always moves to Study. On phones the
tabs sit in a fixed bottom bar; on wide screens they sit in the top bar and Notes is hidden because the
sidebar already shows it.

## Tokens (`css/tokens.css`)

* Colour: the five-colour palette Lilac Ash `#BCABAE`, Onyx `#0F0F0F`, Graphite `#2D2E2E`, Dim Grey `#716969`,
  White `#FBFBFB`. Light: white surfaces, Graphite buttons, Lilac tints for hover and selection, Dim Grey-toned
  secondary text. Dark: Onyx page, Graphite panels, Lilac Ash as the accent (buttons, orb, brand mark).
  Green marks only the speaking state and correct answers, red only wrong answers. Chart series keep their
  validated hues (a muted mauve line failed the validator's chroma check). Light and dark follow the system;
  `<html data-theme>` overrides (the header button cycles system, light, dark).
* Type: system font stack with Devanagari, so Hindi renders without a download. Sentence case everywhere.
* Shape: radii 8 and 12, borders instead of shadows, 44 px minimum tap size (`--tap`).
* Chart series colours `--series-1..4` were checked with the dataviz skill's palette validator for both
  themes.

## Chart rules (`mastery-chart.js`)

One y axis (0 to 100), 2 px lines, 8 px markers (filled = correct, hollow = wrong), hairline grid,
legend for two or more series, end labels only when they fit, more than four topics fold into
"more topics (see the table)". Hover and the arrow keys both show a readout; "View as table" gives the
same data as text. Text uses ink colours, never the series colour.

## Whiteboard (`whiteboard.js`)

The only place with large display type: what the tutor is explaining, drawn while it talks. Three kinds:
formula (stacked fractions, "where" lines, a worked example), steps (the spoken step highlighted, earlier ones
muted), table (a small comparison). Earlier boards stay one tap away as chips. One short reveal animation per
new board (off with reduced motion). Formulas carry `role="math"` and the plain formula text as their label;
each new board is announced once ("On the whiteboard: Precision").

## Study features (phase 2-4)

* **First-run guide** (`onboarding.js`): a modal `<dialog>` in 3 steps (language, notes, how talking works). The mic
  permission is explained before the browser asks. Shown once per browser; Escape or "Skip for now" closes it.
* **Interface language** (`lib/strings.js`): Hindi selected = Hindi labels (Devanagari); English and Hinglish keep
  English labels. A unit test checks every English label has a Hindi one.
* **Living orb**: a halo grows with whoever is talking (mic level, or Eklavya's voice in the speaking green). Off
  with reduced motion. **Captions** show the latest tutor sentence in large type (the transcript stays the record).
* **Viva card**: question, a 90-second answer bar (amber in the last 10 seconds, not announced every second),
  marks so far as chips, then a report card with marks out of 10.
* **Debate scoreboard**: a big average meter plus evidence, logic and rebuttal bars for the latest argument; a
  verdict card at the end. Numbers are always written next to the bars.
* **Concept map**: topics on a ring, lines where one topic's notes mention another, colour = mastery on one hue
  (`--map-1` weak to `--map-5` strong, separate light and dark steps). The SVG is decorative for screen readers;
  the list under it carries the same information and its buttons open the topic.
* **Flashcards**: the card is a button (Enter/Space flips); arrow keys move; cards from mistakes have a red edge.
* **Celebrations**: only real wins (mastery up, a debate won, a streak of 2+ days): one chip rises and fades.
* **Study pack**: `print.css` hides the app and prints only the pack; "Save as PDF" in the print dialog makes the file.

## Accessibility checklist

* Skip link, one `h1`, landmarks (header, nav, aside, main), tablist with arrow-key support.
* Visible focus ring on every control; `prefers-reduced-motion` and forced colours respected.
* Status changes go through the polite live region (`#announcer`); the chat log itself is not announced
  twice.
* Destructive actions (Remove) confirm inside the page, not with `confirm()`.
* Scrollable areas (conversation, decision log) are focusable so keyboard users can scroll them.
* Last audit (axe-core, real Chrome, after the study features): 0 violations on the first-run guide, Today,
  Progress, and phone Today and Progress; earlier: desktop light and dark, tablet and phone; no
  horizontal scroll; every interactive element is at least 44 by 44 px.
