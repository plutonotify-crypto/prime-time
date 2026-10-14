// Host / projector screen: live leaderboard, round stage and the control bar.

import { ROUNDS, BRAND } from './content.mjs';
import { derive } from './engine.mjs';
import { createApi } from './api.mjs';
import { $, el, fmt } from './dom.mjs';
import { sfx, confetti, confettiRain, countTo } from './fx.mjs';

const api = createApi();
const htop = $('#htop');
const lb = $('#lb');
const sp = $('#sp');
const ctl = $('#ctl');

const ROUND_COLORS = ['#ff9900', '#37c0d8', '#3ddc97', '#c99a5b', '#ff6b78'];
const W = { state: null, board: [], phase: null, round: -1, pinOk: false, watchOnly: false };
let stageKey = '';
let ticker = 0;
let seenEvent = new Map();
let rebuiltKey = '';

const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
const ordinal = (n) => ['', '1st', '2nd', '3rd'][n] || `${n}th`;

// ───────────── header ─────────────
function drawTop() {
  const pips = el('div', { class: 'pips' }, ROUNDS.map((_, i) => el('span', { class: 'pip', 'data-pip': i })));
  const logo = el('div', { class: 'brand-mark' });
  logo.innerHTML = '<svg viewBox="0 0 100 100"><path d="M10 32l40-18 40 18v42L50 92 10 74z" fill="#c99a5b"/><path d="M10 32l40 18 40-18" fill="none" stroke="#8a6532" stroke-width="3"/><path d="M50 50v42" stroke="#8a6532" stroke-width="3"/><path d="M18 66c20 16 44 16 64 0" fill="none" stroke="#ff9900" stroke-width="7" stroke-linecap="round"/></svg>';
  htop.replaceChildren(
    el('div', { class: 'brand' }, logo, el('div', {}, BRAND.name, el('small', {}, BRAND.tag))),
    pips,
    el('div', { class: 'h-join' }, el('span', {}, 'Join on your PC'), el('b', {}, location.host + (api.demo ? '/?demo' : ''))),
  );
}
function updatePips() {
  const r = W.round; const ph = W.phase;
  document.querySelectorAll('[data-pip]').forEach((p) => {
    const i = Number(p.dataset.pip);
    p.className = 'pip' + (ph === 'final' || i < r || (i === r && ph === 'recap') ? ' fin' : i === r && (ph === 'play' || ph === 'intro') ? ' now' : '');
  });
}

// ───────────── leaderboard (FLIP via absolute rows + transforms) ─────────────
const rows = new Map(); // pid → {node, parts, total, rank}
const boardEl = el('div', { class: 'board' });
const countEl = el('span', {}, '');
const emptyEl = el('div', { class: 'empty-board' }, 'Waiting for the first team to join…');
lb.replaceChildren(el('div', { class: 'panel-h' }, el('h2', {}, '🏆 Leaderboard'), countEl), boardEl);

function buildRow(t) {
  const x = el('button', { class: 'x', title: 'Remove team', onclick: async () => { await api.host('remove', { pid: t.pid }); refresh(); } }, '×');
  const parts = {
    rk: el('div', { class: 'rk' }), av: el('div', { class: 'av' }), nm: el('div', { class: 'nm' }),
    nmText: el('span', {}), sm: el('small', {}), bars: el('div', { class: 'bars' }), totNum: el('span', {}, '0'), x,
  };
  parts.tot = el('div', { class: 'tot' }, parts.totNum);
  parts.nm.append(parts.nmText, parts.sm);
  const node = el('div', { class: 'row' }, parts.rk, parts.av, el('div', { class: 'mid' }, parts.nm, parts.bars), parts.tot);
  boardEl.append(node);
  return { node, parts, total: 0, rank: null };
}

