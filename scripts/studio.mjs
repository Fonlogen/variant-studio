#!/usr/bin/env node
// Variant Studio 3.1 — zero-dependency design-variant previewer for coding agents.
// Node >= 18. Works on macOS, Linux, Windows. No bash required.
//
//   node studio.mjs start    [--project DIR] [--port N] [--host H] [--url-host H] [--team] [--open] [--foreground] [--idle MIN]
//   node studio.mjs new      <slug> [--group "Area/Sub"] [--title T] [--question Q] [--kind component|section|page] [--variants a,b,c] [--viewports mobile,desktop] [--parent ID]
//   node studio.mjs present  [--round ID] [--timeout SEC]     hand the round to the user, then wait for the decision
//   node studio.mjs wait     [--round ID] [--timeout SEC]     wait for the next decision (exit 2 = still waiting, run again)
//   node studio.mjs decision [--round ID]
//   node studio.mjs status | list | groups | inbox | open | stop | errors | build [--out FILE] [--team] | demo

import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VERSION = '3.1';
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
const INBOX = path.join(STATE, 'inbox');
const INFO = path.join(STATE, 'server.json');
const AGENT = path.join(STATE, 'agent.json');
const VOTES = path.join(STATE, 'votes.json');
const BRAND = path.join(HOME, 'brand.json');
const EVENTS = path.join(STATE, 'events.jsonl');
const ERRORS = path.join(STATE, 'errors.jsonl');

const ensureDirs = () => { for (const d of [HOME, ROUNDS, STATE, INBOX]) fs.mkdirSync(d, { recursive: true }); };
const readJSON = (f, fb = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const writeJSON = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify(o, null, 2)); fs.renameSync(t, f); };
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

// ---------- agent presence ----------
// `wait` writes a heartbeat every 2 s; the gallery shows whether the agent is listening.
const HOLD_MS = 15000; // approvals stay undoable this long before the agent can read them
function setAgent(state, extra = {}) { try { writeJSON(AGENT, { state, pid: process.pid, at: now(), beat: Date.now(), ...extra }); } catch {} }
function agentStatus() {
  const a = readJSON(AGENT);
  if (!a) return { state: 'unknown' };
  const age = Date.now() - (a.beat || 0);
  if (a.state === 'waiting') return age < 9000 ? { state: 'waiting', since: a.since || a.at } : { state: 'away', since: a.at };
  if (a.state === 'working') return age < 25 * 60000 ? { state: 'working', since: a.at, round: a.round || null } : { state: 'away', since: a.at };
  return { state: 'away', since: a.at };
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
  const [group, subgroup] = splitGroup(m);
  return {
    id,
    group,
    subgroup,
    title: m.title || id.replace(/^\d+-/, '').replace(/[-_]/g, ' '),
    question: m.question || '',
    kind: ['component', 'section', 'page'].includes(m.kind) ? m.kind : 'component',
    viewports: m.viewports || null,
    canvas: m.canvas || null,
    parent: m.parent || null,
    context: m.context || '',
    knobs: Array.isArray(m.knobs) ? m.knobs : [],
    states: Array.isArray(m.states) ? m.states : [],
    content: Array.isArray(m.content) ? m.content : [],
    checklist: Array.isArray(m.checklist) ? m.checklist : [],
    variants,
    decision: decision ? publicDecision(decision) : null,
    created: m.created || new Date(stat.birthtimeMs || stat.ctimeMs).toISOString(),
  };
}
const publicDecision = (d) => { const { _prev, ...rest } = d; return rest; };
function splitGroup(m) {
  const parts = String(m.group || '').split('/').map((s) => s.trim()).filter(Boolean);
  const group = parts[0] || '';
  const subgroup = String(m.subgroup || '').trim() || parts.slice(1).join(' / ');
  return [group, subgroup];
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

// ---------- inbox: every decision is queued, nothing is overwritten ----------
function inboxEntries() {
  if (!fs.existsSync(INBOX)) return [];
  return fs.readdirSync(INBOX).filter((f) => f.endsWith('.json')).sort()
    .map((f) => ({ file: path.join(INBOX, f), d: readJSON(path.join(INBOX, f)) })).filter((e) => e.d);
}
function pendingEntries(roundId) {
  return inboxEntries().filter((e) => !e.d.consumed && !e.d.cancelled && (!roundId || e.d.round === roundId));
}
function enqueue(decision) {
  ensureDirs();
  const file = path.join(INBOX, `${Date.now().toString().padStart(14, '0')}-${decision.id}.json`);
  writeJSON(file, decision);
  return file;
}
function markConsumed(e) {
  e.d.consumed = true; e.d.consumed_at = now();
  writeJSON(e.file, e.d);
  const rf = path.join(ROUNDS, e.d.round, 'decision.json');
  const rd = readJSON(rf);
  if (rd && rd.id === e.d.id) { rd.consumed = true; rd.consumed_at = e.d.consumed_at; writeJSON(rf, rd); }
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
    else if (/\.css(\?|$)/i.test(t) || /fonts\.googleapis\.com\/css/i.test(t)) items.push(`<link rel="stylesheet" href="${esc(t)}">`);
    else if (/\.m?js(\?|$)/i.test(t)) items.push(`<script src="${esc(t)}"${/\.mjs/.test(t) ? ' type="module"' : ''}></script>`);
  }
  return items.join('\n');
}
function brandCss() {
  const b = readJSON(BRAND);
  if (!b || b.enabled === false) return '';
  const vars = Object.entries(b.colors || {}).filter(([k, v]) => /^[\w-]+$/.test(k) && typeof v === 'string' && !/[;{}<]/.test(v)).map(([k, v]) => `--brand-${k}:${v};`).join('');
  const f = b.fonts || {};
  const fam = (x) => (typeof x === 'string' && /^[\w \-]+$/.test(x) ? `"${x}"` : null);
  const fonts = [fam(f.heading) && `--brand-font-heading:${fam(f.heading)},system-ui,sans-serif;`, fam(f.body) && `--brand-font-body:${fam(f.body)},system-ui,sans-serif;`].filter(Boolean).join('');
  return vars || fonts ? `<style id="vs-brand">:root{${vars}${fonts}}</style>` : '';
}
function renderVariant(roundId, file, opts = {}) {
  const dir = path.join(ROUNDS, roundId);
  const manifest = readJSON(path.join(dir, 'round.json'), {}) || {};
  const kind = ['component', 'section', 'page'].includes(manifest.kind) ? manifest.kind : 'component';
  const raw = fs.readFileSync(path.join(dir, file), 'utf8');
  const frameJs = opts.bare ? '' : opts.inline ? `<script>${fs.readFileSync(path.join(UI, 'frame.js'), 'utf8')}</script>` : `<script src="/_ui/frame.js"></script>`;
  const brand = brandCss();
  const isDoc = /^\s*(<!doctype|<html)/i.test(raw);
  if (isDoc) {
    // inject as early as possible so errors thrown by the page are captured
    if (/<head[^>]*>/i.test(raw)) return raw.replace(/<head[^>]*>/i, (m) => `${m}${frameJs}${brand}`);
    if (/<html[^>]*>/i.test(raw)) return raw.replace(/<html[^>]*>/i, (m) => `${m}${frameJs}${brand}`);
    return frameJs + brand + raw;
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
${brand}
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
// fingerprint of the studio's own files: an open tab reloads itself when it changes (after an update or restart)
function uiVersion() {
  let n = 0;
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else n = (n * 31 + Math.round(fs.statSync(p).mtimeMs) + f.name.length) % 2147483647; } };
  try { walk(UI); } catch {}
  return VERSION + '-' + n.toString(36);
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
const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
const cleanName = (s, max = 40) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, max);
function saveImage(roundId, sub, name, dataUrl) {
  const m = String(dataUrl || '').match(/^data:image\/(png|jpe?g|webp|gif|avif);base64,(.+)$/);
  if (!m) return null;
  const rel = `${sub}/${Date.now().toString(36)}-${cleanName(name) || 'image'}.${m[1].replace('jpeg', 'jpg')}`;
  fs.mkdirSync(path.join(ROUNDS, roundId, sub), { recursive: true });
  fs.writeFileSync(path.join(ROUNDS, roundId, rel), Buffer.from(m[2], 'base64'));
  return rel;
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
  for (const f of [path.join(HOME, 'global.css'), VOTES, BRAND]) if (fs.existsSync(f)) parts.push(f + ':' + fs.statSync(f).mtimeMs);
  const pend = pendingEntries().map((e) => e.d.id).join(',');
  parts.push('inbox:' + pend);
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex');
}

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  return null;
}

