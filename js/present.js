/**
 * The question stage.
 *
 * Three steps, advanced with Space / click / the primary button:
 *   0  MEDIA     — the image, clip or track plays full-bleed, no text
 *   1  QUESTION  — media shrinks to a thumbnail, the question appears
 *   2  ANSWER    — the answer is revealed
 *
 * Questions with no media start at step 1.
 */

import { state, findQuestion, mediaSrc, touch } from './state.js';

const dom = {};
let cur = null;     // { roundIdx, catIdx, qIdx, q, step, hasMedia }
let armedAt = 0;    // timestamp the stage opened; guards the opening click

export function init() {
  dom.stage = document.getElementById('stage');
  dom.round = document.getElementById('stage-round');
  dom.cat = document.getElementById('stage-cat');
  dom.media = document.getElementById('stage-media');
  dom.question = document.getElementById('stage-question');
  dom.options = document.getElementById('stage-options');
  dom.answer = document.getElementById('stage-answer');
  dom.next = document.getElementById('stage-next');
  dom.back = document.getElementById('stage-back');

  dom.next.addEventListener('click', next);
  dom.back.addEventListener('click', back);
  dom.stage.querySelector('[data-action="stage-close"]').addEventListener('click', close);

  // Clicking dead space on the stage advances — handy when presenting from
  // across the room with a clicker that sends a left click.
  dom.stage.addEventListener('click', (e) => {
    if (e.target.closest('button, a, input, video, audio, iframe, .stage-foot, .stage-head')) return;
    // The click that opened the stage finishes *after* the overlay appears, so
    // its mouseup lands here. Ignore anything that arrives before the guard
    // expires, or opening a tile would skip straight past the question.
    if (performance.now() - armedAt < 400) return;
    next();
  });
}

export const isOpen = () => !!cur;

export async function open(roundIdx, catIdx, qIdx) {
  const q = findQuestion(roundIdx, catIdx, qIdx);
  if (!q) return;

  const r = state.game.rounds[roundIdx];
  const c = r.categories[catIdx];

  // Video and audio get a step of their own — the room watches, then the
  // question appears. A still image is part of the question, so it shows
  // together with it and there is nothing to wait for.
  const timed = isTimed(q.media);
  cur = { roundIdx, catIdx, qIdx, q, step: timed ? 0 : 1, hasMedia: !!q.media, timed };
  armedAt = performance.now();

  dom.round.textContent = r.subtitle ? `${r.name} · ${r.subtitle}` : r.name;
  dom.cat.textContent = r.hideCategories ? `Question ${qIdx + 1}` : c.icon ? `${c.icon} ${c.name}` : c.name;
  dom.cat.style.setProperty('--cat', c.color);

  document.activeElement?.blur?.();
  dom.stage.hidden = false;
  document.getElementById('app').inert = true;

  await mountMedia(q);
  paint();
}

export function close() {
  if (!cur) return;
  unmountMedia();
  cur = null;
  dom.stage.hidden = true;
  document.getElementById('app').inert = false;
}

export function next() {
  if (!cur) return;

  if (cur.step < 2) {
    cur.step += 1;
    paint();
    return;
  }

  // Past the answer: mark it played and drop back to the board.
  cur.q.done = true;
  touch();
  close();
}

/** Media the room has to sit through, as opposed to a still image. */
const isTimed = (m) => !!m && (m.kind === 'video' || m.kind === 'audio' || m.kind === 'youtube');

export function back() {
  if (!cur) return;
  const floor = cur.timed ? 0 : 1;
  if (cur.step > floor) {
    cur.step -= 1;
    paint();
  } else {
    close();
  }
}

/* ── Painting ──────────────────────────────────────────────── */

