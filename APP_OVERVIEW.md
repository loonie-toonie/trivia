# Trivia Night — Complete App Architecture

**Last updated:** 2026-08-01
**Repo:** `/Users/yuki/Projects/personal/Coding/SCJ/clara` · **Default branch:** n/a (not yet a git repo) · **Trunk:** n/a
**Stack:** Zero-dependency static site — plain HTML + CSS + ES modules, IndexedDB for persistence
**Environments:** Local only today (`npm run dev` → `http://localhost:5173`). No deployment yet; see §11.
**Companion doc:** [SECURITY.md](./SECURITY.md)

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Application Shell & Routing](#4-application-shell--routing)
5. [Authentication Flow](#5-authentication-flow)
6. [Authorization Model](#6-authorization-model)
7. [Data Model](#7-data-model)
8. [Features](#8-features)
9. [Cross-Cutting Systems](#9-cross-cutting-systems)
10. [Configuration & Environments](#10-configuration--environments)
11. [Build, CI & Deploy](#11-build-ci--deploy)
12. [Testing](#12-testing)
13. [Performance & Scale](#13-performance--scale)
14. [Operations](#14-operations)
15. [Known Issues & Technical Debt](#15-known-issues--technical-debt)
16. [Glossary](#16-glossary)
17. [Change Log](#17-change-log)

---

## 1. Overview

A single-screen trivia board for running a live trivia night from one laptop plugged into a
projector or TV. The host sets up questions ahead of time in the browser, then switches to
Present Game and drives the whole evening with a clicker or the spacebar.

The problem it solves: a slide deck can't be edited five minutes before the event, can't hide
answers until you want them, and can't track which questions have already been played. This does
all three, and it works with no network connection at the venue.

- **Users:** one host/presenter. There is no player-facing view, no login, no accounts, no
  multi-device sync — teams look at the projected screen and shout answers.
- **Lifecycle state:** built 2026-08-01, pre-first-event. Seeded with the real event content,
  extracted from the Canva design `DAHRCuKC6js` on 2026-08-01 (`js/data.js:1`).
- **Non-goals:** buzzers, team score tracking, player devices, remote play, multi-host editing.

The game is fixed at three rounds, matching the event format:

| Round | Name | Categories | Questions | Format |
|---|---|---|---|---|
| 1 | General Knowledge | Pop Culture · History and Geography · Sports and Nutrition | 3 × 3 = 9 | multiple choice, 4 options each |
| 2 | Lebanese Edition | Guess the Logo · Lebanese Proverbs · Lebanese Music | 3 × 3 = 9 | multiple choice, 4 options each (last tile still blank) |
| 3 | Challenge Time! | none — a flat 3 × 3 grid of mystery tiles | 9 | open questions and physical challenges, no options |

Multiple choice and open questions are the *same* record — an open question is simply one whose
`options` array is empty (§7.4). Round and category counts are not hard-coded: **Board Size**
resizes any round at runtime (§8.4).

## 2. Tech Stack

| Layer | Choice | Version | Notes |
|---|---|---|---|
| Language | JavaScript (ES2022 modules) | — | No transpiler, no bundler, no TypeScript |
| Markup | Hand-written HTML | — | `index.html` is the whole shell |
| Styling | Plain CSS with custom properties | — | `css/style.css`, ~800 lines, incl. 9 `@keyframes` |
| Motion | CSS animations/transitions only | — | No JS animation library; all of it behind `prefers-reduced-motion` |
| Persistence | IndexedDB | — | Native API, wrapped in `js/db.js` |
| Seeded media | Local files in `assets/` | — | ~20 MB committed, referenced as `./assets/<file>` |
| Dialogs | Native `<dialog>` | — | `showModal()` + `returnValue`, no library |
| Fullscreen | Fullscreen API | — | `requestFullscreen()` for Present Game |
| Dev server | `serve` via `npx` | ^14 | Only needed because ES modules need `http://` |
| Runtime deps | **none** | — | `package.json` has no `dependencies` block |

**Notable absences and why:**

- *No framework.* The whole UI is one board and one overlay. A framework would be more code than
  the app.
- *No build step.* Files served are files authored. This matters at a venue — if something breaks
  at 8pm you edit a file and hit refresh.
- *No backend.* Everything lives in the host's browser. The consequence is that the board does not
  sync between devices — see §15 and `SECURITY.md` §16.
- *No `localStorage`.* It caps out at ~5 MB and cannot store `Blob`s; one trivia video would break
  it. IndexedDB is used instead.

**Load-bearing browser APIs** (all require a reasonably current Chrome/Edge/Safari/Firefox):
`indexedDB`, `structuredClone`, `<dialog>.showModal()`, `HTMLElement.inert`, `navigator.storage.persist()`,
and — with a graceful fallback in `js/board.js:249` — the RegExp `v` flag with `\p{RGI_Emoji}`.

## 3. Project Structure

```
clara/
├── index.html              Entire DOM shell: toolbar, board, question stage, two dialogs
├── package.json            Dev-server scripts only; no dependencies
├── vercel.json             Static hosting config + security headers
├── canva-order.json        Raw text/media extraction from the Canva design; source material only,
│                           never loaded by the app
├── assets/                 Seeded question media, committed (~20 MB, 18 files) — see §3.1
├── css/
│   └── style.css           All styling. Design tokens in :root (colors, radii, --tile-min)
├── js/
│   ├── app.js              Entry point. Boot, toolbar wiring, keyboard, status line
│   ├── state.js            Game state, normalisation, autosave, media URL resolution
│   ├── db.js               IndexedDB wrapper — kv store + media blob store
│   ├── data.js             Seed content (the 27 default questions) + blank factories
│   ├── board.js            Renders round tabs, category headers, tiles, board note
│   ├── present.js          The question stage: media → question (+ choices) → answer
│   ├── editor.js           Question editor dialog + Board Size dialog
│   └── backup.js           JSON export/import with base64-inlined media
├── APP_OVERVIEW.md         This file
├── SECURITY.md             Companion security doc
└── README.md               Quick start for the host
```

**Entry point:** `index.html` loads `js/app.js` as `type="module"`; every other module is pulled in
by static `import`.

### 3.1 `assets/`

Real media for the seeded questions, committed to the repo rather than uploaded through the editor,
so a fresh browser profile shows the finished board without a Restore. Files are referenced from
`js/data.js` as plain relative URLs — `{ kind: 'video', url: './assets/r3-q2-video.mp4' }` — built by
the `img()` / `vid()` helpers (`js/data.js:59`). Because they are ordinary same-origin static files
they never touch IndexedDB and are not included in a Backup `.json`.

Naming is positional: `r<round>-<category>-q<n>-<subject>.<ext>`.

| File | Used by |
|---|---|
| `r1-popculture-q2-video.mp4` | R1 · Pop Culture · 200 |
| `r1-history-q1-video.mp4` | R1 · History and Geography · 100 |
| `r1-history-q3-map.png` | R1 · History and Geography · 300 |
| `r1-sports-q3-haaland.png` | R1 · Sports and Nutrition · 300 |
| `r2-logo-q1-gandour.png`, `r2-logo-q2-xanddough.png`, `r2-logo-q3-woodenbakery.jpg` | R2 · Guess the Logo · 100/200/300 |
| `r2-proverbs-q1.png`, `r2-proverbs-q2.png`, `r2-proverbs-q3.png` | R2 · Lebanese Proverbs · 100/200/300 |
| `r3-q2-video.mp4`, `r3-q3-song.mp4`, `r3-q5-image.jpg` | R3 · questions 2, 3, 5 |

Five files are present but **not referenced** by `js/data.js`: `r1-history-q1-poster.jpg`,
`r1-popculture-q2-poster.jpg`, `r3-q2-rain-poster.jpg`, `r3-q3-fareskaram-poster.jpg` (poster frames
kept from the extraction) and `r3-q8-fadelchaker.mp4` (its question is still unwritten). The `.mp4`s
are muxed video+audio, so `kind: 'video'` covers the audio-only challenges too — there is no separate
audio file in the seed.

The largest single file is `r1-popculture-q2-video.mp4` at 6.1 MB.

**Most-changed files, and what each owns:**

| File | Responsibility |
|---|---|
| `js/data.js` | The questions themselves — but only as a *seed*, see §7 |
| `css/style.css` | Every visual decision; tokens at the top of the file, motion at the bottom |
| `js/board.js` | Anything about how tiles and headers look or behave |
| `js/present.js` | Anything about the three-step reveal, including the choice list |
| `js/editor.js` | Anything in either dialog |
| `js/state.js` | The shape of the data and what counts as valid |

## 4. Application Shell & Routing

**N/A — there is no router.** The app is a single document at `/` with no URL state; nothing is
routable, bookmarkable, or deep-linkable. Navigation is view-state held in `state.js`:

| View | Trigger | Implementation |
|---|---|---|
| Board (default) | — | `#board` + `#board-note` inside `.board-wrap` |
| Round 1 / 2 / 3 | Round tab, or keys `1` `2` `3` | `state.game.activeRound`, re-renders the board |
| Question stage | Click a tile | `#stage` un-hidden; `#app` set `inert` |
| Edit mode | Edit button, or `E` | `body.editing` class; tiles open the editor instead |
| Present mode | Present Game, or `P` | `body.presenting` class + `requestFullscreen()` |
| Question editor | Click a tile while editing | `<dialog id="dlg-edit">.showModal()` |
| Board Size | Board Size button | `<dialog id="dlg-size">.showModal()` |

Edit mode and Present mode are mutually exclusive — `setEditing`/`setPresenting` in
`js/state.js:158` each clear the other.

**Keyboard map** (`js/app.js:174`, suppressed while typing or while a dialog is open):

| Key | Board | Question stage |
|---|---|---|
| `1`–`9` | switch round | — |
| `Space` / `Enter` / `→` | — | advance a step |
| `←` / `Backspace` | — | step back |
| `Esc` | leave present/edit mode | close the stage |
| `E` | toggle edit mode | — |
| `P` | toggle present mode | — |
| `Cmd`/`Ctrl`+`S` | save now | — |

## 5. Authentication Flow

**N/A — the app has no authentication.** There are no accounts, no sessions, and no server to
authenticate against. Whoever can open the page has full control of the board. This is a deliberate
fit for the use case (one host, one laptop) and is recorded as an accepted risk in
`SECURITY.md` §16.

## 6. Authorization Model

**N/A — there are no roles or capabilities.** Every visitor is implicitly the host and can read and
write everything. The only access boundary is the browser origin: IndexedDB is origin-scoped, so a
game saved on `localhost:5173` is invisible to any other origin. See `SECURITY.md` §4.

## 7. Data Model

There is exactly one persisted document. It lives in IndexedDB under database `trivia-night`
(version 1), object store `kv`, key `"game"`. Uploaded media lives alongside it in object store
`media`, keyed by media id, one `Blob` per entry. Media that ships with the repo under `assets/`
(§3.1) is *not* in IndexedDB — it is referenced by relative URL.

### 7.1 `game` document

| Field | Type | Meaning |
|---|---|---|
| `schema` | `number` | Schema version, currently `2` (`data.js:22`, `SCHEMA_VERSION`) |
| `title` | `string` | Board headline; editable in place in edit mode |
| `activeRound` | `number` | Index of the visible round; persisted so a refresh returns you to it |
| `updatedAt` | `string` | ISO timestamp, stamped on every `save()` |
| `rounds` | `Round[]` | Always at least one; three by default |

### 7.2 `Round`

| Field | Type | Meaning |
|---|---|---|
| `id` | `string` | `"r1"`, `"r2"`, `"r3"` — informational, not a lookup key |
| `name` | `string` | Tab label: "Round 1", "Round 2", "Final Round" |
| `subtitle` | `string` | Shown on the question stage: "General Knowledge", "Lebanese Edition", "Challenge Time!" |
| `icon` | `string` | Emoji on the round tab |
| `color` | `string` | Hex; tints the active tab and stage heading |
| `hideCategories` | `boolean` | `true` for Round 3 — suppresses headers, renders a flat grid, enables Random Pick |
| `gridCols` | `number` | Tiles per row **when `hideCategories`**; otherwise mirrors `categories.length` |
| `categories` | `Category[]` | One per column. Round 3 has exactly one, holding all nine questions |

### 7.3 `Category`

| Field | Type | Meaning |
|---|---|---|
| `id` | `string` | Generated |
| `name` | `string` | Header text, without the emoji |
| `icon` | `string` | Leading emoji, stored separately so flex `gap` can space it (`board.js:83`) |
| `color` | `string` | Hex; tints the header text and the tile hover glow |
| `questions` | `Question[]` | One per row |

### 7.4 `Question`

| Field | Type | Meaning |
|---|---|---|
| `id` | `string` | Generated |
| `prompt` | `string` | The question. Empty is legal — renders as a dashed "empty" tile |
| `options` | `string[]` | Multiple-choice answers, in display order. **Empty array = an open question**, no choice list is rendered. Capped at 8 by `normalise()` and by `editor.js:parseOptions` |
| `correct` | `number` | Index into `options` of the right answer, or `-1` when there is none (every open question, and any multiple-choice question the host has not marked yet) |
| `answer` | `string` | Free text revealed at step 2. Optional for multiple choice — the correct option is highlighted regardless — and it stays hidden when blank (`present.js:108`) |
| `points` | `number` | Shown in the tile corner and on the stage. `0` hides it |
| `label` | `string` | Overrides the `?` on the tile. Usually blank |
| `media` | `Media \| null` | Shown *before* the question |
| `done` | `boolean` | Played already — tile dims and shows `✓` |

`js/data.js` builds these through two factories rather than by hand: `mc(points, prompt, options,
correct, extra)` and `open(points, prompt, answer, extra)` (`js/data.js:30`, `js/data.js:45`). The
only difference between them is whether `options` is populated.

**`correct` is always validated against `options`.** `normalise()` keeps it only when it is an
integer in `[0, options.length)` and otherwise forces `-1` (`state.js:79`); the editor applies the
same rule on save (`editor.js:131`). A truncated choice list can therefore never leave a dangling
correct index pointing past the end of the array.

### 7.5 `Media`

Three variants, discriminated by which reference field is present:

| Field | Type | Meaning |
|---|---|---|
| `kind` | `"image" \| "video" \| "audio" \| "youtube"` | Decides which element the stage builds |
| `mediaId` | `string?` | Key into the `media` object store — an uploaded file |
| `url` | `string?` | Used when `mediaId` is absent. Either a repo-relative path (`./assets/…`, the seeded content) or an external link the host pasted |
| `videoId` | `string?` | YouTube 11-char id, parsed from the URL at edit time |
| `name`, `mime` | `string?` | Original filename and MIME type, informational |

`mediaSrc()` (`state.js:241`) returns `media.url` verbatim when there is no `mediaId`, so an
`./assets/` path and a remote `https://` link travel exactly the same code path — only uploads go
through `URL.createObjectURL`.

### 7.6 Invariants

- `state.js:normalise()` runs on **every** load and on every restore. Anything it cannot make sense
  of is replaced with a default, so a corrupted or hand-edited document can never crash rendering.
  If `rounds` is missing or empty, the whole document is rejected and the seed is used instead.
- `options` is always an array of strings after normalisation — non-string entries are coerced with
  `String(o ?? '')` and the list is truncated to 8 (`state.js:70`). `correct` is always either `-1`
  or a valid index into that array.
- Every category in a round with `hideCategories === false` is expected to have the same number of
  questions. `resizeRound()` maintains this; the renderer places tiles by explicit
  `grid-column`/`grid-row` so a mismatch degrades to a gap rather than a scrambled board.
- `media` blobs are garbage-collected on every save: `db.mediaPrune()` deletes any blob whose id no
  longer appears in any question (`state.js:save`).

### 7.7 Migrations

`schema` is `2`. **1 → 2** (2026-08-01) added `options` and `correct` to `Question` and needed no
migration code: a schema-1 question simply has no `options` key, and `normalise()` already defaults
an absent or non-array `options` to `[]` and `correct` to `-1` — which is exactly the definition of
an open question, so old documents upgrade to their correct meaning by falling through the normal
path (`state.js:68`).

`normalise()` still rewrites `game.schema` unconditionally (`state.js:48`), so nothing anywhere reads
the incoming version. A migration that *cannot* be expressed as a field default — renaming a field,
reinterpreting an existing value — must branch on the incoming `game.schema` *before* that line.

## 8. Features

### 8.1 The board

**Purpose** — the resting state of the evening: what everyone stares at between questions.

**Files** — `js/board.js`, `css/style.css` (`.board`, `.tile`, `.cat-head`).

**Data** — reads the active round; writes `question.done` on right-click.

**Key flows**

1. `renderBoard()` sets `--cols` and toggles `.has-heads`.
2. Rounds with categories render one column per category, header on grid row 1, tiles on rows 2+,
   each placed explicitly.
3. Rounds with `hideCategories` render a flat auto-flowing grid — no headers.
4. Tiles show `?` (or `label`), the point value top-right, and a media badge bottom-left when the
   question has an image/clip/track attached.
5. Played tiles go dashed and dim and show `✓`, the check scaling in via `check-pop`. They remain
   clickable so a mis-click is recoverable.
6. Empty questions render dashed and faded so gaps are obvious during setup.

**Motion** — headers and tiles cascade in on a round switch: each element carries a `--i` index
(`board.js:75`, `board.js:109`, `board.js:121`) that CSS turns into an `animation-delay`
(`head-in` at 60 ms per step, `tile-in` at 34 ms per step). Category rounds use `ci + qi`, giving a
diagonal wave from the top-left; the flat Round 3 grid uses the plain tile index.

The entrance is gated on an `is-entering` class that `renderBoard()` only applies when the active
round actually changed (`board.js:56`) — without it every autosave re-render would replay the whole
cascade. Hover lifts a tile 4 px and scales it 1.5%, with the face itself scaling 12%.

**Edge cases** — the grid uses `grid-auto-rows: minmax(var(--tile-min), 1fr)` inside a
`height: 100dvh` shell, so adding rows shrinks tiles to fit rather than pushing the board off-screen;
past ~9 rows the board scrolls internally.

**Known quirks** — right-click toggles played state. This is deliberate (fast during a live game)
and is surfaced in the board note while editing, but it is invisible otherwise.

### 8.2 The question stage

**Purpose** — reveal a question in controlled steps so the room never sees the answer early.

**Files** — `js/present.js`, `css/style.css` (`.stage`).

**Key flows**

```
tile click
   │
   ├─ has media ──▶ step 0: MEDIA        full-bleed image / video / audio / YouTube
   │                   │  Space
   │                   ▼
   └─ no media ───▶ step 1: QUESTION     media shrinks to a thumbnail above the text;
                       │                 choices (if any) stagger in beneath it
                       │  Space
                       ▼
                    step 2: ANSWER       correct choice turns green with a ✓, the rest dim;
                       │                 free-text answer fades in below
                       │  Space
                       ▼
                    marks done, returns to the board
```

**Multiple choice** — `paintOptions()` (`present.js:124`) renders `q.options` into the
`<ol id="stage-options">` as `.opt` list items, each with a letter chip (`A`–`H`, falling back to a
number past 8) and the choice text. The whole list is hidden for open questions
(`options.length === 0`).

- The list is rebuilt only when `dom.options.dataset.qid` no longer matches the question id
  (`present.js:129`). Advancing from question to answer therefore mutates classes **in place**
  rather than re-creating the nodes, so the entrance stagger does not re-run under the reveal.
- At step 2 each item gets `.is-correct` (index `=== q.correct`) or `.is-dimmed` (any other index,
  and only when `q.correct >= 0`). A question with `correct === -1` shows its choices without
  marking any of them.
- Styling lives in `css/style.css` `.stage-options` / `.opt`: the grid is `auto-fit` with a 340 px
  minimum so 4 short choices sit two-up and long ones fall to one column. `.is-correct` gets a green
  wash, a green key chip, a `✓` appended via `::after`, and a `correct-pop` overshoot; `.is-dimmed`
  drops to 32% opacity and desaturates.
- Entrance is `opt-in`, delayed `calc(var(--i) * 90ms + 120ms)` where `--i` is set per item in JS.

**Other motion** — the stage itself scales up out of a 6 px blur (`stage-in`), media fades and
scales in (`media-in`), and the question and answer each rise 16 px (`rise`, `answer-in`). The media
container animates its `flex-basis`/`max-height` when it shrinks to `.is-thumb`, so the media
visibly travels up the screen instead of jumping.

- `←` / Back walks the steps in reverse, then closes.
- `Esc` or `✕` closes at any point **without** marking the question played.
- Clicking dead space on the stage advances — this is what makes a presentation clicker work.
  Clicks on buttons, links and media controls are excluded (`present.js:36`).
- While the stage is open, `#app` is set `inert` so focus cannot escape behind the overlay.
- Video and audio autoplay; if the browser blocks it the controls are still there. Closing the
  stage pauses and unloads the element so audio never bleeds into the next question.
- If a media blob has gone missing, the stage shows a ⚠️ card telling the host to re-upload rather
  than rendering a broken image.

### 8.3 Edit mode

**Purpose** — write the real questions, and fix things minutes before the event.

**Files** — `js/editor.js`, dialog markup in `index.html`.

**Key flows**

- `E` or the Edit button sets `body.editing`. Tiles gain a dashed border and an "EDIT" corner label.
- The board title and every category header become `contenteditable`. On blur, a leading emoji is
  split off into `category.icon` and the rest becomes `category.name` (`board.js:splitIcon`) — flags,
  ZWJ sequences and skin-tone modifiers are all handled.
- Clicking a tile opens the question editor: prompt, choices, correct-answer picker, answer/notes,
  points, tile label, and a media picker with three tabs — None / Upload file / Link or YouTube.
- **Choices** are a plain textarea, one option per line (`#edit-options`). `parseOptions()`
  (`editor.js:18`) splits on newlines, trims, drops blanks and caps the list at 8 — so blank lines
  and trailing whitespace are free. Leaving the textarea empty is how you write an open question.
- **Correct answer** is a row of letter chips rendered by `renderCorrectPicker()` (`editor.js:144`),
  one per parsed choice. The row re-renders on every `input` event in the textarea, so the chips
  track what you are typing. Click a chip to mark it correct; click the same chip again to clear it
  back to "no correct answer". If you delete choices until the marked index no longer exists, the
  draft resets to `-1` (`editor.js:147`), and the row hides entirely when there are no choices.
- The picker's state lives in a module-level `draftCorrect`, not in the DOM, and is committed
  alongside the parsed options in `commitQuestion()` — re-validated against the final list first.
- Uploaded files are written to IndexedDB immediately so the preview works; a cancelled edit leaves
  an orphan blob, which the next save prunes.
- A pasted URL is classified by extension into image / video / audio, or recognised as YouTube and
  turned into an embed.
- **Clear question** wipes prompt, choices, correct index, answer, label, media and played state but
  keeps the tile (`editor.js:114`).

### 8.4 Board Size

**Purpose** — add a row (or a whole category column) without touching code.

**Files** — `js/editor.js:openSize`, `state.js:resizeRound`, `state.js:resizeLoss`.

**Key flows**

- Operates on the **active round only**.
- Rounds with categories expose *Categories (columns)* 1–8 and *Questions per category (rows)* 1–10.
- Round 3 hides the columns field and instead offers *Total questions* (1–40) and *Tiles per row*.
- Growing appends blank questions, continuing the point ladder (last + 100). A new category column
  is created with the same number of rows and the same point values as the first column.
- Shrinking drops from the end. Before you can apply it, `resizeLoss()` names exactly what would be
  destroyed — "Applying this removes 5 questions in 'Challenge Time!'" — in a yellow warning that
  updates live as you type. A question counts as worth warning about if it has a prompt, an answer,
  media, **or any choices** (`state.js:220`), so deleting a row of half-written multiple choice is
  never silent.

### 8.5 Save, Backup, Restore

**Purpose** — never lose an evening's setup.

**Files** — `js/state.js` (save), `js/backup.js` (export/import).

**Key flows**

- **Autosave**: every edit calls `touch()`, which marks the Save button with a `•` and schedules a
  write 900 ms later. Explicit Save flushes it immediately.
- A `beforeunload` handler fires one last save and prompts if anything is still unsaved.
- **Backup** downloads one `.json` file — `trivia-night-<date>-<time>.json` — containing the whole
  game *plus every uploaded file inlined as base64*. That makes it portable between machines and
  browser profiles.
- **Restore** accepts either a full backup or a bare game document, confirms first because it
  replaces everything, re-inserts the media blobs, normalises, and saves.

## 9. Cross-Cutting Systems

- **Data fetching** — N/A, no `fetch`/XHR at all. The only network activity is the browser loading
  media elements: same-origin files under `assets/`, plus optional hot-linked media and YouTube
  embeds if the host pastes a link.
- **Real-time / polling** — N/A. The only timer is the 900 ms autosave debounce (`state.js:120`).
- **Global state** — a single `state` object in `js/state.js` plus a `Set` of listeners; `emit()`
  re-renders the whole board. Cheap at this size (≤ 40 tiles).
- **Error handling** — no error boundary. `normalise()` is the safety net for bad data; storage
  failures surface in the top-right status line. A boot failure paints a permanent red status.
- **Notifications** — the status line at top right (`Ready` / `Saving…` / `Saved ✓` / errors),
  auto-clearing after a few seconds.
- **i18n** — none. UI chrome is English; question content is free text and renders Arabic correctly
  via browser bidi (verified with the Lebanese Proverbs round).
- **Dates/timezones** — local time only, used for backup filenames and `updatedAt`.
- **File storage** — IndexedDB `media` store for host uploads (capped at 200 MB each,
  `editor.js:182`) plus the static `assets/` directory for seeded media, which never enters
  IndexedDB.
- **Motion** — CSS only, no JS animation library and no Web Animations API. Nine `@keyframes`
  (`tile-in`, `head-in`, `pick`, `check-pop`, `stage-in`, `media-in`, `opt-in`, `correct-pop`,
  `rise`, `answer-in`) plus hover/`.is-thumb` transitions. Staggering is done with a `--i` custom
  property set in JS and consumed by `animation-delay` in CSS — no per-element timers.
- **Logging/telemetry** — none. No analytics, no error reporting, no beacons.
- **Accessibility** — tiles are real `<button>`s with `aria-label`s, the board is `aria-live`,
  dialogs are native `<dialog>`, the choice list is a semantic `<ol>`, the stage sets `inert` on the
  background, and a single `prefers-reduced-motion: reduce` block (`css/style.css:794`) collapses
  every animation and transition on the page to 0.01 ms — including the new entrance staggers.

## 10. Configuration & Environments

**Environment variables: none.** There is nothing to configure — no keys, no endpoints, no build
flags. The app has no notion of "which environment am I in".

**Design tokens** live in `css/style.css` `:root` and are the intended customisation point:

| Token | Purpose |
|---|---|
| `--bg-0` … `--bg-2` | Background gradient stops |
| `--ink`, `--ink-dim`, `--ink-faint` | Text hierarchy |
| `--cyan`, `--green`, `--yellow`, `--red`, `--violet` | Accents; `--cyan` is the title |
| `--tile-min` | Floor for tile height before the board starts scrolling |
| `--radius`, `--radius-lg` | Corner rounding |

**Local dev setup**

```bash
cd clara
npm run dev          # → http://localhost:5173
# or, with no Node at all:
python3 -m http.server 5173
```

A server is required — ES module imports fail under `file://`.

## 11. Build, CI & Deploy

**Build: none.** The source *is* the artifact.

| Script | What it does |
|---|---|
| `npm run dev` | `npx serve@14 . -l 5173` |
| `npm start` | identical |

**CI: none.** No workflows, no gates.

**Deploy:** ⚠️ **nothing auto-deploys today.** The project is not a git repository and is not linked
to any host. `vercel.json` is present and correct so that `vercel deploy` works the moment you want
it, but it has never been run.

To deploy: `npx vercel` from the project root, then `npx vercel --prod`. Any static host works —
there is no server component.

**Important:** deploying does **not** move your *edits*. The game document lives in the browser's
IndexedDB, keyed to the origin. Going from `localhost:5173` to a `vercel.app` URL starts you on the
seed content again. Use Backup → Restore to carry a board across origins or machines.

The seeded media *does* travel — `assets/` is part of the static artifact, so a fresh origin shows
the real Round 1 and Round 2 questions with their videos and images intact. Only host uploads (blobs
in IndexedDB) need a Backup. The deploy uploads ~20 MB of media; there is no image or video
optimisation step, the files are served as committed.

## 12. Testing

**Automated tests: none.** No runner, no suites.

**What has been manually verified** (2026-08-01, Chromium via Playwright, 1200×762):

| Check | Result |
|---|---|
| All three rounds render; R3 flat grid with no headers | pass |
| Question stage: question → answer, no media | pass |
| Question stage: media → question → answer, uploaded PNG | pass |
| Question stage: choices render, stagger in, correct highlights green at the answer step | pass |
| Open question (`options: []`) shows no choice list | pass |
| Seeded `./assets/` image and `.mp4` load and play from the stage | pass |
| Uploaded media survives a full page reload | pass |
| Backup → Restore round-trip, media included | pass — 1 blob, 186 KB payload |
| Board Size grow to 4 × 4, shrink back to 3 × 3 | pass |
| Board Size destructive-change warning | pass |
| Category rename, emoji split: flag / ZWJ / skin tone / none | pass, 5/5 |
| Arabic question and choice rendering (Lebanese Proverbs) | pass |
| Present mode hides tools and enlarges tiles | pass |
| Tile cascade plays on a round switch and **not** on autosave re-render | pass |
| Console errors across the whole session | 0 |

**Coverage gaps, ranked:** no test pins `normalise()` against malformed input, including a `correct`
index that points past the end of `options`; no test pins the backup format; no test asserts the
schema-1 → 2 upgrade path (a document with no `options` key); nothing verifies that every
`./assets/` URL in `js/data.js` resolves to a file that exists; nothing exercises Safari or Firefox;
nothing exercises the IndexedDB-quota-exceeded path; the `prefers-reduced-motion` path has not been
exercised.

## 13. Performance & Scale

- **Payload:** ~85 KB of HTML/CSS/JS, uncompressed, zero dependencies — plus ~20 MB of media in
  `assets/`. First paint is immediate because none of that media is on the critical path: the board
  renders `?` tiles only, and a question's media is not requested until its tile is clicked
  (`present.js:mountMedia`). Nothing is preloaded, so the first play of a 6 MB clip on a cold cache
  buffers briefly — open each media question once before the event to warm it.
- **Rendering:** every state change re-renders the whole board. At 9–40 tiles this is well under a
  frame; it would need rethinking past a few hundred. Entrance animations are transform/opacity only
  and are gated to round switches, so re-renders during autosave cost nothing.
- **Storage:** IndexedDB quota is typically a percentage of free disk — commonly several GB. The
  practical ceiling is the 200 MB per-file upload cap and the base64 backup, which inflates media
  by ~33%: a 300 MB board becomes a ~400 MB JSON file that must be held in memory to export.
- **Next bottleneck:** backup export of a media-heavy board. If it becomes a problem, switch the
  export to a zip stream or split media into a sidecar folder.

## 14. Operations

- **Monitoring:** none, and none is warranted.
- **Logs:** browser console only. `console.warn` on unreadable saved state or a failed media restore.
- **Backup:** click Backup, keep the `.json`. This is the only real disaster-recovery mechanism —
  the restore path has been tested end to end (§12).

**Common failure modes**

| Symptom | Cause | Fix |
|---|---|---|
| Board resets to the seed questions, losing your edits | Different browser, profile, or origin | Restore from the backup `.json` |
| ⚠️ card instead of an image | Uploaded blob evicted, or restored from a media-less backup | Re-upload in edit mode |
| ⚠️ card on a *seeded* question | The file under `assets/` was renamed, deleted, or not deployed | Restore the file, or re-point the question in edit mode |
| Video/audio does not autoplay | Browser autoplay policy | Press play; controls are always present |
| Present Game does not go fullscreen | Fullscreen refused by the browser | Presentation styling still applies; press F11 |
| Edits do not survive refresh | Private/incognito window, or storage disabled | Use a normal window |

## 15. Known Issues & Technical Debt

| Issue | Impact | Where | Since | Planned fix |
|---|---|---|---|---|
| No cross-device sync — the board lives in one browser profile | Editing on a laptop and presenting from another machine needs a manual Backup/Restore | `js/db.js` | 2026-08-01 | Optional cloud adapter behind the existing storage layer |
| Not a git repository | No history, no rollback beyond backup files | repo root | 2026-08-01 | `git init` |
| No automated tests | Regressions are only caught by hand | — | 2026-08-01 | Pin `normalise()` and the backup format first |
| Base64 backups inflate media ~33% and are built in memory | Very media-heavy boards could exhaust memory on export | `js/backup.js` | 2026-08-01 | Stream to zip if it ever bites |
| Cancelling the editor after an upload orphans a blob until the next save | Transient disk use | `js/editor.js:onFilePicked` | 2026-08-01 | Accepted — `mediaPrune()` cleans it up |
| Round 3's "no categories" is modelled as one hidden category | Slightly indirect data shape | `js/data.js` | 2026-08-01 | Accepted — keeps one renderer, not two |
| Seven questions are still blank — R2 · Lebanese Music · 300 and R3 questions 5–9 (Q5 has its image but no prompt) | Those tiles render dashed and empty; the stage shows "— no question written yet —" | `js/data.js:230`, `js/data.js:264` | 2026-08-01 | Write them in edit mode before the event; the Canva design does not contain them |
| R1 · Sports · 200 asks about a video that is not attached | The prompt says "this video shows…" with nothing to show | `js/data.js:141` | 2026-08-01 | Attach the clip in edit mode; flagged with a comment in the source |
| Five files in `assets/` are unreferenced (4 poster frames + `r3-q8-fadelchaker.mp4`) | ~450 KB of dead weight in the deploy | `assets/` | 2026-08-01 | Wire `r3-q8-fadelchaker.mp4` to question 8 when its prompt is written; delete the posters |
| Media is committed unoptimised | ~20 MB deploy; a 6.1 MB clip buffers on a cold cache | `assets/` | 2026-08-01 | Accepted — the venue machine plays from a warm local copy |
| No `preload` / warm-up for seeded media | First play of a large clip can stall in front of the room | `js/present.js` | 2026-08-01 | Accepted — open each media question once before the event |

## 16. Glossary

| Term | Meaning |
|---|---|
| **Board** | The grid of tiles for one round |
| **Tile** | One question, face-down, showing `?` |
| **Stage** | The full-screen overlay that reveals a question |
| **Step** | One of the three stage states: media, question, answer |
| **Round** | One of the three sections of the evening |
| **Category** | A column within a round; Round 3 has none visible |
| **Played / done** | A question already used; its tile dims and shows `✓` |
| **Media** | An image, video, audio clip or YouTube embed shown *before* the question |
| **Choice / option** | One entry in a question's `options` array, shown on the stage with a letter chip |
| **Open question** | A question with no choices (`options` empty) — Round 3 is entirely open |
| **Seed** | The default content in `data.js` plus the files in `assets/`, used only until the first save |

## 17. Change Log

| Date | Change | By | Commit/PR |
|---|---|---|---|
| 2026-08-01 | Initial build and document — static trivia board, 3 rounds, media stage, IndexedDB persistence, board resizing, backup/restore | Claude | — |
| 2026-08-01 | Schema 1 → 2: `Question` gains `options` and `correct` (§7.4, §7.7). Real Canva content replaces the placeholders, with ~20 MB of committed media in the new `assets/` directory (§3.1). Question stage renders multiple choice with a staggered entrance and a green correct-answer reveal (§8.2); editor gains a choices textarea and letter-chip correct picker (§8.3). Entrance/hover/reveal animations added throughout, gated on `is-entering` and disabled under `prefers-reduced-motion` (§8.1, §9) | Claude | — |
