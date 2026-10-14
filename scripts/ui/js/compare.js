// Variant Studio 3.0 — compare (swipe, overlay, A vs B tournament, before/after), overview grid, version tree.
'use strict';

let cmpState = null;
function compareCandidates(c) {
  // the round's variants, plus the parent round's (before/after)
  const list = [];
  const seen = new Set();
  const add = (it, tag) => { if (!it || seen.has(it.fk) || !it.v.ready) return; seen.add(it.fk); list.push({ ...it, tag }); };
  if (c.kind === 'shortlist') c.items.forEach(it => add(it, ''));
  else {
    c.r.variants.forEach(v => add({ r: c.r, v, key: v.id, fk: c.r.id + '/' + v.id }, ''));
    const p = c.r.parent && round(c.r.parent);
    if (p) p.variants.forEach(v => add({ r: p, v, key: p.id + '/' + v.id, fk: p.id + '/' + v.id }, t('before')));
  }
  return list;
}
const candLabel = (c, it) => `${it.r.id === c.target?.id && c.kind !== 'shortlist' ? '' : rnum(it.r.id) + ' '}${it.v.id.toUpperCase()} · ${it.v.label}${it.tag ? ' (' + it.tag + ')' : ''}`;

function buildCompare(c) {
  const cands = compareCandidates(c);
  const box = h('div', {});
  const modes = h('div', { class: 'seg' });
  seg(modes, [['swipe', t('Swipe'), I.compare], ['overlay', t('Overlay'), I.layers], ['duel', t('A vs B'), I.trophy]], S.cmp.mode, (m) => { S.cmp.mode = m; persist(); renderRound(true); });
  if (cands.length < 2) {
    box.append(h('div', { class: 'strip' }, modes), h('div', { class: 'empty' }, h('h2', {}, t('Nothing to compare yet')), h('p', {}, t('Compare needs at least two ready variants.'))));
    return box;
  }
  if (S.cmp.mode === 'duel') { box.append(h('div', { class: 'strip' }, modes), buildDuel(c, cands)); return box; }
  const d = draft(c.key);
  const byFk = (fk) => cands.find(x => x.fk === fk);
  const A = byFk(S.cmp.a) || cands.find(x => d.selected.includes(x.key)) || cands[0];
  const parentPick = c.r && c.r.parent ? cands.find(x => x.r.id === c.r.parent && approvedOf(x.r) === x.v.id) || cands.find(x => x.r.id === c.r.parent && x.r.decision?.selected?.includes(x.v.id)) : null;
  const B = (byFk(S.cmp.b) && S.cmp.b !== A.fk ? byFk(S.cmp.b) : null) || cands.find(x => x !== A && d.selected.includes(x.key)) || cands.find(x => x !== A && x.r.id === A.r.id) || cands.find(x => x !== A);
  S.cmp.a = A.fk; S.cmp.b = B.fk;
  const pick = (cur, on) => { const s = h('select', { class: 'tx' }); cands.forEach(it => s.append(h('option', { value: it.fk, selected: it.fk === cur }, candLabel(c, it)))); s.onchange = () => on(s.value); return s; };
  const fa = makeFrame(A, { role: 'layer', tag: 'a' }); const fb = makeFrame(B, { role: 'layer', tag: 'b' });
  fa.wrap.classList.add('layer', 'top'); fb.wrap.classList.add('layer');
  const body = h('div', { class: 'cmp-b' + (S.cmp.mode === 'overlay' && S.cmp.diff ? ' diff' : '') }, fb.wrap, fa.wrap);
  const head = h('div', { class: 'cmp-h' }, modes,
    pick(A.fk, v => { S.cmp.a = v; renderRound(true); }), h('span', { class: 'lbl' }, 'vs'), pick(B.fk, v => { S.cmp.b = v; renderRound(true); }),
    h('button', { class: 'ib', title: t('Swap'), 'aria-label': t('Swap'), html: I.redo, onclick: () => { [S.cmp.a, S.cmp.b] = [S.cmp.b, S.cmp.a]; renderRound(true); } }),
    parentPick && c.kind !== 'shortlist' ? h('button', { class: 'btn sm ghost', title: t('Compare with the version picked in the previous round'), onclick: () => { S.cmp.b = parentPick.fk; if (S.cmp.a === parentPick.fk) S.cmp.a = cands.find(x => x.r.id === c.r.id)?.fk; renderRound(true); } }, t('Before / after')) : null,
    h('span', { class: 'sp' }));
  if (S.cmp.mode === 'overlay') {
    const op = h('input', { type: 'range', min: 0, max: 100, value: S.cmp.opacity, 'aria-label': t('Opacity') });
    op.oninput = () => { S.cmp.opacity = Number(op.value); layoutCompare(); };
    const diff = h('label', { class: 'hint', style: 'display:flex;gap:6px;align-items:center' }, h('input', { type: 'checkbox', checked: S.cmp.diff || null, onchange: (e) => { S.cmp.diff = e.target.checked; body.classList.toggle('diff', S.cmp.diff); } }), t('Difference'));
    head.append(h('span', { class: 'lbl' }, t('Opacity')), op, diff);
  } else head.append(h('span', { class: 'hint' }, t('Drag the handle, or double-click to jump')));
  const tags = [h('span', { class: 'ctag', style: 'left:10px' }, shortKey(A.r.id === c.r?.id ? A.v.id : A.fk)), h('span', { class: 'ctag', style: 'right:10px' }, shortKey(B.r.id === c.r?.id ? B.v.id : B.fk))];
  body.append(...tags);
  let handle = null;
  if (S.cmp.mode === 'swipe') {
    handle = h('div', { class: 'handle' }, h('div', { class: 'handle-hit' }));
    body.append(handle);
    let drag = false;
    const move = (x) => { const rc = body.getBoundingClientRect(); S.cmp.pos = Math.max(0, Math.min(100, (x - rc.left) / rc.width * 100)); layoutCompare(); };
    handle.addEventListener('pointerdown', (e) => { drag = true; handle.setPointerCapture(e.pointerId); body.style.pointerEvents = 'none'; handle.style.pointerEvents = 'auto'; });
    handle.addEventListener('pointermove', (e) => drag && move(e.clientX));
    handle.addEventListener('pointerup', () => { drag = false; body.style.pointerEvents = ''; });
    body.addEventListener('dblclick', (e) => move(e.clientX));
  }
  box.append(h('div', { class: 'cmp' }, head, body));
  cmpState = { body, fa, fb, handle };
  return box;
}
function layoutCompare() {
  if (!cmpState || !cmpState.body.isConnected) return;
  const { body, fa, fb, handle } = cmpState;
  const w = body.clientWidth;
  layoutFrame(fa, w); layoutFrame(fb, w);
  const H = Math.max(parseFloat(fa.wrap.style.height) || 0, parseFloat(fb.wrap.style.height) || 0);
  body.style.height = H + 'px';
  fa.wrap.style.width = fb.wrap.style.width = w + 'px';
  if (S.cmp.mode === 'swipe') { fa.wrap.style.clipPath = `inset(0 ${100 - S.cmp.pos}% 0 0)`; fa.wrap.style.opacity = ''; if (handle) handle.style.left = S.cmp.pos + '%'; }
  else { fa.wrap.style.clipPath = ''; fa.wrap.style.opacity = String(S.cmp.opacity / 100); }
}

