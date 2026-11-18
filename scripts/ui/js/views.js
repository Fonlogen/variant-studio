// Variant Studio 4.0 — rail, drawer, top bar and the main views.
'use strict';

// ---------------- rail + drawer ----------------
function statusOf(r) {
  if (approvedOf(r)) return 'choose';
  if (r.decision && r.decision.action !== 'unapprove') return r.decision.action;
  if (r.variants.some(v => !v.ready)) return 'gen';
  return 'open';
}
const stIcon = () => ({ choose: I.check, revise: I.redo, remix: I.plus, more: I.plus, regenerate: I.x, export: I.code, gen: '', open: '' });
const stTitle = () => ({ choose: t('Approved'), revise: t('Changes requested'), remix: t('Combine requested'), more: t('More like this requested'), regenerate: t('Start over requested'), export: t('Export requested'), gen: t('Generating…'), open: t('Waiting for your decision') });
function toggleDrawer(v = !S.drawer) { S.drawer = v; persist(); document.body.classList.toggle('drawer-open', S.drawer); renderRail(); setTimeout(layoutFrames, 30); }
function renderRail() {
  document.body.classList.toggle('drawer-open', S.drawer);
  $('#rRounds').setAttribute('aria-pressed', String(S.drawer));
  $('#rShort').setAttribute('aria-pressed', String(S.roundId === SHORT && !SPECIAL_VIEWS.includes(S.layout)));
  $('#rTree').setAttribute('aria-pressed', String(S.layout === 'tree'));
  $('#rOverview').setAttribute('aria-pressed', String(S.layout === 'overview'));
  $('#rMap').setAttribute('aria-pressed', String(S.layout === 'map'));
  const sn = $('#rShort'); sn.querySelector('.n')?.remove(); if (S.stars.length) sn.append(h('span', { class: 'n' }, String(S.stars.length)));
  const tree = $('#tree'); tree.innerHTML = '';
  const q = S.railQ.trim().toLowerCase();
  const groups = new Map();
  for (const r of S.data.rounds) {
    const hay = [r.title, r.question, r.group, r.subgroup, r.id].join(' ').toLowerCase();
    if (q && !hay.includes(q)) continue;
    const g = r.group || t('Ungrouped');
    if (!groups.has(g)) groups.set(g, { last: '', subs: new Map() });
    const G = groups.get(g); G.last = r.id > G.last ? r.id : G.last;
    const sg = r.subgroup || '';
    if (!G.subs.has(sg)) G.subs.set(sg, []);
    G.subs.get(sg).push(r);
  }
  const ordered = [...groups.entries()].sort((a, b) => (a[0] === t('Ungrouped')) - (b[0] === t('Ungrouped')) || b[1].last.localeCompare(a[1].last));
  const depth = (r) => { let d = 0, p = r.parent; while (p && d < 3) { const pr = round(p); if (!pr || pr.subgroup !== r.subgroup || pr.group !== r.group) break; d++; p = pr.parent; } return d; };
  const icons = stIcon(), titles = stTitle();
  for (const [g, G] of ordered) {
    const gk = 'g:' + g; const closed = !!S.collapsed[gk] && !q;
    const count = [...G.subs.values()].reduce((n, l) => n + l.length, 0);
    tree.append(h('li', {}, h('button', { class: 'tr g' + (closed ? ' closed' : ''), title: closed ? t('Expand group') : t('Collapse group'), onclick: () => { S.collapsed[gk] = !S.collapsed[gk]; persist(); renderRail(); } },
      h('span', { html: I.chevD, style: 'display:grid' }), h('span', { class: 'lbl' }, g), h('span', { class: 'cnt' }, String(count)))));
    if (closed) continue;
    for (const [sg, list] of G.subs) {
      const sk = gk + '/' + sg; const sclosed = sg && !!S.collapsed[sk] && !q;
      if (sg) tree.append(h('li', {}, h('button', { class: 'tr' + (sclosed ? ' closed' : ''), style: 'padding-left:22px', title: sclosed ? t('Expand group') : t('Collapse group'), onclick: () => { S.collapsed[sk] = !S.collapsed[sk]; persist(); renderRail(); } },
        h('span', { html: I.chevD, style: 'display:grid' }), h('span', { class: 'lbl' }, sg), h('span', { class: 'cnt' }, String(list.length)))));
      if (sclosed) continue;
      for (const r of list) {
        const st = statusOf(r); const ap = approvedOf(r);
        tree.append(h('li', {}, h('button', { class: 'tr', style: `padding-left:${(sg ? 34 : 22) + depth(r) * 10}px`, 'aria-current': String(r.id === S.roundId && !SPECIAL_VIEWS.includes(S.layout)), title: (r.question || r.title) + ': ' + titles[st], onclick: () => selectRound(r.id) },
          h('span', { class: 'st ' + st, html: icons[st] || '' }), h('span', { class: 'num' }, rnum(r.id)), h('span', { class: 'lbl' }, r.title),
          h('span', { class: 'cnt' }, ap ? ap.toUpperCase() : (r.decision?.selected?.length && r.decision.action !== 'unapprove' ? r.decision.selected.map(s => s.split('/').pop()).join('+').toUpperCase() : String(r.variants.length))))));
      }
    }
  }
  if (!S.data.rounds.length) tree.append(h('li', { class: 'hint', style: 'padding:10px' }, t('No rounds yet.')));
}

