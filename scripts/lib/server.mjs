// The shared server: one process for every project. Each project is a session reached at /<PIN>/ (owner) or /<guest PIN>/.
// Registry: ~/.variant-studio/server.json (pid, port, control token, sessions). Per-project state stays in <project>/.variant-studio/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJSON, writeJSON, print, now, pidAlive, lanAddress, MIME } from './util.mjs';
import { VERSION, UI, USER_DIR, REGISTRY, DEFAULT_PORT, HOSTNAME, LANG_NAMES, userConfig, saveUserConfig } from './config.mjs';
import { project, ensureDirs, agentStatus, sessionPins, rotateGuestPin, writeNotice, clearNotice, PIN_RE } from './project.mjs';
import { SAFE, listRounds, loadRound, pendingEntries, saveImage, snapshot } from './rounds.mjs';
import { receiveDecision, cancelDecision } from './decisions.mjs';
import { renderVariant } from './render.mjs';
import { renderPreview, wallpaperFile } from './shells.mjs';
import { exportVariant, EXPORT_AS } from './export.mjs';
import { zip } from './zip.mjs';
import { writeLogoSet, extractSvgs } from './logo.mjs';
import { settings, cleanSettings } from './generation.mjs';
import { createTunnel, findCloudflared } from './tunnel.mjs';
import { qrSvg } from './qr.mjs';
import { pinPage } from './pinpage.mjs';

