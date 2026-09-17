#!/usr/bin/env node
// Variant Studio — zero-dependency design-variant previewer for coding agents.
// Node >= 18. Works on macOS, Linux, Windows. No bash required.
//
//   node studio.mjs start   [--project DIR] [--port N] [--host H] [--url-host H] [--open] [--foreground] [--idle MIN]
//   node studio.mjs new     <slug> [--title T] [--question Q] [--kind component|section|page] [--variants a,b,c] [--viewports mobile,desktop]
//   node studio.mjs wait    [--round ID] [--timeout SEC]
//   node studio.mjs decision [--round ID]
//   node studio.mjs status | list | open | stop | errors | build [--out FILE] | demo

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI = path.join(HERE, 'ui');
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

// ---------- args ----------
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) out[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || 'help';

// ---------- paths ----------
const PROJECT = path.resolve(args.project || process.env.VARIANT_STUDIO_PROJECT || process.cwd());
const HOME = path.join(PROJECT, '.variant-studio');
const ROUNDS = path.join(HOME, 'rounds');
const STATE = path.join(HOME, 'state');
const INFO = path.join(STATE, 'server.json');
const EVENTS = path.join(STATE, 'events.jsonl');
const ERRORS = path.join(STATE, 'errors.jsonl');

const ensureDirs = () => { for (const d of [HOME, ROUNDS, STATE]) fs.mkdirSync(d, { recursive: true }); };
const readJSON = (f, fb = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const writeJSON = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(o, null, 2)); fs.renameSync(t, f); };
const print = (o) => process.stdout.write(JSON.stringify(o, null, 2) + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

function pidAlive(pid) { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

async function health(info) {
  if (!info) return false;
  try {
    const r = await fetch(`http://127.0.0.1:${info.port}/api/health?k=${info.key}`, { signal: AbortSignal.timeout(1500) });
    const j = await r.json();
    return j.ok && j.project === PROJECT;
  } catch { return false; }
}

// ---------- rounds ----------
const SAFE = /^[a-z0-9][a-z0-9._-]*$/i;
function listRounds() {
  if (!fs.existsSync(ROUNDS)) return [];
  return fs.readdirSync(ROUNDS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && SAFE.test(d.name))
    .map((d) => d.name).sort();
}
function variantFiles(dir) {
  return fs.readdirSync(dir).filter((f) => /\.html?$/i.test(f) && !f.startsWith('_')).sort();
}
function loadRound(id) {
  const dir = path.join(ROUNDS, id);
  if (!fs.existsSync(dir)) return null;
  const m = readJSON(path.join(dir, 'round.json'), {}) || {};
  const files = variantFiles(dir);
  const declared = Array.isArray(m.variants) ? m.variants : [];
  const byId = new Map();
  for (const v of declared) {
    const vv = typeof v === 'string' ? { id: v } : { ...v };
    if (!vv.id) continue;
    byId.set(vv.id, vv);
  }
  for (const f of files) {
    const vid = f.replace(/\.html?$/i, '');
    if (!byId.has(vid)) byId.set(vid, { id: vid });
    byId.get(vid).file = f;
  }
  const variants = [...byId.values()].map((v) => {
    const file = v.file || (v.url ? null : `${v.id}.html`);
    const abs = file ? path.join(dir, file) : null;
    const exists = v.url ? true : !!(abs && fs.existsSync(abs));
    return { id: v.id, label: v.label || prettyId(v.id), notes: v.notes || '', url: v.url || null, file, ready: exists, mtime: exists && abs ? fs.statSync(abs).mtimeMs : 0 };
  });
  const decision = readJSON(path.join(dir, 'decision.json'));
  const stat = fs.statSync(dir);
  return {
    id,
    title: m.title || id.replace(/^\d+-/, '').replace(/[-_]/g, ' '),
    question: m.question || '',
    kind: ['component', 'section', 'page'].includes(m.kind) ? m.kind : 'component',
    viewports: m.viewports || null,
    canvas: m.canvas || null,
    parent: m.parent || null,
    context: m.context || '',
    variants,
    decision,
    created: m.created || new Date(stat.birthtimeMs || stat.ctimeMs).toISOString(),
  };
}
function prettyId(id) {
  if (id.length <= 2) return id.toUpperCase();
  const t = id.replace(/[-_]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function latestRoundId() { const r = listRounds(); return r[r.length - 1] || null; }
function nextRoundId(slug) {
  const nums = listRounds().map((r) => parseInt(r, 10)).filter((n) => !isNaN(n));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  const clean = String(slug || 'round').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'round';
  return `${String(n).padStart(3, '0')}-${clean}`;
}

// ---------- rendering ----------
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function headItems(manifest, roundId, inline = false) {
  const items = [];
  const g = path.join(HOME, 'global.css');
  const shared = path.join(ROUNDS, roundId, '_shared.css');
  if (fs.existsSync(g)) items.push(inline ? `<style>${fs.readFileSync(g, 'utf8')}</style>` : `<link rel="stylesheet" href="/_global.css">`);
  if (fs.existsSync(shared)) items.push(inline ? `<style>${fs.readFileSync(shared, 'utf8')}</style>` : `<link rel="stylesheet" href="/r/${roundId}/_shared.css">`);
  for (const h of manifest.head || []) {
    if (typeof h !== 'string') continue;
    const t = h.trim();
    if (t.startsWith('<')) items.push(t);
    else if (/\.css(\?|$)/i.test(t)) items.push(`<link rel="stylesheet" href="${esc(t)}">`);
    else if (/\.m?js(\?|$)/i.test(t)) items.push(`<script src="${esc(t)}"${/\.mjs/.test(t) ? ' type="module"' : ''}></script>`);
  }
  return items.join('\n');
}
function renderVariant(roundId, file, opts = {}) {
  const dir = path.join(ROUNDS, roundId);
  const manifest = readJSON(path.join(dir, 'round.json'), {}) || {};
  const kind = ['component', 'section', 'page'].includes(manifest.kind) ? manifest.kind : 'component';
  const raw = fs.readFileSync(path.join(dir, file), 'utf8');
  const frameJs = opts.inline ? `<script>${fs.readFileSync(path.join(UI, 'frame.js'), 'utf8')}</script>` : `<script src="/_ui/frame.js"></script>`;
  const isDoc = /^\s*(<!doctype|<html)/i.test(raw);
  if (isDoc) {
    // inject as early as possible so errors thrown by the page are captured
    if (/<head[^>]*>/i.test(raw)) return raw.replace(/<head[^>]*>/i, (m) => `${m}${frameJs}`);
    if (/<html[^>]*>/i.test(raw)) return raw.replace(/<html[^>]*>/i, (m) => `${m}${frameJs}`);
    return frameJs + raw;
  }
  const baseCss = opts.inline ? `<style>${fs.readFileSync(path.join(UI, 'base.css'), 'utf8')}</style>` : `<link rel="stylesheet" href="/_ui/base.css">`;
  return `<!doctype html>
<html lang="en" data-vs-kind="${kind}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${opts.inline ? '' : `<base href="/r/${roundId}/">`}
${frameJs}
${baseCss}
${headItems(manifest, roundId, opts.inline)}
</head>
<body>
<div id="vs-root">
${raw}
</div>
</body>
</html>`;
}

// ---------- server ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const BLOCKED = /(^|[\\/])(\.env[^\\/]*|\.git|\.ssh|node_modules[\\/]\.cache|id_rsa[^\\/]*|.*\.pem|.*\.key)([\\/]|$)/i;

function safeJoin(root, rel) {
  const p = path.resolve(root, '.' + path.sep + decodeURIComponent(rel));
  if (p !== root && !p.startsWith(root + path.sep)) return null;
  return p;
}
function sendFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}
function readBody(req, limit = 2e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function snapshot() {
  // cheap fingerprint of everything the UI cares about
  const parts = [];
  for (const r of listRounds()) {
    const dir = path.join(ROUNDS, r);
    try {
      for (const f of fs.readdirSync(dir)) {
        const st = fs.statSync(path.join(dir, f));
        parts.push(`${r}/${f}:${st.mtimeMs}:${st.size}`);
      }
    } catch {}
  }
  const g = path.join(HOME, 'global.css');
  if (fs.existsSync(g)) parts.push('g:' + fs.statSync(g).mtimeMs);
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex');
}

async function serve() {
  ensureDirs();
  const prev = readJSON(INFO);
  const key = (prev && prev.key) || crypto.randomBytes(12).toString('hex');
  const host = args.host || '127.0.0.1';
  const urlHost = args['url-host'] || (host === '0.0.0.0' ? 'localhost' : host);
  const idleMin = Number(args.idle || 240);
  let lastActivity = Date.now();
  const clients = new Set();
  const broadcast = (event, data) => { for (const c of clients) c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

  const server = http.createServer(async (req, res) => {
    lastActivity = Date.now();
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    const cookieKey = (req.headers.cookie || '').match(/vs_key=([a-f0-9]+)/)?.[1];
    const authed = u.searchParams.get('k') === key || cookieKey === key;
    // tool assets are public so pages on other origins (e.g. a dev server) can include frame.js
    if (p.startsWith('/_ui/') && /^\/_ui\/(frame\.js|base\.css)$/.test(p)) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)], 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      return res.end(fs.readFileSync(path.join(UI, path.basename(p))));
    }
    if (!authed) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Variant Studio: missing or wrong key. Open the full URL printed by `studio.mjs start` (it contains ?k=...).');
    }
    const setCookie = u.searchParams.get('k') === key ? { 'Set-Cookie': `vs_key=${key}; Path=/; SameSite=Strict; HttpOnly` } : {};

    try {
      if (p === '/' || p === '/index.html') {
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store', ...setCookie });
        return res.end(fs.readFileSync(path.join(UI, 'app.html')));
      }
      if (p === '/api/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, project: PROJECT, pid: process.pid })); }
      if (p === '/api/state') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ project: path.basename(PROJECT), rounds: listRounds().map(loadRound).filter(Boolean) }));
      }
      if (p === '/api/stream') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(`retry: 1500\nevent: hello\ndata: {}\n\n`);
        clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 20000);
        req.on('close', () => { clearInterval(ping); clients.delete(res); });
        return;
      }
      if (p === '/api/decision' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const id = body.round;
        if (!id || !SAFE.test(id) || !fs.existsSync(path.join(ROUNDS, id))) { res.writeHead(400); return res.end('bad round'); }
        const round = loadRound(id);
        const files = {};
        for (const v of round.variants) if (v.file) files[v.id] = path.join(ROUNDS, id, v.file);
        const decision = { ...body, id: crypto.randomBytes(6).toString('hex'), at: now(), consumed: false, files, round_dir: path.join(ROUNDS, id) };
        writeJSON(path.join(ROUNDS, id, 'decision.json'), decision);
        fs.appendFileSync(EVENTS, JSON.stringify({ type: 'decision', round: id, action: body.action, selected: body.selected, at: decision.at }) + '\n');
        broadcast('decision', { round: id });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, id: decision.id }));
      }
      if (p === '/api/log' && req.method === 'POST') {
        const body = await readBody(req, 20000);
        fs.appendFileSync(ERRORS, JSON.stringify({ at: now(), ...JSON.parse(body) }) + '\n');
        res.writeHead(204); return res.end();
      }
      if (p.startsWith('/_ui/')) {
        const f = safeJoin(UI, p.slice(5)); if (!f) { res.writeHead(403); return res.end(); }
        return sendFile(res, f);
      }
      if (p === '/_global.css') return sendFile(res, path.join(HOME, 'global.css'));
      if (p.startsWith('/v/')) {
        const [, , roundId, file] = p.split('/');
        if (!SAFE.test(roundId || '') || !/^[\w.-]+\.html?$/i.test(file || '')) { res.writeHead(400); return res.end(); }
        const abs = path.join(ROUNDS, roundId, file);
        if (!fs.existsSync(abs)) {
          res.writeHead(404, { 'Content-Type': MIME['.html'] });
          return res.end('<!doctype html><body style="font:14px system-ui;color:#888;display:grid;place-items:center;height:90vh">Not generated yet…</body>');
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
        return res.end(renderVariant(roundId, file));
      }
      if (p.startsWith('/r/')) {
        const rest = p.slice(3);
        const roundId = rest.split('/')[0];
        if (!SAFE.test(roundId)) { res.writeHead(400); return res.end(); }
        const f = safeJoin(path.join(ROUNDS, roundId), rest.slice(roundId.length + 1));
        if (!f) { res.writeHead(403); return res.end(); }
        return sendFile(res, f);
      }
      if (p.startsWith('/p/')) {
        const rel = p.slice(3);
        const f = safeJoin(PROJECT, rel);
        if (!f || BLOCKED.test(path.relative(PROJECT, f))) { res.writeHead(403); return res.end('blocked'); }
        return sendFile(res, f);
      }
      res.writeHead(404); res.end('not found');
    } catch (e) {
      res.writeHead(500); res.end(String(e && e.message));
    }
  });

  const tryListen = (port) => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(server.address().port); });
  });
  let port;
  const wanted = Number(args.port || (prev && prev.port) || 0);
  try { port = await tryListen(wanted); }
  catch { port = await tryListen(0); }

  const info = { type: 'server-started', pid: process.pid, port, key, host, project: PROJECT, url: `http://${urlHost}:${port}/?k=${key}`, rounds_dir: ROUNDS, state_dir: STATE, started: now() };
  writeJSON(INFO, info);
  try { fs.rmSync(path.join(STATE, 'stopped'), { force: true }); } catch {}
  if (args.foreground) print(info);

  let last = snapshot();
  const watcher = setInterval(() => {
    const s = snapshot();
    if (s !== last) { last = s; broadcast('change', { at: Date.now() }); }
    if (clients.size === 0 && Date.now() - lastActivity > idleMin * 60000) shutdown('idle');
  }, 600);

  function shutdown(reason) {
    clearInterval(watcher);
    try { fs.writeFileSync(path.join(STATE, 'stopped'), JSON.stringify({ reason, at: now() })); } catch {}
    const cur = readJSON(INFO);
    if (cur && cur.pid === process.pid) { cur.stopped = now(); cur.pid = null; writeJSON(INFO, cur); }
    for (const c of clients) c.end();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  }
  process.on('SIGINT', () => shutdown('signal'));
  process.on('SIGTERM', () => shutdown('signal'));
}

