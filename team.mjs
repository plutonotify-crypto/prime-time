// Team screen: one per group PC. Join → lobby → (intro → play → recap) × 5 → final.

import { ROUNDS, BRAND } from './content.mjs';
import { derive } from './engine.mjs';
import { createApi } from './api.mjs';
import { MOUNTS } from './games.mjs';
import { $, el, fmt } from './dom.mjs';
import { sfx, confetti, confettiRain, countTo, vibrate } from './fx.mjs';

const api = createApi();
const stage = $('#stage');
const top = $('#top');

const BOX = `<svg viewBox="0 0 100 100"><path d="M10 32l40-18 40 18v42L50 92 10 74z" fill="#c99a5b"/><path d="M10 32l40 18 40-18" fill="none" stroke="#8a6532" stroke-width="3"/><path d="M50 50v42" stroke="#8a6532" stroke-width="3"/><path d="M18 66c20 16 44 16 64 0" fill="none" stroke="#ff9900" stroke-width="7" stroke-linecap="round"/></svg>`;
const boxEl = (cls = 'hero-box') => {
  const d = el('div', { class: cls });
  d.innerHTML = BOX; // static, trusted markup
  return d;
};

// ───────────── identity ─────────────
let saved = null;
try { saved = JSON.parse(localStorage.getItem('pt:me') || 'null'); } catch { /* ignore */ }
const me = { tid: saved?.tid || '', name: saved?.name || '', pid: '', info: null };
const persist = () => { try { localStorage.setItem('pt:me', JSON.stringify({ tid: me.tid, name: me.name })); } catch { /* ignore */ } };

// ───────────── live view of the world ─────────────
const W = { state: null, board: [], phase: null, offline: false, joined: false };
let view = '';          // identity of the screen currently drawn
let engine = null;      // running mini-game
let local = { round: -1, score: 0 };
let rankAtStart = {};   // round → rank when the round began
let tickTimer = 0;
let rejoining = false;

const myRow = () => W.board.find((t) => t.pid === me.pid);
const otherRoundsTotal = (r) => Object.entries(myRow()?.rounds || {}).reduce((s, [k, v]) => s + (Number(k) === r ? 0 : v.score), 0);

// ───────────── score submission (coalescing, retrying) ─────────────
const outbox = { latest: null, busy: false };
function submit(payload) {
  outbox.latest = payload;
  pump();
}
async function pump() {
  if (outbox.busy) return;
  outbox.busy = true;
  try {
    while (outbox.latest) {
      const p = outbox.latest;
      outbox.latest = null;
      try {
        const { status, data } = await api.score({ tid: me.tid, ...p });
        if (status === 404 && data?.error === 'unknown-team') { outbox.latest = p; await rejoin(); }
        else if (status >= 500) throw new Error('server');
        setOffline(false);
      } catch {
        setOffline(true);
        if (!outbox.latest) outbox.latest = p;   // keep the newest and retry
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  } finally { outbox.busy = false; }
}
function setOffline(v) {
  if (W.offline === v) return;
  W.offline = v;
  $('.offline')?.remove();
  if (v) document.body.append(el('div', { class: 'offline' }, 'Reconnecting…'));
}

// ───────────── join ─────────────
async function doJoin(name) {
  const { status, data } = await api.join(name);
  if (status !== 200 || !data.ok) return { error: data?.error || 'Could not join. Try again.' };
  me.tid = data.tid; me.name = data.team.name; me.pid = data.team.pid; me.info = data.team;
  persist();
  return {};
}
async function rejoin() {
  if (rejoining || !me.name) return;
  rejoining = true;
  try { await doJoin(me.name); } finally { rejoining = false; }
}

function joinScreen(err = '') {
  const input = el('input', { type: 'text', placeholder: 'Your group name', maxlength: 22, autocomplete: 'off', value: me.name, 'aria-label': 'Group name' });
  const msg = el('div', { class: 'err' }, err);
  const go = el('button', { class: 'btn primary big' }, 'Join the game');
  const submitJoin = async () => {
    go.disabled = true; msg.textContent = '';
    sfx.unlock();
    try {
      const r = await doJoin(input.value);
      if (r.error) { msg.textContent = r.error; go.disabled = false; return; }
      view = ''; await poll();
    } catch { msg.textContent = 'Cannot reach the game server.'; go.disabled = false; }
  };
  go.addEventListener('click', submitJoin);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitJoin(); });
  draw(el('section', { class: 'screen' },
    boxEl(),
    el('div', { class: 'round-badge' }, BRAND.tag),
    el('h1', {}, BRAND.name),
    el('p', {}, 'Type your group name to get on the conveyor belt.'),
    el('div', { class: 'join-card' }, input, msg, go),
  ));
  setTimeout(() => input.focus(), 50);
}

