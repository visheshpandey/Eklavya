# Design guide

How the Eklavya interface is organised and styled. The code is in `frontend/css/` and
`frontend/js/components/`.

## Structure: three sections

| Section | Job | Wide screens (64rem and up) | Phones and tablets |
|---|---|---|---|
| Notes | pick a topic, upload, search, remove a document | always-visible sidebar | one tab of three |
| Study | learn, then test, by voice | main area (default) | one tab of three |
| Progress | mission, mastery over time, misconceptions, recent answers, decision log | main area | one tab of three |

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

## Accessibility checklist

* Skip link, one `h1`, landmarks (header, nav, aside, main), tablist with arrow-key support.
* Visible focus ring on every control; `prefers-reduced-motion` and forced colours respected.
* Status changes go through the polite live region (`#announcer`); the chat log itself is not announced
  twice.
* Destructive actions (Remove) confirm inside the page, not with `confirm()`.
* Last audit (axe-core, real Chrome): 0 violations on desktop light and dark, tablet and phone; no
  horizontal scroll; every interactive element is at least 44 by 44 px.