function stateFor() {
  return {
    version: VERSION,
    project: path.basename(PROJECT),
    rounds: listRounds().map(loadRound).filter(Boolean),
    agent: agentStatus(),
    pending: pendingEntries().map((e) => ({ id: e.d.id, round: e.d.round, action: e.d.action, selected: e.d.selected, at: e.d.at, hold_until: e.d.hold_until || null })),
    votes: readJSON(VOTES, {}),
    brand: readJSON(BRAND, null),
    team_url: readJSON(INFO)?.team_url || null,
  };
}

// ---------- remote sharing (Cloudflare quick tunnel) ----------
// ~/.variant-studio/config.json is written by the installer: { "remote": { "enabled": true, "cloudflared": "/path/to/cloudflared" } }
const USER_DIR = path.join(os.homedir(), '.variant-studio');
const LANG_NAMES = { en: 'English', it: 'Italian', es: 'Spanish', fr: 'French', ru: 'Russian' };
// the studio language: chosen in the studio (saved by the browser), otherwise guessed from the system locale
function studioLang() {
  const l = userConfig().lang;
  if (LANG_NAMES[l]) return l;
  const sys = (process.env.LC_ALL || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale || '').slice(0, 2).toLowerCase();
  return LANG_NAMES[sys] ? sys : 'en';
}
const langNote = () => { const l = studioLang(); return { studio_language: l, write_in: `Write the round title, question, context, variant labels and notes in ${LANG_NAMES[l]}, the language of the studio. Copy inside the designs follows the product, not the studio.` }; };
function saveUserConfig(patch) {
  const f = path.join(USER_DIR, 'config.json');
  fs.mkdirSync(USER_DIR, { recursive: true });
  writeJSON(f, { ...readJSON(f, {}), ...patch });
}
const userConfig = () => ({ ...readJSON(path.join(HERE, '..', 'config.json'), {}), ...readJSON(path.join(USER_DIR, 'config.json'), {}) });
function findCloudflared() {
  const exe = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const cfg = userConfig().remote?.cloudflared;
  const dirs = [...(process.env.PATH || '').split(path.delimiter), path.join(USER_DIR, 'bin'), '/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin'),
    ...(process.platform === 'win32' ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'cloudflared'), path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'cloudflared')] : [])];
  for (const c of [cfg, ...dirs.filter(Boolean).map((d) => path.join(d, exe))]) { try { if (c && fs.statSync(c).isFile()) return c; } catch {} }
  return null;
}
// what a guest (teammate link, LAN or remote) may reach: view, vote, export. Never decisions, uploads or project sources.
const GUEST_P_ASSET = /\.(css|woff2?|ttf|otf|png|jpe?g|gif|webp|avif|svg|ico)$/i;
function guestAllowed(p, method) {
  if (method === 'GET' && (p === '/' || p === '/index.html' || p.startsWith('/_ui/') || p === '/_global.css' || p === '/api/state' || p === '/api/stream' || p === '/api/health' || p === '/api/agent' || p.startsWith('/v/') || p.startsWith('/r/') || p.startsWith('/x/'))) return true;
  if (method === 'GET' && p.startsWith('/p/')) return GUEST_P_ASSET.test(p);
  if (method === 'POST' && (p === '/api/vote' || p === '/api/log')) return true;
  return false;
}