// ───────────── rendering helpers ─────────────
function draw(...nodes) {
  stage.replaceChildren(...nodes);
}
function renderTop() {
  if (!me.pid) { top.hidden = true; return; }
  top.hidden = false;
  const row = myRow();
  let tot = top.querySelector('[data-total]');
  if (!tot) {
    const mute = el('button', { class: 'icon-btn', 'aria-label': 'Toggle sound', onclick: () => { sfx.setMuted(!sfx.muted); mute.textContent = sfx.muted ? '🔇' : '🔊'; sfx.unlock(); } }, sfx.muted ? '🔇' : '🔊');
    tot = el('b', { 'data-total': '' }, '0');
    top.replaceChildren(
      el('div', { class: 'avatar', 'data-av': '' }),
      el('div', { class: 'who' }, el('b', { 'data-name': '' }), el('span', { 'data-rank': '' })),
      el('div', { class: 'score' }, tot, el('span', {}, 'points')),
      mute,
    );
  }
  const av = top.querySelector('[data-av]');
  av.textContent = row?.avatar || me.info?.avatar || '📦';
  av.style.setProperty('--h', row?.hue ?? me.info?.hue ?? 30);
  top.querySelector('[data-name]').textContent = me.name;
  top.querySelector('[data-rank]').textContent = row ? `Rank ${row.rank} of ${W.board.length}` : '';
  let total = row?.total ?? 0;
  if (engine && local.round >= 0) total = Math.max(total, otherRoundsTotal(local.round) + local.score);
  countTo(tot, total, 500);
}
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 >> 3) ^ 1 && n % 10 < 4 ? n % 10 : 0]}`;

// ───────────── screens ─────────────
function lobbyScreen() {
  let taps = 0;
  const count = el('span', { class: 'tap-count' }, '0');
  const box = boxEl();
  box.addEventListener('click', () => {
    taps++; count.textContent = taps; sfx.unlock(); sfx.correct(); vibrate(10);
    box.animate([{ transform: 'scale(1.18) rotate(6deg)' }, { transform: 'none' }], { duration: 220 });
    if (taps % 10 === 0) confetti({ x: 0.5, y: 0.4, count: 60 });
  });
  const chips = el('div', { class: 'chips', 'data-chips': '' });
  draw(el('section', { class: 'screen' },
    box,
    el('h1', {}, 'You’re in!'),
    el('p', {}, 'Waiting for the host to start. Tap the box while you wait: ', count, ' taps.'),
    chips,
  ));
  paintChips();
}
function paintChips() {
  const c = $('[data-chips]');
  if (!c) return;
  c.replaceChildren(...W.board.map((t) => el('span', { class: 'chip-team' }, t.avatar, ' ', t.name)));
}

function introScreen(r, d) {
  const cfg = ROUNDS[r];
  const n = el('div', { class: 'count-big' }, '');
  const x2 = cfg.mult > 1 ? el('span', { class: 'x2' }, `×${cfg.mult} POINTS`) : null;
  draw(el('section', { class: 'screen' },
    el('div', { class: 'round-badge' }, `Round ${r + 1} of ${ROUNDS.length}`),
    el('div', { class: 'hero-box', style: { fontSize: '4rem', width: 'auto' } }, cfg.emoji),
    el('h1', {}, cfg.title),
    el('p', {}, cfg.subtitle),
    x2,
    el('ul', { class: 'rules' }, cfg.rules.map((t) => el('li', {}, t))),
    n,
  ));
  rankAtStart[r] = myRow()?.rank ?? null;
  let last = -1;
  clearInterval(tickTimer);
  const step = () => {
    const ms = Math.max(0, d.startsAt - api.clock.now());
    const s = Math.ceil(ms / 1000);
    if (s <= 3 && s !== last && s > 0) {
      last = s; n.textContent = s; n.classList.remove('tick'); void n.offsetWidth; n.classList.add('tick'); sfx.tick();
    } else if (s > 3) n.textContent = '';
  };
  step(); tickTimer = setInterval(step, 100);
}

function playScreen(r, d) {
  const cfg = ROUNDS[r];
  // A refresh mid-round must not allow a replay: if the server says we finished, wait.
  if (myRow()?.rounds?.[r]?.done) return waitScreen('Round complete', 'Your answers are in. Watch the big screen!');
  const clock = el('div', { class: 'round-clock' }, '');
  const holder = el('div', {});
  draw(el('section', { class: 'screen', style: { justifyContent: 'flex-start', gap: '0.7rem', animation: 'none' } }, clock, holder));
  sfx.go();
  local = { round: r, score: 0 };
  engine = MOUNTS[cfg.type](holder, cfg, {
    onProgress: (p) => {
      local.score = p.score;
      submit({ round: r, score: p.score, answered: p.answered, correct: p.correct, done: Boolean(p.done), event: p.event ? `${me.name}: ${p.event}` : '' });
      renderTop();
    },
    onFinish: () => { /* engine shows its own "done" card; we flip on the timer / recap */ },
  });
  clearInterval(tickTimer);
  const step = () => {
    const ms = Math.max(0, d.endsAt - api.clock.now());
    const s = Math.ceil(ms / 1000);
    clock.textContent = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    clock.classList.toggle('low', s <= 10);
    if (s <= 5 && s > 0) sfx.tick();
  };
  step(); tickTimer = setInterval(step, 1000);
}

function waitScreen(title, text) {
  draw(el('section', { class: 'screen' }, el('div', { class: 'done-emoji' }, '⏳'), el('h2', {}, title), el('p', {}, text)));
}

function recapScreen(r) {
  const cfg = ROUNDS[r];
  const row = myRow();
  const rs = row?.rounds?.[r] || { score: 0, correct: 0, answered: 0 };
  const before = rankAtStart[r];
  const now = row?.rank;
  const dv = before && now ? before - now : 0;
  const delta = el('span', { class: `delta ${dv > 0 ? 'up' : dv < 0 ? 'down' : 'same'}` }, dv > 0 ? `▲ up ${dv}` : dv < 0 ? `▼ down ${-dv}` : '— holding');
  const big = el('div', { class: 'stat-big' }, '0');
  const board = el('div', { class: 'mini-board' }, miniRows());
  draw(el('section', { class: 'screen' },
    el('div', { class: 'round-badge' }, `Round ${r + 1} complete`),
    el('h2', {}, cfg.title),
    big,
    el('p', {}, `${rs.correct} correct out of ${rs.answered} answered`),
    el('div', {}, delta, ' ', el('span', { class: 'muted' }, now ? `Now ${ordinal(now)} of ${W.board.length}` : '')),
    board,
    el('div', { class: 'fact' }, '💡 ', cfg.fact),
  ));
  countTo(big, rs.score, 900);
  if (rs.score > 0) { sfx.correct(); }
  if (dv > 0) setTimeout(() => confetti({ x: 0.5, y: 0.3, count: 70 }), 400);
}
function miniRows() {
  const rows = W.board.slice(0, 3);
  const mine = myRow();
  if (mine && mine.rank > 3) rows.push(mine);
  return rows.map((t) => el('div', { class: `mini-row${t.pid === me.pid ? ' me' : ''}` },
    el('span', { class: 'r' }, t.rank), el('span', { class: 'n' }, `${t.avatar} ${t.name}`), el('span', { class: 's' }, fmt(t.total))));
}

function finalScreen() {
  const row = myRow();
  const rank = row?.rank || W.board.length;
  const revealed = (W.state.reveal || 0) >= 3 || W.board.length <= 0;
  if (!revealed) {
    draw(el('section', { class: 'screen' }, el('div', { class: 'medal' }, '🥁'), el('h1', {}, 'The final results…'), el('p', {}, 'Eyes on the big screen!')));
    sfx.drum();
    return;
  }
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
  const tag = rank === 1 ? 'Diversification champions! 👑' : rank <= 3 ? 'On the podium. Prime delivery!' : 'Every great portfolio starts with a few experiments.';
  const maxR = Math.max(1, ...ROUNDS.map((c, i) => row?.rounds?.[i]?.score || 0));
  const rows = ROUNDS.map((c, i) => {
    const s = row?.rounds?.[i]?.score || 0;
    return el('div', {}, c.title, el('span', { class: 'bar' }, el('i', { style: { width: `${(s / maxR) * 100}%` } })), el('b', {}, fmt(s)));
  });
  const big = el('div', { class: 'stat-big' }, '0');
  draw(el('section', { class: 'screen' },
    el('div', { class: 'medal' }, medal),
    el('h1', {}, `${ordinal(rank)} place`),
    big,
    el('p', {}, tag),
    el('div', { class: 'breakdown' }, rows),
  ));
  // grid rows are div>[text, span.bar, b]; fix layout by making the bar a block cell
  countTo(big, row?.total || 0, 1200);
  sfx.fanfare();
  if (rank <= 3) confettiRain(4500); else confetti({ count: 120 });
}

// ───────────── the loop ─────────────
function teardown() {
  engine?.destroy(); engine = null;
  clearInterval(tickTimer);
}

function reconcile() {
  const st = W.state;
  const d = derive(st, api.clock.now());
  W.phase = d.phase;
  const key = `${st.gameId}|${d.phase}|${d.round}|${d.phase === 'final' ? (st.reveal >= 3 ? 'r' : 'w') : ''}`;
  if (key === view) return;

  // leaving a round: push the final score of the engine before tearing down
  if (engine && d.phase !== 'play') {
    submit({ round: local.round, score: local.score, answered: 0, correct: 0, done: true, event: '' });
    teardown();
  } else if (!engine) clearInterval(tickTimer);
  view = key;

  switch (d.phase) {
    case 'lobby': lobbyScreen(); break;
    case 'intro': introScreen(d.round, d); break;
    case 'play': playScreen(d.round, d); break;
    case 'recap': {
      // Wait a beat so in-flight scores land before we read the board.
      const k = view;
      setTimeout(async () => { if (view === k) { await poll(true); if (view === k) recapScreen(d.round); } }, 900);
      waitScreen('Time!', 'Counting your points…');
      break;
    }
    case 'final': finalScreen(); break;
    default: break;
  }
}

async function poll(quiet = false) {
  try {
    const { status, data } = await api.state(me.tid || undefined);
    if (status !== 200 || !data.ok) throw new Error('bad');
    W.state = data.state; W.board = data.teams; W.joined = data.joined;
    setOffline(false);
    if (data.me) me.pid = data.me;
    if (!data.joined) {
      if (me.name) { await rejoin(); if (!me.pid) return joinScreen(); }
      else { if (view !== 'join') { view = 'join'; teardown(); joinScreen(); } top.hidden = true; return; }
    }
    if (!me.pid) { if (view !== 'join') { view = 'join'; joinScreen(); } return; }
    if (view === 'join') view = '';
    renderTop();
    if (!quiet) reconcile();
    if (W.phase === 'lobby') paintChips();
  } catch {
    setOffline(true);
  }
}

addEventListener('pointerdown', () => sfx.unlock(), { once: true });
(async function boot() {
  await poll();
  if (!W.state) { // first poll failed: still show something
    joinScreen();
  }
  const loop = async () => {
    await poll();
    const play = W.phase === 'play';
    setTimeout(loop, play ? 2500 : 1000);
  };
  setTimeout(loop, 1000);
  // react quickly when a phase boundary is due, without waiting for the next poll
  setInterval(() => { if (W.state && me.pid) reconcile(); }, 250);
})();