// ---------------- top bar ----------------
function seg(el, items, current, onPick) {
  el.innerHTML = '';
  items.forEach(([val, label, ic, title]) => el.append(h('button', { 'aria-pressed': String(val === current), title: title || label, 'aria-label': title || label, onclick: () => onPick(val), html: (ic || '') + (label ? `<span>${label}</span>` : '') })));
}
function viewItems() {
  return [['grid', t('Grid'), I.grid, t('Grid (G)')], ['focus', '', I.focus, t('Full screen (F)')], ['list', '', I.list, t('List (L)')], ['compare', '', I.compare, t('Compare (X)')]];
}
function setLayout(v) {
  if (v === 'focus') return openFocus(S.active || ctx()?.items[0]?.fk);
  if (S.layout !== 'focus') S.prevLayout = SPECIAL_VIEWS.includes(S.layout) ? 'grid' : S.layout;
  S.layout = v; if (v !== 'focus' && !SPECIAL_VIEWS.includes(v)) S.prevLayout = v;
  persist(); renderRail(); renderRound(true);
}
function vpRounds() { const c = ctx(); if (!c) return []; return c.kind === 'shortlist' || !c.r ? [...new Set(c.items.map(i => i.r))] : [c.r]; }
function setVp(v) { for (const r of vpRounds()) { if (v === roundVpDefault(r)) delete S.vps[r.id]; else S.vps[r.id] = v; } persist(); renderTopbar(); layoutFrames(); broadcastFrames(); runAudits(); }
function setTheme(v) { S.theme = v; if (S.canvas === 'light' && v === 'dark') S.canvas = 'dark'; else if (S.canvas === 'dark' && v === 'light') S.canvas = 'light'; persist(); renderTopbar(); broadcastFrames(); }
function setUi(v) { S.ui = v; document.documentElement.dataset.ui = v; persist(); }
function setMode(m) {
  if (TEAM) return;
  S.mode = m; document.body.classList.toggle('mode-pick', m === 'pick'); document.body.classList.toggle('mode-edit', m === 'edit');
  renderTopbar(); broadcastFrames();
  if (m === 'pick') toast(t('Click any element in a preview to comment on it or lock it. Esc to stop.'));
  if (m === 'edit') toast(t('Click any text in a preview to rewrite it. Enter to save, Esc to stop.'));
}
function vpLabel(r) {
  const k = currentVpKey(r);
  if (k === 'custom') return customW(r) + 'px';
  if (k === 'auto') return r?.kind === 'component' ? t('Fit') : designVp(r)[0] + 'px';
  return { mobile: t('Mobile'), tablet: t('Tablet'), laptop: t('Laptop'), desktop: t('Desktop') }[k] || k;
}
// design modes: names (their shell options live in shellpick.js)
const DESIGN_NAMES = () => ({ ui: t('UI'), component: t('Component'), tui: t('TUI'), app: t('App'), desktop: t('Desktop'), logo: t('Logo') });
function renderTopbar(c = ctx()) {
  const r = c && (c.r || c.target);
  const special = SPECIAL_VIEWS.includes(S.layout);
  const mb = $('#modeBadge');
  if (mb) { const show = r && c.kind !== 'shortlist' && !special; mb.hidden = !show; if (show) { mb.textContent = DESIGN_NAMES()[r.design] || r.design; mb.dataset.design = r.design; mb.title = t('Design mode: {x}', { x: mb.textContent }); } }
  $('#viewSeg').style.display = special || !c ? 'none' : '';
  seg($('#viewSeg'), viewItems(), S.layout, setLayout);
  $('#viewSeg').classList.add('icons');
  const vk = currentVpKey(r);
  const vb = $('#vpBtn'); vb.innerHTML = (I[vk] || I.fit) + `<span>${vpLabel(r)}</span>` + (S.zoom !== 'fit' ? `<span class="hint">${Math.round(S.zoom * 100)}%</span>` : '') + I.chevD;
  vb.title = t('Viewport, zoom, device frames'); vb.style.display = special || !c ? 'none' : '';
  // states / content switches declared by the round
  const box = $('#stateBox'); box.innerHTML = ''; $('#modeTools').innerHTML = '';
  if (r && c.kind !== 'shortlist' && !special) {
    const rs = S.rstate[r.id] || {};
    const mk = (list, key, label) => {
      if (!list.length) return;
      const sel = h('select', { class: 'tx', 'aria-label': label, title: label, style: 'height:34px' });
      list.forEach(s => sel.append(h('option', { value: s === list[0] ? '' : s, selected: (rs[key] || '') === (s === list[0] ? '' : s) }, label + ': ' + s)));
      sel.onchange = () => { (S.rstate[r.id] ||= {})[key] = sel.value; persist(); broadcastFrames(); runAudits(); };
      box.append(sel);
    };
    mk(r.states || [], 'state', t('State')); mk(r.content || [], 'content', t('Content'));
    shellPickInto($('#modeTools'), r);
  }
  for (const b of document.querySelectorAll('#themeBtn, .mvc [data-theme]')) { icon(b, S.theme === 'dark' ? 'moon' : 'sun'); b.title = t('Variant theme: light / dark (D)'); }
  $('#vcBox').style.display = special ? 'none' : '';
  paintBgButton();
  const qb = $('#qrBtn'); qb.style.display = TEAM || STATIC ? 'none' : ''; qb.innerHTML = I.qr + `<span>${t('Phone')}</span>`; qb.title = t('Open on your phone: QR code, PIN and link');
  for (const [id, m] of [['#pickBtn', 'pick'], ['#editBtn', 'edit']]) { $(id).setAttribute('aria-pressed', String(S.mode === m)); $(id).style.display = TEAM || special ? 'none' : ''; }
  $('#inspBtn').setAttribute('aria-pressed', String(S.insp)); $('#inspBtn').style.display = TEAM ? 'none' : '';
  const crumb = $('#crumb'); crumb.innerHTML = '';
  if (S.layout === 'tree') { crumb.textContent = t('All rounds'); $('#q').textContent = t('Version tree'); }
  else if (S.layout === 'map') { crumb.textContent = ''; $('#q').textContent = t('Variants map'); }
  else if (S.layout === 'overview') { crumb.textContent = r ? [r.group, r.subgroup].filter(Boolean).join(' / ') : ''; $('#q').textContent = t('Overview'); }
  else if (c && c.kind === 'shortlist') { crumb.textContent = t('Shortlist'); $('#q').textContent = t('{n} starred variants', { n: c.items.length }); }
  else if (r) {
    const parts = [r.group, r.subgroup].filter(Boolean).join(' / ');
    crumb.append(h('button', { onclick: () => toggleDrawer(true), title: t('Rounds (R)') }, parts || t('Ungrouped')), ' · ' + t('round {n}', { n: rnum(r.id).slice(1) }));
    if (r.parent && round(r.parent)) crumb.append(' · ', h('button', { onclick: () => selectRound(r.parent) }, t('from {x}', { x: rnum(r.parent) })));
    $('#q').textContent = r.question || r.title;
  } else { crumb.textContent = ''; $('#q').textContent = 'Variant Studio'; }
  $('#q').title = r ? [r.question || r.title, r.context].filter(Boolean).join('\n\n') : '';
}
function vpName(k, r) { return k === 'auto' ? (r?.kind === 'component' ? t('Fit to card') : t('Design width')) : ({ mobile: t('Mobile'), tablet: t('Tablet'), laptop: t('Laptop'), desktop: t('Desktop') }[k] || k); }
function setOverflow(v) { S.overflow = v; persist(); layoutFrames(); toast(v ? t('Cards show the whole variant') : t('Tall variants scroll inside their card')); }
function vpMenu(anchor) {
  const r = ctx()?.r || ctx()?.target;
  const k = currentVpKey(r);
  showMenu(anchor, [
    { head: t('Viewport') },
    { text: t('Remembered for this round only. Default: {x}', { x: vpName(roundVpDefault(r), r) }) },
    ...[['auto', r?.kind === 'component' ? t('Fit to card') : t('Design width') + ` ${designVp(r)[0]}`, 'fit'], ['mobile', t('Mobile') + ' 390', 'mobile'], ['tablet', t('Tablet') + ' 820', 'tablet'], ['laptop', t('Laptop') + ' 1280', 'laptop'], ['desktop', t('Desktop') + ' 1440', 'desktop']]
      .map(([v, l, ic]) => ({ label: l, icon: ic, checked: k === v, run: () => setVp(v) })),
    { custom: (row) => { const inp = h('input', { class: 'tx', type: 'number', min: 200, max: 3840, step: 10, placeholder: t('Custom width'), value: k === 'custom' ? customW(r) : '', style: 'width:100%' }); inp.onchange = () => { const w = Math.round(Number(inp.value)); hideMenu(); if (w >= 200) setVp('custom:' + w); }; row.append(inp, h('span', { class: 'hint' }, 'px')); } },
    { sep: true },
    { label: t('Device frames on mobile and tablet'), checked: S.device, run: () => { S.device = !S.device; persist(); renderRound(true); } },
    { label: t('Sync scroll'), checked: S.sync, run: () => { S.sync = !S.sync; persist(); } },
    { label: t('Full height (no inner scroll)'), checked: S.overflow, run: () => setOverflow(!S.overflow) },
    { sep: true },
    { head: t('Card size') },
    { custom: (row) => { const sg = h('div', { class: 'seg', style: 'width:100%' }); seg(sg, [['auto', t('Auto')], ['s', 'S'], ['m', 'M'], ['l', 'L'], ['xl', 'XL']], S.cardPreset, (v) => { hideMenu(); setCardPreset(v); }); [...sg.children].forEach(b => { b.style.flex = '1'; }); row.append(sg); } },
    { label: t('Reset resized cards'), icon: 'resize', disabled: !Object.keys(S.cardSizes[r?.id] || {}).length || null, run: () => resetCardSizes(r) },
    { sep: true },
    { head: t('Zoom') },
    { label: t('Zoom in'), kbd: '+', icon: 'plus', run: () => zoomAll(1) },
    { label: t('Zoom out'), kbd: '−', icon: 'minus', run: () => zoomAll(-1) },
    { label: t('Fit'), kbd: '0', checked: S.zoom === 'fit', run: () => zoomAll(0) },
  ]);
}

