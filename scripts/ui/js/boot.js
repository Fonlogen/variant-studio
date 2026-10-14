// Variant Studio 3.0 — keyboard, live connection, wiring and start-up.
'use strict';

function renderAll() { renderRail(); renderRound(true); renderDock(); renderInspector(); renderAgent(); }
function applyI18n() {
  document.documentElement.lang = S.lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { const v = t(el.dataset.i18nTitle); el.title = v; if (!el.textContent.trim()) el.setAttribute('aria-label', v.replace(/\s*\([^()]*\)\s*$/, '')); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
}

// ---------------- rail and top bar ----------------
(() => {
  for (const [id, ic] of [['#rRounds', 'rounds'], ['#rShort', 'star'], ['#rTree', 'tree'], ['#rOverview', 'overview'], ['#rTeam', 'team'], ['#rCmd', 'cmd'], ['#rSettings', 'gear'], ['#pickBtn', 'pick'], ['#editBtn', 'edit'], ['#inspBtn', 'sliders']]) icon($(id), ic);
  $('#rRounds').onclick = () => toggleDrawer();
  $('#rShort').onclick = () => selectRound(SHORT);
  $('#rTree').onclick = () => setLayout(S.layout === 'tree' ? (S.prevLayout || 'grid') : 'tree');
  $('#rOverview').onclick = () => setLayout(S.layout === 'overview' ? (S.prevLayout || 'grid') : 'overview');
  $('#rTeam').onclick = openTeam;
  $('#rCmd').onclick = openPalette;
  $('#rSettings').onclick = () => openSettings();
  $('#vpBtn').onclick = (e) => vpMenu(e.currentTarget);
  $('#themeBtn').onclick = () => setTheme(S.theme === 'light' ? 'dark' : 'light');
  $('#pickBtn').onclick = () => setMode(S.mode === 'pick' ? '' : 'pick');
  $('#editBtn').onclick = () => setMode(S.mode === 'edit' ? '' : 'edit');
  $('#inspBtn').onclick = () => toggleInsp();
  $('#inspClose').onclick = () => toggleInsp(false);
  $('#pickBtn').title = t('Comment on an element or lock it (C)');
  $('#editBtn').title = t('Edit text inline (E)');
  $('#inspBtn').title = t('Tune, tokens, checklist, audit (I)');
  $('#railQ').addEventListener('input', (e) => { S.railQ = e.target.value; renderRail(); });
  if (TEAM) { $('#rTeam').title = t('Your name and votes'); }
})();

// ---------------- keyboard ----------------
const typing = (e) => { const el = e.target; return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)); };
addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#pal').classList.contains('show') ? closePalette() : openPalette(); return; }
  if (mod && e.key === 'Enter') { e.preventDefault(); sendPrimary(); return; }
  if (e.key === 'Escape') {
    if ($('#pal').classList.contains('show')) return closePalette();
    if ($('#menu').classList.contains('show')) return hideMenu();
    if ($('#pop').classList.contains('show')) return closePop();
    if ($('#sheet').classList.contains('show') && !TEAM_NAME_REQUIRED()) return closeSheet();
    if (S.mode) return setMode('');
    if (S.layout === 'focus') return closeFocus();
    if (S.insp && innerWidth < 1100) return toggleInsp(false);
    return;
  }
  if (typing(e) || mod || e.altKey) return;
  if ($('#sheet').classList.contains('show') || $('#pal').classList.contains('show')) return;
  const c = ctx();
  const k = e.key;
  // tournament: arrows pick a side
  if (S.layout === 'compare' && S.cmp.mode === 'duel' && S.duelVote && (k === 'ArrowLeft' || k === 'ArrowRight')) { e.preventDefault(); S.duelVote(k === 'ArrowLeft' ? -1 : 1); return; }
  if (k === 'ArrowLeft' || k === 'ArrowRight') {
    const dir = k === 'ArrowLeft' ? -1 : 1;
    if (S.layout === 'focus') { e.preventDefault(); return stepFocus(dir); }
    if (S.layout === 'list' && c?.items.length) { e.preventDefault(); const i = c.items.findIndex(it => it.fk === S.listSel); const n = c.items.length; S.listSel = S.active = c.items[(i + dir + n) % n].fk; return renderRound(); }
  }
  if ((k === 'ArrowUp' || k === 'ArrowDown') && S.layout === 'list' && c?.items.length) { e.preventDefault(); const i = c.items.findIndex(it => it.fk === S.listSel); const n = c.items.length; S.listSel = S.active = c.items[(i + (k === 'ArrowUp' ? -1 : 1) + n) % n].fk; return renderRound(); }
  if (/^[1-9]$/.test(k) && c) { const it = c.items[Number(k) - 1]; if (it) { e.preventDefault(); if (S.layout === 'focus') { S.focusFk = it.fk; } toggleSel(it.key, it.fk); if (S.layout === 'focus') renderRound(); } return; }
  const map = {
    g: () => setLayout('grid'), f: () => setLayout('focus'), z: () => S.layout === 'focus' ? closeFocus() : setLayout('focus'), l: () => setLayout('list'), x: () => setLayout('compare'),
    o: () => setLayout(S.layout === 'overview' ? (S.prevLayout || 'grid') : 'overview'), t: () => setLayout(S.layout === 'tree' ? (S.prevLayout || 'grid') : 'tree'),
    c: () => setMode(S.mode === 'pick' ? '' : 'pick'), e: () => setMode(S.mode === 'edit' ? '' : 'edit'), i: () => toggleInsp(),
    n: toggleNotes, d: () => setTheme(S.theme === 'light' ? 'dark' : 'light'), u: () => setUi(S.ui === 'dark' ? 'light' : 'dark'), r: () => toggleDrawer(),
    '+': () => zoomAll(1), '=': () => zoomAll(1), '-': () => zoomAll(-1), '0': () => zoomAll(0), '?': openHelp,
    '/': () => { const n = $('#note'); if (n.offsetParent) n.focus(); },
  };
  const fn = map[k.toLowerCase()] || map[k];
  if (fn) { e.preventDefault(); fn(); }
});

