// The game server logic. This file is isomorphic on purpose:
//   • the Netlify Function runs it against Netlify Blobs (production),
//   • dev-server.mjs runs it against memory (local testing),
//   • the browser runs it against localStorage ("demo mode", no server needed).
// One brain, three storage back ends, zero drift between them.

import { ROUNDS, INTRO_MS, maxScoreOf } from './content.mjs';

export const LIMITS = { teams: 30, nameMin: 2, nameMax: 22 };
const AVATARS = ['📦', '🚚', '☁️', '🛒', '🎬', '🥑', '💊', '🤖', '🛰️', '🎧', '📚', '🚀', '⚡', '🧠', '🦾', '🎯'];

// ───────────────────────────── helpers ─────────────────────────────

export function rid(len = 16) {
  const bytes = new Uint8Array(Math.ceil(len / 2));
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, len);
}

const ok = (body) => ({ status: 200, body });
const fail = (status, error) => ({ status, body: { ok: false, error } });
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function cleanName(raw) {
  const s = String(raw ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.nameMax);
  return s.length >= LIMITS.nameMin ? s : '';
}

function cleanEvent(raw) {
  return String(raw ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 56);
}

export function newState(pace = 1) {
  return { gameId: rid(6), status: 'lobby', round: -1, startsAt: 0, endsAt: 0, pace, reveal: 0, updatedAt: 0 };
}

/**
 * Turn the stored state + a clock into what everybody should be looking at.
 * Phases: lobby → intro → play → recap → … → final. Clients call this with
 * their server-synced clock, so the whole room flips screens in the same beat.
 */
export function derive(state, now) {
  const base = { status: state.status, round: state.round, startsAt: state.startsAt, endsAt: state.endsAt };
  if (state.status === 'lobby') return { ...base, phase: 'lobby' };
  if (state.status === 'final') return { ...base, phase: 'final' };
  if (state.status === 'recap') return { ...base, phase: 'recap' };
  if (now < state.startsAt) return { ...base, phase: 'intro', msToStart: state.startsAt - now };
  if (now < state.endsAt) return { ...base, phase: 'play', msLeft: state.endsAt - now };
  return { ...base, phase: 'recap' };
}

const publicTeam = (t) => ({
  pid: t.pid,
  name: t.name,
  avatar: t.avatar,
  hue: t.hue,
  total: t.total,
  rounds: t.rounds,
  lastScoreAt: t.lastScoreAt,
  event: t.event,
});

export function buildBoard(teams) {
  return teams
    .map(publicTeam)
    .sort((a, b) => b.total - a.total || (a.lastScoreAt || 0) - (b.lastScoreAt || 0) || a.name.localeCompare(b.name))
    .map((t, i) => ({ ...t, rank: i + 1 }));
}

// ───────────────────────────── storage back ends ─────────────────────────────

/** Plain in-memory storage (dev server, and the fallback if Blobs is unavailable). */
export function memoryDb() {
  let state = null;
  const teams = new Map();
  return {
    kind: 'memory',
    async getState() { return state ? structuredClone(state) : null; },
    async setState(s) { state = structuredClone(s); },
    async listTeams() { return [...teams.values()].map((t) => structuredClone(t)); },
    async getTeam(id) { return teams.has(id) ? structuredClone(teams.get(id)) : null; },
    async putTeam(t) { teams.set(t.id, structuredClone(t)); },
    async delTeam(id) { teams.delete(id); },
    async clearTeams() { teams.clear(); },
  };
}

// ───────────────────────────── request handlers ─────────────────────────────

export async function handle(db, req, now = Date.now(), hostPin = 'amazon') {
  const { method, route, query = {}, body = {}, pin } = req;
  try {
    switch (`${method} ${route}`) {
      case 'GET state': return ok(await getState(db, query.tid, now));
      case 'POST join': return await join(db, body, now);
      case 'POST score': return await score(db, body, now);
      case 'POST host': return await host(db, body, now, pin, hostPin);
      case 'GET ping': return ok({ pong: true, serverTime: now });
      default: return fail(404, 'Unknown route');
    }
  } catch (err) {
    console.error('[prime-time] handler error', err);
    return fail(500, 'Server error');
  }
}

async function getState(db, tid, now) {
  const [stored, teams] = await Promise.all([db.getState(), db.listTeams()]);
  let state = stored;
  if (!state) { state = newState(); await db.setState(state); }
  const me = tid ? teams.find((t) => t.id === tid) : null;
  return {
    ok: true,
    serverTime: now,
    state,
    teams: buildBoard(teams),
    me: me ? me.pid : null,
    joined: Boolean(me),
  };
}