// ---------------- menu popover ----------------
function showMenu(anchor, items) {
  const m = $('#menu'); m.innerHTML = '';
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { m.append(h('div', { class: 'msep' })); continue; }
    if (it.head) { m.append(h('div', { class: 'mh' }, it.head)); continue; }
    if (it.custom) { const row = h('div', { class: 'mrow' }); it.custom(row); m.append(row); continue; }
    if (it.text) { const el = h('div', { class: 'mtext' }); if (it.title) el.append(h('b', {}, it.title)); el.append(it.text); m.append(el); continue; }
    m.append(h('button', { class: 'mi', role: 'menuitem', title: it.title || null, 'data-tip-pos': 'left', disabled: it.disabled || null, onclick: () => { hideMenu(); it.run(); } },
      h('span', { class: 'ck', html: it.checked ? I.check : (it.icon ? I[it.icon] : '') }), h('span', { class: 'lb' }, it.label), it.kbd ? h('kbd', {}, it.kbd) : null));
  }
  m.classList.add('show');
  const rc = anchor.getBoundingClientRect();
  const w = m.offsetWidth, hh = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, rc.right - w)) + 'px';
  m.style.top = (rc.bottom + hh + 8 > innerHeight ? Math.max(8, rc.top - hh - 6) : rc.bottom + 6) + 'px';
  setTimeout(() => addEventListener('pointerdown', menuAway, { once: true, capture: true }), 0);
}
function menuAway(e) { if (!$('#menu').contains(e.target)) hideMenu(); else addEventListener('pointerdown', menuAway, { once: true, capture: true }); }
function hideMenu() { $('#menu').classList.remove('show'); }

// ---------------- round view ----------------
let lastSig = '';
let justApproved = null;
function renderRound(force = false) {
  const c = ctx();
  renderTopbar(c);
  const view = $('#view');
  if (SPECIAL_VIEWS.includes(S.layout)) {
    const sig = [S.layout, S.ovScope, S.ovSize, S.mapSubj, S.mapSize, S.roundId, S.data.rounds.map(r => r.id + statusOf(r) + r.variants.map(v => v.ready ? v.mtime : 0).join('.')).join(',')].join('|');
    if (force || sig !== lastSig) { lastSig = sig; frames.clear(); view.innerHTML = ''; view.append(S.layout === 'tree' ? buildTree() : S.layout === 'map' ? buildMap() : buildOverview()); }
    $('#dock').style.display = 'none';
    renderMobileNav(null); renderInspector();
    requestAnimationFrame(layoutFrames);
    return;
  }
  if (!c) {
    view.innerHTML = ''; frames.clear(); lastSig = '';
    view.append(h('div', { class: 'empty' }, h('h2', {}, t('No rounds yet')), h('p', {}, t('When the agent creates design variants they appear here automatically.')), h('p', {}, h('code', {}, 'node scripts/studio.mjs demo'))));
    $('#dock').style.display = 'none';
    renderMobileNav(null); renderInspector();
    return;
  }
  $('#dock').style.display = '';
  if (S.layout === 'focus' && !c.items.some(it => it.fk === S.focusFk)) S.focusFk = c.items[0]?.fk || null;
  const sig = [S.roundId, c.kind, S.layout, S.layout === 'focus' ? S.focusFk : '', c.items.map(it => it.fk + (it.v.ready ? 1 : 0)).join(','), S.layout === 'compare' ? [S.cmp.mode, S.cmp.a, S.cmp.b, JSON.stringify(S.duel)].join() : '', S.layout === 'list' ? S.listSel : '', S.device, currentVpKey(c.target)].join('|');
  if (force || sig !== lastSig) {
    lastSig = sig;
    frames.clear(); cmpState = null;
    view.innerHTML = '';
    view.append(...buildView(c));
    paintBgButton();
  } else {
    for (const it of c.items) for (const f of framesOf(it.fk)) {
      if (it.v.mtime && it.v.mtime !== f.mtime) {
        f.mtime = it.v.mtime; f.errors = []; f.v = it.v; f.it = { ...f.it, v: it.v, r: it.r }; f.r = it.r; updateBadges(it.fk);
        if (STATIC) f.iframe.srcdoc = it.v.html || ''; else f.iframe.src = frameSrc(it.r, it.v);
      }
    }
    updateCards();
  }
  if (!S.active || !c.items.some(it => it.fk === S.active)) S.active = c.items[0]?.fk || null;
  if (force && phone()) mShow(c);
  renderMobileNav(c); renderDock(); renderInspector();
  requestAnimationFrame(layoutFrames);
}

