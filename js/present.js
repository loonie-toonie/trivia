/**
 * The question stage.
 *
 * A question is a list of frames, advanced with Space / click / the primary
 * button and walked back with ← :
 *
 *   MEDIA        video or audio plays full-bleed, no text (skipped for stills)
 *   PROMPT       the question, with its choices if it has any
 *   ANSWER       the answer, or the right choice lit up
 *
 * A multi-part challenge replaces the single ANSWER frame with a
 * question/answer pair per part, so the host can work through them one at a
 * time instead of showing every answer at once.
 */

import { state, findQuestion, mediaSrc, touch } from './state.js';

const dom = {};
let cur = null;     // { roundIdx, catIdx, qIdx, q, timed, label, frames, i }
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
  const label = r.hideCategories ? `Question ${qIdx + 1}` : c.icon ? `${c.icon} ${c.name}` : c.name;

  cur = { roundIdx, catIdx, qIdx, q, timed, label, i: 0, frames: buildFrames(q, timed) };
  armedAt = performance.now();

  dom.round.textContent = r.subtitle ? `${r.name} · ${r.subtitle}` : r.name;
  dom.cat.textContent = label;
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

/** Media the room has to sit through, as opposed to a still image. */
const isTimed = (m) => !!m && (m.kind === 'video' || m.kind === 'audio' || m.kind === 'youtube');

/**
 * The sequence of screens for one question.
 *
 *   plain      media? → prompt → answer
 *   choices    media? → prompt+options → options with the right one lit
 *   multipart  media? → rules → part 1 → answer 1 → part 2 → answer 2 → …
 */
function buildFrames(q, timed) {
  const f = [];
  if (timed) f.push({ k: 'media' });
  f.push({ k: 'prompt' });

  if (q.parts?.length) {
    q.parts.forEach((_, i) => f.push({ k: 'part', i }, { k: 'partAnswer', i }));
  } else {
    f.push({ k: 'answer' });
  }
  return f;
}

export function next() {
  if (!cur) return;

  if (cur.i < cur.frames.length - 1) {
    cur.i += 1;
    paint();
    return;
  }

  // Past the last screen: mark it played and drop back to the board.
  cur.q.done = true;
  touch();
  close();
}

export function back() {
  if (!cur) return;
  if (cur.i > 0) {
    cur.i -= 1;
    paint();
  } else {
    close();
  }
}

/* ── Painting ──────────────────────────────────────────────── */

function paint() {
  const { q, timed, label, frames, i } = cur;
  const f = frames[i];
  const mc = q.options.length > 0;
  const last = i === frames.length - 1;
  const inPart = f.k === 'part' || f.k === 'partAnswer';

  // Timed media shrinks out of the way once the question is up; a still image
  // stays large, because looking at it *is* the question.
  dom.media.classList.toggle('is-thumb', timed && f.k !== 'media');
  dom.media.classList.toggle('is-still', !timed && !!q.media);

  // Once a multi-part challenge is running, the rules step aside — the room
  // only needs the part they are being asked right now.
  dom.question.hidden = f.k === 'media';
  dom.options.hidden = f.k === 'media' || !mc || inPart;
  dom.answer.hidden = !(f.k === 'answer' || f.k === 'partAnswer') || (mc && !q.answer.trim());

  const text = inPart ? q.parts[f.i].q : q.prompt.trim() || '— no question written yet —';
  dom.question.textContent = text;
  dom.question.classList.toggle('is-placeholder', !inPart && !q.prompt.trim());
  dom.question.classList.toggle('is-part', inPart);

  dom.cat.textContent = inPart ? `${label} — Q${f.i + 1} of ${q.parts.length}` : label;

  if (mc) paintOptions(q, f.k === 'answer');

  dom.answer.textContent = f.k === 'partAnswer'
    ? q.parts[f.i].a
    : q.answer.trim() || (mc ? '' : '— no answer written yet —');

  dom.next.textContent =
    f.k === 'media' ? 'Show Question →'
    : f.k === 'prompt' ? (q.parts?.length ? 'Start — Q1 →' : 'Reveal Answer ✦')
    : f.k === 'part' ? 'Reveal Answer ✦'
    : last ? 'Done — back to board'
    : `Next — Q${f.i + 2} →`;

  dom.back.textContent = i > 0 ? '← Back' : '← Board';
}

const LETTERS = 'ABCDEFGH';

function paintOptions(q, revealed) {

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