async function serve() {
  ensureDirs();
  const prev = readJSON(INFO);
  const key = (prev && prev.key) || crypto.randomBytes(12).toString('hex');
  let guestKey = (prev && prev.guest_key) || crypto.randomBytes(12).toString('hex');
  const host = args.host || (args.team ? '0.0.0.0' : '127.0.0.1');
  const lan = lanAddress();
  const urlHost = args['url-host'] || (host === '0.0.0.0' ? (args.team && lan ? lan : 'localhost') : host);
  const idleMin = Number(args.idle || 240);
  let lastActivity = Date.now();
  const clients = new Set();
  const broadcast = (event, data) => { for (const c of clients) c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

  const server = http.createServer(async (req, res) => {
    lastActivity = Date.now();
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    const cookie = req.headers.cookie || '';
    const cookieKey = cookie.match(/vs_key=([a-f0-9]+)/)?.[1];
    const cookieGuest = cookie.match(/vs_guest=([a-f0-9]+)/)?.[1];
    const owner = u.searchParams.get('k') === key || cookieKey === key;
    const guest = !owner && (u.searchParams.get('g') === guestKey || cookieGuest === guestKey);
    const authed = owner || guest;
    // tool assets are public so pages on other origins (e.g. a dev server) can include frame.js
    if (p.startsWith('/_ui/') && /^\/_ui\/(frame\.js|base\.css)$/.test(p)) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)], 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      return res.end(fs.readFileSync(path.join(UI, path.basename(p))));
    }
    if (!authed) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(`Variant Studio ${VERSION}: missing or wrong key. Open the full URL printed by \`studio.mjs start\` (it contains ?k=...).`);
    }
    if (guest && !guestAllowed(p, req.method)) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not available to guests.'); }
    const setCookie = u.searchParams.get('k') === key ? { 'Set-Cookie': `vs_key=${key}; Path=/; SameSite=Lax; HttpOnly` }
      : u.searchParams.get('g') === guestKey ? { 'Set-Cookie': `vs_guest=${guestKey}; Path=/; SameSite=Lax; HttpOnly` } : {};

    try {
      if (p === '/' || p === '/index.html') {
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store', ...setCookie });
        const app = fs.readFileSync(path.join(UI, 'app.html'), 'utf8');
        return res.end(guest ? app.replace('<!--VS_STATIC-->', '<script>window.__VS_ROLE__="guest";</script>') : app);
      }
      if (p === '/api/health') return json(res, 200, { ok: true, project: PROJECT, pid: process.pid, version: VERSION });
      if (p === '/api/state') {
        const st = stateFor();
        if (guest) { delete st.team_url; delete st.brand; return json(res, 200, { ...st, role: 'guest' }); }
        return json(res, 200, { ...st, role: 'owner', team_url: teamUrl(), remote: remoteState(), lang: userConfig().lang || null });
      }
      if (p === '/api/prefs' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}');
        if (!LANG_NAMES[body.lang]) return json(res, 400, { error: 'unknown language' });
        saveUserConfig({ lang: body.lang });
        return json(res, 200, { ok: true, lang: body.lang });
      }
      if (p === '/api/remote' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}');
        if (body.on) startTunnel(); else stopTunnel(true);
        return json(res, 200, remoteState());
      }
      if (p === '/api/agent') return json(res, 200, agentStatus());
      if (p === '/api/stream') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(`retry: 1500\nevent: hello\ndata: ${JSON.stringify({ agent: agentStatus(), ui: uiVersion() })}\n\n`);
        clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 20000);
        req.on('close', () => { clearInterval(ping); clients.delete(res); });
        return;
      }
      if (p === '/api/decision' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const id = body.round;
        if (!id || !SAFE.test(id) || !fs.existsSync(path.join(ROUNDS, id))) return json(res, 400, { error: 'bad round' });
        const out = receiveDecision(id, body);
        broadcast('decision', { round: id });
        return json(res, 200, out);
      }
      if (p === '/api/decision/cancel' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        const out = cancelDecision(String(body.id || ''));
        broadcast('decision', { round: out.round || null });
        return json(res, out.ok ? 200 : 409, out);
      }
      if ((p === '/api/ref' || p === '/api/shot') && req.method === 'POST') {
        const id = u.searchParams.get('round') || '';
        if (!SAFE.test(id) || !fs.existsSync(path.join(ROUNDS, id))) return json(res, 400, { error: 'bad round' });
        const body = JSON.parse(await readBody(req, 16e6));
        const rel = saveImage(id, p === '/api/ref' ? '_refs' : '_shots', body.name || (p === '/api/ref' ? 'reference' : 'shot'), body.data);
        if (!rel) return json(res, 415, { error: 'unsupported image' });
        return json(res, 200, { ok: true, path: rel, url: `/r/${id}/${rel}` });
      }
      if (p === '/api/vote' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req, 4e6));
        const list = Array.isArray(body.votes) ? body.votes : [body];
        const votes = readJSON(VOTES, {});
        let n = 0;
        for (const v of list) {
          const voter = String(v.voter || '').trim().slice(0, 40);
          if (!voter || !SAFE.test(String(v.round || '')) || !String(v.variant || '').match(/^[\w.-]+$/)) continue;
          const slot = ((votes[v.round] ||= {})[v.variant] ||= {});
          if (v.vote == null && !v.comment) { delete slot[voter]; n++; continue; }
          slot[voter] = { vote: ['up', 'down'].includes(v.vote) ? v.vote : null, comment: String(v.comment || '').slice(0, 2000), at: now() };
          n++;
        }
        writeJSON(VOTES, votes);
        broadcast('change', { at: Date.now() });
        return json(res, 200, { ok: true, saved: n });
      }
      if (p === '/api/brand' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req, 50000));
        writeJSON(BRAND, { enabled: body.enabled !== false, colors: body.colors || {}, fonts: body.fonts || {}, updated: now() });
        return json(res, 200, { ok: true });
      }
      if (p.startsWith('/x/')) {
        const [, , roundId, file] = p.split('/');
        if (!SAFE.test(roundId || '') || !/^[\w.-]+\.html?$/i.test(file || '') || !fs.existsSync(path.join(ROUNDS, roundId, file))) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${roundId}-${file}"` });
        return res.end(renderVariant(roundId, file, { inline: true, bare: true }));
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
      json(res, 500, { error: String(e && e.message) });
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

  const url = `http://${urlHost}:${port}/?k=${key}`;
  // teammates never get the owner key: their links carry the guest key (view + vote only)
  function teamUrl() { return host === '0.0.0.0' && lan ? `http://${lan}:${port}/?g=${guestKey}&team=1` : null; }
  let tunnel = { state: 'off' }, tunnelProc = null;
  function remoteState() {
    const cfg = userConfig().remote || {};
    return { ...tunnel, ...(tunnel.url ? { guest_url: `${tunnel.url}/?g=${guestKey}&team=1` } : {}), enabled: cfg.enabled !== false, available: !!findCloudflared() };
  }
  const saveInfo = () => { const cur = readJSON(INFO) || {}; writeJSON(INFO, { ...cur, guest_key: guestKey, team_url: teamUrl(), remote_url: tunnel.url ? remoteState().guest_url : null }); };
  function setTunnel(t) { tunnel = t; saveInfo(); broadcast('change', { at: Date.now() }); }
  function startTunnel() {
    if (tunnelProc) return;
    if (userConfig().remote?.enabled === false) return setTunnel({ state: 'disabled' });
    const bin = findCloudflared();
    if (!bin) return setTunnel({ state: 'missing' });
    setTunnel({ state: 'starting', since: now() });
    const proc = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    tunnelProc = proc;
    let log = '';
    const onData = (b) => {
      log = (log + b.toString()).slice(-4000);
      const m = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !found && tunnelProc === proc) { found = true; clearTimeout(timer); ready(m[0]); }
    };
    // cloudflared prints the URL a few seconds before the hostname resolves. Report "on" only once the link answers
    // (looked up on public DNS), so nobody opens it too early and gets a cached "not found" from their resolver.
    let found = false;
    const ready = async (u) => {
      const host = new URL(u).hostname, resolver = new dns.promises.Resolver({ timeout: 3000, tries: 1 });
      resolver.setServers(['1.1.1.1', '8.8.8.8']);
      const probe = (ip) => new Promise((ok) => {
        const r = https.get({ host: ip, servername: host, headers: { host }, path: `/api/health?g=${guestKey}`, timeout: 4000 }, (res) => { res.resume(); ok(res.statusCode === 200); });
        r.on('error', () => ok(false)); r.on('timeout', () => { r.destroy(); ok(false); });
      });
      for (let i = 0; i < 20 && tunnelProc === proc; i++) {
        const ip = (await resolver.resolve4(host).catch(() => []))[0];
        if (ip && await probe(ip)) break;
        await sleep(1500);
      }
      if (tunnelProc === proc && tunnel.state === 'starting') setTunnel({ state: 'on', url: u, since: now() });
    };
    proc.stdout.on('data', onData); proc.stderr.on('data', onData);
    const timer = setTimeout(() => { if (tunnelProc === proc && tunnel.state === 'starting') { proc.kill(); } }, 45000);
    proc.on('exit', () => {
      clearTimeout(timer);
      if (tunnelProc !== proc) return;
      tunnelProc = null;
      if (tunnel.state === 'stopping') return setTunnel({ state: 'off' });
      const last = log.trim().split('\n').filter((l) => /ERR|error|failed/i.test(l)).slice(-2).join(' ').slice(0, 300);
      setTunnel({ state: 'error', error: last || 'cloudflared exited' });
    });
    proc.on('error', (e) => { if (tunnelProc === proc) { tunnelProc = null; setTunnel({ state: 'error', error: String(e.message) }); } });
  }
  function stopTunnel(rotate) {
    if (tunnelProc) { tunnel = { state: 'stopping' }; try { tunnelProc.kill(); } catch {} }
    else tunnel = { state: 'off' };
    // closing the share also invalidates every guest link handed out so far
    if (rotate) guestKey = crypto.randomBytes(12).toString('hex');
    saveInfo(); broadcast('change', { at: Date.now() });
  }
  const info = { type: 'server-started', version: VERSION, pid: process.pid, port, key, guest_key: guestKey, host, project: PROJECT, url, ...(teamUrl() ? { team_url: teamUrl() } : {}), rounds_dir: ROUNDS, state_dir: STATE, started: now() };
  writeJSON(INFO, info);
  if (args.remote) startTunnel();
  try { fs.rmSync(path.join(STATE, 'stopped'), { force: true }); } catch {}
  if (args.foreground) print(info);

  let last = snapshot();
  let lastAgent = JSON.stringify(agentStatus());
  const watcher = setInterval(() => {
    const s = snapshot();
    if (s !== last) { last = s; broadcast('change', { at: Date.now() }); }
    const a = agentStatus(); const as = JSON.stringify(a);
    if (as !== lastAgent) { lastAgent = as; broadcast('agent', a); }
    if (clients.size === 0 && Date.now() - lastActivity > idleMin * 60000) shutdown('idle');
  }, 600);

  function shutdown(reason) {
    clearInterval(watcher);
    if (tunnelProc) { try { tunnelProc.kill(); } catch {} }
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

// ---------- decisions ----------
function filesFor(round, selected) {
  const files = {};
  for (const v of round.variants) if (v.file) files[v.id] = path.join(ROUNDS, round.id, v.file);
  // cross-round picks (shortlist, before/after) use "round/variant" keys
  for (const key of selected || []) {
    const [rid, vid] = String(key).split('/');
    if (!vid || !SAFE.test(rid)) continue;
    const other = loadRound(rid);
    const v = other && other.variants.find((x) => x.id === vid);
    if (v && v.file) files[key] = path.join(ROUNDS, rid, v.file);
  }
  return files;
}
const absIn = (id, list, dir) => (list || []).filter((r) => new RegExp(`^${dir}\\/[\\w.-]+$`).test(r)).map((r) => path.join(ROUNDS, id, r));

function receiveDecision(id, body) {
  const round = loadRound(id);
  const rf = path.join(ROUNDS, id, 'decision.json');
  const prevRaw = readJSON(rf);
  const prevApproved = prevRaw && (prevRaw.approved || (prevRaw.action === 'choose' ? { variant: prevRaw.selected?.[0], at: prevRaw.at } : null));

  // Revoking an approval the agent has not read yet simply cancels it.
  if (body.action === 'unapprove') {
    const held = pendingEntries(id).find((e) => e.d.action === 'choose');
    if (held) return cancelDecision(held.d.id);
  }

  let approved;
  if (body.action === 'choose') approved = { variant: body.selected?.[0], at: now() };
  else if (body.action === 'unapprove') approved = undefined;
  else approved = prevApproved || undefined;

  const references = absIn(id, body.references, '_refs');
  const screenshots = {};
  for (const [k, rel] of Object.entries(body.screenshots || {})) { const a = absIn(id, [rel], '_shots')[0]; if (a) screenshots[k] = a; }
  const revoked = body.action === 'unapprove' ? { variant: prevApproved?.variant || body.selected?.[0] || null, at: now() } : undefined;
  const decision = {
    ...body,
    references: references.length ? references : undefined,
    screenshots: Object.keys(screenshots).length ? screenshots : undefined,
    ...(approved ? { approved } : {}),
    ...(revoked ? { revoked } : {}),
    id: crypto.randomBytes(6).toString('hex'),
    at: now(),
    consumed: false,
    ...(body.action === 'choose' && !body.no_hold ? { hold_until: new Date(Date.now() + HOLD_MS).toISOString() } : {}),
    files: filesFor(round, body.selected),
    round_dir: path.join(ROUNDS, id),
  };
  delete decision.no_hold;
  writeJSON(rf, { ...decision, _prev: prevRaw ? publicDecision(prevRaw) : null });
  enqueue(decision);
  fs.appendFileSync(EVENTS, JSON.stringify({ type: 'decision', id: decision.id, round: id, action: body.action, selected: body.selected, at: decision.at }) + '\n');
  return { ok: true, id: decision.id, hold_until: decision.hold_until || null };
}

function cancelDecision(did) {
  const e = inboxEntries().find((x) => x.d.id === did);
  if (!e) return { ok: false, error: 'not found' };
  if (e.d.consumed) return { ok: false, error: 'already received by the agent', round: e.d.round };
  e.d.cancelled = true; e.d.cancelled_at = now();
  writeJSON(e.file, e.d);
  const rf = path.join(ROUNDS, e.d.round, 'decision.json');
  const rd = readJSON(rf);
  if (rd && rd.id === did) { if (rd._prev) writeJSON(rf, rd._prev); else fs.rmSync(rf, { force: true }); }
  fs.appendFileSync(EVENTS, JSON.stringify({ type: 'cancel', id: did, round: e.d.round, at: now() }) + '\n');
  return { ok: true, cancelled: did, round: e.d.round };
}

function nextStep(d) {
  const sel = (d.selected || []).join(', ');
  const extras = [];
  const vs = Object.values(d.variants || {});
  if (vs.some((v) => v.tokens)) extras.push('Apply every `tokens` override (CSS custom property from -> to) — the user tuned them live.');
  if (d.knobs && Object.keys(d.knobs).length) extras.push('Apply the `knobs` values (round-wide token settings the user chose).');
  if (d.fonts) extras.push('Use the `fonts` the user picked for headings/body.');
  if (vs.some((v) => v.text_edits)) extras.push('Use the user\'s `text_edits` copy verbatim.');
  if (vs.some((v) => v.locked)) extras.push('Elements in `locked` must stay exactly as they are in the next version.');
  if (vs.some((v) => v.checklist && v.checklist.failed && v.checklist.failed.length)) extras.push('Fix every `checklist.failed` criterion.');
  if (vs.some((v) => v.audit)) extras.push('Fix the `audit` issues (contrast, touch targets, labels, overflow) in the next version.');
  if (d.references?.length) extras.push('Look at the reference images in `references` (read them as images) and match their direction.');
  if (d.screenshots) extras.push('`screenshots` show the variants exactly as the user saw them; open them if you need to check the rendering.');
  if (d.team_votes) extras.push('`team_votes` holds teammates\' votes and comments: weigh them, the user\'s own choice still wins.');
  if (d.ranking?.length) extras.push(`The user ranked the variants (best first): ${d.ranking.join(' > ')}.`);
  if ((d.selected || []).some((k) => k.includes('/'))) extras.push('Some selected variants come from other rounds: their paths are in `files`.');
  if (d.reuse) extras.push('The user reused variants that were discarded when this round was approved; keep the approved design untouched.');
  return base(d, sel) + (extras.length ? ' ' + extras.join(' ') : '');
}
function base(d, sel) {
  switch (d.action) {
    case 'choose': return `User approved variant ${sel}. Implement it in the real codebase (source: files.${d.selected?.[0]}). Apply any comments/annotations as final tweaks.`;
    case 'revise': return `User wants changes to ${sel}. Create a new round (--parent ${d.round}) with 2-3 refined versions of ${sel} that address every note and annotation.`;
    case 'remix': return `User wants to combine ${sel}. Read the per-variant comments to see what to keep from each, then create a new round (--parent ${d.round}) with 2-3 blends.`;
    case 'regenerate': return `User rejected all variants. Read the note and ratings, then create a new round (--parent ${d.round}) exploring clearly different directions.`;
    case 'more': return `User wants more variants in the direction of ${sel}. Create a new round (--parent ${d.round}) with 2-3 new variants that keep ${sel}'s idea and push it in different ways.`;
    case 'unapprove': return `User REVOKED the approval of ${d.revoked?.variant || sel} in round ${d.round}. Stop implementing it; if you already changed the codebase for it, tell the user what you changed and ask whether to revert. The round is open again: wait for the next decision.`;
    case 'export': return `User wants variant ${sel} as a ${d.framework || d.export?.framework || 'component'} component. Convert files.${d.selected?.[0]} using the project's conventions and write it to ${path.join(HOME, 'exports')}/ (create the folder), then tell the user the path. Do not touch the app code unless asked.`;
    default: return 'Read the note and act on it.';
  }
}

function formatDecision(e, rest) {
  const d = publicDecision(e.d);
  const errs = recentErrors(d.round);
  const out = { type: 'decision', ...d, next_step: nextStep(d), ...(errs.length ? { render_errors: errs } : {}) };
  const m = readJSON(path.join(ROUNDS, String(d.round || '').split('/')[0], 'round.json'), {}) || {};
  out.design_target = { kind: m.kind || 'component', viewports: m.viewports || (m.kind && m.kind !== 'component' ? ['laptop'] : ['auto']) };
  const seen = d.viewed_at?.viewport;
  if (seen && seen !== 'auto' && !out.design_target.viewports.includes(seen)) out.next_step += ` Note: the user looked at the variants at "${seen}" width, but the design target is ${out.design_target.viewports.join(', ')}. Keep designing for the target; only treat ${seen} as a responsive check unless the note asks to change the target.`;
  delete out.consumed; delete out.hold_until;
  if (rest.length) {
    out.also_pending = rest.map((x) => ({ id: x.d.id, round: x.d.round, action: x.d.action, selected: x.d.selected, note: x.d.note || '' }));
    out.next_step += ` ${rest.length} more decision${rest.length > 1 ? 's are' : ' is'} queued (see also_pending): read them before you start, a later one may refine this one, then run \`wait\` again to receive them in order.`;
  }
  return out;
}

async function waitLoop({ round, timeoutMs }) {
  const t0 = Date.now();
  const since = now();
  setAgent('waiting', { since, round: round || null });
  const beat = setInterval(() => setAgent('waiting', { since, round: round || null }), 2000);
  try {
    while (Date.now() - t0 < timeoutMs) {
      const pend = pendingEntries(round);
      const ready = pend.filter((e) => !e.d.hold_until || Date.parse(e.d.hold_until) <= Date.now());
      if (ready.length) {
        const e = ready[0];
        markConsumed(e);
        clearInterval(beat);
        setAgent('working', { round: e.d.round, decision: e.d.id });
        return formatDecision(e, ready.slice(1));
      }
      await sleep(600);
    }
  } finally { clearInterval(beat); }
  setAgent('waiting', { since, round: round || null, ended: now() });
  return null;
}

async function wait() {
  if (args.round && !fs.existsSync(path.join(ROUNDS, String(args.round)))) { print({ type: 'error', message: `round ${args.round} not found` }); process.exit(1); }
  const timeoutMs = Number(args.timeout || 110) * 1000;
  const d = await waitLoop({ round: args.round ? String(args.round) : null, timeoutMs });
  if (d) return print(d);
  print({ type: 'still-waiting', message: 'No decision yet: the user is still looking. Run this same command again right now. Do NOT end your turn and do not ask the user to reply in chat; stop waiting only if the user writes to you in chat.' });
  process.exit(2);
}

async function present() {
  ensureDirs();
  const id = args.round || latestRoundId();
  const r = id && loadRound(id);
  if (!r) { print({ type: 'error', message: 'no round to present: run `new` first' }); process.exit(1); }
  const missing = r.variants.filter((v) => !v.ready).map((v) => v.id);
  if (missing.length) { print({ type: 'error', message: `write these variants first: ${missing.map((m) => path.join(ROUNDS, id, m + '.html')).join(', ')}` }); process.exit(1); }
  let info = readJSON(INFO);
  if (!(info && pidAlive(info.pid) && await health(info))) {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'start', '--project', PROJECT], { stdio: 'ignore', windowsHide: true });
    await new Promise((res) => child.on('exit', res));
    info = readJSON(INFO);
  }
  const errs = recentErrors(id).filter((e) => Date.parse(e.at) > Date.now() - 10 * 60000);
  print({
    type: 'presented', round: id, studio_language: studioLang(), url: info?.url || null, question: r.question || r.title,
    variants: r.variants.map((v) => `${v.id.toUpperCase()} — ${v.label}`),
    ...(errs.length ? { render_errors: errs } : {}),
    tell_user: 'Give the user the url and one or two sentences on what they are comparing. This command keeps waiting for their decision.',
  });
  const timeoutMs = Number(args.timeout || 110) * 1000;
  const d = await waitLoop({ round: null, timeoutMs });
  if (d) return print(d);
  print({ type: 'still-waiting', message: 'No decision yet. Run `wait` (same --project) right now and keep running it until a decision arrives. Do NOT end your turn; stop only if the user writes to you in chat.' });
  process.exit(2);
}

