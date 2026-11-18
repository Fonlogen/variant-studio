// Remote sharing through a Cloudflare quick tunnel. One tunnel serves the whole server; each session opts in.
// ~/.variant-studio/config.json is written by the installer: { "remote": { "enabled": true, "cloudflared": "/path/to/cloudflared" } }
import https from 'node:https';
import dns from 'node:dns';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { sleep, now } from './util.mjs';
import { USER_DIR, userConfig } from './config.mjs';

export function findCloudflared() {
  const exe = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const cfg = userConfig().remote?.cloudflared;
  const dirs = [...(process.env.PATH || '').split(path.delimiter), path.join(USER_DIR, 'bin'), '/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin'),
    ...(process.platform === 'win32' ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'cloudflared'), path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'cloudflared')] : [])];
  for (const c of [cfg, ...dirs.filter(Boolean).map((d) => path.join(d, exe))]) { try { if (c && fs.statSync(c).isFile()) return c; } catch {} }
  return null;
}

export function createTunnel(port, onChange) {
  let tunnel = { state: 'off' }, proc = null;
  const set = (t) => { tunnel = t; onChange(t); };
  function start() {
    if (proc) return;
    if (userConfig().remote?.enabled === false) return set({ state: 'disabled' });
    const bin = findCloudflared();
    if (!bin) return set({ state: 'missing' });
    set({ state: 'starting', since: now() });
    const me = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port()}`], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    proc = me;
    let log = '', found = false;
    // cloudflared prints the URL a few seconds before the hostname resolves. Report "on" only once the link answers
    // (looked up on public DNS), so nobody opens it too early and gets a cached "not found" from their resolver.
    const ready = async (u) => {
      const host = new URL(u).hostname, resolver = new dns.promises.Resolver({ timeout: 3000, tries: 1 });
      resolver.setServers(['1.1.1.1', '8.8.8.8']);
      const probe = (ip) => new Promise((ok) => {
        const r = https.get({ host: ip, servername: host, headers: { host }, path: '/api/health', timeout: 4000 }, (res) => { res.resume(); ok(res.statusCode === 200); });
        r.on('error', () => ok(false)); r.on('timeout', () => { r.destroy(); ok(false); });
      });
      for (let i = 0; i < 20 && proc === me; i++) {
        const ip = (await resolver.resolve4(host).catch(() => []))[0];
        if (ip && await probe(ip)) break;
        await sleep(1500);
      }
      if (proc === me && tunnel.state === 'starting') set({ state: 'on', url: u, since: now() });
    };
    const onData = (b) => {
      log = (log + b.toString()).slice(-4000);
      const m = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !found && proc === me) { found = true; clearTimeout(timer); ready(m[0]); }
    };
    me.stdout.on('data', onData); me.stderr.on('data', onData);
    const timer = setTimeout(() => { if (proc === me && tunnel.state === 'starting') me.kill(); }, 45000);
    me.on('exit', () => {
      clearTimeout(timer);
      if (proc !== me) return;
      proc = null;
      if (tunnel.state === 'stopping') return set({ state: 'off' });
      const last = log.trim().split('\n').filter((l) => /ERR|error|failed/i.test(l)).slice(-2).join(' ').slice(0, 300);
      set({ state: 'error', error: last || 'cloudflared exited' });
    });
    me.on('error', (e) => { if (proc === me) { proc = null; set({ state: 'error', error: String(e.message) }); } });
  }
  function stop() {
    if (proc) { tunnel = { state: 'stopping' }; try { proc.kill(); } catch {} }
    else tunnel = { state: 'off' };
    onChange(tunnel);
  }
  return { start, stop, state: () => tunnel, running: () => !!proc };
}