function paintBoard() {
  const list = W.board;
  countEl.textContent = `${list.length} team${list.length === 1 ? '' : 's'}`;
  if (!list.length) { if (!emptyEl.isConnected) boardEl.replaceChildren(emptyEl); return; }
  emptyEl.remove();
  const H = boardEl.clientHeight;
  const gap = 0.55 * rem();
  const rowH = Math.max(2.6 * rem(), Math.min(5.4 * rem(), (H - gap * (list.length - 1)) / list.length));
  const max = Math.max(1, ...list.map((t) => t.total));
  const live = new Set(list.map((t) => t.pid));
  for (const [pid, r] of rows) if (!live.has(pid)) { r.node.remove(); rows.delete(pid); }

  list.forEach((t, i) => {
    let r = rows.get(t.pid);
    if (!r) { r = buildRow(t); rows.set(t.pid, r); r.node.style.transform = `translateY(${i * (rowH + gap) + 30}px)`; r.node.style.opacity = '0'; requestAnimationFrame(() => { r.node.style.opacity = '1'; }); }
    const p = r.parts;
    r.node.style.height = `${rowH}px`;
    r.node.style.transform = `translateY(${i * (rowH + gap)}px)`;
    r.node.classList.toggle('first', t.rank === 1 && t.total > 0);
    r.node.classList.toggle('tiny', rowH < 3.9 * rem());
    p.rk.textContent = t.rank;
    p.av.textContent = t.avatar; p.av.style.setProperty('--h', t.hue);
    p.nmText.textContent = t.name;
    const done = W.phase === 'play' && t.rounds?.[W.round]?.done;
    p.sm.textContent = done ? '✓ finished' : '';
    if (W.phase === 'lobby' && !p.x.isConnected) r.node.append(p.x);
    if (W.phase !== 'lobby' && p.x.isConnected) p.x.remove();

    // stacked per-round segments, scaled against the leader
    p.bars.style.width = `${Math.max(2, (t.total / max) * 100)}%`;
    const segs = ROUNDS.map((_, k) => t.rounds?.[k]?.score || 0);
    while (p.bars.children.length < segs.length) p.bars.append(el('i', { style: { background: ROUND_COLORS[p.bars.children.length % 5] } }));
    segs.forEach((s, k) => { p.bars.children[k].style.flexGrow = s; });

    // deltas
    if (r.rank !== null && r.rank !== t.rank) {
      const diff = r.rank - t.rank;
      const mv = el('span', { class: `mv ${diff > 0 ? 'up' : 'down'}` }, diff > 0 ? `▲${diff}` : `▼${-diff}`);
      p.nm.append(mv); setTimeout(() => mv.remove(), 4000);
    }
    if (t.total > r.total && r.total >= 0 && r.rank !== null) {
      const g = el('span', { class: 'gain' }, `+${fmt(t.total - r.total)}`);
      p.tot.append(g); setTimeout(() => g.remove(), 2300);
      r.node.classList.add('hot'); clearTimeout(r.hotT); r.hotT = setTimeout(() => r.node.classList.remove('hot'), 1600);
    }
    countTo(p.totNum, t.total, 900);
    r.total = t.total; r.rank = t.rank;
  });
  boardEl.style.minHeight = `${list.length * (rowH + gap)}px`;
}

// ───────────── stage panel ─────────────
let live = {}; // handles to nodes that tick
function setStage(...nodes) { sp.replaceChildren(...nodes); sp.style.animation = 'none'; void sp.offsetWidth; sp.style.animation = ''; }

