// The three mini-game engines. Each one is mounted into a container and talks
// to the app through a small context:
//   ctx.onProgress({ score, answered, correct, done?, event? })   cumulative, sent to the server
//   ctx.onFinish()                                               everything in the round is done
// and returns { destroy() }.

import { el, shuffle, clamp } from './dom.mjs';
import { sfx, confetti, vibrate } from './fx.mjs';
import { award } from './scoring.mjs';

const BCG_META = {
  'Star':          { cls: 'star', icon: '★', hint: 'High growth · high share' },
  'Question Mark': { cls: 'qm',   icon: '?', hint: 'High growth · low share' },
  'Cash Cow':      { cls: 'cow',  icon: '$', hint: 'Low growth · high share' },
  'Dog':           { cls: 'dog',  icon: '✕', hint: 'Low growth · low share' },
};

function streakEvent(streak) {
  if (streak === 3) return '🔥 3 in a row!';
  if (streak === 5) return '🔥🔥 5-streak!';
  if (streak === 8) return '⚡ 8-streak, unstoppable!';
  if (streak === 12) return '👑 12-streak legend!';
  return '';
}

function hudDots(total) {
  const wrap = el('div', { class: 'dots', 'aria-hidden': 'true' });
  const dots = Array.from({ length: total }, () => el('i'));
  wrap.append(...dots);
  return { wrap, dots };
}

function floatPop(host, text, cls = '') {
  const p = el('div', { class: `pop ${cls}` }, text);
  host.append(p);
  setTimeout(() => p.remove(), 1000);
}

function keyHandler(fn) {
  const h = (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    fn(e);
  };
  addEventListener('keydown', h);
  return () => removeEventListener('keydown', h);
}

// ═════════════════════════════ CHOICE (BCG sort + multiple choice) ═════════════════════════════

