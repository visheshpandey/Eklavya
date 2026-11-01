# Design guide

How the Eklavya interface is organised and styled. The look comes from the design in `design/new-frontend/` (a standalone prototype:
`index.html`, `styles.css`, `app.js`). The real code is in `frontend/css/` and `frontend/js/components/`.

## Structure: seven screens

| Screen | Job |
|---|---|
| Today | greeting, your next session on a 3D desk, today's three-step route, subject cards, then the plan, due revisions and the exam planner |
| My notes | drop zone (PDFs, text, photos, several at once), add from a link, the library grouped by document |
| Study room | the orbit of topics and six ways to study; while a call is live the picker steps aside and the stage, whiteboard, quiz and conversation take over |
| Ask Eklavya | a typed question answered from the notes, with the passages it used; recent doubts; searchable doubt history |
| Progress | six number tiles, concept map with detail card, mastery by subject, misconceptions, badges, mock exam, charts, decision log |
| Flashcards | today's cards on a 3D flip card; the decks (make cards, browse, mistakes) below |
| Study groups | groups, shared notes, leaderboard, challenge a friend (accounts only; guests see an invitation) |

`#app[data-view]` decides which screen shows; `#app[data-live]` is "on" during a voice call. On a desktop the tabs are a left rail
(with the streak card and the account chip); at 900px and below the rail becomes a bottom bar of seven short tabs.

## Look

* Paper background `#f2efe7`, forest green `#29483e` for buttons and the hero, terracotta `#b8604a` for emphasis and the active
  marker, ochre and sage for status. Dark follows the system unless the theme button is used. Status colours: Strong (80+) green,
  Growing (60 to 79) ochre, Revisit (under 60) terracotta; the number inside a circle always stays dark for contrast.
* Type: Instrument Serif for headlines (italic for the emphasised word), DM Sans for text, DM Mono for small uppercase labels.
  All three are bundled in `frontend/fonts`. Hindi falls back to Nirmala UI or Noto.
* Shape: small radii (4px panels, 6px controls). Motion is gentle and stops with "reduce motion".

## Tokens and files

* `css/tokens.css` is the only place colours, type, space and shape are defined. It is generated from one table of values, so the two dark blocks stay identical.
  The older names (`--bg`, `--surface`, `--accent-fill`...) are kept so every component follows the palette; the design's own names (`--paper-hi`, `--hero`,
  `--sage`, `--clay-pale`, `--terracotta`, `--ochre`) are there too. Do not give two variables the same name (a width and a colour once both were `--rail`).
* `css/shell.css` holds the layout and the screens above. Class names the older components already used were renamed there:
  `stage`->`desk`, `step`->`rstep`, `tab`->`tnum`, `eq`->`heq`, `empty`->`splitcta`, `badge`->`srcbadge`, `legend`->`maplegend`, `pill`->`duepill`,
  `doc`->`docrow`, `doubts`->`recent`, `composer`->`askbox`, `shell`->`frame`.
* `components.css` and `skin.css` style the working components (quiz, whiteboard, chat, charts, dialogs); they read the same tokens.

## Rules that keep it working

* Never put `filter`, `backdrop-filter` or `transform` on an ancestor of a `position: fixed` element: it becomes the containing block (this once moved the phone bar to the top).
* The page must not scroll sideways at 390px, and the rail must fit a short screen (it compacts under 780px height and drops the streak card under 640px).
* Everything the model writes is set with `textContent`, never as HTML.
* Interactive things are real buttons or links, dialogs are `<dialog>`, tabs follow the WAI-ARIA pattern, the concept map circles are keyboard buttons.