function decision() {
  const id = args.round || latestRoundId();
  const pend = pendingEntries(args.round ? id : null);
  if (pend.length) {
    const e = pend[0];
    return print({ ...formatDecision(e, pend.slice(1)), note_for_agent: 'Not marked as received. Run `wait` to receive it.' });
  }
  const d = id && readJSON(path.join(ROUNDS, id, 'decision.json'));
  if (!d) return print({ type: 'no-decision', round: id });
  print({ type: 'decision', ...publicDecision(d), next_step: nextStep(d) });
}

function recentErrors(roundId) {
  if (!fs.existsSync(ERRORS)) return [];
  return fs.readFileSync(ERRORS, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e) => e && (!roundId || e.round === roundId)).slice(-20);
}

// ---------- other commands ----------
function openBrowser(url) {
  const plat = process.platform;
  const [bin, a] = plat === 'darwin' ? ['open', [url]] : plat === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : ['xdg-open', [url]];
  try { spawn(bin, a, { detached: true, stdio: 'ignore', windowsHide: true }).unref(); return true; } catch { return false; }
}

async function start() {
  ensureDirs();
  ensureGitignore();
  const info = readJSON(INFO);
  if (info && pidAlive(info.pid) && await health(info)) {
    if (args.open) openBrowser(info.url);
    if (args.remote) return share();
    return print({ ...info, type: 'server-already-running' });
  }
  if (args.foreground) return serve();
  const passthrough = ['project', 'port', 'host', 'url-host', 'idle'].flatMap((k) => (args[k] ? [`--${k}`, String(args[k])] : []));
  if (args.team) passthrough.push('--team');
  if (args.remote) passthrough.push('--remote');
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
  const pend = pendingEntries();
  print({
    running: alive, version: VERSION, url: alive ? info.url : null, ...(alive && info.team_url ? { team_url: info.team_url } : {}), ...(alive && info.remote_url ? { remote_url: info.remote_url } : {}), project: PROJECT, rounds_dir: ROUNDS,
    latest_round: r ? { id: r.id, title: r.title, variants: r.variants.map((v) => `${v.id}${v.ready ? '' : ' (missing)'}`), decision: r.decision ? { action: r.decision.action, selected: r.decision.selected, consumed: r.decision.consumed } : null } : null,
    pending_decisions: pend.length, ...langNote(),
    hint: alive ? (pend.length ? 'Decisions are waiting: run `wait` to receive them.' : undefined) : 'Run: node <skill>/scripts/studio.mjs start --project <dir> --open',
  });
}