function openBrowser(url) {
  const plat = process.platform;
  const [bin, a] = plat === 'darwin' ? ['open', [url]] : plat === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : ['xdg-open', [url]];
  try { spawn(bin, a, { detached: true, stdio: 'ignore', windowsHide: true }).unref(); return true; } catch { return false; }
}

// ---------- commands ----------
async function start() {
  ensureDirs();
  ensureGitignore();
  const info = readJSON(INFO);
  if (info && pidAlive(info.pid) && await health(info)) {
    if (args.open) openBrowser(info.url);
    return print({ ...info, type: 'server-already-running' });
  }
  if (args.foreground) return serve();
  const passthrough = ['project', 'port', 'host', 'url-host', 'idle'].flatMap((k) => (args[k] ? [`--${k}`, String(args[k])] : []));
  const logFile = path.join(STATE, 'server.log');
  const out = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve', '--project', PROJECT, ...passthrough], { detached: true, stdio: ['ignore', out, out], windowsHide: true });
  child.unref();
  for (let i = 0; i < 50; i++) {
    await sleep(150);
    const cur = readJSON(INFO);
    if (cur && cur.pid === child.pid && await health(cur)) {
      if (args.open) openBrowser(cur.url);
      return print(cur);
    }
  }
  print({ type: 'error', message: 'server did not start in time', log: logFile });
  process.exit(1);
}