function buildView(c) {
  const out = [];
  if (c.kind === 'approved' && S.layout !== 'focus') return buildApproved(c);
  if (c.kind === 'discarded') {
    out.push(h('div', { class: 'strip' },
      h('button', { class: 'btn sm', html: I.back + `<span>${t('Back to approved')}</span>`, onclick: () => { S.showDiscarded[c.r.id] = false; renderRound(true); } }),
      h('span', { class: 'hint' }, t('Discarded variants of {r}. Select one or more to reuse them in a new round; {x} stays approved.', { r: rnum(c.r.id), x: c.ap.toUpperCase() }))));
  }
  if (c.kind === 'shortlist' && !c.items.length) {
    out.push(h('div', { class: 'empty' }, h('h2', {}, t('Your shortlist is empty')), h('p', {}, t('Star variants in any round to collect them here, compare them and send them to the agent together.'))));
    return out;
  }
  if (S.layout === 'focus') out.push(buildFocus(c));
  else if (S.layout === 'compare') out.push(buildCompare(c));
  else if (S.layout === 'list') out.push(buildList(c));
  else out.push(buildGrid(c));
  return out;
}

function buildGrid(c) {
  const grid = h('div', { class: 'grid' });
  const kinds = new Set(c.items.map(it => it.r.kind));
  const n = c.items.length;
  // terminals and desktop windows keep their real width and scale down: two per row stay readable
  const wide = c.items.some(it => ['tui', 'desktop'].includes(it.r.design));
  const cols = wide ? Math.min(n, 2) : kinds.has('component') && kinds.size === 1 ? Math.min(n, 4) : Math.min(n, 3);
  grid.dataset.cols = Math.max(1, cols);
  c.items.forEach(it => grid.append(buildCard(c, it, { grid: true })));
  let raf = 0;
  grid.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => mOnScroll(grid)); }, { passive: true });
  return grid;
}

// ---------------- phone: one variant at a time ----------------
// The grid scrolls sideways with scroll snap; the tabs and the dots follow it. S.active is the card on screen.
const mGrid = () => $('#view .grid:not(.one)');
const mIndex = (c) => Math.max(0, c.items.findIndex(it => it.fk === S.active));
function renderMobileNav(c = ctx()) {
  const tabs = $('#mTabs'), dots = $('#mDots'); tabs.innerHTML = ''; dots.innerHTML = '';
  if (!c || S.layout !== 'grid' || c.kind === 'approved' || c.items.length < 2) return;
  const d = draft(c.key), cur = mIndex(c);
  c.items.forEach((it, i) => {
    const vd = vdata(it.fk);
    tabs.append(h('button', { class: 'mtab' + (d.selected.includes(it.key) ? ' sel' : ''), role: 'tab', 'aria-selected': String(i === cur), title: labelOf(it), onclick: () => mGo(i) },
      h('span', { class: 'l' }, letterOf(c, it)),
      vd.rating ? h('span', { class: vd.rating > 0 ? 'ok' : 'no', html: vd.rating > 0 ? I.up : I.down }) : null,
      S.stars.includes(it.fk) ? h('span', { class: 'st', html: I.star }) : null));
    dots.append(h('i', { class: i === cur ? 'on' : null }));
  });
}
function mGo(i) { const g = mGrid(); if (g) g.scrollTo({ left: i * g.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
function mOnScroll(g) {
  const c = ctx(); if (!c || !phone() || !g.clientWidth) return;
  const it = c.items[Math.round(g.scrollLeft / g.clientWidth)];
  if (it && it.fk !== S.active) mSetActive(c, it);
}
function mSetActive(c, it) {
  S.active = it.fk;
  // the selection follows the variant on screen, unless several are picked to combine
  const d = draft(c.key);
  if (!TEAM && ['open', 'shortlist'].includes(c.kind) && d.selected.length <= 1 && d.selected[0] !== it.key) { d.selected = [it.key]; persist(); updateCards(); renderDock(); }
  renderMobileNav(c); if (S.insp) renderInspector();
}
// after a rebuild: back to the card that was on screen
function mShow(c) {
  const it = c.items[mIndex(c)]; if (it) mSetActive(c, it);
  requestAnimationFrame(() => { const g = mGrid(); if (g) g.scrollLeft = mIndex(c) * g.clientWidth; });
}

// ---------------- card sizes ----------------
// Per card: drag the corner (width and height), the right edge (width) or the bottom edge (height). Width snaps to
// free widths (a fraction of the row), height is the preview's own; both are remembered per round in this browser. Double-click resets.
function setCardSize(fk, patch) {
  const i = fk.indexOf('/'); const rid = fk.slice(0, i), vid = fk.slice(i + 1);
  const all = (S.cardSizes[rid] ||= {});
  const o = { ...(all[vid] || {}), ...patch };
  for (const k of Object.keys(o)) if (o[k] == null) delete o[k];
  if (Object.keys(o).length) all[vid] = o; else delete all[vid];
  if (!Object.keys(all).length) delete S.cardSizes[rid];
}
function setCardPreset(v) {
  S.cardPreset = v;
  for (const r of vpRounds()) for (const vid of Object.keys(S.cardSizes[r.id] || {})) setCardSize(r.id + '/' + vid, { span: null, wf: null });
  persist(); layoutFrames(); requestAnimationFrame(layoutFrames);
}
function resetCardSizes(r) { if (!r) return; delete S.cardSizes[r.id]; persist(); document.querySelectorAll('.card.sized').forEach(c => c.classList.remove('sized')); layoutFrames(); requestAnimationFrame(layoutFrames); }
function resizeHandles(card, fk) {
  const relayout = () => { card.classList.toggle('sized', !!cardSize(fk)); applySpans(); for (const f of framesOf(fk)) if (f.role === 'card') layoutFrame(f); };
  const make = (dir) => {
    const el = dir === 'c'
      ? h('button', { class: 'rz c', html: I.resize, title: t('Resize (drag; double-click resets)'), 'aria-label': t('Resize card: arrow keys change width and height') })
      : h('div', { class: 'rz ' + dir, 'aria-hidden': 'true', 'data-no-tip': '' });
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId);
      const W = card.parentElement.clientWidth;
      const w0 = card.getBoundingClientRect().width, wrap = card.querySelector('.pv'), h0 = wrap ? wrap.getBoundingClientRect().height : 240;
      const x0 = e.clientX, y0 = e.clientY;
      card.classList.add('resizing');
      let raf = 0;
      const move = (ev) => {
        const p = {};
        if (dir !== 's') { p.wf = Math.round(Math.min(1, Math.max(200 / W, (w0 + ev.clientX - x0) / W)) * 1000) / 1000; p.span = null; }
        if (dir !== 'e') p.h = Math.round(Math.max(100, Math.min(4000, h0 + ev.clientY - y0)));
        setCardSize(fk, p);
        cancelAnimationFrame(raf); raf = requestAnimationFrame(relayout);
      };
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); card.classList.remove('resizing'); persist(); requestAnimationFrame(layoutFrames); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
    el.addEventListener('dblclick', (e) => { e.stopPropagation(); setCardSize(fk, dir === 'e' ? { span: null, wf: null } : dir === 's' ? { h: null } : { span: null, wf: null, h: null }); persist(); relayout(); requestAnimationFrame(layoutFrames); });
    if (dir === 'c') el.addEventListener('keydown', (e) => {
      const cur = cardSize(fk) || {}, wrap = card.querySelector('.pv');
      const wf = cur.wf || card.getBoundingClientRect().width / card.parentElement.clientWidth, hh = cur.h || (wrap ? wrap.getBoundingClientRect().height : 240);
      const step = { ArrowLeft: { wf: Math.max(.15, wf - .05), span: null }, ArrowRight: { wf: Math.min(1, wf + .05), span: null }, ArrowUp: { h: Math.max(100, hh - 40) }, ArrowDown: { h: hh + 40 } }[e.key];
      if (!step) return; e.preventDefault(); e.stopPropagation(); setCardSize(fk, step); persist(); relayout();
    });
    return el;
  };
  return [make('c'), make('e'), make('s')];
}

// Full screen: one variant over the whole screen (Fullscreen API on the document, so menus, toasts and the prompt
// stay usable). When the browser refuses (no user gesture, iframe, iPhone) the same layout is a fixed overlay.
// S.fsMode 'page' keeps the studio around the variant and only lets it take the page height (like 3.x)
function enterFullscreen() {
  if (S.fsMode === 'page') { document.body.classList.add('fs-page'); return; }
  document.body.classList.add('fs');
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}
function leaveFullscreen() {
  document.body.classList.remove('fs', 'fs-page');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
// Esc in real full screen is taken by the browser: follow it back to the gallery
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && S.layout === 'focus') closeFocus(); else requestAnimationFrame(layoutFrames); });
function openFocus(fk) {
  if (!fk) return;
  // a phone already shows one variant at a time
  if (phone()) { S.active = fk; if (S.layout !== 'grid') { S.layout = 'grid'; persist(); renderRail(); } return renderRound(true); }
  if (S.layout !== 'focus') { S.prevLayout = [...SPECIAL_VIEWS, 'focus'].includes(S.layout) ? 'grid' : S.layout; S.scrollBack = $('#stage').scrollTop; }
  S.layout = 'focus'; S.focusFk = fk; S.active = fk;
  enterFullscreen();
  renderRail(); renderRound(true); $('#stage').scrollTop = 0;
}
function setFsMode(m) {
  S.fsMode = m; persist();
  if (S.layout !== 'focus') return toast(m === 'page' ? t('Full screen expands inside the page') : t('Full screen covers the whole screen'));
  leaveFullscreen(); enterFullscreen(); renderRound(true); requestAnimationFrame(layoutFrames);
}
const fsModeBtn = (ib) => S.fsMode === 'page' ? ib('expand', t('Exclusive full screen'), () => setFsMode('screen')) : ib('fit', t('Expand inside the page instead'), () => setFsMode('page'));
function closeFocus() { leaveFullscreen(); S.layout = S.prevLayout || 'grid'; renderRail(); renderRound(true); requestAnimationFrame(() => $('#stage').scrollTop = S.scrollBack || 0); }
function stepFocus(dir) {
  const c = ctx(); if (!c) return;
  const n = c.items.length; const i = c.items.findIndex(it => it.fk === S.focusFk);
  S.focusFk = S.active = c.items[(i + dir + n) % n].fk; renderRound();
}
function buildFocus(c) {
  const idx = Math.max(0, c.items.findIndex(it => it.fk === S.focusFk));
  const it = c.items[idx];
  const wrap = h('div', { class: 'focus' });
  wrap.append(buildCard(c, it, { focus: true }));
  return wrap;
}