function stageLobby() {
  const n = el('b', {}, '0');
  live = { teams: n };
  setStage(
    el('h1', {}, 'Ready to play?'),
    el('p', { class: 'lead' }, 'Open this address on your group’s PC and enter your group name:'),
    el('div', { class: 'join-url' }, location.host + (api.demo ? '/?demo' : '')),
    el('div', { class: 'roadmap' }, ROUNDS.map((c, i) => el('div', { class: 'rm' }, el('i', {}, c.emoji), c.title, el('span', {}, c.mult > 1 ? '×2' : `${i + 1}/5`)))),
  );
}
function stageIntro(r, d) {
  const cfg = ROUNDS[r];
  const n = el('div', { class: 'huge-count' }, '');
  live = { n, last: -1, startsAt: d.startsAt };
  sfx.whoosh();
  setStage(
    el('div', { class: 'round-badge' }, `Round ${r + 1} of ${ROUNDS.length}`),
    el('div', { style: { fontSize: '5rem' } }, cfg.emoji),
    el('h1', {}, cfg.title),
    el('p', { class: 'lead' }, cfg.subtitle + (cfg.mult > 1 ? ' · POINTS ×2' : '')),
    n,
  );
}
function stagePlay(r, d) {
  const cfg = ROUNDS[r];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  const mk = (cls) => { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('class', cls); c.setAttribute('cx', 50); c.setAttribute('cy', 50); c.setAttribute('r', 45); return c; };
  const bg = mk('bg'); const fg = mk('fg'); fg.setAttribute('stroke-dasharray', 283); fg.setAttribute('stroke-dashoffset', 0);
  svg.append(bg, fg);
  const num = el('b', {}, '');
  const ring = el('div', { class: 'ring' }, svg, num);
  const fin = el('div', { class: 'fin-line' }, '');
  const feed = el('div', { class: 'feed' });
  live = { ring, fg, num, fin, feed, total: d.endsAt - d.startsAt, endsAt: d.endsAt, last: -1 };
  seenEvent = new Map(W.board.map((t) => [t.pid, t.event?.ts || 0]));
  sfx.go();
  setStage(
    el('div', { class: 'round-badge' }, `Round ${r + 1} · ${cfg.title}`),
    ring, fin, feed,
  );
}
function stageRecap(r) {
  const cfg = ROUNDS[r];
  const top3 = [...W.board].sort((a, b) => (b.rounds?.[r]?.score || 0) - (a.rounds?.[r]?.score || 0)).slice(0, 3);
  sfx.horn();
  setStage(
    el('div', { class: 'round-badge' }, `Round ${r + 1} results`),
    el('h2', { class: 't' }, cfg.title),
    el('p', { class: 'lead' }, 'Best this round'),
    el('div', { class: 'mini-podium roadmap' }, top3.map((t, i) => el('div', { class: `rm ${i === 0 ? 'now' : ''}` },
      el('i', {}, ['🥇', '🥈', '🥉'][i]), `${t.avatar} ${t.name}`, el('span', {}, `${fmt(t.rounds?.[r]?.score || 0)} pts`)))),
    el('div', { class: 'fact', style: { fontSize: '1.15rem' } }, '💡 ', cfg.fact),
  );
}
function stageFinal() {
  const top = W.board.slice(0, 3);
  const slots = [[1, top[1]], [0, top[0]], [2, top[2]]]; // visual order: 2nd, 1st, 3rd
  live = { pods: {}, shown: 0 };
  const drum = el('div', { class: 'drumroll' }, '🥁 And the winners are…');
  live.drum = drum;
  const pod = el('div', { class: 'podium' }, slots.filter(([, t]) => t).map(([idx, t]) => {
    const n = el('div', { class: `pod p${idx + 1}` },
      el('div', { class: 'av2' }, t.avatar), el('div', { class: 'pn' }, t.name), el('div', { class: 'ps' }, fmt(t.total)),
      el('div', { class: 'block' }, idx + 1));
    live.pods[idx] = n;
    return n;
  }));
  setStage(el('h2', { class: 't' }, 'Final results'), drum, pod);
}
function applyReveal() {
  if (W.phase !== 'final' || !live.pods) return;
  const rv = W.state.reveal || 0;
  for (; live.shown < rv; live.shown++) {
    const idx = 2 - live.shown; // reveal 3rd, then 2nd, then 1st
    const n = live.pods[idx];
    if (n) { n.classList.add('show'); sfx.drum(); }
    if (idx === 0) { sfx.fanfare(); confettiRain(6000); confetti({ x: 0.3, y: 0.5, count: 140 }); confetti({ x: 0.7, y: 0.5, count: 140 }); }
  }
  if (rv >= 1) live.drum.textContent = rv >= 3 ? '👑 Champions!' : '🥁 …';
}