export function mountChoice(root, cfg, ctx) {
  const bcg = cfg.layout === 'bcg';
  const items = shuffle(cfg.items).map((it) => ({
    q: it.q, why: it.why,
    opts: bcg
      ? it.opts.map((t, i) => ({ t, ok: i === it.a }))
      : shuffle(it.opts.map((t, i) => ({ t, ok: i === it.a }))),
  }));
  const S = { i: 0, score: 0, streak: 0, correct: 0, answered: 0, locked: false, t0: 0, timer: 0, next: 0, dead: false };
  const box = el('div', { class: `game choice ${bcg ? 'is-bcg' : 'is-list'}` });
  root.append(box);
  const { wrap: dotsWrap, dots } = hudDots(items.length);
  const streakEl = el('div', { class: 'streak' });
  const scoreEl = el('div', { class: 'gscore' }, '0');
  box.append(el('div', { class: 'hud' }, dotsWrap, streakEl, scoreEl));
  const stage = el('div', { class: 'stage-inner' });
  box.append(stage);
  let buttons = [];
  let whyEl = null;

  const offKeys = keyHandler((e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= 4) answer(n - 1);
  });

  function show() {
    if (S.dead) return;
    if (S.i >= items.length) return finish();
    const it = items[S.i];
    S.locked = false;
    S.t0 = Date.now();
    dots[S.i]?.classList.add('now');
    streakEl.textContent = S.streak >= 2 ? `🔥 x${(1 + Math.min(S.streak, 5) * 0.1).toFixed(1)}` : '';
    const bar = el('i');
    bar.style.animationDuration = `${cfg.itemTime}ms`;
    buttons = it.opts.map((o, k) => {
      const meta = bcg ? BCG_META[o.t] : null;
      return el('button', {
        class: `opt ${meta ? `bcg-${meta.cls}` : `list-${k}`}`, type: 'button', onclick: () => answer(k),
        'aria-label': `${o.t} (key ${k + 1})`,
      },
      meta ? el('span', { class: 'opt-icon' }, meta.icon) : el('span', { class: 'opt-key' }, String(k + 1)),
      el('span', { class: 'opt-text' }, el('b', {}, o.t), meta ? el('small', {}, meta.hint) : null));
    });
    whyEl = el('div', { class: 'why', 'aria-live': 'polite' });
    stage.replaceChildren(
      el('div', { class: 'qcard enter' }, el('div', { class: 'qtag' }, cfg.prompt), el('h2', { class: 'q' }, it.q)),
      el('div', { class: 'timer' }, bar),
      el('div', { class: `opts ${bcg ? 'opts-bcg' : 'opts-list'}` }, buttons),
      whyEl,
    );
    S.timer = setTimeout(() => answer(-1), cfg.itemTime);
  }

  function answer(k) {
    if (S.locked || S.dead || S.i >= items.length) return;
    S.locked = true;
    clearTimeout(S.timer);
    const it = items[S.i];
    const chosen = it.opts[k];
    const good = Boolean(chosen?.ok);
    const r = award({ correct: good, elapsed: Date.now() - S.t0, window: cfg.bonusWindow, streak: S.streak, mult: cfg.mult });
    S.answered++;
    if (good) { S.correct++; S.score += r.points; }
    S.streak = r.streak;
    buttons.forEach((b, i) => {
      b.disabled = true;
      if (it.opts[i].ok) b.classList.add('is-correct');
      else if (i === k) b.classList.add('is-wrong');
      else b.classList.add('is-dim');
    });
    stage.querySelector('.timer i')?.classList.add('stop');
    dots[S.i]?.classList.remove('now');
    dots[S.i]?.classList.add(good ? 'ok' : 'bad');
    whyEl.textContent = (good ? '✓ ' : k === -1 ? '⏱ Time is up. ' : '✗ ') + (it.why || '');
    whyEl.className = `why show ${good ? 'good' : 'bad'}`;
    scoreEl.textContent = S.score.toLocaleString('en-US');
    if (good) {
      sfx.correct(); vibrate(15);
      floatPop(box, `+${r.points}`, 'good');
      if (streakEvent(S.streak)) sfx.streak();
    } else { sfx.wrong(); vibrate([40, 30, 40]); }
    ctx.onProgress({ score: S.score, answered: S.answered, correct: S.correct, event: good ? streakEvent(S.streak) : '' });
    S.i++;
    S.next = setTimeout(show, good ? 950 : 1900);
  }

  function finish() {
    S.dead = true;
    offKeys();
    const perfect = S.correct === items.length;
    if (perfect) { sfx.fanfare(); confetti({ power: 0.9 }); }
    box.querySelector('.hud').classList.add('hide');
    stage.replaceChildren(el('div', { class: 'done' },
      el('div', { class: 'done-emoji' }, perfect ? '💯' : '🏁'),
      el('h2', {}, perfect ? 'Perfect round!' : 'All done!'),
      el('p', {}, `${S.correct} of ${items.length} right · ${S.score.toLocaleString('en-US')} points`),
      el('p', { class: 'muted' }, 'Watch the big screen while the other teams finish.')));
    ctx.onProgress({ score: S.score, answered: S.answered, correct: S.correct, done: true, event: perfect ? '💯 Perfect round!' : `🏁 Finished ${cfg.title}` });
    ctx.onFinish();
  }

  show();
  return { destroy() { S.dead = true; clearTimeout(S.timer); clearTimeout(S.next); offKeys(); box.remove(); } };
}

// ═════════════════════════════ ORDER (tap cards into numbered slots) ═════════════════════════════

