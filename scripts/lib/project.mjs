// A project: its .variant-studio/ folder, the agent heartbeat, its session PINs and notices from the server.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJSON, writeJSON, now } from './util.mjs';

export function project(dir) {
  const root = path.resolve(dir);
  const home = path.join(root, '.variant-studio');
  const state = path.join(home, 'state');
  return {
    root, name: path.basename(root), home, state,
    rounds: path.join(home, 'rounds'),
    inbox: path.join(state, 'inbox'),
    info: path.join(state, 'server.json'),
    session: path.join(state, 'session.json'),
    notice: path.join(state, 'notice.json'),
    agent: path.join(state, 'agent.json'),
    votes: path.join(state, 'votes.json'),
    events: path.join(state, 'events.jsonl'),
    errors: path.join(state, 'errors.jsonl'),
    brand: path.join(home, 'brand.json'),
    settings: path.join(home, 'settings.json'),
  };
}
export const ensureDirs = (P) => { for (const d of [P.home, P.rounds, P.state, P.inbox]) fs.mkdirSync(d, { recursive: true }); };
export function ensureGitignore(P) {
  const gi = path.join(P.root, '.gitignore');
  if (!fs.existsSync(path.join(P.root, '.git'))) return;
  const txt = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  if (!/^\/?\.variant-studio\/?$/m.test(txt)) fs.appendFileSync(gi, `${txt && !txt.endsWith('\n') ? '\n' : ''}.variant-studio/\n`);
}

// ---------- agent presence ----------
// `wait` writes a heartbeat every 2 s; the gallery shows whether the agent is listening.
export const HOLD_MS = 15000; // approvals stay undoable this long before the agent can read them
export function setAgent(P, state, extra = {}) { try { writeJSON(P.agent, { state, pid: process.pid, at: now(), beat: Date.now(), ...extra }); } catch {} }
export function agentStatus(P) {
  const a = readJSON(P.agent);
  if (!a) return { state: 'unknown' };
  const age = Date.now() - (a.beat || 0);
  if (a.state === 'waiting') return age < 9000 ? { state: 'waiting', since: a.since || a.at } : { state: 'away', since: a.at };
  if (a.state === 'working') return age < 25 * 60000 ? { state: 'working', since: a.at, round: a.round || null } : { state: 'away', since: a.at };
  return { state: 'away', since: a.at };
}

// ---------- session PINs ----------
// 5 characters, no 0/O/1/I. The owner PIN never changes; the guest PIN changes when remote sharing is closed.
export const PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PIN_RE = /^[A-HJ-NP-Z2-9]{5}$/;
function newPin(taken) {
  for (;;) {
    const p = Array.from({ length: 5 }, () => PIN_ALPHABET[crypto.randomInt(PIN_ALPHABET.length)]).join('');
    if (!taken.has(p)) return p;
  }
}
export function sessionPins(P, taken = new Set()) {
  const s = readJSON(P.session, {}) || {};
  let dirty = false;
  if (!PIN_RE.test(s.pin || '') || taken.has(s.pin)) { s.pin = newPin(taken); dirty = true; }
  if (!PIN_RE.test(s.guest_pin || '') || s.guest_pin === s.pin || taken.has(s.guest_pin)) { s.guest_pin = newPin(new Set([...taken, s.pin])); dirty = true; }
  if (dirty) writeJSON(P.session, { ...s, created: s.created || now() });
  return s;
}
export function rotateGuestPin(P, taken) {
  const s = readJSON(P.session, {}) || {};
  s.guest_pin = newPin(new Set([...taken, s.pin]));
  writeJSON(P.session, s);
  return s.guest_pin;
}

// ---------- notices: the server tells a waiting agent that its session was stopped ----------
export const writeNotice = (P, n) => { try { writeJSON(P.notice, n); } catch {} };
export const clearNotice = (P) => { try { fs.rmSync(P.notice, { force: true }); } catch {} };
export function takeNotice(P) {
  const n = readJSON(P.notice);
  if (n) clearNotice(P);
  return n;
}
