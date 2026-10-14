// Talks to the game server. Two interchangeable back ends:
//   • remote  → fetch('/api/…')                (Netlify, or dev-server.mjs)
//   • local   → engine running on localStorage (add ?demo to the URL, or open the files directly)
// Demo mode lets you rehearse the whole game with several tabs of ONE browser, offline.

import { handle } from './engine.mjs';

export class Clock {
  constructor() { this.samples = []; this.offset = 0; }
  /** Learn the server's clock from a response: keep the sample with the lowest round-trip. */
  sample(serverTime, sentAt, recvAt) {
    const rtt = recvAt - sentAt;
    this.samples.push({ rtt, offset: serverTime + rtt / 2 - recvAt });
    if (this.samples.length > 10) this.samples.shift();
    this.offset = this.samples.reduce((best, s) => (s.rtt < best.rtt ? s : best)).offset;
  }
  now() { return Date.now() + this.offset; }
}

const params = new URLSearchParams(location.search);
export const DEMO = params.has('demo') || location.protocol === 'file:';

// ── localStorage database for demo mode ──
const P = 'pt:';
const read = (k) => { try { return JSON.parse(localStorage.getItem(P + k) || 'null'); } catch { return null; } };
const write = (k, v) => localStorage.setItem(P + k, JSON.stringify(v));
const localDb = {
  kind: 'local',
  async getState() { return read('state'); },
  async setState(s) { write('state', s); },
  async listTeams() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${P}team:`)) { const t = read(k.slice(P.length)); if (t) out.push(t); }
    }
    return out;
  },
  async getTeam(id) { return read(`team:${id}`); },
  async putTeam(t) { write(`team:${t.id}`, t); },
  async delTeam(id) { localStorage.removeItem(`${P}team:${id}`); },
  async clearTeams() {
    for (const k of Object.keys(localStorage)) if (k.startsWith(`${P}team:`)) localStorage.removeItem(k);
  },
};

export function createApi() {
  const clock = new Clock();
  let hostPin = '';
  try { hostPin = sessionStorage.getItem('pt:pin') || ''; } catch { /* ignore */ }

  async function call(method, route, { query, body, pin } = {}) {
    const sent = Date.now();
    if (DEMO) {
      const out = await handle(localDb, { method, route, query: query || {}, body: body || {}, pin: pin || '' }, Date.now(), 'amazon');
      return { status: out.status, data: out.body };
    }
    const qs = query ? `?${new URLSearchParams(query)}` : '';
    const res = await fetch(`/api/${route}${qs}`, {
      method,
      headers: { 'content-type': 'application/json', ...(pin ? { 'x-host-pin': pin } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const recv = Date.now();
    const data = await res.json().catch(() => ({}));
    if (data?.serverTime) clock.sample(data.serverTime, sent, recv);
    return { status: res.status, data };
  }

  return {
    clock,
    demo: DEMO,
    async state(tid) { return call('GET', 'state', { query: tid ? { tid } : undefined }); },
    async join(name) { return call('POST', 'join', { body: { name } }); },
    async score(payload) { return call('POST', 'score', { body: payload }); },
    get hasPin() { return Boolean(hostPin); },
    setPin(p) { hostPin = p; try { sessionStorage.setItem('pt:pin', p); } catch { /* ignore */ } },
    async host(action, extra = {}) { return call('POST', 'host', { body: { action, ...extra }, pin: hostPin }); },
  };
}