function newRound() {
  ensureDirs();
  const slug = args._[1] || args.slug || 'round';
  const id = nextRoundId(slug);
  const dir = path.join(ROUNDS, id);
  fs.mkdirSync(dir, { recursive: true });
  const count = Number(args.count || 0);
  const parentManifest = args.parent ? readJSON(path.join(ROUNDS, String(args.parent), 'round.json'), {}) || {} : {};
  const group = args.group ? String(args.group) : parentManifest.group ? [parentManifest.group, parentManifest.subgroup].filter(Boolean).join(' / ') : '';
  const ids = args.variants ? String(args.variants).split(',').map((s) => s.trim()).filter(Boolean) : LETTERS.slice(0, count || 3);
  const manifest = {
    ...(group ? { group } : {}),
    title: args.title || slug.replace(/[-_]/g, ' '),
    question: args.question || '',
    // iterations keep the parent's kind and target viewports unless told otherwise: losing them made desktop rounds render as mobile (and vice versa)
    kind: args.kind || parentManifest.kind || 'component',
    ...(args.viewports ? { viewports: String(args.viewports).split(',').map((v) => v.trim()) } : parentManifest.viewports ? { viewports: parentManifest.viewports } : {}),
    ...(args.parent ? { parent: args.parent } : {}),
    head: args.head ? String(args.head).split(',') : [],
    variants: ids.map((v) => ({ id: v, label: prettyId(v), notes: '' })),
    created: now(),
  };
  writeJSON(path.join(dir, 'round.json'), manifest);
  setAgent('working', { round: id });
  print({ type: 'round-created', id, dir, group: group || null, ...(() => { const w = []; if (!group) w.push('No --group given: the round will appear under "Ungrouped". Run `groups` and pass --group "Area / Item".'); if (manifest.kind !== 'component' && !manifest.viewports) w.push(`No --viewports for a ${manifest.kind}: it will be shown at laptop width (1280). Pass --viewports with the target the user asked for (e.g. laptop, or mobile, or laptop,mobile) and design for that target.`); return w.length ? { warning: w.join(' ') } : {}; })(), manifest: path.join(dir, 'round.json'), ...langNote(), write_variants_to: ids.map((v) => path.join(dir, `${v}.html`)), then: 'Write every variant file, fill label/notes in round.json, then run `present`.' });
}

