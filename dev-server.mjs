// Zero-dependency local server: serves /public and runs the very same game
// engine as production, backed by memory.   →   node dev-server.mjs
// Great for rehearsing at home with several browser tabs.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, memoryDb } from './public/js/engine.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const PORT = Number(process.env.PORT) || 8888;
const PIN = process.env.HOST_PIN || 'amazon';
const db = memoryDb();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { /* ignore */ }
      const out = await handle(db, {
        method: req.method, route: url.pathname.slice(5).replace(/\/$/, ''),
        query: Object.fromEntries(url.searchParams), body, pin: req.headers['x-host-pin'] || '',
      }, Date.now(), PIN);
      res.writeHead(out.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify(out.body));
    }
    let path = url.pathname === '/' ? '/index.html' : url.pathname === '/host' ? '/host.html' : url.pathname;
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
    await stat(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n  Prime Time running locally\n  Teams:  http://localhost:${PORT}/\n  Host:   http://localhost:${PORT}/host   (PIN: ${PIN})\n`);
});
