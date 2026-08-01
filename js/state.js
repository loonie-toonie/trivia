/**
 * Game state: load, normalise, autosave, and media URL resolution.
 */

import * as db from './db.js';
import { defaultGame, blankQuestion, blankCategory, SCHEMA_VERSION } from './data.js';

const GAME_KEY = 'game';

export const state = {
  game: null,
  editing: false,
  presenting: false,
  dirty: false,
};

const listeners = new Set();
export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn(state));

/* ── Load ──────────────────────────────────────────────────── */

export async function load() {
  let game = null;

  if (db.isSupported()) {
    try {
      game = await db.kvGet(GAME_KEY);
    } catch (err) {
      console.warn('[trivia] could not read saved game:', err);
    }
  }

  state.game = normalise(game) || defaultGame();
  emit();
  return state.game;
}

/**
 * Defensive normalisation — a restored backup or an older schema should never
 * be able to leave the board in a state that throws while rendering.
 */
function normalise(game) {
  if (!game || typeof game !== 'object' || !Array.isArray(game.rounds) || !game.rounds.length) {
    return null;
  }

  game.schema = SCHEMA_VERSION;
  game.title = typeof game.title === 'string' ? game.title : 'TRIVIA NIGHT';
  game.activeRound = clamp(Number(game.activeRound) || 0, 0, game.rounds.length - 1);

  game.rounds = game.rounds.map((round, ri) => {
    const cats = Array.isArray(round.categories) ? round.categories : [];
    return {
      id: round.id || `r${ri + 1}`,
      name: round.name || `Round ${ri + 1}`,
      subtitle: round.subtitle || '',
      icon: round.icon || '⚪',
      color: round.color || '#9aa9c9',
      hideCategories: !!round.hideCategories,
      gridCols: clamp(Number(round.gridCols) || cats.length || 3, 1, 8),
      categories: cats.map((c, ci) => ({
        id: c.id || `c${ri}-${ci}`,
        name: c.name || `Category ${ci + 1}`,
        icon: typeof c.icon === 'string' ? c.icon : '',
        color: c.color || '#9aa9c9',
        questions: (Array.isArray(c.questions) ? c.questions : []).map((q, qi) => {
          // Schema 1 had no choices; an absent `options` is simply an open
          // question, so the upgrade needs no special-casing.
          const options = (Array.isArray(q.options) ? q.options : [])
            .map((o) => (typeof o === 'string' ? o : String(o ?? '')))
            .slice(0, 8);
          const correct = Number(q.correct);

          return {
            id: q.id || `q${ri}-${ci}-${qi}`,
            prompt: typeof q.prompt === 'string' ? q.prompt : '',
            options,
            correct: Number.isInteger(correct) && correct >= 0 && correct < options.length ? correct : -1,
            answer: typeof q.answer === 'string' ? q.answer : '',
            label: typeof q.label === 'string' ? q.label : '',
            media: normaliseMedia(q.media),
            done: !!q.done,
          };
        }),
      })),
    };
  });

  return game;
}

function normaliseMedia(m) {
  if (!m || typeof m !== 'object') return null;
  const kind = ['image', 'video', 'audio', 'youtube'].includes(m.kind) ? m.kind : null;
  if (!kind) return null;
  if (!m.mediaId && !m.url) return null;
  return {
    kind,
    mediaId: m.mediaId || undefined,
    url: m.url || undefined,
    videoId: m.videoId || undefined,
    name: m.name || undefined,
    mime: m.mime || undefined,
  };
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/* ── Save ──────────────────────────────────────────────────── */

let saveTimer = null;

/** Mark dirty and schedule an autosave. */
export function touch() {
  state.dirty = true;
  emit();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save().catch(() => {}), 900);
}

export async function save() {
  clearTimeout(saveTimer);
  if (!state.game) return;
  state.game.updatedAt = new Date().toISOString();

  // structuredClone strips anything non-serialisable before it can poison the
  // transaction (IndexedDB throws DataCloneError on functions / DOM nodes).
  await db.kvSet(GAME_KEY, structuredClone(state.game));
  await db.mediaPrune(collectMediaIds(state.game));

  state.dirty = false;
  emit();
}

export function collectMediaIds(game) {
  const ids = [];
  for (const r of game.rounds)
    for (const c of r.categories)
      for (const q of c.questions) if (q.media?.mediaId) ids.push(q.media.mediaId);
  return ids;
}

/* ── Accessors ─────────────────────────────────────────────── */

