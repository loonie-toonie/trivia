/**
 * App wiring: boot, toolbar, keyboard, status line.
 */

import * as db from './db.js';
import { state, load, save, onChange, setEditing, setPresenting, setActiveRound } from './state.js';
import * as board from './board.js';
import * as present from './present.js';
import * as editor from './editor.js';
import { exportBackup, importBackup } from './backup.js';

const statusEl = () => document.getElementById('status');
let statusTimer = null;

function status(text, tone = 'ok', hold = 2400) {
  const s = statusEl();
  s.textContent = text;
  s.dataset.tone = tone;
  clearTimeout(statusTimer);
  if (hold) statusTimer = setTimeout(() => { s.textContent = 'Ready'; s.dataset.tone = 'ok'; }, hold);
}

/* ── Boot ──────────────────────────────────────────────────── */

async function boot() {
  if (!db.isSupported()) {
    status('No storage in this browser — edits will not survive a refresh', 'err', 0);
  }

  present.init();
  editor.init({ afterChange: render });

  await load();
  db.requestPersistence().catch(() => {});

  if (state.reseeded) {
    status('Questions updated to the latest version', 'ok', 6000);
  }

  onChange(render);
  wireToolbar();
  wireKeys();
  render();

  // Never lose an edit to a stray tab close.
  window.addEventListener('beforeunload', (e) => {
    if (!state.dirty) return;
    save().catch(() => {});
    e.preventDefault();
    e.returnValue = '';
  });
}

/* ── Render ────────────────────────────────────────────────── */

function render() {
  document.body.classList.toggle('editing', state.editing);
  document.body.classList.toggle('presenting', state.presenting);

  board.renderTitle();
  board.renderTabs();
  board.renderBoard();

  document.querySelector('[data-action="edit"]').setAttribute('aria-pressed', String(state.editing));
  document.querySelector('[data-action="present"]').setAttribute('aria-pressed', String(state.presenting));
  document.querySelector('.txt-save').classList.toggle('dirty', state.dirty);
}

board.wire({
  onOpen: (r, c, q) => present.open(r, c, q),
  onEdit: (r, c, q) => editor.openQuestion(r, c, q),
});

/* ── Toolbar ───────────────────────────────────────────────── */

function wireToolbar() {
  document.getElementById('toolbar').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    switch (btn.dataset.action) {
      case 'edit':
        setEditing(!state.editing);
        status(state.editing ? 'Edit mode — click a tile or a category name' : 'Edit mode off');
        break;

      case 'board-size':
        editor.openSize();
        break;

      case 'save':
        await doSave();
        break;

      case 'backup':
        await doBackup(btn);
        break;

      case 'restore':
        document.getElementById('restore-input').click();
        break;

      case 'present':
        await togglePresent();
        break;
    }
  });

  document.getElementById('restore-input').addEventListener('change', doRestore);
}

async function doSave() {
  try {
    status('Saving…', 'busy', 0);
    await save();
    status('Saved ✓');
  } catch (err) {
    console.error(err);
    status(`Save failed: ${err.message}`, 'err', 6000);
  }
}

async function doBackup(btn) {
  btn.disabled = true;
  try {
    status('Packing backup…', 'busy', 0);
    await save();
    const { bytes, mediaCount } = await exportBackup();
    status(`Backup downloaded — ${fmtBytes(bytes)}, ${mediaCount} media file${mediaCount === 1 ? '' : 's'}`, 'ok', 5000);
  } catch (err) {
    console.error(err);
    status(`Backup failed: ${err.message}`, 'err', 6000);
  } finally {
    btn.disabled = false;
  }
}

async function doRestore(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;

  if (!confirm('Restoring replaces the current board and every question on it. Continue?')) return;

  try {
    status('Restoring…', 'busy', 0);
    const { rounds, media } = await importBackup(file);
    render();
    status(`Restored ${rounds} rounds and ${media} media file${media === 1 ? '' : 's'}`, 'ok', 5000);
  } catch (err) {
    console.error(err);
    status(`Restore failed: ${err.message}`, 'err', 7000);
  }
}

async function togglePresent() {
  const on = !state.presenting;
  setPresenting(on);

  try {
    if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    else if (!on && document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // Fullscreen can be refused (permissions policy, iframe) — presentation
    // styling still applies, so this is not worth surfacing.
  }

  status(on ? 'Presenting — press P or Esc to exit' : 'Back to setup');
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && state.presenting) setPresenting(false);
});

/* ── Keyboard ──────────────────────────────────────────────── */

function wireKeys() {
  document.addEventListener('keydown', (e) => {
    const typing =
      e.target.matches('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]') ||
      document.querySelector('dialog[open]');
    if (typing) return;

    if (present.isOpen()) {
      if (e.key === 'Escape') { e.preventDefault(); present.close(); }
      else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); present.next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); present.back(); }
      return;
    }

    if (e.key >= '1' && e.key <= '9') {
      const i = Number(e.key) - 1;
      if (i < state.game.rounds.length) { e.preventDefault(); setActiveRound(i); }
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'e':
        if (!state.presenting) { e.preventDefault(); setEditing(!state.editing); }
        break;
      case 'p':
        e.preventDefault();
        togglePresent();
        break;
      case 's':
        if (e.metaKey || e.ctrlKey) { e.preventDefault(); doSave(); }
        break;
      case 'escape':
        if (state.presenting) { e.preventDefault(); togglePresent(); }
        else if (state.editing) { e.preventDefault(); setEditing(false); }
        break;
    }
  });
}

/* ── Utils ─────────────────────────────────────────────────── */

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

boot().catch((err) => {
  console.error('[trivia] boot failed:', err);
  status(`Could not start: ${err.message}`, 'err', 0);
});