const BLOCKED = /(^|[\\/])(\.env[^\\/]*|\.git|\.ssh|node_modules[\\/]\.cache|id_rsa[^\\/]*|.*\.pem|.*\.key)([\\/]|$)/i;
// servers started with another VARIANT_STUDIO_HOME are someone else's: never reuse them
export const HOME_ID = crypto.createHash('sha1').update(USER_DIR).digest('hex').slice(0, 12);

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
const html = (res, code, body, extra = {}) => { res.writeHead(code, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin', ...extra }); res.end(body); };
const redirect = (res, to, code = 302) => { res.writeHead(code, { Location: to, 'Cache-Control': 'no-store' }); res.end(); };
const viaTunnel = (req) => !!(req.headers['cf-connecting-ip'] || req.headers['cf-ray'] || /\.trycloudflare\.com(:\d+)?$/i.test(req.headers.host || ''));
// a request made on this computer, to a local name (not through the tunnel, not a rebound DNS name)
function isLocal(req) {
  const a = req.socket.remoteAddress || '';
  const host = String(req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return /^(127\.|::1$|::ffff:127\.)/.test(a) && !viaTunnel(req) && !req.headers['x-forwarded-for'] && (host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '::1');
}

// what a guest (teammate link, LAN or remote) may reach: view, vote, export. Never decisions, uploads or project sources.
const GUEST_P_ASSET = /\.(css|woff2?|ttf|otf|png|jpe?g|gif|webp|avif|svg|ico)$/i;
function guestAllowed(p, method) {
  if (method === 'GET' && (p === '/' || p === '/index.html' || p.startsWith('/_ui/') || p === '/_global.css' || p === '/api/state' || p === '/api/stream' || p === '/api/agent' || p.startsWith('/v/') || p.startsWith('/r/') || p.startsWith('/x/') || p === '/_wallpaper' || p === '/api/export')) return true;
  if (method === 'GET' && p.startsWith('/p/')) return GUEST_P_ASSET.test(p);
  if (method === 'POST' && (p === '/api/vote' || p === '/api/log')) return true;
  return false;
}

async function probe(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    const j = await r.json();
    return j && j.app === 'variant-studio' ? j : null;
  } catch { return null; }
}

export async function serve(o = {}) {
  const host = o.host || '0.0.0.0';
  const urlHost = o['url-host'] || HOSTNAME;
  const idleMin = Number(o.idle || 240);
  const token = crypto.randomBytes(16).toString('hex');
  const bootAt = Date.now();
  const sessions = new Map(), guests = new Map(); // owner PIN -> session, guest PIN -> session
  let port = 0, stopping = false, watcher = null, savedAt = 0;

  const find = (pin) => sessions.has(pin) ? [sessions.get(pin), 'owner'] : guests.has(pin) ? [guests.get(pin), 'guest'] : [null, null];
  const taken = (except) => new Set([...sessions.values()].filter((s) => s !== except).flatMap((s) => [s.pin, s.guest]));
  const broadcast = (s, event, data) => { for (const c of s.clients) c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  const lan = () => (host === '0.0.0.0' ? lanAddress() : null);
  const urlsFor = (s, pin) => {
    const t = tunnel.state();
    return { local: `http://${urlHost}:${port}/${pin}`, lan: lan() ? `http://${lan()}:${port}/${pin}` : null, tunnel: s.remote && t.url ? `${t.url}/${pin}` : null };
  };
  const lastActivity = (s) => Math.max(s.lastActivity, readJSON(s.P.agent)?.beat || 0);
  const brief = (s) => ({ project: s.P.root, name: s.P.name, pin: s.pin, guest_pin: s.guest, agent: agentStatus(s.P).state, last_activity: lastActivity(s), started: s.started, remote: s.remote });
  function info(s) {
    const u = urlsFor(s, s.pin), g = urlsFor(s, s.guest);
    return {
      version: VERSION, pid: process.pid, port, host, project: s.P.root, pin: s.pin, guest_pin: s.guest,
      url: u.local, lan_url: u.lan, loopback_url: `http://127.0.0.1:${port}/${s.pin}`,
      // teammates never get the owner PIN: their links carry the guest PIN (view + vote only)
      team_url: g.lan, remote_url: g.tunnel,
      rounds_dir: s.P.rounds, state_dir: s.P.state, started: s.started,
    };
  }
  const saveInfo = (s) => { try { writeJSON(s.P.info, { type: 'server-started', ...info(s) }); } catch {} };
  function saveRegistry() {
    if (stopping) return;
    writeJSON(REGISTRY, { app: 'variant-studio', version: VERSION, pid: process.pid, port, host, home: HOME_ID, token, started: new Date(bootAt).toISOString(), sessions: [...sessions.values()].map(brief) }, 0o600);
  }

  const tunnel = createTunnel(() => port, () => { for (const s of sessions.values()) if (s.remote) { saveInfo(s); broadcast(s, 'change', { at: Date.now() }); } });
  function remoteState(s) {
    const cfg = userConfig().remote || {}, t = s.remote ? tunnel.state() : { state: 'off' };
    return { ...t, ...(t.url ? { owner_url: `${t.url}/${s.pin}`, guest_url: `${t.url}/${s.guest}` } : {}), enabled: cfg.enabled !== false, available: !!findCloudflared() };
  }
  function setRemote(s, on) {
    if (on) { s.remote = true; tunnel.start(); }
    else {
      s.remote = false;
      // closing the share also invalidates every guest link handed out so far
      guests.delete(s.guest); s.guest = rotateGuestPin(s.P, taken(s)); guests.set(s.guest, s);
      if (![...sessions.values()].some((x) => x.remote)) tunnel.stop();
    }
    saveInfo(s); saveRegistry(); broadcast(s, 'change', { at: Date.now() });
  }

  function register(dir) {
    const P = project(dir);
    const had = [...sessions.values()].find((x) => x.P.root === P.root);
    if (had) return { s: had, existed: true };
    ensureDirs(P);
    const pins = sessionPins(P, taken());
    const s = { P, pin: pins.pin, guest: pins.guest_pin, clients: new Set(), lastActivity: Date.now(), remote: false, started: now(), snap: snapshot(P), agentSig: JSON.stringify(agentStatus(P)) };
    sessions.set(s.pin, s); guests.set(s.guest, s);
    clearNotice(P);
    try { fs.rmSync(path.join(P.state, 'stopped'), { force: true }); } catch {}
    saveInfo(s); saveRegistry();
    return { s, existed: false };
  }
  // notice = { by, reason, sessions }: tells the session's gallery and its waiting agent who stopped it
  function detach(s, reason, notice) {
    if (!sessions.has(s.pin)) return;
    sessions.delete(s.pin); guests.delete(s.guest);
    if (notice) {
      const n = { type: 'server-stopping', reason, by: notice.by || null, at: now() };
      writeNotice(s.P, { ...n, by_project: notice.by_project || null, sessions: notice.sessions });
      broadcast(s, 'server-stopping', n); // guests read this too: no paths, no PINs
    }
    for (const c of s.clients) c.end();
    if (s.remote && ![...sessions.values()].some((x) => x.remote)) tunnel.stop();
    try { fs.writeFileSync(path.join(s.P.state, 'stopped'), JSON.stringify({ reason, at: now() })); } catch {}
    const cur = readJSON(s.P.info);
    if (cur && cur.pid === process.pid) { cur.stopped = now(); cur.pid = null; try { writeJSON(s.P.info, cur); } catch {} }
    saveRegistry();
    if (!sessions.size && !stopping) shutdown('no-sessions');
  }
  function shutdown(reason, by = {}, except = null) {
    if (stopping) return;
    stopping = true;
    const list = [...sessions.values()].map((s) => ({ name: s.P.name, project: s.P.root }));
    for (const s of [...sessions.values()]) detach(s, reason, s === except ? null : { ...by, sessions: list });
    clearInterval(watcher);
    if (tunnel.running()) tunnel.stop();
    if (readJSON(REGISTRY)?.pid === process.pid) try { fs.rmSync(REGISTRY, { force: true }); } catch {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  }

  function stateFor(s, role) {
    const P = s.P;
    const st = {
      version: VERSION,
      project: P.name,
      rounds: listRounds(P).map((id) => loadRound(P, id)).filter(Boolean),
      agent: agentStatus(P),
      pending: pendingEntries(P).map((e) => ({ id: e.d.id, round: e.d.round, action: e.d.action, selected: e.d.selected, at: e.d.at, hold_until: e.d.hold_until || null })),
      votes: readJSON(P.votes, {}),
    };
    if (role === 'guest') return { ...st, role: 'guest' };
    return { ...st, role: 'owner', brand: readJSON(P.brand, null), team_url: urlsFor(s, s.guest).lan, remote: remoteState(s), lang: userConfig().lang || null, settings: settings(P) };
  }
  function share(s) {
    const t = '{url}?round={round}&v={variant}&focus=1';
    return { pin: s.pin, guest_pin: s.guest, urls: urlsFor(s, s.pin), guest_urls: urlsFor(s, s.guest), variant_url_template: t, remote: remoteState(s) };
  }

  // ---------- control API: the CLI on this computer, with the token from the registry ----------
  async function control(req, res, name) {
    if (!isLocal(req) || req.headers['x-vs-control'] !== token) return json(res, 403, { error: 'forbidden' });
    const body = req.method === 'POST' ? JSON.parse((await readBody(req)) || '{}') : {};
    if (name === 'sessions') return json(res, 200, { sessions: [...sessions.values()].map((s) => ({ ...brief(s), ...info(s) })) });
    if (name === 'session') {
      if (!body.project || !path.isAbsolute(body.project)) return json(res, 400, { error: 'project must be an absolute path' });
      const { s, existed } = register(body.project);
      return json(res, 200, { existed, ...info(s) });
    }
    if (name === 'stop') {
      const s = [...sessions.values()].find((x) => x.P.root === path.resolve(String(body.project || '')));
      if (!s) return json(res, 404, { error: 'no session for this project' });
      const remaining = sessions.size - 1;
      json(res, 200, { stopped: s.pin, project: s.P.root, remaining, server: remaining ? 'running' : 'stopped' });
      return setImmediate(() => detach(s, 'stopped'));
    }
    if (name === 'stop-all') {
      const list = [...sessions.values()].map(brief);
      const me = [...sessions.values()].find((x) => x.P.root === path.resolve(String(body.project || '')));
      json(res, 200, { stopped: list });
      return setImmediate(() => shutdown('stop-all', { by: String(body.by || (me ? me.P.name : 'another agent')).slice(0, 80), by_project: body.project || null }, me));
    }
    return json(res, 404, { error: 'unknown control call' });
  }

  // ---------- one session ----------
  async function route(s, role, pin, p, u, req, res) {
    const P = s.P;
    if (p === '/' || p === '/index.html') {
      const app = fs.readFileSync(path.join(UI, 'app.html'), 'utf8');
      const sid = crypto.createHash('sha1').update(P.root).digest('hex').slice(0, 10);
      const boot = `<script>window.__VS_ROLE__=${JSON.stringify(role)};window.__VS_PIN__=${JSON.stringify(pin)};window.__VS_SID__=${JSON.stringify(sid)};</script>`;
      return html(res, 200, app.replace('<!--VS_STATIC-->', boot), { 'Set-Cookie': `vs_pin=${pin}; Path=/; SameSite=Lax; HttpOnly` });
    }
    if (p === '/api/state') return json(res, 200, stateFor(s, role));
    if (p === '/api/share') return json(res, 200, share(s));
    if (p === '/api/prefs' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!LANG_NAMES[body.lang]) return json(res, 400, { error: 'unknown language' });
      saveUserConfig({ lang: body.lang });
      return json(res, 200, { ok: true, lang: body.lang });
    }
    if (p === '/api/settings' && req.method === 'POST') {
      const body = cleanSettings(JSON.parse((await readBody(req)) || '{}'));
      writeJSON(P.settings, { ...readJSON(P.settings, {}), ...body });
      broadcast(s, 'change', { at: Date.now() });
      return json(res, 200, { ok: true, settings: settings(P) });
    }
    if (p === '/api/remote' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      setRemote(s, !!body.on);
      return json(res, 200, remoteState(s));
    }
    if (p === '/api/agent') return json(res, 200, agentStatus(P));
    if (p === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`retry: 1500\nevent: hello\ndata: ${JSON.stringify({ agent: agentStatus(P), ui: uiVersion() })}\n\n`);
      s.clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); s.clients.delete(res); });
      return;
    }
    if (p === '/api/decision' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const id = body.round;
      if (!id || !SAFE.test(id) || !fs.existsSync(path.join(P.rounds, id))) return json(res, 400, { error: 'bad round' });
      const out = receiveDecision(P, id, body);
      broadcast(s, 'decision', { round: id });
      return json(res, 200, out);
    }
    if (p === '/api/decision/cancel' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const out = cancelDecision(P, String(body.id || ''));
      broadcast(s, 'decision', { round: out.round || null });
      return json(res, out.ok ? 200 : 409, out);
    }
    if ((p === '/api/ref' || p === '/api/shot') && req.method === 'POST') {
      const id = u.searchParams.get('round') || '';
      if (!SAFE.test(id) || !fs.existsSync(path.join(P.rounds, id))) return json(res, 400, { error: 'bad round' });
      const body = JSON.parse(await readBody(req, 16e6));
      const rel = saveImage(P, id, p === '/api/ref' ? '_refs' : '_shots', body.name || (p === '/api/ref' ? 'reference' : 'shot'), body.data);
      if (!rel) return json(res, 415, { error: 'unsupported image' });
      return json(res, 200, { ok: true, path: rel, url: `/${pin}/r/${id}/${rel}` });
    }
    if (p === '/api/vote' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req, 4e6));
      const list = Array.isArray(body.votes) ? body.votes : [body];
      const votes = readJSON(P.votes, {});
      let n = 0;
      for (const v of list) {
        const voter = String(v.voter || '').trim().slice(0, 40);
        if (!voter || !SAFE.test(String(v.round || '')) || !String(v.variant || '').match(/^[\w.-]+$/)) continue;
        const slot = ((votes[v.round] ||= {})[v.variant] ||= {});
        if (v.vote == null && !v.comment) { delete slot[voter]; n++; continue; }
        slot[voter] = { vote: ['up', 'down'].includes(v.vote) ? v.vote : null, comment: String(v.comment || '').slice(0, 2000), at: now() };
        n++;
      }
      writeJSON(P.votes, votes);
      broadcast(s, 'change', { at: Date.now() });
      return json(res, 200, { ok: true, saved: n });
    }
    if (p === '/api/brand' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req, 50000));
      writeJSON(P.brand, { enabled: body.enabled !== false, colors: body.colors || {}, fonts: body.fonts || {}, updated: now() });
      return json(res, 200, { ok: true });
    }
    if (p.startsWith('/x/')) {
      const [, , roundId, file] = p.split('/');
      if (!SAFE.test(roundId || '') || !/^[\w.-]+\.html?$/i.test(file || '') || !fs.existsSync(path.join(P.rounds, roundId, file))) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${roundId}-${file}"` });
      return res.end(renderVariant(P, roundId, file, { inline: true, bare: true }));
    }
    if (p === '/api/log' && req.method === 'POST') {
      const body = await readBody(req, 20000);
      fs.appendFileSync(P.errors, JSON.stringify({ at: now(), ...JSON.parse(body) }) + '\n');
      res.writeHead(204); return res.end();
    }
    if (p.startsWith('/_ui/')) {
      const f = safeJoin(UI, p.slice(5)); if (!f) { res.writeHead(403); return res.end(); }
      return sendFile(res, f);
    }
    if (p === '/_global.css') return sendFile(res, path.join(P.home, 'global.css'));
    if (p === '/_wallpaper') return sendFile(res, wallpaperFile(P));
    // one variant as a download: single .html, or a .zip for split / shared
    if (p === '/api/export') {
      const roundId = u.searchParams.get('round') || '', vid = u.searchParams.get('variant') || '', as = u.searchParams.get('as') || 'single';
      if (!SAFE.test(roundId) || !/^[\w.-]+$/.test(vid) || !EXPORT_AS.includes(as)) return json(res, 400, { error: 'bad export request' });
      const out = await exportVariant(P, roundId, vid, as);
      const one = as === 'single';
      const body = one ? Buffer.from(out.files[out.name]) : zip(out.files);
      res.writeHead(200, { 'Content-Type': one ? MIME['.html'] : 'application/zip', 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${out.name}${one ? '' : '.zip'}"` });
      return res.end(body);
    }
    // logo set rasterized in the browser (no headless Chrome on this machine): PNG data URLs -> files + favicon.ico
    if (p === '/api/logo-set' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req, 40e6));
      const roundId = String(body.round || ''), vid = String(body.variant || '');
      const src = SAFE.test(roundId) && /^[\w.-]+$/.test(vid) && path.join(P.rounds, roundId, vid + '.html');
      if (!src || !fs.existsSync(src)) return json(res, 400, { error: 'bad round or variant' });
      const pngs = {};
      for (const [name, d] of Object.entries(body.files || {})) { const m = /^data:image\/png;base64,(.+)$/.exec(String(d)); if (m && /^[\w.-]+\.png$/.test(name)) pngs[name] = Buffer.from(m[1], 'base64'); }
      const dir = path.join(P.home, 'exports', `logo-${roundId}-${vid}`);
      const files = writeLogoSet(dir, { ...extractSvgs(fs.readFileSync(src, 'utf8')), pngs });
      return json(res, 200, { ok: true, dir, files: files.map((f) => path.basename(f)) });
    }
    if (p.startsWith('/v/')) {
      const [, , roundId, file] = p.split('/');
      if (!SAFE.test(roundId || '') || !/^[\w.-]+\.html?$/i.test(file || '')) { res.writeHead(400); return res.end(); }
      if (!fs.existsSync(path.join(P.rounds, roundId, file))) return html(res, 404, '<!doctype html><body style="font:14px system-ui;color:#888;display:grid;place-items:center;height:90vh">Not generated yet…</body>');
      return html(res, 200, renderPreview(P, roundId, file, { prefix: '/' + pin, raw: u.searchParams.get('raw') === '1' }));
    }
    if (p.startsWith('/r/')) {
      const rest = p.slice(3);
      const roundId = rest.split('/')[0];
      if (!SAFE.test(roundId)) { res.writeHead(400); return res.end(); }
      const f = safeJoin(path.join(P.rounds, roundId), rest.slice(roundId.length + 1));
      if (!f) { res.writeHead(403); return res.end(); }
      return sendFile(res, f);
    }
    if (p.startsWith('/p/')) {
      const f = safeJoin(P.root, p.slice(3));
      if (!f || BLOCKED.test(path.relative(P.root, f))) { res.writeHead(403); return res.end('blocked'); }
      return sendFile(res, f);
    }
    res.writeHead(404); res.end('not found');
  }

  // Which session a request belongs to: /<PIN>/… first; absolute paths used by the gallery and by variants
  // (/api/…, /v/…, /p/…) carry the session in the Referer, and as a last resort in the vs_pin cookie.
  const known = (pin) => (pin && PIN_RE.test(pin) && find(pin)[0] ? pin : null);
  function implicitPin(req) {
    try {
      const ref = new URL(req.headers.referer || '');
      if (ref.host === req.headers.host) { const pin = known(ref.pathname.split('/')[1]); if (pin) return pin; }
    } catch {}
    return known(String(req.headers.cookie || '').match(/(?:^|;\s*)vs_pin=([A-Z0-9]{5})/)?.[1]);
  }
  const sessionsHere = (req) => (isLocal(req) ? [...sessions.values()].map(brief) : null);

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    try {
      if (p === '/api/health') return json(res, 200, { ok: true, app: 'variant-studio', version: VERSION, pid: process.pid, port, home: HOME_ID });
      if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
      // tool assets are public so pages on other origins (e.g. a dev server) can include frame.js
      if (/^\/_ui\/(frame\.js|base\.css)$/.test(p)) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(p)], 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
        return res.end(fs.readFileSync(path.join(UI, path.basename(p))));
      }
      if (p.startsWith('/_ui/')) { const f = safeJoin(UI, p.slice(5)); if (!f) { res.writeHead(403); return res.end(); } return sendFile(res, f); }
      if (p === '/api/qr') {
        const text = String(u.searchParams.get('text') || '').slice(0, 2000);
        if (!text) return json(res, 400, { error: 'text is required' });
        res.writeHead(200, { 'Content-Type': MIME['.svg'], 'Cache-Control': 'no-store' });
        return res.end(qrSvg(text, { cell: Math.min(16, Math.max(1, Number(u.searchParams.get('cell')) || 4)), margin: Math.min(16, Math.max(0, Number(u.searchParams.get('margin') ?? 4))) }));
      }
      if (p.startsWith('/api/control/')) return await control(req, res, p.slice(13));

      const seg = p.split('/')[1] || '';
      let pin = PIN_RE.test(seg.toUpperCase()) ? seg.toUpperCase() : null, rest;
      if (pin) {
        if (!find(pin)[0]) return html(res, 404, pinPage({ error: `No active session with PIN ${pin}. The agent may have stopped it: ask it to run \`start\` again.`, pin, sessions: sessionsHere(req) }));
        if (seg !== pin || p === '/' + seg) return redirect(res, `/${pin}${p.slice(seg.length + 1) || '/'}${u.search}`);
        rest = p.slice(pin.length + 1);
      } else if (p === '/' || p === '/index.html') {
        const q = String(u.searchParams.get('pin') || '').trim().toUpperCase();
        if (!q) return html(res, 200, pinPage({ sessions: sessionsHere(req) }));
        if (!known(q)) return html(res, 404, pinPage({ error: `No active session with PIN ${q}.`, pin: q, sessions: sessionsHere(req) }));
        u.searchParams.delete('pin');
        return redirect(res, `/${q}/${u.search}`);
      } else {
        pin = implicitPin(req);
        if (!pin) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(`Variant Studio ${VERSION}: open the studio from its link (http://${urlHost}:${port}/<PIN>).`); }
        // pages and assets move under /<PIN>/ so whatever they load next stays in the same session
        if (req.method === 'GET' && !p.startsWith('/api/')) return redirect(res, `/${pin}${p}${u.search}`, 307);
        rest = p;
      }
      const [s, role] = find(pin);
      if (viaTunnel(req) && !s.remote) return html(res, 404, pinPage({ error: 'This session is not shared outside the local network.' }));
      if (role === 'guest' && !guestAllowed(rest, req.method)) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not available to guests.'); }
      s.lastActivity = Date.now();
      return await route(s, role, pin, rest, u, req, res);
    } catch (e) {
      json(res, 500, { error: String(e && e.message) });
    }
  });

  // fixed port 8065, then 8066, 8067…; a Variant Studio server already there (same user folder) is reused
  const tryListen = (p) => new Promise((resolve, reject) => {
    const fail = (e) => { server.off('listening', ok); reject(e); };
    const ok = () => { server.off('error', fail); resolve(server.address().port); };
    server.once('error', fail); server.once('listening', ok);
    server.listen(p, host);
  });
  const first = Number(o.port || DEFAULT_PORT);
  for (let p = first; p < first + 20 && !port; p++) {
    const other = await probe(p);
    if (other) {
      if (other.home !== HOME_ID) continue;
      if (o.project) { const reg = readJSON(REGISTRY); if (reg?.pid === other.pid) await fetch(`http://127.0.0.1:${p}/api/control/session`, { method: 'POST', headers: { 'X-VS-Control': reg.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ project: path.resolve(o.project) }) }).catch(() => {}); }
      if (o.foreground) print({ type: 'server-already-running', port: p, pid: other.pid });
      return process.exit(0);
    }
    try { await tryListen(p); } catch { continue; }
    // another program may hold the same port on a single address: make sure 127.0.0.1 reaches us
    const me = await probe(p);
    if (me && me.pid === process.pid) port = p;
    else await new Promise((r) => server.close(r));
  }
  if (!port) { print({ type: 'error', message: `no free port between ${first} and ${first + 19}` }); process.exit(1); }
  saveRegistry();

  watcher = setInterval(() => {
    for (const s of [...sessions.values()]) {
      const snap = snapshot(s.P);
      if (snap !== s.snap) { s.snap = snap; broadcast(s, 'change', { at: Date.now() }); }
      const a = agentStatus(s.P), as = JSON.stringify(a);
      if (as !== s.agentSig) { s.agentSig = as; broadcast(s, 'agent', a); }
      if (s.clients.size === 0 && Date.now() - s.lastActivity > idleMin * 60000) detach(s, 'idle');
    }
    // nobody registered a project after a minute: nothing to serve
    if (!sessions.size && Date.now() - bootAt > 60000) shutdown('no-sessions');
    const reg = readJSON(REGISTRY);
    if (!reg || (reg.pid === process.pid ? Date.now() - savedAt > 30000 : !pidAlive(reg.pid))) { savedAt = Date.now(); saveRegistry(); }
  }, 600);

  if (o.project) { const { s } = register(path.resolve(o.project)); if (o.foreground) print({ type: 'server-started', ...info(s) }); }
  process.on('SIGINT', () => shutdown('signal'));
  process.on('SIGTERM', () => shutdown('signal'));
}
