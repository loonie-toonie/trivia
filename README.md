# Trivia Night

A static trivia board for running the night from one laptop. Three rounds, nine questions each,
images / video / audio shown **before** the question, and everything you edit stays put across a
refresh.

> Architecture lives in [APP_OVERVIEW.md](./APP_OVERVIEW.md) · security posture in [SECURITY.md](./SECURITY.md).

## Run it

```bash
npm run dev          # → http://localhost:5173
```

No install, no build, no dependencies. If you'd rather not use Node:

```bash
python3 -m http.server 5173
```

You do need *a* server — opening `index.html` directly won't work, because ES modules are blocked
under `file://`.

## The board

| Round | Categories | Questions |
|---|---|---|
| 🟢 Round 1 — General Knowledge | Pop Culture · History and Geography · Sports and Nutrition | 3 × 3 |
| 🟡 Round 2 — Lebanese Edition | Guess the Logo · Lebanese Proverbs · Lebanese Music | 3 × 3 |
| 🔴 Final Round — Challenge Time! | none — nine mystery tiles, picked at random | 9 |

## Running a night

Click a tile and it goes full screen in three steps, one press of **Space** apart:

```
media  →  question  →  answer
```

Questions with no media start at the question. `←` steps back, `Esc` closes without marking the
question played. Clicking anywhere on the empty part of the screen also advances, so a presentation
clicker works.

**Present Game** goes fullscreen and hides the editing chrome. The round tabs stay so you can move
between rounds mid-game.

The Final Round has a **🎲 Random pick** button that highlights an unplayed tile and opens it.

| Key | Does |
|---|---|
| `1` `2` `3` | switch round |
| `Space` | next step |
| `←` | previous step |
| `Esc` | close / leave present mode |
| `E` | edit mode |
| `P` | present mode |
| `⌘S` | save now |

Right-click a tile to mark it played or unplayed without opening it.

## Writing your questions

Hit **Edit** (or `E`), then click any tile.

- **Question**, **Answer**, **Points**, and an optional **Tile label** if you want something other
  than `?` on the board.
- **Media** — either upload a file (image, video or audio, up to 200 MB) or paste a link. YouTube
  links become an embedded player. Whatever you attach shows *before* the question, which is what
  makes the Guess-the-Logo and Lebanese-Music rounds work.
- Category names and the board title are editable in place. Type an emoji first and it becomes the
  category icon: `🎵 Lebanese Music`.

**Board Size** adds or removes rows and category columns on the round you're looking at. If a change
would delete questions you've written, it tells you exactly what before you apply it.

## Saving

Edits save themselves about a second after you stop typing — **Save** just flushes it now. The dot
next to Save means there's something unsaved.

Everything lives in your browser (IndexedDB), so it survives refreshes, crashes and reboots. It does
**not** follow you to another browser, another profile, or another machine. For that:

- **Backup** downloads one `.json` with every question *and* every uploaded file inside it.
- **Restore** loads it back, media included.

If you're setting up on one laptop and presenting from another, back up and restore. Do it before
the event, not at it.

## Deploying

Not required — the board runs fine from a local folder, which is the safer bet on venue wifi. If you
do want a URL:

```bash
npx vercel          # preview
npx vercel --prod   # production
```

`vercel.json` sets the security headers. Note that your questions don't travel with the deploy —
they're in your browser, not in the files. Restore a backup on the new URL.

## Where things are

```
index.html          the whole shell
css/style.css       all styling; the colour tokens are at the top
js/data.js          the seed questions — only used until your first save
js/state.js         data shape, autosave, media handling
js/board.js         tiles and headers
js/present.js       the three-step reveal
js/editor.js        both dialogs
js/backup.js        export / import
```

## Known limits

- One browser, one profile. No sync — use Backup/Restore.
- Backups inline media as base64, so a media-heavy board makes a large `.json`.
- The questions currently in `js/data.js` are placeholders. Replace them in Edit mode.