// ---------------- live connection ----------------
let es = null, offlineT = 0, uiSeen = null;
function setConn(ok) {
  $('#conn').className = 'conn ' + (ok ? 'on' : 'off');
  $('#conn').title = ok ? t('Connected to the studio') : t('Disconnected: retrying…');
  const b = $('#banner');
  if (ok) { clearTimeout(offlineT); b.classList.remove('show'); return; }
  clearTimeout(offlineT);
  offlineT = setTimeout(() => { b.textContent = t('The studio server stopped. Ask the agent to run `start` again: this tab reconnects by itself.'); b.classList.add('show'); }, 2500);
}
function connect() {
  if (STATIC) { $('#conn').className = 'conn static'; $('#conn').title = t('Offline gallery'); return; }
  es?.close();
  es = new EventSource('/api/stream');
  es.addEventListener('hello', (e) => {
    setConn(true);
    try {
      const d = JSON.parse(e.data);
      // the studio was updated while this tab was open: reload to get the new interface (drafts are in localStorage)
      if (d.ui) { if (uiSeen && uiSeen !== d.ui) return location.reload(); uiSeen = d.ui; }
      if (d.agent) { S.data.agent = d.agent; renderAgent(); }
    } catch {}
    refresh();
  });
  es.addEventListener('change', () => refresh());
  es.addEventListener('decision', () => refresh());
  es.addEventListener('agent', (e) => { try { S.data.agent = JSON.parse(e.data); } catch {} renderAgent(); renderSent(); });
  es.onerror = () => setConn(false);
  es.onopen = () => setConn(true);
}

// ---------------- start ----------------
setUi(S.ui);
applyI18n();
if (TEAM) document.body.classList.add('team');
refresh(true).then(() => {
  connect();
  renderDock(); renderInspector();
  if (TEAM && !S.voter) askVoterName();
}).catch((e) => { $('#banner').textContent = t('Could not load the studio: {x}', { x: e.message }); $('#banner').classList.add('show'); });
// countdowns (undo window, "receives it in Ns") and agent presence
setInterval(() => { if (!document.hidden) { renderAgent(); renderSent(); } }, 1000);
