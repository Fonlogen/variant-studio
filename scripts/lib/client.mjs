// The CLI side of the shared server: find it through the registry, start it, register and stop sessions.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { readJSON, sleep, pidAlive } from './util.mjs';
import { ENTRY, REGISTRY, SERVER_LOG, USER_DIR } from './config.mjs';

export async function health(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    const j = await r.json();
    return j && j.app === 'variant-studio' ? j : null;
  } catch { return null; }
}
// the running server of this user, or null
export async function liveServer() {
  const reg = readJSON(REGISTRY);
  if (!reg || !reg.token || !pidAlive(reg.pid)) return null;
  const h = await health(reg.port);
  return h && h.pid === reg.pid ? reg : null;
}
export async function control(srv, name, body) {
  const r = await fetch(`http://127.0.0.1:${srv.port}/api/control/${name}`, {
    method: body ? 'POST' : 'GET', headers: { 'X-VS-Control': srv.token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `server answered ${r.status}`);
  return j;
}
export async function ensureServer(o = {}) {
  let srv = await liveServer();
  if (srv) return srv;
  fs.mkdirSync(USER_DIR, { recursive: true });
  const pass = ['port', 'host', 'url-host', 'idle'].flatMap((k) => (o[k] ? [`--${k}`, String(o[k])] : []));
  const out = fs.openSync(SERVER_LOG, 'a');
  const child = spawn(process.execPath, [ENTRY, 'serve', ...pass], { detached: true, stdio: ['ignore', out, out], windowsHide: true });
  child.unref();
  for (let i = 0; i < 80; i++) {
    await sleep(150);
    if ((srv = await liveServer())) return srv;
  }
  throw new Error(`the server did not start in time (log: ${SERVER_LOG})`);
}
// the project's session on the server (registered if needed); null when the server is not running
export async function findSession(P) {
  const srv = await liveServer();
  if (!srv) return null;
  const { sessions } = await control(srv, 'sessions').catch(() => ({ sessions: [] }));
  const s = sessions.find((x) => x.project === P.root);
  return s ? { ...s, server: srv } : null;
}
export async function ensureSession(P, o = {}) {
  const srv = await ensureServer(o);
  const s = await control(srv, 'session', { project: P.root });
  return { ...s, server: srv };
}