// ---------------- A vs B tournament ----------------
function buildDuel(c, cands) {
  const pool = cands.filter(x => c.kind === 'shortlist' || x.r.id === c.r.id);
  const key = c.key;
  let st = S.duel[key];
  if (!st || st.n !== pool.length) {
    const pairs = [];
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) pairs.push(Math.random() < .5 ? [pool[i].fk, pool[j].fk] : [pool[j].fk, pool[i].fk]);
    pairs.sort(() => Math.random() - .5);
    st = S.duel[key] = { pairs, i: 0, wins: {}, n: pool.length };
  }
  const wrap = h('div', {});
  const total = st.pairs.length;
  if (st.i >= total) {
    const ranking = pool.slice().sort((a, b) => (st.wins[b.fk] || 0) - (st.wins[a.fk] || 0));
    const d = draft(c.key);
    wrap.append(h('div', { class: 'duel-h' }, h('b', {}, t('Ranking')), h('span', { class: 'hint' }, t('{n} match-ups decided', { n: total }))));
    const ol = h('ol', { class: 'rank' });
    ranking.forEach((it, i) => ol.append(h('li', {}, h('span', { class: 'pos' }, String(i + 1)), h('span', { class: 'letter' }, letterOf(c, it)), h('span', {}, labelOf(it)), h('span', { class: 'w' }, t('{n} wins', { n: st.wins[it.fk] || 0 })))));
    wrap.append(ol, h('div', { class: 'strip' },
      h('button', { class: 'btn pri', onclick: () => { d.selected = [ranking[0].key]; d.ranking = ranking.map(x => x.key); persist(); setLayout('grid'); toast(t('{x} selected, ranking attached to your next decision', { x: shortKey(ranking[0].key) })); } }, t('Select the winner')),
      h('button', { class: 'btn', onclick: () => { d.ranking = ranking.map(x => x.key); persist(); renderDock(); toast(t('Ranking attached to your next decision')); } }, t('Attach ranking only')),
      h('button', { class: 'btn ghost', onclick: () => { delete S.duel[key]; renderRound(true); } }, t('Play again'))));
    return wrap;
  }
  const [fa, fb] = st.pairs[st.i];
  const A = pool.find(x => x.fk === fa), B = pool.find(x => x.fk === fb);
  const vote = (win) => { st.wins[win] = (st.wins[win] || 0) + 1; st.i++; renderRound(true); };
  S.duelVote = (side) => vote(side < 0 ? fa : fb);
  wrap.append(h('div', { class: 'duel-h' }, h('b', {}, t('Which one is better?')), h('span', { class: 'hint' }, t('Click a side or press ← / →')), h('div', { class: 'prog' }, h('i', { style: `width:${(st.i / total) * 100}%` })), h('span', { class: 'hint' }, `${st.i + 1} / ${total}`)));
  const pane = (it, side) => {
    const f = makeFrame(it, { role: 'card', tag: 'duel' + side });
    const stage = h('div', { class: 'stage' }, f.wrap);
    return h('article', { class: 'card', onclick: () => vote(it.fk) }, h('div', { class: 'card-h' }, h('span', { class: 'letter' }, letterOf(c, it)), h('div', { class: 'card-t' }, h('b', {}, labelOf(it))), h('kbd', {}, side < 0 ? '←' : '→')), stage);
  };
  wrap.append(h('div', { class: 'duel' }, pane(A, -1), pane(B, 1)));
  return wrap;
}