function list() {
  print(listRounds().map(loadRound).map((r) => ({ id: r.id, group: [r.group, r.subgroup].filter(Boolean).join(' / ') || null, title: r.title, kind: r.kind, parent: r.parent, variants: r.variants.length, decision: r.decision ? `${r.decision.action}:${(r.decision.selected || []).join('+')}` : null, approved: r.decision?.approved?.variant || null })));
}
function groups() {
  const tree = {};
  for (const r of listRounds().map(loadRound)) {
    const g = r.group || '(ungrouped)';
    tree[g] ||= {};
    const sg = r.subgroup || '(none)';
    (tree[g][sg] ||= []).push(r.id);
  }
  print({ type: 'groups', hint: 'Reuse these names exactly with --group "Group / Subgroup".', groups: tree });
}
function inbox() {
  print({ type: 'inbox', pending: pendingEntries().map((e) => ({ id: e.d.id, round: e.d.round, action: e.d.action, selected: e.d.selected, note: e.d.note || '', at: e.d.at, held_until: e.d.hold_until || null })) });
}

// Static, server-less gallery (fallback for sandboxes that can't keep a server alive, or to share with a team)
function build() {
  const out = path.resolve(args.out || path.join(HOME, 'gallery.html'));
  const rounds = (args.round ? [args.round] : listRounds()).map(loadRound).filter(Boolean).map((r) => ({
    ...r,
    variants: r.variants.map((v) => ({ ...v, html: v.file && v.ready ? renderVariant(r.id, v.file, { inline: true }) : null })),
  }));
  const app = fs.readFileSync(path.join(UI, 'app.html'), 'utf8');
  const data = JSON.stringify({ version: VERSION, project: path.basename(PROJECT), team: !!args.team, rounds, votes: readJSON(VOTES, {}), brand: readJSON(BRAND, null) }).replace(/</g, '\\u003c');
  // inline the studio's own CSS and scripts so the file works from file:// with no server
  const ui = (f) => fs.readFileSync(path.join(UI, f), 'utf8');
  const safeScript = (js) => js.replace(/<\/script/gi, '<\\/script');
  const html = app
    .replace(/<link rel="stylesheet" href="\/_ui\/([\w./-]+\.css)">/g, (m, f) => `<style>\n${ui(f)}\n</style>`)
    .replace(/<script src="\/_ui\/([\w./-]+\.js)"><\/script>/g, (m, f) => `<script>\n${safeScript(ui(f))}\n</script>`)
    .replace('<!--VS_STATIC-->', () => `<script>window.__VS_STATIC__=${data};</script>`);
  fs.writeFileSync(out, html);
  print({ type: 'static-gallery', file: out, note: args.team
    ? 'Team gallery: send this file to teammates. They vote and comment, then download a votes file; the user imports it in the studio (Team > Import votes).'
    : 'Open this file in a browser. Decisions are copied to the clipboard as JSON for the user to paste back into chat.' });
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
  process.stdout.write(`Variant Studio ${VERSION}
  start     start (or reuse) the preview server        --project DIR --open --port N --host H --team --remote --foreground --idle MIN
  new       scaffold a round: new <slug> --group "Area / Item" --title T --question Q --kind component|section|page --viewports laptop,mobile --variants a,b,c --parent ID
  present   hand the latest round to the user and wait for the decision   --round ID --timeout SEC
  wait      wait for the next decision (exit 2 = still waiting: run it again)   --round ID --timeout SEC
  decision  print the next or latest decision without waiting   --round ID
  inbox     decisions queued for the agent
  status    server + latest round summary
  list      all rounds
  groups    existing groups/subgroups (reuse their names)
  errors    JS errors reported by variant previews     --round ID
  open      open the gallery in the default browser
  build     write a self-contained gallery.html        --out FILE --round ID --team
  demo      add a demo round (product card)
  share     share the studio outside your network (Cloudflare tunnel, guests can view and vote)   --stop
  stop      stop the server
`);
}