function paint() {
  const { step, q, timed } = cur;
  const mc = q.options.length > 0;

  // Timed media shrinks out of the way once the question is up; a still image
  // stays large, because looking at it *is* the question.
  dom.media.classList.toggle('is-thumb', timed && step > 0);
  dom.media.classList.toggle('is-still', !timed && !!q.media);
  dom.question.hidden = step < 1;
  dom.options.hidden = step < 1 || !mc;
  dom.answer.hidden = step < 2 || (mc && !q.answer.trim());

  dom.question.textContent = q.prompt.trim() || '— no question written yet —';
  dom.question.classList.toggle('is-placeholder', !q.prompt.trim());

  if (mc) paintOptions(q, step);

  dom.answer.textContent = q.answer.trim() || (mc ? '' : '— no answer written yet —');

  dom.next.textContent =
    step === 0 ? 'Show Question →' : step === 1 ? 'Reveal Answer ✦' : 'Done — back to board';
  dom.back.textContent = step > (timed ? 0 : 1) ? '← Back' : '← Board';
}

const LETTERS = 'ABCDEFGH';

function paintOptions(q, step) {
  const revealed = step >= 2;

  // Rebuild only when the question changes, so advancing to the answer
  // highlights in place instead of re-running the entrance stagger.
  if (dom.options.dataset.qid !== q.id) {
    dom.options.dataset.qid = q.id;
    dom.options.replaceChildren();

    q.options.forEach((text, i) => {
      const li = document.createElement('li');
      li.className = 'opt';
      li.style.setProperty('--i', i);

      const key = document.createElement('span');
      key.className = 'opt-key';
      key.textContent = LETTERS[i] || String(i + 1);

      const body = document.createElement('span');
      body.className = 'opt-text';
      body.textContent = text;

      li.append(key, body);
      dom.options.append(li);
    });
  }

  [...dom.options.children].forEach((li, i) => {
    const right = revealed && i === q.correct;
    const wrong = revealed && q.correct >= 0 && i !== q.correct;
    li.classList.toggle('is-correct', right);
    li.classList.toggle('is-dimmed', wrong);
  });
}

/* ── Media ─────────────────────────────────────────────────── */

async function mountMedia(q) {
  dom.media.replaceChildren();
  if (!q.media) return;

  const src = await mediaSrc(q.media);
  if (!src) {
    const warn = document.createElement('div');
    warn.className = 'audio-card';
    warn.append(Object.assign(document.createElement('div'), { className: 'audio-emoji', textContent: '⚠️' }));
    warn.append(Object.assign(document.createElement('div'), { textContent: 'Media file is missing — re-upload it in Edit mode.' }));
    dom.media.append(warn);
    return;
  }

  // A newer open may have resolved first; bail if we are stale.
  if (!cur || cur.q !== q) return;

  dom.media.append(buildMedia(q.media, src));
}

function buildMedia(media, src) {
  switch (media.kind) {
    case 'image': {
      const img = document.createElement('img');
      img.src = src;
      img.alt = media.name || 'Question image';
      return img;
    }

    case 'video': {
      const v = document.createElement('video');
      v.src = src;
      v.controls = true;
      v.playsInline = true;
      v.autoplay = true;
      // Some clips are shown for the picture only — the soundtrack would give
      // the answer away.
      v.muted = !!media.muted;
      v.play?.().catch(() => {});
      return v;
    }

    case 'audio': {
      const card = document.createElement('div');
      card.className = 'audio-card';

      const emoji = document.createElement('div');
      emoji.className = 'audio-emoji';
      emoji.textContent = '🎵';

      const a = document.createElement('audio');
      a.src = src;
      a.controls = true;
      a.autoplay = true;
      a.play?.().catch(() => {});

      card.append(emoji, a);
      return card;
    }

    case 'youtube': {
      const f = document.createElement('iframe');
      const id = media.videoId || '';
      f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1`;
      f.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture';
      f.allowFullscreen = true;
      f.title = 'Question video';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      return f;
    }

    default:
      return document.createComment('unsupported media');
  }
}

function unmountMedia() {
  for (const m of dom.media.querySelectorAll('video, audio')) {
    try { m.pause(); m.removeAttribute('src'); m.load(); } catch { /* ignore */ }
  }
  dom.media.replaceChildren();
}