// ---------------- overview: every variant at the same scale ----------------
function buildOverview() {
  const cur = round(S.roundId === SHORT ? null : S.roundId) || S.data.rounds[S.data.rounds.length - 1];
  const wrap = h('div', {});
  const scope = h('div', { class: 'seg' });
  seg(scope, [['round', t('This round')], ['group', t('This subject')], ['all', t('All rounds')]], S.ovScope, (v) => { S.ovScope = v; persist(); renderRound(true); });
  const size = h('input', { type: 'range', min: 160, max: 520, step: 20, value: S.ovSize, 'aria-label': t('Tile size') });
  const grid = h('div', { class: 'ov' }); grid.style.setProperty('--tile', S.ovSize + 'px');
  size.oninput = () => { S.ovSize = Number(size.value); grid.style.setProperty('--tile', S.ovSize + 'px'); layoutFrames(); };
  size.onchange = persist;
  wrap.append(h('div', { class: 'ov-h' }, scope, h('span', { class: 'sp' }), h('span', { class: 'hint' }, t('Tile size')), size));
  const rounds = S.data.rounds.filter(r => !cur ? true : S.ovScope === 'round' ? r.id === cur.id : S.ovScope === 'group' ? r.group === cur.group && r.subgroup === cur.subgroup : true).slice().reverse();
  let count = 0;
  for (const r of rounds) {
    if (count > 90) break;
    const g = h('div', { class: 'ov' }); g.style.setProperty('--tile', 'var(--tile-x)');
    wrap.append(h('div', { class: 'ov-g' }, `${rnum(r.id)} ${r.title}`, r.question ? h('span', { class: 'hint', style: 'margin-left:8px;font-weight:400' }, r.question) : null));
    const ap = approvedOf(r);
    const list = h('div', { class: 'ov' }); list.style.setProperty('--tile', S.ovSize + 'px');
    for (const v of r.variants) {
      count++;
      const it = { r, v, key: v.id, fk: r.id + '/' + v.id };
      const box = h('div', { class: 'box' });
      if (v.ready) box.append(makeFrame(it, { role: 'thumb' }).wrap);
      list.append(h('button', { class: 'tile' + (ap === v.id ? ' approved' : ''), title: t('Open {x}', { x: labelOf(it) }), onclick: () => { S.roundId = r.id; S.follow = false; S.prevLayout = 'grid'; S.layout = 'grid'; openFocus(it.fk); } },
        box, h('div', { class: 'meta' }, h('span', { class: 'letter', style: ap === v.id ? 'background:var(--good);color:#0b2a1b' : '' }, v.id.length <= 2 ? v.id.toUpperCase() : '·'), h('b', {}, labelOf(it)),
          S.stars.includes(it.fk) ? h('span', { html: I.star, style: 'color:var(--acc);display:grid' }) : null)));
    }
    wrap.append(list);
  }
  if (!rounds.length) wrap.append(h('div', { class: 'empty' }, h('h2', {}, t('No rounds yet'))));
  wrap.dataset.grid = '1';
  return wrap;
}