export function mountOrder(root, cfg, ctx) {
  const S = { p: 0, score: 0, answered: 0, correct: 0, perfect: 0, dead: false, timer: 0, next: 0, locked: false, t0: 0 };
  const box = el('div', { class: 'game order' });
  root.append(box);
  const { wrap: dotsWrap, dots } = hudDots(cfg.puzzles.length);
  const scoreEl = el('div', { class: 'gscore' }, '0');
  box.append(el('div', { class: 'hud' }, dotsWrap, el('div', { class: 'streak' }), scoreEl));
  const stage = el('div', { class: 'stage-inner' });
  box.append(stage);

  function showPuzzle() {
    if (S.dead) return;
    if (S.p >= cfg.puzzles.length) return finish();
    const pz = cfg.puzzles[S.p];
    const n = pz.items.length;
    S.locked = false;
    S.t0 = Date.now();
    dots[S.p]?.classList.add('now');
    let chips = shuffle(pz.items.map((t, i) => ({ t, i })));
    if (chips.every((c, k) => c.i === k)) chips = chips.reverse();
    const placed = Array(n).fill(null);

    const poolEl = el('div', { class: 'pool' });
    const slotsEl = el('div', { class: 'slots' });
    const lockBtn = el('button', { class: 'btn primary lock', type: 'button', disabled: true, onclick: () => lock() }, 'Lock it in ✓');
    const bar = el('i');
    bar.style.animationDuration = `${pz.time}ms`;
    const revealEl = el('div', { class: 'why', 'aria-live': 'polite' });

    function draw(justPlaced = -1) {
      poolEl.replaceChildren(...chips.filter((c) => !placed.includes(c)).map((c) =>
        el('button', { class: 'chip', type: 'button', onclick: () => place(c) }, c.t)));
      if (!poolEl.children.length) poolEl.append(el('div', { class: 'pool-empty' }, 'All cards placed. Happy with the order?'));
      slotsEl.replaceChildren(...placed.map((c, k) =>
        el('button', {
          class: `slot ${c ? 'filled' : ''} ${k === justPlaced ? 'just' : ''}`, type: 'button',
          onclick: () => unplace(k), 'aria-label': c ? `Slot ${k + 1}: ${c.t}. Tap to remove.` : `Empty slot ${k + 1}`,
        }, el('span', { class: 'slot-n' }, String(k + 1)), el('span', { class: 'slot-t' }, c ? c.t : ''))));
      lockBtn.disabled = placed.some((c) => !c);
    }
    function place(c) {
      if (S.locked) return;
      const k = placed.indexOf(null);
      if (k < 0) return;
      placed[k] = c; sfx.tick(); draw(k);
    }
    function unplace(k) {
      if (S.locked || !placed[k]) return;
      placed[k] = null; draw();
    }

    function lock() {
      if (S.locked || S.dead) return;
      S.locked = true;
      clearTimeout(S.timer);
      bar.classList.add('stop');
      const rightFlags = placed.map((c, k) => Boolean(c) && c.i === k);
      const nRight = rightFlags.filter(Boolean).length;
      const elapsed = Date.now() - S.t0;
      const perfect = nRight === n;
      let pts = nRight * 100;
      if (perfect) pts += 250 + Math.round(150 * Math.max(0, 1 - elapsed / pz.time));
      pts = Math.round(pts * cfg.mult);
      S.score += pts; S.answered++; S.correct += perfect ? 1 : 0; if (perfect) S.perfect++;
      dots[S.p]?.classList.remove('now');
      dots[S.p]?.classList.add(perfect ? 'ok' : 'bad');
      scoreEl.textContent = S.score.toLocaleString('en-US');
      lockBtn.disabled = true;
      poolEl.replaceChildren();
      slotsEl.replaceChildren(...pz.items.map((t, k) =>
        el('div', { class: `slot filled reveal ${rightFlags[k] ? 'is-correct' : 'is-wrong'}`, style: { animationDelay: `${k * 110}ms` } },
          el('span', { class: 'slot-n' }, rightFlags[k] ? '✓' : '✗'),
          el('span', { class: 'slot-t' }, t, pz.labels ? el('small', {}, pz.labels[k]) : null))));
      revealEl.className = `why show ${perfect ? 'good' : 'bad'}`;
      revealEl.textContent = perfect ? `✓ Perfect order! +${pts}` : `${nRight} of ${n} in the right place. +${pts}`;
      if (perfect) { sfx.fanfare(); confetti({ power: 0.8 }); vibrate(30); } else { sfx.wrong(); }
      ctx.onProgress({ score: S.score, answered: S.answered, correct: S.correct, event: perfect ? '🎯 Perfect order!' : '' });
      S.p++;
      S.next = setTimeout(showPuzzle, perfect ? 2200 : 3400);
    }

    stage.replaceChildren(
      el('div', { class: 'qcard enter' }, el('div', { class: 'qtag' }, `Puzzle ${S.p + 1} of ${cfg.puzzles.length}`), el('h2', { class: 'q' }, pz.title), el('p', { class: 'sub' }, pz.prompt)),
      el('div', { class: 'timer' }, bar),
      el('div', { class: 'order-grid' }, el('div', { class: 'col' }, el('div', { class: 'col-h' }, 'Cards'), poolEl), el('div', { class: 'col' }, el('div', { class: 'col-h' }, 'Your order'), slotsEl)),
      el('div', { class: 'order-actions' }, lockBtn),
      revealEl,
    );
    draw();
    S.timer = setTimeout(() => lock(true), pz.time);
  }

  function finish() {
    S.dead = true;
    box.querySelector('.hud').classList.add('hide');
    if (S.perfect === cfg.puzzles.length) { sfx.fanfare(); confetti({ power: 1 }); }
    stage.replaceChildren(el('div', { class: 'done' },
      el('div', { class: 'done-emoji' }, S.perfect === cfg.puzzles.length ? '🎡' : '🏁'),
      el('h2', {}, 'Puzzles complete!'),
      el('p', {}, `${S.perfect} of ${cfg.puzzles.length} perfect · ${S.score.toLocaleString('en-US')} points`),
      el('p', { class: 'muted' }, 'Watch the big screen while the other teams finish.')));
    ctx.onProgress({ score: S.score, answered: S.answered, correct: S.correct, done: true, event: `🏁 Finished ${cfg.title}` });
    ctx.onFinish();
  }

  showPuzzle();
  return { destroy() { S.dead = true; clearTimeout(S.timer); clearTimeout(S.next); box.remove(); } };
}