export const round = (i = state.game.activeRound) => state.game.rounds[i];

export function findQuestion(roundIdx, catIdx, qIdx) {
  return state.game?.rounds[roundIdx]?.categories[catIdx]?.questions[qIdx] || null;
}

export function setActiveRound(i) {
  state.game.activeRound = clamp(i, 0, state.game.rounds.length - 1);
  touch();
}

export function setEditing(on) {
  state.editing = !!on;
  if (state.editing) state.presenting = false;
  emit();
}

export function setPresenting(on) {
  state.presenting = !!on;
  if (state.presenting) state.editing = false;
  emit();
}

export function replaceGame(game) {
  const clean = normalise(game);
  if (!clean) throw new Error('That file does not look like a Trivia Night backup.');
  state.game = clean;
  emit();
}

/* ── Board size ────────────────────────────────────────────── */

/**
 * Resize a round's grid. Growing appends blanks; shrinking drops from the end
 * and reports what would be lost so the caller can confirm first.
 */
export function resizeRound(roundIdx, { cols, rows, gridCols }) {
  const r = state.game.rounds[roundIdx];

  if (Number.isFinite(gridCols)) r.gridCols = clamp(gridCols, 1, 8);

  if (Number.isFinite(cols) && !r.hideCategories) {
    const target = clamp(cols, 1, 8);
    while (r.categories.length > target) r.categories.pop();
    while (r.categories.length < target) {
      const rowCount = r.categories[0]?.questions.length || rows || 3;
      const model = r.categories[0]?.questions || [];
      const c = blankCategory(r.categories.length + 1);
      for (let i = 0; i < rowCount; i++) c.questions.push(blankQuestion());
      r.categories.push(c);
    }
    r.gridCols = r.categories.length;
  }

  if (Number.isFinite(rows)) {
    const target = clamp(rows, 1, 10);
    for (const c of r.categories) {
      while (c.questions.length > target) c.questions.pop();
      while (c.questions.length < target) {
        c.questions.push(blankQuestion());
      }
    }
  }

  touch();
}

/** What a resize would delete — used to warn before destroying content. */
export function resizeLoss(roundIdx, { cols, rows }) {
  const r = state.game.rounds[roundIdx];
  const lost = [];

  const hasContent = (q) => q.prompt.trim() || q.answer.trim() || q.media || q.options.length;

  if (Number.isFinite(cols) && !r.hideCategories && cols < r.categories.length) {
    for (const c of r.categories.slice(cols)) {
      if (c.questions.some(hasContent)) lost.push(`category “${c.name}”`);
    }
  }
  if (Number.isFinite(rows)) {
    for (const c of r.categories) {
      const dropped = c.questions.slice(rows).filter(hasContent).length;
      if (dropped) lost.push(`${dropped} question${dropped > 1 ? 's' : ''} in “${c.name}”`);
    }
  }
  return lost;
}

/* ── Media URLs ────────────────────────────────────────────── */

const urlCache = new Map();

/** Resolve a question's media to something an <img>/<video>/<iframe> can use. */
export async function mediaSrc(media) {
  if (!media) return null;
  if (media.url && !media.mediaId) return media.url;
  if (!media.mediaId) return null;

  if (urlCache.has(media.mediaId)) return urlCache.get(media.mediaId);

  const blob = await db.mediaGet(media.mediaId);
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  urlCache.set(media.mediaId, url);
  return url;
}

export async function storeMediaFile(file) {
  const kind = file.type.startsWith('video/')
    ? 'video'
    : file.type.startsWith('audio/')
      ? 'audio'
      : file.type.startsWith('image/')
        ? 'image'
        : null;

  if (!kind) throw new Error(`Unsupported file type: ${file.type || 'unknown'}`);

  const mediaId = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await db.mediaPut(mediaId, file);
  return { kind, mediaId, name: file.name, mime: file.type };
}

/** Parse a pasted URL into a media descriptor. */
export function mediaFromUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return null;

  const yt = parseYouTube(url);
  if (yt) return { kind: 'youtube', url, videoId: yt };

  const path = url.split(/[?#]/)[0].toLowerCase();
  if (/\.(mp4|webm|ogv|mov|m4v)$/.test(path)) return { kind: 'video', url };
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(path)) return { kind: 'audio', url };
  return { kind: 'image', url };
}

export function parseYouTube(url) {
  const m = String(url).match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

export function releaseMediaUrls() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}