function stageTick() {
  const d = derive(W.state, api.clock.now());
  if (d.phase === 'lobby') { live.teams && (live.teams.textContent = W.board.length); }
  if (d.phase === 'intro' && live.n) {
    const s = Math.ceil(Math.max(0, live.startsAt - api.clock.now()) / 1000);
    const shown = s <= 3 && s > 0 ? s : '';
    if (shown !== live.last) {
      live.last = shown; live.n.textContent = shown;
      if (shown) { live.n.classList.remove('tick'); void live.n.offsetWidth; live.n.classList.add('tick'); sfx.tick(); }
    }
  }
  if (d.phase === 'play' && live.ring) {
    const left = Math.max(0, live.endsAt - api.clock.now());
    const s = Math.ceil(left / 1000);
    live.fg.setAttribute('stroke-dashoffset', String(283 * (1 - left / live.total)));
    live.ring.classList.toggle('low', s <= 10);
    if (s !== live.last) { live.last = s; live.num.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s <= 5 && s > 0) sfx.tick(); }
    const done = W.board.filter((t) => t.rounds?.[W.round]?.done).length;
    live.fin.textContent = `${done} of ${W.board.length} teams finished`;
    // live feed of team events
    for (const t of W.board) {
      const ts = t.event?.ts || 0;
      if (ts > (seenEvent.get(t.pid) || 0)) {
        seenEvent.set(t.pid, ts);
        live.feed.append(el('div', { class: 'fe' }, t.avatar, ' ', t.event.text));
        while (live.feed.children.length > 4) live.feed.firstChild.remove();
      }
    }
  }
}

// ───────────── controls ─────────────
let busy = false;
const primary = el('button', { class: 'btn primary', onclick: () => act() });
const pace = el('select', { title: 'Game pace', onchange: async () => { await api.host('pace', { pace: Number(pace.value) }); refresh(); } },
  [[1, 'Pace: normal (≈10 min)'], [0.7, 'Pace: quick'], [0.15, 'Pace: test (fast)']].map(([v, l]) => el('option', { value: v }, l)));
const status = el('span', { class: 'muted' }, '');
const resetBtn = el('button', { class: 'btn', onclick: async () => { if (confirm('Reset the game and remove all teams?')) { await api.host('reset'); stageKey = ''; refresh(); } } }, '↺ New game');
const muteBtn = el('button', { class: 'btn', onclick: () => { sfx.setMuted(!sfx.muted); muteBtn.textContent = sfx.muted ? '🔇' : '🔊'; } }, sfx.muted ? '🔇' : '🔊');
ctl.replaceChildren(primary, pace, status, el('span', { class: 'spacer' }), muteBtn, resetBtn);

