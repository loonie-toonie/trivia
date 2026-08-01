/**
 * Board rendering: round tabs, category headers, question tiles.
 */

import { state, round, touch, setActiveRound } from './state.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const MEDIA_ICON = { image: '🖼', video: '🎬', audio: '🎵', youtube: '▶' };

let openQuestion = () => {};
let editQuestion = () => {};

export function wire({ onOpen, onEdit }) {
  openQuestion = onOpen;
  editQuestion = onEdit;
}

/* ── Round tabs ────────────────────────────────────────────── */

export function renderTabs() {
  const host = document.getElementById('round-tabs');
  host.replaceChildren();

  state.game.rounds.forEach((r, i) => {
    const b = el('button', 'btn btn-round');
    b.dataset.active = String(i === state.game.activeRound);
    b.title = r.subtitle ? `${r.name} — ${r.subtitle}` : r.name;
    b.append(el('span', 'ico', r.icon), document.createTextNode(r.name));
    b.style.color = i === state.game.activeRound ? r.color : '';
    b.addEventListener('click', () => setActiveRound(i));
    host.append(b);
  });
}

/* ── Board ─────────────────────────────────────────────────── */

let lastRound = null;

export function renderBoard() {
  const host = document.getElementById('board');
  const r = round();
  host.replaceChildren();

  const cols = r.hideCategories ? r.gridCols : Math.max(1, r.categories.length);
  host.style.setProperty('--cols', cols);
  host.classList.toggle('has-heads', !r.hideCategories);

  // Only cascade the tiles in when the board actually changes round —
  // otherwise every autosave would replay the entrance animation.
  const switched = lastRound !== state.game.activeRound;
  lastRound = state.game.activeRound;
  host.classList.toggle('is-entering', switched);

  if (r.hideCategories) {
    renderFlat(host, r);
  } else {
    renderColumns(host, r);
  }

  const note = document.getElementById('board-note');
  note.replaceChildren(...boardNote(r).childNodes);
}

/** Rounds with categories: one column per category, headers on row 1. */
function renderColumns(host, r) {
  r.categories.forEach((c, ci) => {
    const head = el('div', 'cat-head');
    head.style.setProperty('--cat', c.color);
    head.style.setProperty('--i', ci);
    head.style.gridColumn = String(ci + 1);

    if (state.editing) {
      // Plain text while editing so the caret behaves; split back apart on blur.
      head.textContent = c.icon ? `${c.icon} ${c.name}` : c.name;
    } else {
      // Separate nodes so flex `gap` spaces the emoji off the label.
      if (c.icon) head.append(el('span', 'cat-icon', c.icon));
      head.append(el('span', 'cat-name', c.name));
    }

    if (state.editing) {
      head.contentEditable = 'plaintext-only';
      head.spellcheck = false;
      head.title = 'Click to rename — the leading emoji is kept as the category icon';
      head.addEventListener('blur', () => {
        const { icon, name } = splitIcon(head.textContent);
        c.icon = icon;
        c.name = name || c.name;
        head.textContent = c.icon ? `${c.icon} ${c.name}` : c.name;
        touch();
      });
      head.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); head.blur(); }
      });
    }

    host.append(head);

    c.questions.forEach((q, qi) => {
      const t = tile(q, c, ci, qi);
      t.style.gridColumn = String(ci + 1);
      t.style.gridRow = String(qi + 2);
      t.style.setProperty('--i', ci + qi); // diagonal wave
      host.append(t);
    });
  });
}

/** Rounds without categories (Challenge Time): a flat grid of mystery tiles. */
function renderFlat(host, r) {
  const c = r.categories[0];
  if (!c) return;
  c.questions.forEach((q, qi) => {
    const t = tile(q, c, 0, qi);
    t.style.setProperty('--i', qi);
    host.append(t);
  });
}