function buildApproved(c) {
  const it = c.items[0];
  const others = c.r.variants.length - 1;
  const d = c.r.decision || {};
  const pending = (S.data.pending || []).find(p => p.round === c.r.id && p.action === 'choose');
  const status = STATIC ? null : pending ? h('span', { class: 'tag warn' }, pending.hold_until && Date.parse(pending.hold_until) > Date.now() ? t('can still be undone') : t('waiting for the agent')) : h('span', { class: 'tag good' }, t('received by the agent'));
  const revoke = h('button', { class: 'btn sm ghost', title: t('Tell the agent you no longer approve this design (click twice)'), html: I.undo + `<span>${t('Revoke approval')}</span>` });
  let armed = false;
  revoke.onclick = () => {
    if (!armed) { armed = true; revoke.classList.add('warn'); revoke.lastChild.textContent = t('Click again to revoke'); setTimeout(() => { if (revoke.isConnected) { armed = false; revoke.classList.remove('warn'); revoke.lastChild.textContent = t('Revoke approval'); } }, 4000); return; }
    revokeApproval(c);
  };
  const bar = h('div', { class: 'banner-ok' },
    h('span', { class: 'ok', html: I.check }),
    h('div', {}, h('b', {}, t('Approved: {x}', { x: `${it.v.id.toUpperCase()} · ${it.v.label}` })), ' ', h('small', {}, (d.approved?.at || d.at || '').slice(0, 16).replace('T', ' '))),
    status, h('span', { class: 'sp' }),
    TEAM ? null : revoke,
    others > 0 ? h('button', { class: 'btn sm ghost', title: t('See the other variants of this round to reuse them'), html: I.eye + `<span>${t('Show discarded ({n})', { n: others })}</span>`, onclick: () => { S.showDiscarded[c.r.id] = true; renderRound(true); } }) : null);
  const g = h('div', { class: 'grid one' }); g.append(buildCard(c, it, { one: true }));
  return [bar, g];
}