async function join(db, b, now) {
  const name = cleanName(b.name);
  if (!name) return fail(400, `Pick a group name (${LIMITS.nameMin}–${LIMITS.nameMax} characters).`);
  const teams = await db.listTeams();
  const key = name.toLowerCase().replace(/\s+/g, '');
  let team = teams.find((t) => t.key === key);
  if (!team) {
    if (teams.length >= LIMITS.teams) return fail(403, 'This game is full.');
    const n = teams.length;
    team = {
      id: rid(20), pid: rid(8), name, key,
      avatar: AVATARS[n % AVATARS.length],
      hue: Math.round((n * 137.508) % 360),
      joinedAt: now, rounds: {}, total: 0, lastScoreAt: 0, event: null,
    };
    await db.putTeam(team);
  }
  return ok({ ok: true, tid: team.id, team: publicTeam(team) });
}

async function score(db, b, now) {
  const [state, team] = await Promise.all([db.getState(), db.getTeam(String(b.tid || ''))]);
  if (!team) return fail(404, 'unknown-team');
  if (!state) return fail(409, 'no-game');
  const r = Number(b.round);
  if (!Number.isInteger(r) || r < 0 || r >= ROUNDS.length) return fail(400, 'bad-round');
  // Scores only count for the live round (plus a short grace for in-flight requests).
  const open = state.status === 'round' && state.round === r && now >= state.startsAt - 500 && now <= state.endsAt + 3500;
  if (!open) return { status: 200, body: { ok: false, reason: 'closed', total: team.total } };

  const cap = Math.ceil(maxScoreOf(ROUNDS[r]) * 1.1) + 50;
  const incoming = clamp(Math.round(Number(b.score) || 0), 0, cap);
  const prev = team.rounds[r] || { score: 0, answered: 0, correct: 0, done: false };
  // Monotonic: a late, out-of-order or replayed request can never lower a score.
  const next = {
    score: Math.max(prev.score, incoming),
    answered: Math.max(prev.answered, clamp(Math.round(Number(b.answered) || 0), 0, 99)),
    correct: Math.max(prev.correct, clamp(Math.round(Number(b.correct) || 0), 0, 99)),
    done: prev.done || Boolean(b.done),
  };
  const gained = next.score > prev.score;
  team.rounds[r] = next;
  team.total = Object.values(team.rounds).reduce((s, x) => s + x.score, 0);
  if (gained) team.lastScoreAt = now;
  const ev = cleanEvent(b.event);
  if (ev) team.event = { text: ev, ts: now };
  await db.putTeam(team);
  return ok({ ok: true, total: team.total, round: next });
}

async function host(db, b, now, pin, hostPin) {
  if (!pin || String(pin).trim().toLowerCase() !== String(hostPin).trim().toLowerCase()) return fail(401, 'Wrong PIN');
  let st = (await db.getState()) || newState();
  switch (b.action) {
    case 'ping':
      return ok({ ok: true });
    case 'start': {
      const ph = derive(st, now).phase;
      if (ph === 'intro' || ph === 'play') return fail(409, 'A round is already running.');
      if (ph === 'final') return fail(409, 'The game is over. Start a new game.');
      const next = st.round + 1;
      if (next >= ROUNDS.length) {
        st.status = 'final'; st.reveal = 0;
      } else {
        st.status = 'round'; st.round = next;
        st.startsAt = now + INTRO_MS;
        st.endsAt = st.startsAt + Math.round(ROUNDS[next].duration * 1000 * st.pace);
      }
      break;
    }
    case 'end':
      if (st.status === 'round' && now < st.endsAt) { st.endsAt = Math.min(st.endsAt, now); if (st.startsAt > now) st.startsAt = now; }
      break;
    case 'final':
      st.status = 'final'; st.reveal = 0;
      break;
    case 'reveal':
      st.reveal = Math.min(3, (st.reveal || 0) + 1);
      break;
    case 'pace':
      if (st.status !== 'lobby') return fail(409, 'Pace can only change in the lobby.');
      st.pace = clamp(Number(b.pace) || 1, 0.05, 2);
      break;
    case 'reset':
      st = newState(st.pace);
      await db.clearTeams();
      break;
    case 'remove': {
      const teams = await db.listTeams();
      const t = teams.find((x) => x.pid === b.pid);
      if (t) await db.delTeam(t.id);
      return ok({ ok: true });
    }
    default:
      return fail(400, 'Unknown host action');
  }
  st.updatedAt = now;
  await db.setState(st);
  return ok({ ok: true, state: st });
}