function tile(q, cat, ci, qi) {
  const t = el('button', 'tile');
  t.type = 'button';
  t.style.setProperty('--glow', hexA(cat.color, 0.22));

  const blank = !q.prompt.trim() && !q.answer.trim() && !q.media;
  if (q.done) t.classList.add('is-done');
  if (blank) t.classList.add('is-empty');

  t.append(el('span', 'tile-face', q.done ? '✓' : q.label.trim() || '?'));

  if (q.media) t.append(el('span', 'tile-badge', MEDIA_ICON[q.media.kind] || '📎'));

  t.setAttribute(
    'aria-label',
    state.editing
      ? `Edit ${cat.name} question ${qi + 1}`
      : `${cat.name}, question ${qi + 1}${q.done ? ', already played' : ''}`
  );

  t.addEventListener('click', () => {
    if (state.editing) editQuestion(state.game.activeRound, ci, qi);
    else openQuestion(state.game.activeRound, ci, qi);
  });

  // Right-click toggles played/unplayed without opening the question.
  t.addEventListener('contextmenu', (e) => {
    if (state.editing) return;
    e.preventDefault();
    q.done = !q.done;
    touch();
  });

  return t;
}

function boardNote(r) {
  const note = el('div', 'board-note');
  const total = r.categories.reduce((n, c) => n + c.questions.length, 0);
  const done = r.categories.reduce((n, c) => n + c.questions.filter((q) => q.done).length, 0);

  note.append(document.createTextNode(`${done} / ${total} played`));

  if (r.hideCategories) {
    const pick = el('button', 'btn');
    pick.append(el('span', 'ico', '🎲'), document.createTextNode('Random pick'));
    pick.addEventListener('click', () => randomPick(r));
    note.append(pick);
  }

  if (done > 0) {
    const reset = el('button', 'btn');
    reset.append(el('span', 'ico', '↺'), document.createTextNode('Reset round'));
    reset.addEventListener('click', () => {
      for (const c of r.categories) for (const q of c.questions) q.done = false;
      touch();
    });
    note.append(reset);
  }

  if (state.editing) {
    note.append(el('span', '', ' · right-click a tile to mark it played'));
  }

  return note;
}

function randomPick(r) {
  const pool = [];
  r.categories.forEach((c, ci) =>
    c.questions.forEach((q, qi) => { if (!q.done) pool.push([ci, qi]); })
  );
  if (!pool.length) return;

  const [ci, qi] = pool[Math.floor(Math.random() * pool.length)];
  const tiles = document.querySelectorAll('#board .tile');
  const flat = r.hideCategories ? qi : ci * r.categories[0].questions.length + qi;
  const node = tiles[flat];

  if (node) {
    node.classList.add('is-picked');
    node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setTimeout(() => openQuestion(state.game.activeRound, ci, qi), 900);
  } else {
    openQuestion(state.game.activeRound, ci, qi);
  }
}

/* ── Title ─────────────────────────────────────────────────── */

export function renderTitle() {
  const h = document.getElementById('game-title');
  if (document.activeElement === h) return;

  h.textContent = state.game.title;
  h.contentEditable = state.editing ? 'plaintext-only' : 'false';
  h.spellcheck = false;

  if (state.editing && !h.dataset.wired) {
    h.dataset.wired = '1';
    h.addEventListener('blur', () => {
      state.game.title = h.textContent.trim() || 'TRIVIA NIGHT';
      h.textContent = state.game.title;
      touch();
    });
    h.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); h.blur(); }
    });
  }
}

/* ── Helpers ───────────────────────────────────────────────── */

/**
 * Split a leading emoji off a header so "🎬 Pop Culture" round-trips.
 *
 * `\p{RGI_Emoji}` handles the awkward cases — flags (🇱🇧 is two regional
 * indicators), ZWJ sequences, skin tones — but needs the `v` flag, so fall
 * back to a narrower pattern on browsers that lack it.
 */
const ICON_RE = (() => {
  try {
    return new RegExp('^(\\p{RGI_Emoji})\\s*([\\s\\S]*)$', 'v');
  } catch {
    return /^([\u{1F1E6}-\u{1F1FF}]{2}|\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*)\s*([\s\S]*)$/u;
  }
})();

function splitIcon(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, ' ');
  const m = s.match(ICON_RE);
  return m && m[2].trim() ? { icon: m[1], name: m[2].trim() } : { icon: '', name: s };
}

function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return `rgba(86,204,242,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
