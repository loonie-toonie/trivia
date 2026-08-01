/**
 * Edit dialogs: the per-question editor and the board-size resizer.
 */

import {
  state, round, findQuestion, touch,
  resizeRound, resizeLoss,
  mediaSrc, storeMediaFile, mediaFromUrl,
} from './state.js';

const dom = {};
let target = null;       // { roundIdx, catIdx, qIdx }
let draftMedia = null;   // media descriptor being edited
let draftCorrect = -1;   // index of the correct choice, -1 for none
let onDone = () => {};

const LETTERS = 'ABCDEFGH';
const parseOptions = (text) =>
  String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);

export function init({ afterChange }) {
  onDone = afterChange || (() => {});

  dom.edit = document.getElementById('dlg-edit');
  dom.scope = document.getElementById('edit-scope');
  dom.prompt = document.getElementById('edit-prompt');
  dom.options = document.getElementById('edit-options');
  dom.correct = document.getElementById('edit-correct');
  dom.correctRow = document.getElementById('edit-correct-row');
  dom.answer = document.getElementById('edit-answer');
  dom.label = document.getElementById('edit-label');
  dom.file = document.getElementById('edit-file');
  dom.url = document.getElementById('edit-url');
  dom.tabs = document.getElementById('media-tabs');
  dom.preview = document.getElementById('edit-media-preview');

  dom.size = document.getElementById('dlg-size');
  dom.sizeScope = document.getElementById('size-scope');
  dom.cols = document.getElementById('size-cols');
  dom.rows = document.getElementById('size-rows');
  dom.grid = document.getElementById('size-grid');
  dom.gridField = document.getElementById('size-grid-field');
  dom.sizeWarn = document.getElementById('size-warn');

  dom.tabs.addEventListener('click', (e) => {
    const b = e.target.closest('.mtab');
    if (b) selectMediaTab(b.dataset.kind);
  });

  dom.options.addEventListener('input', renderCorrectPicker);
  dom.correct.addEventListener('click', (e) => {
    const b = e.target.closest('.pick');
    if (!b) return;
    draftCorrect = Number(b.dataset.i) === draftCorrect ? -1 : Number(b.dataset.i);
    renderCorrectPicker();
  });

  dom.file.addEventListener('change', onFilePicked);
  dom.url.addEventListener('change', onUrlTyped);
  dom.url.addEventListener('blur', onUrlTyped);

  dom.edit.addEventListener('close', commitQuestion);
  dom.size.addEventListener('close', commitSize);

  for (const input of [dom.cols, dom.rows]) input.addEventListener('input', previewLoss);
}

/* ── Question editor ───────────────────────────────────────── */

export function openQuestion(roundIdx, catIdx, qIdx) {
  const q = findQuestion(roundIdx, catIdx, qIdx);
  if (!q) return;

  target = { roundIdx, catIdx, qIdx };
  draftMedia = q.media ? { ...q.media } : null;
  draftCorrect = q.correct;

  const r = state.game.rounds[roundIdx];
  const c = r.categories[catIdx];
  dom.scope.textContent = r.hideCategories
    ? `${r.name} · ${r.subtitle || 'Challenge'} — question ${qIdx + 1}`
    : `${r.name} · ${c.name} — row ${qIdx + 1}`;

  dom.prompt.value = q.prompt;
  dom.options.value = q.options.join('\n');
  dom.answer.value = q.answer;
  dom.label.value = q.label;
  dom.url.value = draftMedia?.url || '';
  dom.file.value = '';

  renderCorrectPicker();
  selectMediaTab(!draftMedia ? 'none' : draftMedia.mediaId ? 'file' : 'url');
  renderPreview();

  dom.edit.showModal();
  dom.prompt.focus();
}

function commitQuestion() {
  const action = dom.edit.returnValue;
  const t = target;
  target = null;
  if (!t) return;

  const q = findQuestion(t.roundIdx, t.catIdx, t.qIdx);
  if (!q) return;

  if (action === 'clear') {
    q.prompt = '';
    q.options = [];
    q.correct = -1;
    q.answer = '';
    q.label = '';
    q.media = null;
    q.done = false;
    touch();
    onDone();
    return;
  }

  if (action !== 'save') return;

  q.prompt = dom.prompt.value.trim();
  q.options = parseOptions(dom.options.value);
  q.correct = draftCorrect >= 0 && draftCorrect < q.options.length ? draftCorrect : -1;
  q.answer = dom.answer.value.trim();
  q.label = dom.label.value.trim();

  q.media = draftMedia;

  touch();
  onDone();
}