function ensureGitignore() {
  const gi = path.join(PROJECT, '.gitignore');
  if (!fs.existsSync(path.join(PROJECT, '.git'))) return;
  const txt = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  if (!/^\/?\.variant-studio\/?$/m.test(txt)) fs.appendFileSync(gi, `${txt && !txt.endsWith('\n') ? '\n' : ''}.variant-studio/\n`);
}

async function stop() {
  const info = readJSON(INFO);
  if (!info || !pidAlive(info.pid)) return print({ type: 'not-running' });
  try { process.kill(info.pid, 'SIGTERM'); } catch {}
  for (let i = 0; i < 20 && pidAlive(info.pid); i++) await sleep(100);
  print({ type: 'server-stopped', pid: info.pid });
}

async function status() {
  const info = readJSON(INFO);
  const alive = !!(info && pidAlive(info.pid) && await health(info));
  const latest = latestRoundId();
  const r = latest && loadRound(latest);
  print({
    running: alive, url: alive ? info.url : null, project: PROJECT, rounds_dir: ROUNDS,
    latest_round: r ? { id: r.id, title: r.title, variants: r.variants.map((v) => `${v.id}${v.ready ? '' : ' (missing)'}`), decision: r.decision ? { action: r.decision.action, selected: r.decision.selected, consumed: r.decision.consumed } : null } : null,
    hint: alive ? undefined : 'Run: node <skill>/scripts/studio.mjs start --project <dir> --open',
  });
}

