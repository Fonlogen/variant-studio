// Rounds on disk, the decision inbox, uploaded images and preview errors of one project.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJSON, writeJSON, now, cleanName } from './util.mjs';
import { ensureDirs } from './project.mjs';

export const SAFE = /^[a-z0-9][a-z0-9._-]*$/i;
export const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
export const KINDS = ['component', 'section', 'page'];
// design mode of a round: what the gallery wraps each variant in (tui: terminal shell, app: phone frame, desktop: OS window, logo: usage previews)
export const DESIGNS = ['ui', 'component', 'tui', 'app', 'desktop', 'logo'];
export const SHELLED = ['tui', 'app', 'desktop', 'logo'];
export const SCREEN_DESIGNS = ['tui', 'app', 'desktop'];
export const designOf = (m) => (DESIGNS.includes(m?.design) ? m.design : 'ui');

export function listRounds(P) {
  if (!fs.existsSync(P.rounds)) return [];
  return fs.readdirSync(P.rounds, { withFileTypes: true })
    .filter((d) => d.isDirectory() && SAFE.test(d.name))
    .map((d) => d.name).sort();
}
function variantFiles(dir) {
  return fs.readdirSync(dir).filter((f) => /\.html?$/i.test(f) && !f.startsWith('_')).sort();
}
export function loadRound(P, id) {
  const dir = path.join(P.rounds, id);
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
    kind: KINDS.includes(m.kind) ? m.kind : 'component',
    design: designOf(m),
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
export const publicDecision = (d) => { const { _prev, ...rest } = d; return rest; };
function splitGroup(m) {
  const parts = String(m.group || '').split('/').map((s) => s.trim()).filter(Boolean);
  const group = parts[0] || '';
  const subgroup = String(m.subgroup || '').trim() || parts.slice(1).join(' / ');
  return [group, subgroup];
}
export function prettyId(id) {
  if (id.length <= 2) return id.toUpperCase();
  const t = id.replace(/[-_]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export function latestRoundId(P) { const r = listRounds(P); return r[r.length - 1] || null; }
export function nextRoundId(P, slug) {
  const nums = listRounds(P).map((r) => parseInt(r, 10)).filter((n) => !isNaN(n));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  const clean = String(slug || 'round').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'round';
  return `${String(n).padStart(3, '0')}-${clean}`;
}

// ---------- inbox: every decision is queued, nothing is overwritten ----------
export function inboxEntries(P) {
  if (!fs.existsSync(P.inbox)) return [];
  return fs.readdirSync(P.inbox).filter((f) => f.endsWith('.json')).sort()
    .map((f) => ({ file: path.join(P.inbox, f), d: readJSON(path.join(P.inbox, f)) })).filter((e) => e.d);
}
export function pendingEntries(P, roundId) {
  return inboxEntries(P).filter((e) => !e.d.consumed && !e.d.cancelled && (!roundId || e.d.round === roundId));
}
export function enqueue(P, decision) {
  ensureDirs(P);
  const file = path.join(P.inbox, `${Date.now().toString().padStart(14, '0')}-${decision.id}.json`);
  writeJSON(file, decision);
  return file;
}
export function markConsumed(P, e) {
  e.d.consumed = true; e.d.consumed_at = now();
  writeJSON(e.file, e.d);
  const rf = path.join(P.rounds, e.d.round, 'decision.json');
  const rd = readJSON(rf);
  if (rd && rd.id === e.d.id) { rd.consumed = true; rd.consumed_at = e.d.consumed_at; writeJSON(rf, rd); }
}

export function saveImage(P, roundId, sub, name, dataUrl) {
  const m = String(dataUrl || '').match(/^data:image\/(png|jpe?g|webp|gif|avif);base64,(.+)$/);
  if (!m) return null;
  const rel = `${sub}/${Date.now().toString(36)}-${cleanName(name) || 'image'}.${m[1].replace('jpeg', 'jpg')}`;
  fs.mkdirSync(path.join(P.rounds, roundId, sub), { recursive: true });
  fs.writeFileSync(path.join(P.rounds, roundId, rel), Buffer.from(m[2], 'base64'));
  return rel;
}

export function recentErrors(P, roundId) {
  if (!fs.existsSync(P.errors)) return [];
  return fs.readFileSync(P.errors, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e) => e && (!roundId || e.round === roundId)).slice(-20);
}

// cheap fingerprint of everything the UI cares about
export function snapshot(P) {
  const parts = [];
  for (const r of listRounds(P)) {
    const dir = path.join(P.rounds, r);
    try {
      for (const f of fs.readdirSync(dir)) {
        const st = fs.statSync(path.join(dir, f));
        parts.push(`${r}/${f}:${st.mtimeMs}:${st.size}`);
      }
    } catch {}
  }
  for (const f of [path.join(P.home, 'global.css'), P.votes, P.brand, P.settings]) if (fs.existsSync(f)) parts.push(f + ':' + fs.statSync(f).mtimeMs);
  const pend = pendingEntries(P).map((e) => e.d.id).join(',');
  parts.push('inbox:' + pend);
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex');
}
