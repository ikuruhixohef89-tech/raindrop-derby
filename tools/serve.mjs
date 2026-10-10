// Local dev server, Node built-ins only. Not loaded by the game.
// - Serves the game at http://localhost:<port>/<slug>/ like GitHub Pages does.
// - Path case must match exactly (Pages is case-sensitive, Windows is not).
// - Second port serves tools/embed-test.html from a different site (127.0.0.1) to test the cross-site iframe.
// Binds to loopback only, so Windows does not ask for a firewall exception.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).name;

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const PORT = Number(argVal('--port', 8090));
const EMBED_PORT = Number(argVal('--embed-port', PORT + 1));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// Resolve a URL path to a file, checking every segment's exact case.
function resolveExact(relPath) {
  const parts = relPath.split('/').filter(Boolean);
  let cur = ROOT;
  for (const part of parts) {
    if (part === '..' || part === '.') return null;
    let names;
    try {
      names = fs.readdirSync(cur);
    } catch {
      return null;
    }
    if (!names.includes(part)) return null; // exact-case match only
    cur = path.join(cur, part);
  }
  try {
    const st = fs.statSync(cur);
    if (st.isDirectory()) {
      const idx = path.join(cur, 'index.html');
      return fs.existsSync(idx) ? idx : null;
    }
    return cur;
  } catch {
    return null;
  }
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function log(status, req) {
  if (status >= 400) console.log(`${status} ${req.method} ${req.url}`);
}

// Dev-only: save a PNG/JPG posted by a tool page (sandbox, capture) into tools/out/ or site/.
// Loopback only, strict file names, 8 MB cap. The game itself never calls this.
const SAVE_DIRS = { out: path.join(ROOT, 'tools', 'out'), site: path.join(ROOT, 'site') };
function handleSave(req, res, url) {
  const addr = req.socket.remoteAddress || '';
  const loopback = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  const name = url.searchParams.get('name') || '';
  const dirKey = url.searchParams.get('dir') === 'site' ? 'site' : 'out';
  if (!loopback || req.method !== 'POST' || !/^[a-z0-9-]+\.(png|jpg)$/.test(name)) {
    send(res, 400, 'bad request');
    return;
  }
  const chunks = [];
  let size = 0;
  req.on('data', c => {
    size += c.length;
    if (size > 8 * 1024 * 1024) req.destroy();
    else chunks.push(c);
  });
  req.on('end', () => {
    fs.mkdirSync(SAVE_DIRS[dirKey], { recursive: true });
    const file = path.join(SAVE_DIRS[dirKey], name);
    fs.writeFileSync(file, Buffer.concat(chunks));
    console.log(`saved ${path.relative(ROOT, file)} (${size} bytes)`);
    send(res, 200, `saved ${path.relative(ROOT, file).split(path.sep).join('/')} ${size} B`);
  });
}

const gameHandler = (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = decodeURIComponent(url.pathname);
  if (p === '/__save') {
    handleSave(req, res, url);
    return;
  }
  if (p === '/' || p === `/${SLUG}`) {
    res.writeHead(302, { Location: `/${SLUG}/${url.search}` });
    res.end();
    return;
  }
  if (!p.startsWith(`/${SLUG}/`)) {
    log(404, req);
    send(res, 404, 'Not found (the game lives under /' + SLUG + '/)');
    return;
  }
  const file = resolveExact(p.slice(SLUG.length + 2));
  if (!file) {
    log(404, req);
    send(res, 404, 'Not found');
    return;
  }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
};

const embedHandler = (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  if (url.pathname !== '/' && url.pathname !== '/embed-test.html') {
    log(404, req);
    send(res, 404, 'Not found');
    return;
  }
  const html = fs
    .readFileSync(path.join(ROOT, 'tools', 'embed-test.html'), 'utf8')
    .replaceAll('__GAME_URL__', `http://localhost:${PORT}/${SLUG}/`);
  send(res, 200, html, MIME['.html']);
};

function listenLoopback(handler, port, label) {
  for (const host of ['127.0.0.1', '::1']) {
    const srv = http.createServer(handler);
    srv.on('error', err => {
      if (host === '::1' && (err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT')) return;
      console.error(`${label} on ${host}:${port} failed: ${err.code || err.message}`);
      if (host === '127.0.0.1') process.exitCode = 1;
    });
    srv.listen(port, host);
  }
}

listenLoopback(gameHandler, PORT, 'game');
listenLoopback(embedHandler, EMBED_PORT, 'embed');
console.log(`Game:       http://localhost:${PORT}/${SLUG}/`);
console.log(`Debug:      http://localhost:${PORT}/${SLUG}/?debug=1`);
console.log(`Embed test: http://127.0.0.1:${EMBED_PORT}/  (cross-site iframe, like the real site)`);