function newRound() {
  ensureDirs();
  const slug = args._[1] || args.slug || 'round';
  const id = nextRoundId(slug);
  const dir = path.join(ROUNDS, id);
  fs.mkdirSync(dir, { recursive: true });
  const count = Number(args.count || 0);
  const ids = args.variants ? String(args.variants).split(',').map((s) => s.trim()).filter(Boolean) : LETTERS.slice(0, count || 3);
  const manifest = {
    title: args.title || slug.replace(/[-_]/g, ' '),
    question: args.question || '',
    kind: args.kind || 'component',
    ...(args.viewports ? { viewports: String(args.viewports).split(',') } : {}),
    ...(args.parent ? { parent: args.parent } : {}),
    head: args.head ? String(args.head).split(',') : [],
    variants: ids.map((v) => ({ id: v, label: prettyId(v), notes: '' })),
    created: now(),
  };
  writeJSON(path.join(dir, 'round.json'), manifest);
  print({ type: 'round-created', id, dir, manifest: path.join(dir, 'round.json'), write_variants_to: ids.map((v) => path.join(dir, `${v}.html`)) });
}

function nextStep(d) {
  const sel = (d.selected || []).join(', ');
  switch (d.action) {
    case 'choose': return `User approved variant ${sel}. Implement it in the real codebase (source: files.${d.selected?.[0]}). Apply any comments/annotations as final tweaks.`;
    case 'revise': return `User wants changes to ${sel}. Create a new round (--parent ${d.round}) with 2-3 refined versions of ${sel} that address every note and annotation.`;
    case 'remix': return `User wants to combine ${sel}. Read the per-variant comments to see what to keep from each, then create a new round (--parent ${d.round}) with 2-3 blends.`;
    case 'regenerate': return `User rejected all variants. Read the note and ratings, then create a new round (--parent ${d.round}) exploring clearly different directions.`;
    default: return 'Read the note and act on it.';
  }
}

