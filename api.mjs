// Netlify Function (v2) that serves every /api/* call.
// State lives in Netlify Blobs so all the PCs in the room see the same game.
//
// Data layout in the "prime-time" blob store:
//   state            → the game state, only ever written by the host
//   team/<teamId>    → one blob per team, only ever written by that team
// One writer per key means two teams scoring at the same instant can never
// overwrite each other. No locks needed.

import { getStore } from '@netlify/blobs';
import { handle, memoryDb } from '../../public/js/engine.mjs';

const STORE_NAME = 'prime-time';
const HOST_PIN = () => (globalThis.Netlify?.env?.get?.('HOST_PIN') ?? process.env.HOST_PIN ?? 'amazon');

// A short-lived cache so a room of PCs polling at once does not hammer storage.
const cache = { at: 0, teams: null };
const CACHE_MS = 400;

function blobsDb(store) {
  return {
    kind: 'blobs',
    async getState() { return (await store.get('state', { type: 'json' })) ?? null; },
    async setState(s) { await store.setJSON('state', s); },
    async listTeams() {
      if (cache.teams && Date.now() - cache.at < CACHE_MS) return cache.teams.map((t) => structuredClone(t));
      const { blobs } = await store.list({ prefix: 'team/' });
      const teams = (await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })))).filter(Boolean);
      cache.teams = teams; cache.at = Date.now();
      return teams.map((t) => structuredClone(t));
    },
    async getTeam(id) { return (await store.get(`team/${id}`, { type: 'json' })) ?? null; },
    async putTeam(t) { cache.at = 0; await store.setJSON(`team/${t.id}`, t); },
    async delTeam(id) { cache.at = 0; await store.delete(`team/${id}`); },
    async clearTeams() {
      cache.at = 0;
      const { blobs } = await store.list({ prefix: 'team/' });
      await Promise.all(blobs.map((b) => store.delete(b.key)));
    },
  };
}

let db = null;
function getDb() {
  if (db) return db;
  try {
    db = blobsDb(getStore({ name: STORE_NAME, consistency: 'strong' }));
  } catch (err) {
    // Blobs not configured (for example plain `node` outside Netlify). Keep the game
    // playable in memory rather than crashing: fine for one instance, not for production.
    console.warn('[prime-time] Netlify Blobs unavailable, using in-memory storage:', err?.message);
    db = memoryDb();
  }
  return db;
}

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/(\.netlify\/functions\/api|api)\/?/, '').replace(/\/$/, '');
  let body = {};
  if (req.method === 'POST') {
    try { body = await req.json(); } catch { body = {}; }
  }
  const result = await handle(
    getDb(),
    {
      method: req.method,
      route,
      query: Object.fromEntries(url.searchParams),
      body,
      pin: req.headers.get('x-host-pin') || '',
    },
    Date.now(),
    HOST_PIN(),
  );
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};

export const config = { path: '/api/*' };