function buildList(c) {
  if (!S.listSel || !c.items.some(it => it.fk === S.listSel)) S.listSel = c.items[0].fk;
  const items = h('div', { class: 'lv-items' });
  const sel = c.items.find(it => it.fk === S.listSel);
  for (const it of c.items) {
    const thumb = h('div', { class: 'lv-thumb' });
    if (it.v.ready) thumb.append(makeFrame(it, { role: 'thumb' }).wrap);
    const vd = vdata(it.fk);
    const picked = draft(c.key).selected.includes(it.key);
    items.append(h('button', { class: 'lv-item' + (picked ? ' sel' : ''), 'data-key': it.key, 'aria-current': String(it.fk === S.listSel), onclick: () => { S.listSel = it.fk; S.active = it.fk; renderRound(); } },
      thumb,
      h('div', { class: 'lv-meta' }, h('b', {}, labelOf(it)), h('span', {}, h('span', { class: 'letter', style: 'min-width:22px;height:22px;font-size:11px' }, letterOf(c, it)),
        vd.rating > 0 ? h('span', { html: I.up, style: 'color:var(--good);display:grid' }) : vd.rating < 0 ? h('span', { html: I.down, style: 'color:var(--bad);display:grid' }) : null,
        S.stars.includes(it.fk) ? h('span', { html: I.star, style: 'color:var(--acc);display:grid' }) : null))));
  }
  const detail = h('div', {}); detail.append(buildCard(c, sel));
  return h('div', { class: 'listv' }, items, detail);
}