async function wait() {
  const id = args.round || latestRoundId();
  if (!id) { print({ type: 'error', message: 'no rounds yet' }); process.exit(1); }
  const timeout = Number(args.timeout || 540) * 1000;
  const file = path.join(ROUNDS, id, 'decision.json');
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const d = readJSON(file);
    if (d && !d.consumed) {
      d.consumed = true; d.consumed_at = now();
      writeJSON(file, d);
      const errs = recentErrors(id);
      return print({ type: 'decision', ...d, next_step: nextStep(d), ...(errs.length ? { render_errors: errs } : {}) });
    }
    // a newer round appeared (agent moved on) -> stop waiting on the old one
    if (!args.round && latestRoundId() !== id) break;
    await sleep(700);
  }
  print({ type: 'timeout', round: id, message: 'No decision yet. End your turn and ask the user to pick in the browser (or reply in chat); then run `decision`.' });
  process.exit(2);
}

function decision() {
  const id = args.round || latestRoundId();
  const d = id && readJSON(path.join(ROUNDS, id, 'decision.json'));
  if (!d) return print({ type: 'no-decision', round: id });
  print({ type: 'decision', ...d, next_step: nextStep(d) });
}

function recentErrors(roundId) {
  if (!fs.existsSync(ERRORS)) return [];
  return fs.readFileSync(ERRORS, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e) => e && (!roundId || e.round === roundId)).slice(-20);
}

