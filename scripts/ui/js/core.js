// Variant Studio 3.0 — core: state, data, frames. Classic script; files share the global scope.
'use strict';
const STATIC = window.__VS_STATIC__ || null;
const SHORT = '#shortlist';
const QS = new URLSearchParams(location.search);
const TEAM = QS.get('team') === '1' || window.__VS_ROLE__ === 'guest' || !!(STATIC && STATIC.team);

// ---------------- icons ----------------
const sv = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const I = {
  rounds: sv('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'),
  grid: sv('<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="9.5" y="4" width="5" height="16" rx="1.5"/><rect x="16" y="4" width="5" height="16" rx="1.5"/>'),
  focus: sv('<rect x="3" y="3" width="18" height="13" rx="2"/><rect x="4" y="18.5" width="4" height="2.5" rx="1"/><rect x="10" y="18.5" width="4" height="2.5" rx="1"/><rect x="16" y="18.5" width="4" height="2.5" rx="1"/>'),
  list: sv('<rect x="3" y="4" width="6" height="4" rx="1.2"/><rect x="3" y="10" width="6" height="4" rx="1.2"/><rect x="3" y="16" width="6" height="4" rx="1.2"/><rect x="11" y="4" width="10" height="16" rx="2"/>'),
  compare: sv('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 2v20"/>'),
  overview: sv('<rect x="3" y="3" width="5" height="5" rx="1.2"/><rect x="9.5" y="3" width="5" height="5" rx="1.2"/><rect x="16" y="3" width="5" height="5" rx="1.2"/><rect x="3" y="9.5" width="5" height="5" rx="1.2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.2"/><rect x="16" y="9.5" width="5" height="5" rx="1.2"/><rect x="3" y="16" width="5" height="5" rx="1.2"/><rect x="9.5" y="16" width="5" height="5" rx="1.2"/>'),
  map: sv('<rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/><path d="M10 7h4M12 7v10h2"/>'),
  tree: sv('<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10M6 12h10"/>'),
  mobile: sv('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
  tablet: sv('<rect x="4.5" y="2.5" width="15" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
  laptop: sv('<rect x="4" y="4.5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>'),
  desktop: sv('<rect x="2.5" y="3.5" width="19" height="13" rx="1.5"/><path d="M9 20.5h6M12 16.5v4"/>'),
  fit: sv('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  sun: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: sv('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  up: sv('<path d="M7 10.5 11 3c1.4 0 2.5 1.1 2.5 2.5V9h5c1.2 0 2.1 1.1 1.9 2.3l-1.2 7c-.2.9-.9 1.7-1.9 1.7H7z"/><path d="M7 10.5H3.5V20H7"/>'),
  down: sv('<path d="M17 13.5 13 21c-1.4 0-2.5-1.1-2.5-2.5V15h-5c-1.2 0-2.1-1.1-1.9-2.3l1.2-7C5 4.8 5.7 4 6.7 4H17z"/><path d="M17 13.5h3.5V4H17"/>'),
  star: sv('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  info: sv('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.1"/>'),
  comment: sv('<path d="M4 5h16v11H9.5L5 20v-4H4z"/>'),
  expand: sv('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  shrink: sv('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  more: sv('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>', 'stroke-width="2.4"'),
  pick: sv('<path d="m4 3 14 7-6 1.8L9.5 18z"/><path d="m12.5 12.5 6.5 6.5"/>'),
  edit: sv('<path d="M15.5 4.5l4 4L9 19H5v-4z"/><path d="M13.5 6.5l4 4"/>'),
  sliders: sv('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  cmd: sv('<path d="M9 9h6v6H9z"/><path d="M9 9H7a2 2 0 1 1 2-2zM15 9V7a2 2 0 1 1 2 2zM15 15h2a2 2 0 1 1-2 2zM9 15v2a2 2 0 1 1-2-2z"/>'),
  gear: sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  team: sv('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.6 0 4.2 1.6 4.6 4.5"/>'),
  chevD: sv('<path d="m6 9 6 6 6-6"/>', 'class="chev"'),
  chevL: sv('<path d="m15 6-6 6 6 6"/>'),
  chevR: sv('<path d="m9 6 6 6-6 6"/>'),
  attach: sv('<path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>'),
  mic: sv('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  spark: sv('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
  check: sv('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 'stroke-width="2.2"'),
  x: sv('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: sv('<path d="m15 6-6 6 6 6"/>'),
  minus: sv('<path d="M5 12h14"/>'),
  plus: sv('<path d="M5 12h14M12 5v14"/>'),
  download: sv('<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 20h15"/>'),
  upload: sv('<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4.5 20h15"/>'),
  image: sv('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>'),
  warn: sv('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.1"/>'),
  bug: sv('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16v.1"/>'),
  refresh: sv('<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4.5h-4.5"/>'),
  eye: sv('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  redo: sv('<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5"/>'),
  lock: sv('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  undo: sv('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  layers: sv('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'),
  trophy: sv('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8 21h8M9.5 17h5"/>'),
  code: sv('<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>'),
  bell: sv('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  globe: sv('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>'),
  copy: sv('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>'),
  chips: sv('<path d="M4 7h9M4 12h16M4 17h11"/>'),
};
const icon = (el, name) => { if (el) el.innerHTML = I[name]; return el; };

// ---------------- DOM helpers ----------------
const $ = (s, el = document) => el.querySelector(s);
// el.append(a, cond ? b : null) is used everywhere: skip null/false instead of printing "null"
for (const P of [Element.prototype, DocumentFragment.prototype]) { const ap = P.append; P.append = function (...n) { return ap.apply(this, n.filter(x => x != null && x !== false)); }; }
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
};
function toast(msg, opts = {}) {
  if (typeof opts === 'string') opts = { kind: opts };
  const el = $('#toast'); el.className = opts.kind || ''; el.innerHTML = '';
  if (opts.kind === 'good') el.append(h('span', { html: I.check, style: 'display:grid' }));
  const txt = h('span', {}, msg); el.append(txt);
  if (opts.action) el.append(h('button', { onclick: () => { el.classList.remove('show'); clearTimeout(toast.t); clearInterval(toast.iv); opts.action.run(); } }, opts.action.label));
  el.classList.add('show');
  clearTimeout(toast.t); clearInterval(toast.iv);
  const ms = opts.ms || (opts.kind ? 4200 : 2600);
  if (opts.countdown) { const end = Date.now() + ms; const tick = () => { txt.textContent = msg.replace('{s}', Math.max(0, Math.ceil((end - Date.now()) / 1000))); }; tick(); toast.iv = setInterval(tick, 250); }
  toast.t = setTimeout(() => { el.classList.remove('show'); clearInterval(toast.iv); }, ms);
  return el;
}
const rnum = (id) => { const n = parseInt(id, 10); return isNaN(n) ? '•' : '#' + n; };
function autoGrow(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 2, 160) + 'px'; }
function download(href, name) { const a = h('a', { href, download: name }); document.body.append(a); a.click(); a.remove(); }
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---------------- state ----------------
const VP = { auto: null, mobile: [390, 844], tablet: [820, 1180], laptop: [1280, 800], desktop: [1440, 900] };
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2];
const VIEWS = ['grid', 'focus', 'list', 'compare', 'overview', 'tree', 'map'];
const SPECIAL_VIEWS = ['tree', 'overview', 'map']; // views across rounds, without a dock or a single round
const store = {
  key: 'vs3:' + (STATIC ? STATIC.project : location.host),
  load() { try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; } },
  save(o) { try { localStorage.setItem(this.key, JSON.stringify(o)); } catch {} },
};
const saved = store.load();
const S = {
  data: { rounds: [], votes: {}, pending: [], agent: { state: 'unknown' } }, roundId: null, follow: true,
  layout: VIEWS.includes(saved.layout) ? saved.layout : 'grid', prevLayout: 'grid', focusFk: null,
  vps: saved.vps || {}, zoom: saved.zoom || 'fit', cardZoom: saved.cardZoom || {},
  theme: saved.theme || 'light', canvas: saved.canvas || 'light', sync: !!saved.sync, device: saved.device !== false, mode: '',
  cmp: { mode: saved.cmpMode || 'swipe', a: null, b: null, pos: 50, opacity: 50, diff: false },
  duel: {}, listSel: null, active: null,
  drafts: saved.drafts || {}, vdata: saved.vdata || {}, stars: saved.stars || [],
  drawer: saved.drawer !== false, ui: saved.ui || 'dark', lang: saved.lang || (['it', 'es', 'fr', 'ru'].find(l => (navigator.language || '').toLowerCase().startsWith(l)) || 'en'),
  insp: !!saved.insp, inspTab: saved.inspTab || 'tune', notesAll: !!saved.notesAll, notesOpen: {}, cmOpen: {},
  showDiscarded: {}, collapsed: saved.collapsed || {}, sendAudit: saved.sendAudit !== false, sendShots: saved.sendShots !== false,
  notify: !!saved.notify, sound: saved.sound !== false, chipsOpen: !!saved.chipsOpen, myChips: saved.myChips || [], criteria: saved.criteria || [],
  fonts: saved.fonts || { heading: '', body: '' }, knobs: saved.knobs || {}, rstate: saved.rstate || {},
  ovScope: saved.ovScope || 'group', ovSize: saved.ovSize || 260, mapSubj: saved.mapSubj || '', mapSize: saved.mapSize || 260, voter: saved.voter || '', myVotes: saved.myVotes || {}, exportScale: saved.exportScale || 2,
  railQ: '', audit: {}, tokens: {}, readySeen: null,
};
const persist = () => store.save({
  layout: S.layout === 'focus' ? S.prevLayout : S.layout, vps: S.vps, zoom: S.zoom, cardZoom: S.cardZoom, theme: S.theme, canvas: S.canvas, sync: S.sync, device: S.device,
  cmpMode: S.cmp.mode, drafts: S.drafts, vdata: S.vdata, stars: S.stars, drawer: S.drawer, ui: S.ui, lang: S.lang, insp: S.insp, inspTab: S.inspTab, notesAll: S.notesAll,
  collapsed: S.collapsed, sendAudit: S.sendAudit, sendShots: S.sendShots, notify: S.notify, sound: S.sound, chipsOpen: S.chipsOpen, myChips: S.myChips, criteria: S.criteria,
  fonts: S.fonts, knobs: S.knobs, rstate: S.rstate, ovScope: S.ovScope, ovSize: S.ovSize, mapSubj: S.mapSubj, mapSize: S.mapSize, voter: S.voter, myVotes: S.myVotes, exportScale: S.exportScale,
});
const round = (id = S.roundId) => S.data.rounds.find(r => r.id === id);
const approvedOf = (r) => { const d = r && r.decision; if (!d || d.action === 'unapprove') return null; const ap = d.approved?.variant || (d.action === 'choose' ? d.selected?.[0] : null); return ap && r.variants.some(v => v.id === ap) ? ap : null; };
const draft = (key) => (S.drafts[key] ||= { selected: [], note: '', refs: [] });
const vdata = (fk) => { const o = (S.vdata[fk] ||= {}); o.rating ??= 0; o.comment ??= ''; o.ann ||= []; o.tokens ||= {}; o.edits ||= {}; o.checks ||= {}; return o; };
const letterOf = (c, it) => {
  if (c && (c.kind === 'shortlist' || c.cross)) return `${rnum(it.r.id).slice(1)}${it.v.id.length <= 2 ? it.v.id.toUpperCase() : ''}`;
  return it.v.id.length <= 2 ? it.v.id.toUpperCase() : String(it.r.variants.indexOf(it.v) + 1);
};
const labelOf = (it) => (it.v.id.length <= 2 && it.v.label.toLowerCase() === it.v.id.toLowerCase()) ? t('Variant {x}', { x: it.v.id.toUpperCase() }) : it.v.label;
const shortKey = (k) => k.includes('/') ? rnum(k.split('/')[0]).slice(1) + k.split('/').pop().toUpperCase() : k.toUpperCase();
const itemOf = (fk) => { const i = fk.indexOf('/'); const r = round(fk.slice(0, i)); const v = r && r.variants.find(x => x.id === fk.slice(i + 1)); return r && v ? { r, v, key: v.id, fk } : null; };

// ---------------- context: what the stage shows ----------------
function ctx() {
  if (S.roundId === SHORT) {
    const items = S.stars.map(k => { const it = itemOf(k); return it ? { ...it, key: k } : null; }).filter(Boolean);
    const target = S.data.rounds[S.data.rounds.length - 1];
    return { kind: 'shortlist', key: SHORT, target, items };
  }
  const r = round(); if (!r) return null;
  const ap = approvedOf(r);
  let kind = 'open', vs = r.variants, key = r.id;
  if (ap && S.showDiscarded[r.id]) { kind = 'discarded'; vs = r.variants.filter(v => v.id !== ap); key = r.id + '#reuse'; }
  else if (ap) { kind = 'approved'; vs = r.variants.filter(v => v.id === ap); key = r.id + '#approved'; }
  const c = { kind, key, target: r, r, ap, items: vs.map(v => ({ r, v, key: v.id, fk: r.id + '/' + v.id })) };
  if (kind === 'approved') { const d = draft(key); if (!d.selected.length) d.selected = [ap]; }
  return c;
}

// ---------------- data ----------------
async function fetchState() {
  if (STATIC) return { ...STATIC, agent: { state: 'static' }, pending: [], votes: mergeVotes(STATIC.votes || {}) };
  const r = await fetch('/api/state', { cache: 'no-store' });
  return r.json();
}
// The studio language is also the language the agent writes round titles, questions and labels in, so the server keeps it
// (~/.variant-studio/config.json). A browser with no choice of its own adopts the saved one; otherwise it updates it.
function postLang() { if (!STATIC && S.data.role === 'owner' && S.data.lang !== S.lang) { S.data.lang = S.lang; fetch('/api/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: S.lang }) }).catch(() => {}); } }
function syncLang(initial) {
  if (STATIC || S.data.role !== 'owner') return;
  if (initial && !saved.lang && S.data.lang && S.data.lang !== S.lang && LANGS.some(l => l.code === S.data.lang)) { S.lang = S.data.lang; persist(); applyI18n(); return; }
  postLang();
}
function mergeVotes(v) {
  // static team gallery: show this voter's own votes too
  if (!TEAM || !S.voter) return v;
  const out = JSON.parse(JSON.stringify(v));
  for (const [k, o] of Object.entries(S.myVotes)) { const [rid, vid] = k.split('/'); ((out[rid] ||= {})[vid] ||= {})[S.voter] = o; }
  return out;
}
async function refresh(initial = false) {
  const prevIds = S.data.rounds.map(r => r.id);
  const prevLatest = prevIds[prevIds.length - 1];
  S.data = await fetchState();
  syncLang(initial);
  $('#proj').textContent = S.data.project || '';
  const ids = S.data.rounds.map(r => r.id);
  const latest = ids[ids.length - 1];
  checkReady(initial);
  if (S.roundId !== SHORT && (!S.roundId || !ids.includes(S.roundId))) S.roundId = latest || null;
  else if (!initial && latest !== prevLatest && latest) {
    if (S.follow) { S.roundId = latest; if (S.layout === 'focus') S.layout = S.prevLayout; toast(t('New round from the agent')); }
    else showNewPill(latest);
  }
  renderRail(); renderAgent(); renderRound();
}
function showNewPill(id) {
  const b = $('#newpill'); b.textContent = t('New round available: show it'); b.classList.add('show');
  b.onclick = () => { b.classList.remove('show'); selectRound(id); };
}
function selectRound(id, opts = {}) {
  S.roundId = id; S.listSel = null; S.active = null; S.cmp.a = S.cmp.b = null; S.duel = {};
  if (S.layout === 'focus' && !opts.keepFocus) S.layout = S.prevLayout;
  if (SPECIAL_VIEWS.includes(S.layout)) { if (!opts.keepView) S.layout = 'grid'; }
  const ids = S.data.rounds.map(r => r.id);
  S.follow = id === ids[ids.length - 1];
  $('#newpill').classList.remove('show');
  if (innerWidth <= 900) toggleDrawer(false);
  renderRail(); renderRound(true);
  $('#stage').scrollTop = 0;
}

// readiness: notify when every variant of a round has been written
function checkReady(initial) {
  const readyIds = S.data.rounds.filter(r => r.variants.length && r.variants.every(v => v.ready)).map(r => r.id);
  if (!S.readySeen || initial) { S.readySeen = new Set(readyIds); return; }
  for (const id of readyIds) if (!S.readySeen.has(id)) {
    S.readySeen.add(id);
    const r = round(id);
    notifyReady(r);
  }
}
function notifyReady(r) {
  const msg = t('Variants ready: {x}', { x: r.title });
  if (S.sound) chime();
  if (S.notify && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try { const n = new Notification('Variant Studio', { body: msg + (r.question ? '\n' + r.question : ''), tag: 'vs-' + r.id }); n.onclick = () => { focus(); selectRound(r.id); n.close(); }; } catch {}
  }
  if (!document.hidden) toast(msg);
  if (document.hidden) { document.title = '● ' + t('Variants ready'); addEventListener('focus', () => { document.title = 'Variant Studio'; }, { once: true }); }
}
let actx = null;
function chime() {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t0 = actx.currentTime;
    [[660, 0], [880, 0.12]].forEach(([f, d]) => {
      const o = actx.createOscillator(); const g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.12, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.35);
      o.start(t0 + d); o.stop(t0 + d + 0.4);
    });
  } catch {}
}

// ---------------- agent presence ----------------
function renderAgent() {
  const el = $('#agent'); if (!el) return;
  const a = S.data.agent || { state: 'unknown' };
  const pend = (S.data.pending || []).filter(p => !p.hold_until || Date.parse(p.hold_until) <= Date.now()).length;
  const st = STATIC ? 'static' : a.state;
  const label = { waiting: t('Agent listening'), working: t('Agent working'), away: t('Agent not listening'), unknown: t('Agent not connected'), static: t('Offline gallery') }[st] || st;
  const tip = {
    waiting: t('The agent is waiting for your decision. Send it from the bar below.'),
    working: t('The agent received your last decision and is working on it.'),
    away: t('The agent is not waiting right now. Your decisions are queued: tell the agent in chat to run `wait` (or just say "check the studio").'),
    unknown: t('No agent has connected yet. Decisions are queued until it runs `wait`.'),
    static: t('Decisions are copied to the clipboard: paste them into the chat.'),
  }[st] || '';
  el.className = 'agent ' + st;
  el.title = tip;
  el.innerHTML = '';
  el.append(h('i'), h('span', {}, label), pend ? h('b', {}, '· ' + t('{n} queued', { n: pend })) : null);
}

// ---------------- viewport ----------------
// Viewport is remembered per round: switching one round to mobile must never leak into the next round.
// Default = the first viewport the round declares, else 'auto' for components and 'laptop' for sections/pages.
const roundVpDefault = (r) => (r?.viewports || []).find(v => VP[v] !== undefined) || (r?.kind === 'component' ? 'auto' : 'laptop');
function vpPick(r) { return (r && S.vps[r.id]) || roundVpDefault(r); }
function currentVpKey(r) { const p = vpPick(r); return String(p).startsWith('custom:') ? 'custom' : p; }
const customW = (r) => Number(String(vpPick(r)).slice(7)) || 1280;
// width a section/page is designed for: 'auto' never squeezes a page into the card width (that rendered desktop pages as mobile)
const designVp = (r) => { const d = (r?.viewports || []).find(v => VP[v] && v !== 'auto'); return VP[d] || VP.laptop; };
function currentVp(r) {
  const key = currentVpKey(r);
  if (key === 'custom') return [customW(r), VP.laptop[1]];
  if (key === 'auto') return r?.kind === 'component' ? VP.laptop : designVp(r);
  return VP[key] === undefined ? VP.laptop : VP[key];
}
const isSmallVp = (r) => { const k = currentVpKey(r); return k === 'mobile' || k === 'tablet' || (k === 'custom' && customW(r) <= 820) || (k === 'auto' && r?.kind !== 'component' && designVp(r)[0] <= 820); };
const deviceOn = (r) => S.device && ['mobile', 'tablet'].includes(currentVpKey(r));

// ---------------- frames ----------------
const frames = new Map(); // key -> frame record
function frameSrc(r, v) {
  if (v.url) return v.url;
  const rs = S.rstate[r.id] || {};
  return `/v/${encodeURIComponent(r.id)}/${encodeURIComponent(v.file)}?round=${encodeURIComponent(r.id)}&variant=${encodeURIComponent(v.id)}&theme=${S.theme}&canvas=${S.canvas}${rs.state ? '&state=' + encodeURIComponent(rs.state) : ''}${rs.content ? '&content=' + encodeURIComponent(rs.content) : ''}&t=${Math.round(v.mtime)}`;
}
function makeFrame(it, opts = {}) {
  const { r, v } = it;
  const role = opts.role || 'card'; // card | focus | thumb | layer
  const key = it.fk + (role === 'card' ? '' : '#' + role + (opts.tag || ''));
  const iframe = h('iframe', { title: `${r.title}: ${v.label}`, loading: role === 'thumb' ? 'lazy' : null, tabindex: role === 'thumb' ? '-1' : null });
  if (STATIC) iframe.srcdoc = v.html || ''; else iframe.src = frameSrc(r, v);
  const scaler = h('div', { class: 'scaler' }, iframe);
  const wrap = h('div', { class: 'pv' }, scaler);
  const f = { key, it, r, v, iframe, scaler, wrap, role, h: v.url ? 700 : 240, errors: [], mtime: v.mtime, url: !!v.url, thumb: role === 'thumb', s: 1 };
  frames.set(key, f);
  iframe.addEventListener('load', () => sendFrame(f));
  return f;
}
function zoomControl(f) {
  const fk = f.it.fk;
  return h('div', { class: 'zc' },
    h('button', { class: 'ib', title: t('Zoom out this card'), 'aria-label': t('Zoom out this card'), html: I.minus, onclick: () => zoomCard(fk, -1, f) }),
    h('span', { class: 'zv', title: t('Reset card zoom'), onclick: () => zoomCard(fk, 0, f) }),
    h('button', { class: 'ib', title: t('Zoom in this card'), 'aria-label': t('Zoom in this card'), html: I.plus, onclick: () => zoomCard(fk, 1, f) }));
}
const postTo = (f, m) => { try { f.iframe.contentWindow.postMessage({ vsHost: true, ...m }, '*'); } catch {} };
function sendFrame(f) {
  const vd = vdata(f.it.fk);
  postTo(f, { type: 'theme', value: S.theme });
  postTo(f, { type: 'canvas', value: S.canvas === 'none' ? '' : S.canvas });
  postTo(f, { type: 'mode', value: f.thumb || TEAM ? '' : S.mode });
  postTo(f, { type: 'vp', mobile: isSmallVp(f.r) });
  postTo(f, { type: 'marks', list: f.thumb ? [] : vd.ann });
  const rs = S.rstate[f.r.id] || {};
  postTo(f, { type: 'vsattr', state: rs.state || '', content: rs.content || '' });
  postTo(f, { type: 'fonts', heading: S.fonts.heading || '', body: S.fonts.body || '' });
  const edits = Object.entries(vd.edits).map(([selector, e]) => ({ selector, ...e }));
  if (edits.length) postTo(f, { type: 'edits', list: edits });
  const toks = Object.entries(vd.tokens).map(([name, tk]) => ({ name, scope: tk.scope, value: tk.to }));
  const kn = knobTokens(f.r);
  if (toks.length || kn.length) postTo(f, { type: 'setTokens', list: [...kn, ...toks] });
  const ka = knobAttrs(f.r);
  if (ka.length) postTo(f, { type: 'attrs', list: ka });
  if (!f.thumb && S.insp && S.inspTab === 'tokens' && S.active === f.it.fk) postTo(f, { type: 'tokens' });
}
function knobTokens(r) {
  const vals = S.knobs[r.id] || {};
  return (r.knobs || []).filter(k => k.token && vals[k.token] != null).map(k => ({ name: k.token, scope: k.scope || ':root', value: String(vals[k.token]) + (k.type === 'range' && k.unit ? k.unit : '') }));
}
function knobAttrs(r) {
  const vals = S.knobs[r.id] || {};
  return (r.knobs || []).filter(k => k.attr && vals[k.attr] != null).map(k => ({ name: k.attr, value: String(vals[k.attr]) }));
}
function framesOf(fk) { return [...frames.values()].filter(f => f.it.fk === fk); }
function mainFrame(fk) { return frames.get(fk) || framesOf(fk).find(f => !f.thumb); }
function liveFrames() { return [...frames.values()].filter(f => f.wrap.isConnected); }
function broadcastFrames() { for (const f of liveFrames()) sendFrame(f); }
function reloadFrames() { for (const f of liveFrames()) { if (STATIC) f.iframe.srcdoc = f.v.html || ''; else f.iframe.src = frameSrc(f.r, f.v); } }
function runAudits() { setTimeout(() => { for (const f of liveFrames()) if (!f.thumb) postTo(f, { type: 'audit' }); }, 250); }
function zoomOf(f) { return f.thumb || f.role === 'layer' ? 'fit' : (S.cardZoom[f.it.fk] ?? S.zoom); }
function stepZoom(cur, dir) {
  if (dir === 0) return 'fit';
  const c = Number(cur);
  return dir > 0 ? (ZOOMS.find(z => z > c + 0.001) ?? ZOOMS[ZOOMS.length - 1]) : ([...ZOOMS].reverse().find(z => z < c - 0.001) ?? ZOOMS[0]);
}
function zoomAll(dir) {
  const ref = liveFrames().find(f => !f.thumb);
  S.zoom = stepZoom(S.zoom === 'fit' ? (ref ? ref.s : 1) : S.zoom, dir);
  S.cardZoom = {}; persist(); renderTopbar(); layoutFrames();
  toast(t('Zoom: {x}', { x: S.zoom === 'fit' ? t('Fit') : Math.round(S.zoom * 100) + '%' }));
}
function zoomCard(fk, dir, f) {
  const cur = S.cardZoom[fk] ?? S.zoom;
  const nv = stepZoom(cur === 'fit' ? f.s : cur, dir);
  if (dir === 0) delete S.cardZoom[fk]; else S.cardZoom[fk] = nv;
  persist(); layoutFrames();
}
function layoutFrame(f, availW) {
  const r = f.r;
  const vp = currentVp(r);
  const fixedH = r.kind === 'page' || f.url;
  if (!f.wrap.isConnected) return;
  if (f.thumb) {
    const box = f.wrap.parentElement; if (!box) return;
    const W = box.clientWidth, Hc = box.clientHeight; if (!W) return;
    const vpW = currentVpKey(r) === 'auto' && r.kind === 'component' ? 560 : vp[0];
    const H = fixedH ? vp[1] : Math.max(60, f.h);
    const s = r.kind === 'component' ? Math.min(W / vpW, Hc / H) : W / vpW;
    Object.assign(f.iframe.style, { width: vpW + 'px', height: H + 'px', transform: `scale(${s})` });
    Object.assign(f.scaler.style, { width: W + 'px', height: Hc + 'px' });
    f.iframe.style.left = Math.max(0, (W - vpW * s) / 2) + 'px';
    f.iframe.style.top = r.kind === 'component' ? Math.max(0, (Hc - H * s) / 2) + 'px' : '0';
    f.wrap.style.height = Hc + 'px';
    return;
  }
  const holder = f.wrap.parentElement;
  const dev = f.role !== 'layer' && deviceOn(r);
  const pad = dev ? (currentVpKey(r) === 'tablet' ? 14 : 11) : 0;
  const cw = (availW ?? (holder ? holder.clientWidth : 0)) - (dev ? 2 * pad + 48 : 0);
  if (cw <= 0) return;
  const vpW = currentVpKey(r) === 'auto' && r.kind === 'component' ? cw : vp[0];
  const H = fixedH ? vp[1] : Math.max(60, f.h);
  const z = zoomOf(f);
  let s = z === 'fit' ? Math.min(1, cw / vpW) : Number(z);
  const maxH = f.role === 'focus' ? Math.max(320, $('#stage').clientHeight - 270) : Infinity;
  if (f.role === 'focus' && z === 'fit' && dev) s = Math.min(s, maxH / H);
  f.s = s;
  const visW = vpW * s, visH = H * s;
  Object.assign(f.iframe.style, { width: vpW + 'px', height: H + 'px', transform: s === 1 ? '' : `scale(${s})`, left: '0', top: '0' });
  Object.assign(f.scaler.style, { width: visW + 'px', height: visH + 'px' });
  f.wrap.classList.toggle('dev', dev);
  f.wrap.classList.toggle('tab', dev && currentVpKey(r) === 'tablet');
  holder?.classList.toggle('dev', dev);
  f.wrap.style.width = dev ? (visW + 2 * pad) + 'px' : '';
  f.wrap.style.height = (Math.min(visH, maxH) + 2 * pad) + 'px';
  f.wrap.classList.toggle('scroll', visW > cw + 1 || visH > maxH);
  const zv = holder?.querySelector('.zv');
  if (zv) zv.textContent = (S.cardZoom[f.it.fk] == null && S.zoom === 'fit' ? t('Fit') + ' ' : '') + Math.round(s * 100) + '%';
  holder?.querySelector('.zc')?.classList.toggle('set', S.cardZoom[f.it.fk] != null);
}
function layoutFrames() { for (const f of liveFrames()) if (f.role !== 'layer') layoutFrame(f); layoutCompare(); }
new ResizeObserver(() => layoutFrames()).observe($('#stage'));

// ---------------- messages from previews ----------------
const snapWait = new Map();
addEventListener('message', (e) => {
  const d = e.data; if (!d || !d.vs) return;
  let f = null;
  for (const x of frames.values()) if (x.iframe.contentWindow === e.source) { f = x; break; }
  if (!f) return;
  const fk = f.it.fk;
  if (d.type === 'ready') sendFrame(f);
  if (d.type === 'size') { f.h = d.h; if (f.role === 'layer') layoutCompare(); else layoutFrame(f); }
  if (d.type === 'error') { f.errors.push(d.message); updateBadges(fk); }
  if ((d.type === 'snapshot' || d.type === 'html') && snapWait.has(d.id)) { snapWait.get(d.id)(d); snapWait.delete(d.id); return; }
  if (f.thumb) return;
  if (d.type === 'picked') openPop(f, d);
  if (d.type === 'mode-cancel') setMode('');
  if (d.type === 'textEdit') {
    const vd = vdata(fk);
    if (d.before === d.after) delete vd.edits[d.selector]; else { vd.edits[d.selector] = { before: d.before, after: d.after, tag: d.tag }; toast(t('Text edit saved: it will be sent to the agent')); }
    persist(); updateBadges(fk); renderDock(); if (S.insp && S.inspTab === 'edits') renderInspector();
    for (const o of framesOf(fk)) if (o !== f) sendFrame(o);
  }
  if (d.type === 'audit') { if (f.role === 'layer') return; S.audit[fk] = d.issues || []; updateBadges(fk); if (S.insp && S.inspTab === 'audit' && S.active === fk) renderInspector(); }
  if (d.type === 'tokens') { S.tokens[fk] = d.list || []; if (S.insp && S.inspTab === 'tokens' && S.active === fk) renderInspector(); }
  if (d.type === 'scrolled' && S.sync && !f.syncing) {
    for (const o of liveFrames()) if (o !== f && !o.thumb) { o.syncing = true; postTo(o, { type: 'scroll', y: d.y, ratio: d.ratio }); clearTimeout(o.syncT); o.syncT = setTimeout(() => o.syncing = false, 300); }
  }
});
function askFrame(f, msg, ms = 6000) {
  return new Promise((res) => {
    const id = 'q' + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => { snapWait.delete(id); res({ error: 'timeout' }); }, ms);
    snapWait.set(id, (d) => { clearTimeout(timer); res(d); });
    postTo(f, { ...msg, id });
  });
}
function snapshotOf(f, ms = 6000) { return askFrame(f, { type: 'snapshot', quiet: true, scale: 1 }, ms); }
const fileBase = (it) => `${it.r.id}-${it.v.id}${it.v.label ? '-' + it.v.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : ''}`;
// HTML: 'source' = the file as the agent wrote it (self-contained); 'live' = what is on screen, with tokens, edits, knobs and fonts applied
async function exportHtml(it, kind = 'live') {
  const f = mainFrame(it.fk);
  if (kind === 'live' && f && !it.v.url) {
    toast(t('Preparing HTML…'));
    const d = await askFrame(f, { type: 'html' }, 20000);
    if (!d.error && d.html) { const u = URL.createObjectURL(new Blob([d.html], { type: 'text/html' })); download(u, `${fileBase(it)}.html`); setTimeout(() => URL.revokeObjectURL(u), 4000); return toast(t('HTML exported'), 'good'); }
    toast(t('Live export failed ({x}): downloading the original file', { x: d.error || '?' }));
  }
  if (STATIC) { const u = URL.createObjectURL(new Blob([it.v.html || ''], { type: 'text/html' })); download(u, `${fileBase(it)}.html`); setTimeout(() => URL.revokeObjectURL(u), 2000); return; }
  if (it.v.url) return toast(t('URL variants cannot be exported as HTML'));
  download(`/x/${encodeURIComponent(it.r.id)}/${encodeURIComponent(it.v.file)}`, `${fileBase(it)}.html`);
}
async function exportImage(it, format = 'png') {
  const f = mainFrame(it.fk); if (!f) return toast(t('Open the variant first'));
  const name = format === 'jpeg' ? 'JPG' : 'PNG';
  toast(t('Rendering {x}…', { x: name }));
  const d = await askFrame(f, { type: 'snapshot', format, scale: S.exportScale || 2, quality: 0.92 }, 30000);
  if (d.error) return toast(t('{x} export failed: {y}', { x: name, y: d.error }));
  download(d.url, `${fileBase(it)}@${S.exportScale || 2}x.${format === 'jpeg' ? 'jpg' : 'png'}`); toast(t('{x} exported', { x: name }), 'good');
}
const exportPng = (it) => exportImage(it, 'png');