/** A letter chip per choice; click one to mark it correct, click again to clear. */
function renderCorrectPicker() {
  const opts = parseOptions(dom.options.value);
  dom.correctRow.hidden = opts.length === 0;
  if (draftCorrect >= opts.length) draftCorrect = -1;

  dom.correct.replaceChildren();
  opts.forEach((text, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick';
    b.dataset.i = String(i);
    b.dataset.on = String(i === draftCorrect);
    b.title = text;
    b.textContent = LETTERS[i] || String(i + 1);
    dom.correct.append(b);
  });
}

function selectMediaTab(kind) {
  for (const b of dom.tabs.querySelectorAll('.mtab')) {
    b.dataset.on = String(b.dataset.kind === kind);
  }
  for (const pane of document.querySelectorAll('.media-pane')) {
    pane.hidden = pane.dataset.pane !== kind;
  }

  if (kind === 'none') {
    draftMedia = null;
    dom.url.value = '';
    dom.file.value = '';
    renderPreview();
  }
}

async function onFilePicked() {
  const file = dom.file.files?.[0];
  if (!file) return;

  const MAX = 200 * 1024 * 1024;
  if (file.size > MAX) {
    alert(`That file is ${(file.size / 1048576).toFixed(0)} MB. Keep media under 200 MB so the browser can store it reliably.`);
    dom.file.value = '';
    return;
  }

  try {
    draftMedia = await storeMediaFile(file);
    renderPreview();
  } catch (err) {
    alert(err.message);
    dom.file.value = '';
  }
}

function onUrlTyped() {
  const parsed = mediaFromUrl(dom.url.value);
  draftMedia = parsed;
  renderPreview();
}

async function renderPreview() {
  dom.preview.replaceChildren();
  if (!draftMedia) return;

  const label = document.createElement('span');
  label.className = 'mp-label';
  label.textContent = draftMedia.kind.toUpperCase();

  if (draftMedia.kind === 'youtube') {
    label.textContent = `YOUTUBE · ${draftMedia.videoId || 'unrecognised link'}`;
    dom.preview.append(label);
    return;
  }

  const src = await mediaSrc(draftMedia);
  if (!src) { dom.preview.append(label); return; }

  let node;
  if (draftMedia.kind === 'image') {
    node = document.createElement('img');
    node.alt = draftMedia.name || 'preview';
  } else if (draftMedia.kind === 'video') {
    node = document.createElement('video');
    node.controls = true;
  } else {
    node = document.createElement('audio');
    node.controls = true;
  }
  node.src = src;

  dom.preview.append(label, node);
}

/* ── Board size ────────────────────────────────────────────── */

export function openSize() {
  const r = round();
  const rows = r.categories[0]?.questions.length ?? 0;

  dom.sizeScope.textContent = r.subtitle ? `${r.name} · ${r.subtitle}` : r.name;
  dom.cols.value = r.categories.length;
  dom.rows.value = rows;
  dom.grid.value = r.gridCols;

  dom.cols.closest('.field').hidden = r.hideCategories;
  dom.gridField.hidden = !r.hideCategories;
  if (r.hideCategories) {
    dom.rows.previousElementSibling.textContent = 'Total questions';
    dom.rows.nextElementSibling.textContent = 'Adds or removes mystery tiles in this round.';
    dom.rows.max = 40;
  } else {
    dom.rows.previousElementSibling.textContent = 'Questions per category (rows)';
    dom.rows.nextElementSibling.textContent = 'Adds or removes a row across every category.';
    dom.rows.max = 10;
  }

  previewLoss();
  dom.size.showModal();
}

function previewLoss() {
  const r = round();
  const lost = resizeLoss(r ? state.game.activeRound : 0, {
    cols: r.hideCategories ? undefined : Number(dom.cols.value),
    rows: Number(dom.rows.value),
  });

  if (lost.length) {
    dom.sizeWarn.hidden = false;
    dom.sizeWarn.textContent = `Applying this removes ${lost.join(', ')}. Back up first if you need them.`;
  } else {
    dom.sizeWarn.hidden = true;
    dom.sizeWarn.textContent = '';
  }
}

function commitSize() {
  if (dom.size.returnValue !== 'apply') return;

  const r = round();
  resizeRound(state.game.activeRound, {
    cols: r.hideCategories ? undefined : Number(dom.cols.value),
    rows: Number(dom.rows.value),
    gridCols: r.hideCategories ? Number(dom.grid.value) : undefined,
  });
  onDone();
}
