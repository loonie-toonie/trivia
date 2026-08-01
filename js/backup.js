/**
 * Backup / Restore.
 *
 * A backup is a single .json file containing the whole game *and* every
 * uploaded image, clip and track inlined as base64. That makes it portable —
 * move it to the laptop you are presenting from, hit Restore, and the board is
 * identical, media included.
 */

import * as db from './db.js';
import { state, replaceGame, save, collectMediaIds } from './state.js';

const FORMAT = 'trivia-night-backup';
const FORMAT_VERSION = 1;

/* ── Export ────────────────────────────────────────────────── */

export async function exportBackup({ includeMedia = true } = {}) {
  const game = structuredClone(state.game);
  const blobs = {};

  if (includeMedia) {
    for (const id of collectMediaIds(game)) {
      const blob = await db.mediaGet(id);
      if (!blob) continue;
      blobs[id] = { mime: blob.type || 'application/octet-stream', data: await blobToBase64(blob) };
    }
  }

  const payload = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    game,
    media: blobs,
  };

  const json = JSON.stringify(payload);
  download(new Blob([json], { type: 'application/json' }), filename(game.title));

  return { bytes: json.length, mediaCount: Object.keys(blobs).length };
}

function filename(title) {
  const slug = String(title || 'trivia-night')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'trivia-night';
  const d = new Date();
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${slug}-${stamp}.json`;
}

const pad = (n) => String(n).padStart(2, '0');

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/* ── Import ────────────────────────────────────────────────── */

export async function importBackup(file) {
  const text = await file.text();

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  // Accept both a full backup and a bare game document.
  const game = payload?.format === FORMAT ? payload.game : payload;
  if (!game || !Array.isArray(game.rounds)) {
    throw new Error('That file does not look like a Trivia Night backup.');
  }

  const media = payload?.format === FORMAT ? payload.media || {} : {};
  let restored = 0;

  for (const [id, entry] of Object.entries(media)) {
    if (!entry?.data) continue;
    try {
      await db.mediaPut(id, base64ToBlob(entry.data, entry.mime));
      restored += 1;
    } catch (err) {
      console.warn(`[trivia] could not restore media ${id}:`, err);
    }
  }

  replaceGame(game);
  await save();

  return { rounds: game.rounds.length, media: restored };
}

/* ── base64 <-> Blob ───────────────────────────────────────── */

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result);
      resolve(s.slice(s.indexOf(',') + 1)); // drop the data: prefix
    };
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, mime = 'application/octet-stream') {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