// ---------------- card ----------------
function buildCard(c, it, opts = {}) {
  const { v, fk, key } = it;
  const vd = vdata(fk);
  const card = h('article', { class: 'card', 'data-key': key, 'data-fk': fk });
  const ib = (name, title, onclick, extra = {}) => h('button', { class: 'ib sm' + (extra.hov ? ' hov' : ''), title, 'aria-label': title, html: I[name], onclick, ...extra, hov: null });
  const actions = TEAM ? [
    ib('up', t('Vote up'), () => teamVote(it, 'up'), { 'data-tv': 'up' }),
    ib('down', t('Vote down'), () => teamVote(it, 'down'), { 'data-tv': 'down' }),
    ib('comment', t('Comment'), () => { S.cmOpen[fk] = !S.cmOpen[fk]; updateCards(); }, { 'data-cm': '' }),
    ...(opts.focus ? [fsModeBtn(ib), ib('shrink', t('Exit full screen (Esc)'), () => closeFocus())] : [ib('expand', t('Full screen (Z)'), () => openFocus(fk), { 'data-fs': '' })]),
  ] : [
    ib('up', t('Like'), () => rate(fk, 1), { 'data-rate': 'up', hov: true }),
    ib('down', t('Dislike'), () => rate(fk, -1), { 'data-rate': 'down', hov: true }),
    v.notes ? ib('info', t('Description (N for all)'), () => { S.notesOpen[fk] = !S.notesOpen[fk]; updateCards(); }, { 'data-notes': '', hov: true }) : null,
    ib('comment', t('Note on this variant'), () => { S.cmOpen[fk] = !S.cmOpen[fk]; updateCards(); if (S.cmOpen[fk]) setTimeout(() => card.querySelector('textarea.cm')?.focus()); }, { 'data-cm': '' }),
    STATIC ? null : ib('qr', t('Open this variant on your phone'), (e) => openQr(e.currentTarget, it), { hov: true }),
    ib('star', t('Add to shortlist'), () => toggleStar(fk), { 'data-star': '' }),
    ...(opts.focus ? [fsModeBtn(ib), ib('shrink', t('Exit full screen (Esc)'), () => closeFocus())] : [ib('expand', t('Full screen (Z)'), () => openFocus(fk), { 'data-fs': '' })]),
    ib('more', t('More'), (e) => cardMenu(e.currentTarget, c, it)),
  ];
  const sub = c.kind === 'shortlist' ? `${rnum(it.r.id)} ${it.r.title}` : '';
  const nav = opts.focus && c.items.length > 1 ? [
    h('button', { class: 'ib sm', title: t('Previous (←)'), 'aria-label': t('Previous (←)'), html: I.chevL, onclick: () => stepFocus(-1) }),
    h('span', { class: 'hint' }, `${c.items.indexOf(it) + 1} / ${c.items.length}`),
    h('button', { class: 'ib sm', title: t('Next (→)'), 'aria-label': t('Next (→)'), html: I.chevR, onclick: () => stepFocus(1) })] : [];
  card.append(h('div', { class: 'card-h', onclick: (e) => { if (!e.target.closest('button,a,select,.badge')) toggleSel(key, fk); } },
    h('button', { class: 'letter', title: TEAM ? '' : t('Select ({n})', { n: c.items.indexOf(it) + 1 }), onclick: () => toggleSel(key, fk) }, letterOf(c, it)),
    h('div', { class: 'card-t' }, h('b', {}, labelOf(it)), sub ? h('small', {}, sub) : null),
    opts.grid ? h('small', { class: 'pos' }, t('{i} of {n}', { i: c.items.indexOf(it) + 1, n: c.items.length })) : null,
    h('button', { class: 'badge votes', 'data-votes': fk, onclick: (e) => votesMenu(e.currentTarget, it) }),
    h('button', { class: 'badge err', 'data-err': fk, onclick: () => toast(framesOf(fk).flatMap(f => f.errors).slice(-3).join(' · ')) }),
    h('button', { class: 'badge aud', 'data-aud': fk, onclick: () => { S.active = fk; S.inspTab = 'audit'; toggleInsp(true); } }),
    ...nav,
    h('div', { class: 'card-a' }, ...actions.filter(Boolean))));
  card.append(h('div', { class: 'notes' }, v.notes || ''));
  card.addEventListener('pointerdown', () => { if (S.active !== fk) { S.active = fk; document.querySelectorAll('.card.active').forEach(x => x.classList.remove('active')); card.classList.add('active'); if (S.insp) renderInspector(); } });
  const stage = h('div', { class: 'stage' });
  if (!v.ready || (STATIC && !v.html && !v.url)) stage.append(h('div', { class: 'skeleton' }, t('The agent is writing this variant…')));
  else { const f = makeFrame(it, { role: opts.focus ? 'focus' : 'card' }); stage.append(f.wrap, zoomControl(f)); }
  // phones: variant theme and background float on the preview (the top bar has no room)
  if (opts.grid || opts.one) stage.append(h('div', { class: 'mvc' },
    h('button', { class: 'ib', 'data-theme': '', html: I[S.theme === 'dark' ? 'moon' : 'sun'], title: t('Variant theme: light / dark (D)'), onclick: () => setTheme(S.theme === 'light' ? 'dark' : 'light') }),
    h('button', { class: 'ib', popovertarget: 'bgPop', html: '<span class="sw"></span>' })));
  card.append(stage);
  if (bareOn(it.r) && !opts.focus) {
    card.classList.add('bare');
    card.append(h('button', { class: 'bare-btn', type: 'button', title: t('Variant options'), 'aria-label': t('Variant options'), 'aria-expanded': 'false',
      onclick: () => openBare(card, true) }, h('b', {}, letterOf(c, it)), h('span', { html: I.more })));
  }
  if (opts.grid) { const [c1, e1, s1] = resizeHandles(card, fk); stage.append(c1); card.append(e1, s1); card.classList.toggle('sized', !!cardSize(fk)); }
  const ann = h('ol', { class: 'ann' });
  const cm = h('textarea', { class: 'cm', rows: 1, placeholder: TEAM ? t('Your comment for the team…') : t('Note on this variant…') });
  cm.value = TEAM ? (myVote(it)?.comment || '') : (vd.comment || '');
  cm.addEventListener('input', () => {
    autoGrow(cm);
    if (TEAM) { teamComment(it, cm.value); return; }
    vd.comment = cm.value; persist(); renderDock();
  });
  card.append(h('div', { class: 'card-f' }, ann, cm));
  requestAnimationFrame(() => autoGrow(cm));
  paintCard(card);
  setTimeout(() => updateBadges(fk));
  return card;
}
// frame-only cards keep their header in a floating bar, opened from the small button on the card
function openBare(card, on) {
  document.querySelectorAll('.card.bare.open').forEach(x => { if (x !== card || !on) { x.classList.remove('open'); x.querySelector('.bare-btn')?.setAttribute('aria-expanded', 'false'); } });
  if (!on) return;
  card.classList.add('open'); card.querySelector('.bare-btn').setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => card.querySelector('.card-h button')?.focus({ preventScroll: true }));
}
addEventListener('pointerdown', (e) => { if (!e.target.closest('.card.bare.open, .menu, [popover]')) openBare(null, false); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.querySelector('.card.bare.open')) { e.stopPropagation(); const c = document.querySelector('.card.bare.open'); openBare(null, false); c.querySelector('.bare-btn')?.focus(); } }, true);
function setBare(on) { S.bare = on; persist(); renderTopbar(); renderRound(true); }
async function exportLogoSet(it) {
  if (STATIC) return toast(t('Exports need the studio server'));
  try {
    toast(t('Rendering the logo set…'));
    const src = await (await fetch(`/r/${encodeURIComponent(it.r.id)}/${encodeURIComponent(it.v.file)}`)).text();
    const all = src.match(/<svg\b[\s\S]*?<\/svg>/gi) || [];
    const icon = all.find(x => /^<svg\b[^>]*\bdata-vs-icon\b/i.test(x)) || null, mark = all.find(x => x !== icon) || icon;
    if (!mark) return toast(t('No inline <svg> found in this variant: the usage previews need the mark as an <svg> element.'));
    const files = await vsRaster.render(mark, icon);
    const res = await (await fetch('/api/logo-set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ round: it.r.id, variant: it.v.id, files }) })).json();
    if (!res.ok) throw new Error(res.error || '?');
    toast(t('Logo set saved: {x}', { x: res.dir }), { kind: 'good', ms: 7000 });
  } catch (e) { toast(t('Logo export failed: {x}', { x: e.message })); }
}
function exportAs(it, as) {
  if (STATIC) return toast(t('Exports need the studio server'));
  download(`/api/export?round=${encodeURIComponent(it.r.id)}&variant=${encodeURIComponent(it.v.id)}&as=${as}`, `${it.r.id}-${it.v.id}${as === 'single' ? '.html' : '-' + as + '.zip'}`);
}
function cardMenu(anchor, c, it) {
  const fk = it.fk;
  const canSend = !STATIC || true;
  showMenu(anchor, [
    ...shellMenu(it, anchor),
    { label: t('More like this'), icon: 'spark', run: () => sendQuick('more', it) },
    { label: t('Compare with…'), icon: 'compare', run: () => { S.cmp.a = fk; S.cmp.b = null; setLayout('compare'); } },
    { sep: true },
    { label: t('Tune and fonts'), icon: 'sliders', run: () => { S.active = fk; S.inspTab = 'tune'; toggleInsp(true); } },
    { label: t('CSS tokens'), icon: 'sliders', run: () => { S.active = fk; S.inspTab = 'tokens'; toggleInsp(true); } },
    { label: t('Checklist'), icon: 'check', run: () => { S.active = fk; S.inspTab = 'checklist'; toggleInsp(true); } },
    { label: t('Accessibility audit'), icon: 'warn', run: () => { S.active = fk; S.inspTab = 'audit'; toggleInsp(true); } },
    { sep: true },
    { head: t('Export') },
    { label: t('PNG image'), icon: 'image', run: () => exportImage(it, 'png') },
    { label: t('JPG image'), icon: 'image', run: () => exportImage(it, 'jpeg') },
    { label: t('HTML with my changes'), icon: 'download', title: t('Tokens, text edits, controls and fonts applied; styles and images inlined'), run: () => exportHtml(it, 'live') },
    { label: t('Original HTML'), icon: 'download', title: t('The file as the agent wrote it'), run: () => exportHtml(it, 'source') },
    it.v.url ? null : { label: t('Single HTML file (all inlined)'), icon: 'download', title: t('Styles, brand, fonts and images inlined in one file'), run: () => exportAs(it, 'single') },
    it.v.url ? null : { label: t('HTML + CSS + JS (.zip)'), icon: 'download', title: t('index.html, style.css and script.js'), run: () => exportAs(it, 'split') },
    it.v.url ? null : { label: t('HTML + shared CSS (.zip)'), icon: 'download', title: t('index.html, style.css for this variant and shared.css for the global and round styles'), run: () => exportAs(it, 'shared') },
    it.r.design === 'logo' && !it.v.url ? { label: t('Export logo set'), icon: 'image', title: t('SVG, PNG 16–1024, favicon.ico, apple-touch-icon and maskable icon, saved in the project'), run: () => exportLogoSet(it) } : null,
    canSend ? { label: t('Ask the agent for a React component'), icon: 'code', run: () => sendQuick('export', it, { framework: 'React' }) } : null,
    canSend ? { label: t('Ask the agent for a Vue component'), icon: 'code', run: () => sendQuick('export', it, { framework: 'Vue' }) } : null,
    canSend ? { label: t('Ask the agent for a Svelte component'), icon: 'code', run: () => sendQuick('export', it, { framework: 'Svelte' }) } : null,
    canSend ? { label: t('Ask the agent for Tailwind HTML'), icon: 'code', run: () => sendQuick('export', it, { framework: 'Tailwind HTML' }) } : null,
    { sep: true },
    { label: t('Reload preview'), icon: 'refresh', run: () => framesOf(fk).forEach(f => { if (STATIC) f.iframe.srcdoc = it.v.html || ''; else f.iframe.src = frameSrc(it.r, it.v); }) },
  ]);
}
function paintCard(card) {
  const c = ctx(); if (!c) return;
  const key = card.dataset.key, fk = card.dataset.fk;
  const d = draft(c.key); const vd = vdata(fk);
  const it = itemOf(fk);
  const sel = d.selected.includes(key);
  const isAp = it && approvedOf(it.r) === it.v.id;
  card.classList.toggle('approved', !!isAp);
  card.classList.toggle('sel', sel && !isAp && !TEAM);
  card.classList.toggle('down', vd.rating < 0 && !sel);
  card.querySelector('[data-rate=up]')?.classList.toggle('on-up', vd.rating > 0);
  card.querySelector('[data-rate=down]')?.classList.toggle('on-down', vd.rating < 0);
  card.querySelector('[data-rate=up]')?.setAttribute('aria-pressed', String(vd.rating > 0));
  card.querySelector('[data-rate=down]')?.setAttribute('aria-pressed', String(vd.rating < 0));
  card.querySelector('[data-star]')?.classList.toggle('on-star', S.stars.includes(fk));
  if (TEAM && it) { const mv = myVote(it); card.querySelector('[data-tv=up]')?.classList.toggle('on-up', mv?.vote === 'up'); card.querySelector('[data-tv=down]')?.classList.toggle('on-down', mv?.vote === 'down'); }
  const showNotes = S.notesAll || !!S.notesOpen[fk];
  card.querySelector('.notes')?.classList.toggle('show', showNotes);
  card.querySelector('[data-notes]')?.setAttribute('aria-pressed', String(showNotes));
  const hasCm = TEAM ? !!(it && myVote(it)?.comment) : !!(vd.comment || vd.ann.length);
  card.querySelector('.card-f').classList.toggle('show', hasCm || !!S.cmOpen[fk]);
  card.querySelector('[data-cm]')?.setAttribute('aria-pressed', String(hasCm || !!S.cmOpen[fk]));
  const ol = card.querySelector('.ann'); ol.innerHTML = '';
  if (!TEAM) vd.ann.forEach((a, i) => ol.append(h('li', {},
    h('span', { class: 'dot' + (a.lock ? ' lock' : ''), html: a.lock ? I.lock : String(i + 1) }),
    h('span', {}, a.lock ? t('Keep exactly as it is') : a.note, h('span', { class: 'el' }, `${a.tag}${a.text ? ' “' + a.text + '”' : ''}`)),
    h('button', { class: 'x', title: t('Remove'), 'aria-label': t('Remove'), onclick: () => { vd.ann.splice(i, 1); persist(); paintCard(card); framesOf(fk).forEach(sendFrame); renderDock(); } }, '×'))));
}
function updateCards() {
  document.querySelectorAll('.card[data-key]').forEach(paintCard);
  const c = ctx();
  if (c) {
    document.querySelectorAll('.lv-item[data-key]').forEach(b => b.classList.toggle('sel', draft(c.key).selected.includes(b.dataset.key)));
    document.querySelectorAll('.film .th').forEach((b, i) => b.classList.toggle('sel', !!c.items[i] && draft(c.key).selected.includes(c.items[i].key)));
  }
  document.querySelectorAll('[data-votes]').forEach(b => paintVotes(b));
  renderMobileNav(c);
}
function updateBadges(fk) {
  const errs = framesOf(fk).reduce((n, f) => n + f.errors.length, 0);
  document.querySelectorAll(`[data-err="${CSS.escape(fk)}"]`).forEach(b => { b.classList.toggle('show', errs > 0); b.innerHTML = I.bug + t('{n} errors', { n: errs }); b.title = t('JavaScript errors in this preview'); });
  const a = S.audit[fk];
  document.querySelectorAll(`[data-aud="${CSS.escape(fk)}"]`).forEach(b => {
    b.classList.toggle('show', !!a && !TEAM); b.classList.toggle('clean', !!a && !a.length);
    b.innerHTML = a && a.length ? I.warn + a.length : I.check + 'a11y';
    b.title = a && a.length ? t('{n} accessibility issues: click for details', { n: a.length }) : t('No accessibility issues');
  });
  document.querySelectorAll(`[data-votes="${CSS.escape(fk)}"]`).forEach(paintVotes);
}

function toggleSel(key, fk) {
  if (TEAM) return;
  const c = ctx(); if (!c) return;
  if (c.kind === 'approved') return toast(t('This round is approved. Use “Show discarded” to reuse other variants.'));
  const d = draft(c.key);
  const i = d.selected.indexOf(key);
  if (i >= 0) d.selected.splice(i, 1); else d.selected.push(key);
  if (fk) S.active = fk;
  persist(); updateCards(); renderDock();
}
function rate(fk, val) { const vd = vdata(fk); vd.rating = vd.rating === val ? 0 : val; persist(); updateCards(); renderDock(); }
function toggleStar(fk) {
  const i = S.stars.indexOf(fk);
  if (i >= 0) S.stars.splice(i, 1); else { S.stars.push(fk); toast(t('Added to shortlist')); }
  persist(); renderRail(); updateCards();
  if (S.roundId === SHORT) renderRound(true);
}

// ---------------- team votes on cards ----------------
const votesFor = (it) => (S.data.votes?.[it.r.id]?.[it.v.id]) || {};
const myVote = (it) => S.voter ? votesFor(it)[S.voter] : null;
function paintVotes(b) {
  const it = itemOf(b.dataset.votes); if (!it) return;
  const vs = Object.entries(votesFor(it));
  const up = vs.filter(([, v]) => v.vote === 'up').length, down = vs.filter(([, v]) => v.vote === 'down').length, cm = vs.filter(([, v]) => v.comment).length;
  b.classList.toggle('show', vs.length > 0);
  b.innerHTML = '';
  b.append(h('span', { html: I.team, style: 'display:grid' }), `${up ? '+' + up : ''}${up && down ? ' ' : ''}${down ? '−' + down : ''}${cm ? ' · ' + cm : ''}` || String(vs.length));
  b.title = t('Team votes: {u} up, {d} down, {c} comments', { u: up, d: down, c: cm });
}
function votesMenu(anchor, it) {
  const vs = Object.entries(votesFor(it));
  showMenu(anchor, [{ head: t('Team votes on {x}', { x: labelOf(it) }) }, ...vs.map(([who, v]) => ({ title: `${who} ${v.vote === 'up' ? '👍' : v.vote === 'down' ? '👎' : ''}`, text: v.comment || '—' }))]);
}