// ═════════════════════════════ SWIPE (risk vs reward cards) ═════════════════════════════

export function mountSwipe(root, cfg, ctx) {
  const cards = shuffle(cfg.items);
  const S = { i: 0, score: 0, streak: 0, correct: 0, answered: 0, locked: false, t0: 0, timer: 0, next: 0, dead: false };
  const box = el('div', { class: 'game swipe' });
  root.append(box);
  const { wrap: dotsWrap, dots } = hudDots(cards.length);
  const streakEl = el('div', { class: 'streak' });
  const scoreEl = el('div', { class: 'gscore' }, '0');
  box.append(el('div', { class: 'hud' }, dotsWrap, streakEl, scoreEl));
  const deck = el('div', { class: 'deck' });
  const whyEl = el('div', { class: 'why', 'aria-live': 'polite' });
  const bar = el('i');
  const timerEl = el('div', { class: 'timer' }, bar);
  const btnRisk = el('button', { class: 'btn swipe-btn risk', type: 'button', onclick: () => decide('risk') }, el('span', {}, '←'), ' RISK');
  const btnReward = el('button', { class: 'btn swipe-btn reward', type: 'button', onclick: () => decide('reward') }, 'REWARD ', el('span', {}, '→'));
  box.append(el('div', { class: 'qtag center' }, 'Is this a risk or a reward for Amazon?'), timerEl, deck, el('div', { class: 'swipe-actions' }, btnRisk, btnReward), whyEl);

  const offKeys = keyHandler((e) => {
    if (e.key === 'ArrowLeft') decide('risk');
    if (e.key === 'ArrowRight') decide('reward');
  });

  let top = null;

  function show() {
    if (S.dead) return;
    if (S.i >= cards.length) return finish();
    S.locked = false;
    S.t0 = Date.now();
    dots[S.i]?.classList.add('now');
    streakEl.textContent = S.streak >= 2 ? `🔥 x${(1 + Math.min(S.streak, 5) * 0.1).toFixed(1)}` : '';
    const cur = cards[S.i];
    const peek = cards[S.i + 1];
    deck.replaceChildren();
    if (peek) deck.append(el('div', { class: 'card peek' }, el('p', {}, peek.q)));
    top = el('div', { class: 'card top enter' },
      el('div', { class: 'stamp stamp-risk' }, 'RISK'), el('div', { class: 'stamp stamp-reward' }, 'REWARD'),
      el('p', {}, cur.q));
    deck.append(top);
    bindDrag(top);
    bar.className = '';
    void bar.offsetWidth; // restart the CSS animation
    bar.style.animationDuration = `${cfg.itemTime}ms`;
    whyEl.className = 'why';
    whyEl.textContent = '';
    clearTimeout(S.timer);
    S.timer = setTimeout(() => decide(null), cfg.itemTime);
  }

  function bindDrag(card) {
    let startX = 0;
    let dx = 0;
    let dragging = false;
    card.addEventListener('pointerdown', (e) => {
      if (S.locked) return;
      dragging = true; startX = e.clientX; dx = 0;
      card.setPointerCapture(e.pointerId);
      card.classList.add('drag');
    });
    card.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      dx = e.clientX - startX;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`;
      const k = clamp(Math.abs(dx) / 120, 0, 1);
      card.style.setProperty('--risk', dx < 0 ? k : 0);
      card.style.setProperty('--reward', dx > 0 ? k : 0);
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      card.classList.remove('drag');
      if (Math.abs(dx) > 110) decide(dx < 0 ? 'risk' : 'reward');
      else { card.style.transform = ''; card.style.setProperty('--risk', 0); card.style.setProperty('--reward', 0); }
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }

  function decide(dir) {
    if (S.locked || S.dead || S.i >= cards.length) return;
    S.locked = true;
    clearTimeout(S.timer);
    const cur = cards[S.i];
    const good = dir === cur.a;
    const r = award({ correct: good, elapsed: Date.now() - S.t0, window: cfg.bonusWindow, streak: S.streak, mult: cfg.mult });
    S.answered++;
    if (good) { S.correct++; S.score += r.points; }
    S.streak = r.streak;
    dots[S.i]?.classList.remove('now');
    dots[S.i]?.classList.add(good ? 'ok' : 'bad');
    scoreEl.textContent = S.score.toLocaleString('en-US');
    bar.classList.add('stop');
    top.classList.add('gone', good ? 'is-correct' : 'is-wrong');
    top.style.transform = `translateX(${dir === 'risk' ? -900 : dir === 'reward' ? 900 : 0}px) translateY(${dir ? 0 : -300}px) rotate(${dir === 'risk' ? -28 : dir === 'reward' ? 28 : 0}deg)`;
    whyEl.className = `why show ${good ? 'good' : 'bad'}`;
    whyEl.textContent = (good ? '✓ ' : dir === null ? '⏱ Time is up. It is a ' : '✗ It is a ') + (good ? '' : `${cur.a.toUpperCase()}: `) + cur.why;
    if (good) { sfx.correct(); vibrate(15); floatPop(box, `+${r.points}`, 'good'); if (streakEvent(S.streak)) sfx.streak(); } else { sfx.wrong(); vibrate([40, 30, 40]); }
    ctx.onProgress({ score: S.score, answered: S.answered, correct: S.correct, event: good ? streakEvent(S.streak) : '' });
    S.i++;
    S.next = setTimeout(show, good ? 650 : 1500);
  }

  function finish() {
    S.dead = true;
    offKeys();
    const perfect = S.correct === cards.length;
    if (perfect) { sfx.fanfare(); confetti({ power: 0.9 }); }
    box.replaceChildren(el('div', { class: 'done' },
      el('div', { class: 'done-emoji' }, perfect ? '💯' : '🏁'),
      el('h2', {}, perfect ? 'Flawless judgement!' : 'All cards judged!'),
      el('p', {}, `${S.correct} of ${cards.length} right · ${S.score.toLocaleString('en-US')} points`),
      el('p', { class: 'muted' }, 'Watch the big screen while the other teams finish.')));
    ctx.onProgress({ score: S.score, answered: S.answered, correct: S.correct, done: true, event: perfect ? '💯 Flawless judgement!' : `🏁 Finished ${cfg.title}` });
    ctx.onFinish();
  }

  show();
  return { destroy() { S.dead = true; clearTimeout(S.timer); clearTimeout(S.next); offKeys(); box.remove(); } };
}

export const MOUNTS = { choice: mountChoice, order: mountOrder, swipe: mountSwipe };