// ---------------- version tree ----------------
function buildTree() {
  const wrap = h('div', { class: 'vtree' });
  const bySub = new Map();
  for (const r of S.data.rounds) {
    const k = [r.group || t('Ungrouped'), r.subgroup].filter(Boolean).join(' / ');
    if (!bySub.has(k)) bySub.set(k, []);
    bySub.get(k).push(r);
  }
  const icons = stIcon(), titles = stTitle();
  const node = (r) => {
    const ap = approvedOf(r); const sel = r.decision && r.decision.action !== 'unapprove' ? (r.decision.selected || []).map(s => s.split('/').pop()) : [];
    const st = statusOf(r);
    return h('button', { class: 'node', 'aria-current': String(r.id === S.roundId), title: (r.question || r.title) + ': ' + titles[st], onclick: () => selectRound(r.id) },
      h('span', { class: 'st ' + st, html: icons[st] || '' }), h('small', {}, rnum(r.id)), h('b', {}, r.title),
      h('span', { class: 'lt' }, ...r.variants.map(v => h('i', { class: ap === v.id ? 'ap' : sel.includes(v.id) ? 'sel' : '' }, v.id.length <= 2 ? v.id.toUpperCase() : '·'))));
  };
  for (const [k, list] of [...bySub.entries()].reverse()) {
    const ids = new Set(list.map(r => r.id));
    const kids = (id) => list.filter(r => r.parent === id);
    const roots = list.filter(r => !r.parent || !ids.has(r.parent));
    const ul = h('ul', { class: 'vt' });
    const add = (r, into, depth) => {
      const li = h('li', {}, node(r));
      const ch = kids(r.id);
      if (ch.length && depth < 30) { const sub = h('ul'); ch.forEach(x => add(x, sub, depth + 1)); li.append(sub); }
      into.append(li);
    };
    roots.forEach(r => add(r, ul, 0));
    wrap.append(h('section', { class: 'vt-g' }, h('h3', {}, k, h('small', {}, t('{n} rounds', { n: list.length }))), ul));
  }
  if (!S.data.rounds.length) wrap.append(h('div', { class: 'empty' }, h('h2', {}, t('No rounds yet'))));
  return wrap;
}