function list() {
  print(listRounds().map(loadRound).map((r) => ({ id: r.id, title: r.title, kind: r.kind, parent: r.parent, variants: r.variants.length, decision: r.decision ? `${r.decision.action}:${(r.decision.selected || []).join('+')}` : null })));
}

// Static, server-less gallery (fallback for sandboxes that can't keep a server alive)
function build() {
  const out = path.resolve(args.out || path.join(HOME, 'gallery.html'));
  const rounds = (args.round ? [args.round] : listRounds()).map(loadRound).filter(Boolean).map((r) => ({
    ...r,
    variants: r.variants.map((v) => ({ ...v, html: v.file && v.ready ? renderVariant(r.id, v.file, { inline: true }) : null })),
  }));
  const app = fs.readFileSync(path.join(UI, 'app.html'), 'utf8');
  const data = JSON.stringify({ project: path.basename(PROJECT), rounds }).replace(/</g, '\\u003c');
  fs.writeFileSync(out, app.replace('<!--VS_STATIC-->', `<script>window.__VS_STATIC__=${data};</script>`));
  print({ type: 'static-gallery', file: out, note: 'Open this file in a browser. Decisions are copied to clipboard as JSON for the user to paste back into chat.' });
}

function demo() {
  ensureDirs();
  const src = path.join(HERE, '..', 'assets', 'demo-round');
  const id = nextRoundId('demo-product-card');
  fs.cpSync(src, path.join(ROUNDS, id), { recursive: true });
  const m = readJSON(path.join(ROUNDS, id, 'round.json')); m.created = now(); writeJSON(path.join(ROUNDS, id, 'round.json'), m);
  print({ type: 'round-created', id, dir: path.join(ROUNDS, id) });
}

function help() {
  process.stdout.write(`Variant Studio
  start     start (or reuse) the preview server        --project DIR --open --port N --host H --foreground --idle MIN
  new       scaffold a round: new <slug> --title T --question Q --kind component|section|page --variants a,b,c --parent ID
  wait      block until the user decides               --round ID --timeout SEC (exit 2 on timeout)
  decision  print latest decision without waiting      --round ID
  status    server + latest round summary
  list      all rounds
  errors    JS errors reported by variant previews     --round ID
  open      open the gallery in the default browser
  build     write a self-contained gallery.html        --out FILE --round ID
  demo      add a demo round (product card)
  stop      stop the server
`);
}

const commands = {
  start, serve, stop, status, wait, decision, list, build, demo, help,
  new: newRound,
  errors: () => print(recentErrors(args.round)),
  open: () => { const i = readJSON(INFO); if (!i) return print({ type: 'not-running' }); openBrowser(i.url); print({ type: 'opened', url: i.url }); },
};
if (!commands[cmd]) { help(); process.exit(1); }
await commands[cmd]();