// share the running studio outside the local network through a Cloudflare quick tunnel (--stop to close it)
async function share() {
  const info = readJSON(INFO);
  if (!(info && pidAlive(info.pid) && await health(info))) { print({ type: 'error', message: 'the studio is not running: run `start` first (or `start --remote`)' }); process.exit(1); }
  const call = async (body) => (await fetch(`http://127.0.0.1:${info.port}/api/remote?k=${info.key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  if (args.stop) { await call({ on: false }); return print({ type: 'remote-stopped', note: 'Guest links no longer work.' }); }
  let st = await call({ on: true });
  for (let i = 0; i < 100 && st.state === 'starting'; i++) { await sleep(500); st = (await (await fetch(`http://127.0.0.1:${info.port}/api/state?k=${info.key}`)).json()).remote; }
  if (st.state === 'on') return print({ type: 'remote-on', guest_url: st.guest_url, tell_user: 'Send guest_url to teammates outside the network: they can view and vote, not decide. Stop with `share --stop`.' });
  const why = { missing: 'cloudflared is not installed. Re-run the Variant Studio installer and enable remote sharing, or install cloudflared (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).', disabled: 'Remote sharing is turned off in ~/.variant-studio/config.json (remote.enabled). Re-run the installer to enable it.' }[st.state];
  print({ type: 'error', state: st.state, message: why || st.error || 'the tunnel did not start' });
  process.exit(1);
}

const commands = {
  share, start, serve, stop, status, wait, present, decision, inbox, list, groups, build, demo, help,
  new: newRound,
  errors: () => print(recentErrors(args.round)),
  open: () => { const i = readJSON(INFO); if (!i) return print({ type: 'not-running' }); openBrowser(i.url); print({ type: 'opened', url: i.url }); },
};
if (!commands[cmd]) { help(); process.exit(1); }
await commands[cmd]();