function plan() {
  const ph = W.phase; const st = W.state;
  if (ph === 'lobby') return { action: 'start', label: `▶ Start round ${st.round + 2}`, off: !W.board.length };
  if (ph === 'intro') return { action: null, label: '…get ready', off: true };
  if (ph === 'play') return { action: 'end', label: '⏭ End round now' };
  if (ph === 'recap') return st.round + 1 >= ROUNDS.length
    ? { action: 'start', label: '🏆 Final results' }
    : { action: 'start', label: `▶ Start round ${st.round + 2}` };
  if (ph === 'final') {
    const rv = st.reveal || 0;
    return rv >= 3 ? { action: null, label: '🎉 Thanks for playing!', off: true } : { action: 'reveal', label: `🥁 Reveal ${ordinal(3 - rv)} place` };
  }
  return { action: null, label: '', off: true };
}
function paintCtl() {
  const p = plan();
  primary.replaceChildren(p.label, el('kbd', {}, 'Space'));
  primary.disabled = !p.action || p.off || busy || W.watchOnly;
  primary.dataset.action = p.action || '';
  pace.style.display = W.phase === 'lobby' && !W.watchOnly ? '' : 'none';
  pace.value = String(W.state?.pace ?? 1);
  resetBtn.style.display = W.watchOnly ? 'none' : '';
  status.textContent = W.watchOnly ? 'Watch-only mode' : '';
}
async function act() {
  const p = plan();
  if (!p.action || busy) return;
  busy = true; paintCtl();
  sfx.unlock();
  const { status: code } = await api.host(p.action);
  busy = false;
  if (code === 401) { gate('Wrong PIN, try again.'); return; }
  await refresh();
}
addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.target.closest?.('input,select,textarea,button')) { e.preventDefault(); act(); }
});

// ───────────── PIN / sound gate ─────────────
function gate(msg = '') {
  $('.sound-gate')?.remove();
  const input = el('input', { type: 'password', placeholder: 'Host PIN', autocomplete: 'off', 'aria-label': 'Host PIN' });
  const err = el('div', { class: 'err' }, msg);
  const go = el('button', { class: 'btn primary big' }, 'Open control room');
  const watch = el('button', { class: 'btn' }, 'Watch only');
  const unlock = async () => {
    sfx.unlock();
    api.setPin(input.value.trim());
    const { status: code } = await api.host('ping');
    if (code !== 200) { err.textContent = 'Wrong PIN.'; return; }
    W.watchOnly = false; $('.sound-gate')?.remove(); paintCtl(); sfx.go();
  };
  go.addEventListener('click', unlock);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(); });
  watch.addEventListener('click', () => { sfx.unlock(); W.watchOnly = true; $('.sound-gate')?.remove(); paintCtl(); });
  document.body.append(el('div', { class: 'sound-gate' }, el('div', { class: 'modal' },
    el('h1', {}, BRAND.name), el('p', { class: 'muted' }, 'Host screen. Enter the PIN (default “amazon”) to control the game. This click also enables sound.'),
    input, err, go, watch)));
  setTimeout(() => input.focus(), 50);
}

// ───────────── loop ─────────────
async function refresh() {
  try {
    const { status: code, data } = await api.state();
    if (code !== 200 || !data.ok) return;
    W.state = data.state; W.board = data.teams;
    syncPhase();
  } catch { /* keep last picture */ }
}
function syncPhase() {
  const d = derive(W.state, api.clock.now());
  W.phase = d.phase; W.round = d.round;
  const key = `${W.state.gameId}|${d.phase}|${d.round}`;
  if (key !== stageKey) {
    stageKey = key;
    switch (d.phase) {
      case 'lobby': stageLobby(); break;
      case 'intro': stageIntro(d.round, d); break;
      case 'play': stagePlay(d.round, d); break;
      case 'recap': stageRecap(d.round); break;
      case 'final': stageFinal(); break;
      default: break;
    }
  }
  paintBoard(); updatePips(); paintCtl(); applyReveal();
}

drawTop();
gate();
api.state().then(() => {});
await refresh();
setInterval(refresh, 800);
setInterval(() => { if (W.state) { stageTick(); const d = derive(W.state, api.clock.now()); if (`${W.state.gameId}|${d.phase}|${d.round}` !== stageKey) syncPhase(); } }, 200);
// recap panel is built from the board, so rebuild it once the last scores have landed
setInterval(() => { if (W.phase === 'recap' && stageKey && rebuiltKey !== stageKey) { rebuiltKey = stageKey; setTimeout(() => { if (W.phase === 'recap') stageRecap(W.round); }, 1800); } }, 500);
addEventListener('resize', () => W.state && paintBoard());
