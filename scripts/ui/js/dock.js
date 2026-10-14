// Variant Studio 3.0 — prompt dock: selection, note, chips, references, voice, sending, undo and revoke.
'use strict';

const QUICK = ['More minimal', 'More contrast', 'More whitespace', 'Denser', 'Bigger type', 'Stronger hierarchy', 'Sharper corners', 'Softer corners', 'More premium', 'More playful', 'Warmer palette', 'Cooler palette', 'Fewer colors', 'Better empty and loading states'];
let uploading = 0, sending = false;


// what the user can send for the current context, given the selection
function availableActions(c = ctx()) {
  if (!c || TEAM) return [];
  const n = draft(c.key).selected.length;
  const L = [];
  if (c.kind === 'approved') {
    L.push({ action: 'revise', label: t('Request changes to the approved design'), ok: true });
    L.push({ action: 'unapprove', label: t('Revoke approval'), ok: true });
    return L;
  }
  L.push({ action: 'choose', label: t('Approve'), ok: n === 1 && c.kind !== 'discarded' });
  L.push({ action: 'revise', label: c.kind === 'discarded' ? t('Bring back and revise') : t('Request changes'), ok: n >= 1 });
  L.push({ action: 'remix', label: t('Combine the selected'), ok: n >= 2 });
  L.push({ action: 'more', label: t('More like this'), ok: n === 1 });
  L.push({ action: 'regenerate', label: t('Start over'), ok: c.kind === 'open' });
  return L.filter(a => a.ok);
}

// ---------------- render ----------------
function renderDock() {
  const c = ctx();
  const dock = $('#dock');
  const special = ['tree', 'overview'].includes(S.layout);
  dock.style.display = !c || special ? 'none' : '';
  renderSent();
  if (!c || special) return;
  const d = draft(c.key);
  const row = $('.dk-row');
  // team reviewers: no decisions, just who they are
  let vb = $('.voterbar');
  if (TEAM) {
    row.style.display = 'none'; $('#chips').classList.remove('show'); $('#refs').innerHTML = '';
    if (!vb) { vb = h('div', { class: 'voterbar' }); $('.dk').append(vb); }
    vb.innerHTML = '';
    vb.append(h('span', {}, S.voter ? h('span', {}, t('Reviewing as'), ' ', h('b', {}, S.voter)) : t('Enter your name to vote')),
      h('span', { class: 'sp', style: 'flex:1' }),
      h('span', { class: 'hint' }, t('Use 👍 👎 and the comment on each card')),
      h('button', { class: 'btn sm', onclick: () => S.voter ? openTeam() : askVoterName() }, S.voter ? t('Change name') : t('Enter name')),
      STATIC && S.voter ? h('button', { class: 'btn sm pri', html: I.download + `<span>${t('Download my votes')}</span>`, onclick: downloadVotes }) : null);
    return;
  }
  vb?.remove(); row.style.display = '';

  // selection
  const ch = $('#chosen'); ch.innerHTML = '';
  if (d.selected.length) {
    ch.append(h('b', {}, d.selected.map(shortKey).join(' + ')));
    const extras = changeCount(c);
    if (extras) ch.append(h('span', { class: 'hint', title: t('Comments, edits and tweaks that go with the decision') }, '· ' + extras));
    ch.title = t('Selected. Click a letter on a card (or press 1–9) to change the selection.');
  } else { ch.append(h('span', {}, t('Select a variant'))); ch.title = t('Click a card or press 1–9'); }

  // note
  const note = $('#note');
  if (document.activeElement !== note) note.value = d.note || '';
  note.placeholder = c.kind === 'approved' ? t('What should change in the approved design?') : d.selected.length > 1 ? t('What to take from each one…') : d.selected.length ? t('What should change? (optional)') : t('Describe what you want, or select a variant first');
  autoGrow(note);

  // buttons
  const acts = availableActions(c);
  const has = (a) => acts.some(x => x.action === a);
  const bC = $('#bChoose'), bR = $('#bRevise'), bM = $('#bMore');
  bC.innerHTML = I.check + `<span>${t('Approve')}</span>`;
  bC.title = t('Approve the selected variant (Ctrl/⌘ Enter)');
  bC.style.display = c.kind === 'approved' || c.kind === 'discarded' ? 'none' : '';
  bC.disabled = !has('choose') || sending || null;
  const remix = d.selected.length >= 2 && has('remix');
  bR.innerHTML = (remix ? I.layers : I.redo) + `<span>${remix ? t('Combine') : c.kind === 'discarded' ? t('Bring back') : t('Request changes')}</span>`;
  bR.title = remix ? t('Ask for a new round that blends the selected variants') : t('Ask for a new round based on the selected variant and your notes');
  bR.disabled = !(remix || has('revise')) || sending || null;
  bR.classList.toggle('pri', c.kind === 'approved' || c.kind === 'discarded' || d.selected.length > 1);
  icon(bM, 'more'); bM.title = t('More actions'); bM.disabled = sending || null;
  icon($('#bAttach'), 'attach'); $('#bAttach').title = STATIC ? t('Reference images need the live server') : t('Attach reference images (or paste / drop them)');
  $('#bAttach').disabled = STATIC || null;
  icon($('#bMic'), 'mic'); $('#bMic').title = rec ? t('Stop dictation') : t('Dictate a note');
  $('#bMic').style.display = SR ? '' : 'none';
  icon($('#bChips'), 'chips'); $('#bChips').title = t('Prompt chips'); $('#bChips').setAttribute('aria-pressed', String(S.chipsOpen));

  renderChips();
  renderRefs(c, d);
}
function changeCount(c) {
  let n = 0;
  for (const it of c.items) { const vd = S.vdata[it.fk]; if (!vd) continue; n += (vd.ann?.length || 0) + Object.keys(vd.tokens || {}).length + Object.keys(vd.edits || {}).length + (vd.comment?.trim() ? 1 : 0); }
  n += Object.keys((c.r && S.knobs[c.r.id]) || {}).length + (S.fonts.heading ? 1 : 0) + (S.fonts.body ? 1 : 0);
  return n ? t('{n} notes and tweaks', { n }) : '';
}
function renderChips() {
  const el = $('#chips'); el.innerHTML = '';
  el.classList.toggle('show', S.chipsOpen && !TEAM);
  if (!S.chipsOpen) return;
  const note = $('#note');
  const addText = (txt) => { const d = draft(ctx()?.key); const cur = (d.note || '').trim(); d.note = cur ? `${cur}${/[.!?]$/.test(cur) ? '' : '.'} ${txt}` : txt; persist(); note.value = d.note; autoGrow(note); note.focus(); };
  for (const q of QUICK) el.append(h('button', { onclick: () => addText(t(q)) }, t(q)));
  S.myChips.forEach((cp, i) => el.append(h('button', { class: 'mine', title: t('Saved prompt'), onclick: (e) => { if (e.target.closest('.x')) { S.myChips.splice(i, 1); persist(); renderChips(); return; } addText(cp); } }, cp, h('span', { class: 'x', title: t('Remove'), 'aria-label': t('Remove') }, '×'))));
  const cur = (note.value || '').trim();
  if (cur && !S.myChips.includes(cur)) el.append(h('button', { class: 'mine', html: I.plus + `<span>${t('Save this note as a chip')}</span>`, onclick: () => { S.myChips.push(cur.slice(0, 140)); persist(); renderChips(); toast(t('Prompt saved')); } }));
}
function renderRefs(c, d) {
  const el = $('#refs'); el.innerHTML = '';
  (d.refs || []).forEach((rf, i) => el.append(h('div', { class: 'ref', title: rf.path },
    h('img', { src: rf.url + (rf.url.includes('?') ? '&' : '?') + 'k=' + (QS.get('k') || ''), alt: t('Reference image') }),
    h('button', { title: t('Remove'), 'aria-label': t('Remove'), onclick: () => { d.refs.splice(i, 1); persist(); renderDock(); } }, '×'))));
  for (let i = 0; i < uploading; i++) el.append(h('div', { class: 'ref up' }, '…'));
}

// "sent" pill above the dock: what was sent last and whether the agent picked it up
function renderSent() {
  const el = $('#sent'); const ls = S.lastSent;
  if (!ls || STATIC || Date.now() - ls.t > 10 * 60e3) { el.className = ''; return; }
  const pend = (S.data.pending || []).find(p => p.id === ls.id);
  const held = pend && pend.hold_until && Date.parse(pend.hold_until) > Date.now();
  const label = { choose: t('Approval'), revise: t('Change request'), remix: t('Combine request'), more: t('“More like this”'), regenerate: t('Start-over request'), export: t('Export request'), unapprove: t('Revoke') }[ls.action] || t('Decision');
  el.innerHTML = '';
  el.append(h('span', { class: 'spin' }),
    h('span', {}, held ? t('{x} sent: the agent receives it in {s}s', { x: label, s: Math.ceil((Date.parse(pend.hold_until) - Date.now()) / 1000) })
      : pend ? t('{x} queued: waiting for the agent', { x: label }) : t('{x} received by the agent', { x: label })),
    pend ? h('button', { onclick: () => undoDecision(ls.id) }, t('Undo')) : h('button', { title: t('Hide'), 'aria-label': t('Hide'), onclick: () => { S.lastSent = null; renderSent(); } }, '×'));
  el.className = 'show' + (pend ? '' : ' done');
}

// ---------------- payload ----------------
function variantPayload(it, c, d, action) {
  const vd = S.vdata[it.fk];
  const o = {};
  if (vd) {
    if (vd.rating) o.rating = vd.rating > 0 ? 'like' : 'dislike';
    if (vd.comment?.trim()) o.comment = vd.comment.trim();
    const ann = (vd.ann || []).filter(a => !a.lock), locks = (vd.ann || []).filter(a => a.lock);
    if (ann.length) o.annotations = ann.map(({ selector, tag, text, note }) => ({ selector, tag, text, note }));
    if (locks.length) o.locked = locks.map(({ selector, tag, text }) => ({ selector, tag, text }));
    if (Object.keys(vd.tokens || {}).length) o.tokens = vd.tokens;
    const ed = Object.entries(vd.edits || {});
    if (ed.length) o.text_edits = ed.map(([selector, e]) => ({ selector, before: e.before, after: e.after }));
    const checks = Object.entries(vd.checks || {});
    if (checks.length) o.checklist = { passed: checks.filter(([, v]) => v === true).map(([k]) => k), failed: checks.filter(([, v]) => v === false).map(([k]) => k) };
  }
  const a = S.audit[it.fk];
  if (S.sendAudit && a && a.length && (d.selected.includes(it.key) || action === 'regenerate')) o.audit = a.slice(0, 15).map(i => ({ kind: i.kind, detail: i.detail, selector: i.selector, text: i.text }));
  return Object.keys(o).length ? { label: it.v.label, ...(c.kind === 'shortlist' ? { round: it.r.id } : {}), ...o } : null;
}
function knobPayload(r) {
  const vals = (r && S.knobs[r.id]) || {}; const out = {};
  for (const k of r?.knobs || []) { const n = k.token || k.attr; if (vals[n] != null) out[n] = { label: k.label || n, value: vals[n] + (k.type === 'range' && k.unit ? k.unit : '') }; }
  return out;
}
async function shotsFor(c, keys) {
  if (STATIC || !S.sendShots) return {};
  const out = {};
  await Promise.all(keys.slice(0, 4).map(async (k) => {
    const it = c.items.find(x => x.key === k); const f = it && mainFrame(it.fk); if (!f || f.url) return;
    const d = await snapshotOf(f, 8000); if (d.error || !d.url) return;
    try {
      const res = await fetch('/api/shot?round=' + encodeURIComponent(c.target.id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: String(k).replace('/', '-'), data: d.url }) });
      if (res.ok) out[k] = (await res.json()).path;
    } catch {}
  }));
  return out;
}

// ---------------- send ----------------
// extra: { only: it } sends one variant directly (card menu), { framework } for export, { no_hold } skips the undo window
async function submit(action, extra = {}) {
  const c = ctx(); if (!c || !c.target || TEAM) return;
  if (sending) return;
  const d = draft(c.key);
  if (action === 'unapprove') return revokeApproval(c);
  const only = extra.only;
  const selected = only ? [only.key] : d.selected.slice();
  if ((action === 'choose' && selected.length !== 1) || (['revise', 'more'].includes(action) && !selected.length && c.kind !== 'approved') || (action === 'remix' && selected.length < 2)) {
    return toast(action === 'remix' ? t('Select at least two variants to combine') : t('Select a variant first'));
  }
  sending = true; renderDock();
  try {
    const variants = {};
    for (const it of only ? [only] : c.items) { const o = variantPayload(it, c, { selected }, action); if (o) variants[it.key] = o; }
    const refs = (d.refs || []).filter(rf => rf.round === c.target.id).map(rf => rf.path);
    const r = c.r || c.target;
    const knobs = knobPayload(r);
    const fonts = Object.fromEntries(Object.entries(S.fonts).filter(([, v]) => v));
    const votes = S.data.votes?.[c.target.id];
    const rs = S.rstate[r.id] || {};
    const vpKey = currentVpKey(r);
    const payload = {
      round: c.target.id, action, selected,
      note: only ? (extra.note || '') : (d.note || '').trim(),
      variants,
      ...(refs.length && !only ? { references: refs } : {}),
      ...(Object.keys(knobs).length ? { knobs } : {}),
      ...(Object.keys(fonts).length ? { fonts } : {}),
      ...(d.ranking?.length && !only ? { ranking: d.ranking } : {}),
      ...(votes && Object.keys(votes).length ? { team_votes: votes } : {}),
      ...(extra.framework ? { framework: extra.framework } : {}),
      ...(c.kind === 'discarded' ? { reuse: true, approved_variant: c.ap } : {}),
      ...(c.kind === 'approved' && action === 'revise' ? { approved_variant: c.ap } : {}),
      ...(c.kind === 'shortlist' ? { shortlist: true } : {}),
      ...(extra.no_hold || action !== 'choose' ? { no_hold: true } : {}),
      viewed_at: { viewport: vpKey === 'custom' ? 'custom' : vpKey, width: currentVp(r)[0], theme: S.theme, layout: S.layout, ...(rs.state ? { state: rs.state } : {}), ...(rs.content ? { content: rs.content } : {}) },
    };
    if (!STATIC && !['export', 'unapprove'].includes(action)) {
      const shots = await shotsFor(c, selected.length ? selected : action === 'regenerate' ? c.items.slice(0, 3).map(i => i.key) : []);
      if (Object.keys(shots).length) payload.screenshots = shots;
    }
    if (STATIC) {
      const text = 'Variant Studio decision:\n```json\n' + JSON.stringify(payload, null, 2) + '\n```';
      await copyText(text);
      if (action === 'choose') { c.target.decision = { ...payload, approved: { variant: selected[0] } }; justApproved = only ? only.fk : c.items.find(x => x.key === selected[0])?.fk; setTimeout(() => { justApproved = null; }, 1700); }
      toast(t('Decision copied. Paste it into the chat with your agent.'), 'good');
      renderRail(); renderRound(true);
      return;
    }
    const res = await fetch('/api/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) { toast(t('Error {n}', { n: res.status })); return; }
    const out = await res.json();
    S.lastSent = { id: out.id, action, round: c.target.id, t: Date.now() };
    const name = action === 'choose' ? (() => { const it = c.items.find(x => x.key === selected[0]); return shortKey(selected[0]) + (it ? ' · ' + labelOf(it) : ''); })() : '';
    const msg = {
      choose: t('Approved {x}. The agent receives it in {s}s', { x: name }),
      revise: t('Change request sent'), remix: t('Combine request sent'), more: t('“More like this” sent'),
      regenerate: t('Start-over request sent'), export: t('Export request sent ({x})', { x: extra.framework || '' }),
    }[action] || t('Sent to the agent');
    toast(msg, { kind: 'good', ms: action === 'choose' ? 15000 : 6000, countdown: action === 'choose', action: { label: t('Undo'), run: () => undoDecision(out.id) } });
    if (action === 'choose') { justApproved = c.items.find(x => x.key === selected[0])?.fk || null; setTimeout(() => { justApproved = null; }, 1700); }
    // a sent note is done: clear it so the next request starts clean (the selection stays)
    if (!only) { d.note = ''; d.ranking = null; d.refs = []; }
    if (c.kind === 'discarded' || c.kind === 'shortlist') d.selected = [];
    persist();
    $('#note').blur();
    S.follow = true;
    await refresh();
  } catch (e) { toast(t('Could not send: {x}', { x: e.message })); }
  finally { sending = false; renderDock(); }
}
function sendQuick(action, it, extra = {}) { return submit(action, { ...extra, only: it, no_hold: true }); }

async function undoDecision(id) {
  try {
    const res = await fetch('/api/decision/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (res.ok) { toast(t('Undone: the agent will not receive it')); if (S.lastSent?.id === id) S.lastSent = null; }
    else toast(t('Too late: the agent already received it. Send a new decision to change course.'));
  } catch { toast(t('Could not reach the studio')); }
  await refresh();
}
async function revokeApproval(c = ctx()) {
  if (!c || !c.r || !c.ap) return;
  if (STATIC) { await copyText(`Variant Studio decision:\n\`\`\`json\n${JSON.stringify({ round: c.r.id, action: 'unapprove', selected: [c.ap] }, null, 2)}\n\`\`\``); return toast(t('Revoke copied. Paste it into the chat with your agent.')); }
  const res = await fetch('/api/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ round: c.r.id, action: 'unapprove', selected: [c.ap], note: (draft(c.key).note || '').trim() }) });
  if (!res.ok) return toast(t('Error {n}', { n: res.status }));
  const out = await res.json();
  if (out.id) S.lastSent = { id: out.id, action: 'unapprove', round: c.r.id, t: Date.now() };
  S.showDiscarded[c.r.id] = false; draft(c.r.id).selected = [];
  toast(out.id ? t('Approval revoked: the agent has been told') : t('Approval cancelled before the agent read it'), 'good');
  await refresh(); renderRound(true);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); } catch { const ta = h('textarea'); ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
}

// ---------------- references ----------------
async function addRefs(files) {
  files = [...files].filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  if (STATIC) return toast(t('Reference images need the live server'));
  const c = ctx(); if (!c || !c.target || TEAM) return;
  const d = draft(c.key);
  for (const file of files.slice(0, 8)) {
    if (file.size > 12e6) { toast(t('Image too large (max 12 MB)')); continue; }
    uploading++; renderDock();
    try {
      const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
      const r = await fetch('/api/ref?round=' + encodeURIComponent(c.target.id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, data }) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      (d.refs ||= []).push({ path: j.path, url: j.url, round: c.target.id });
    } catch (err) { toast(t('Upload failed: {x}', { x: err.message })); }
    uploading--; persist(); renderDock();
  }
}

// ---------------- voice ----------------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
function toggleMic() {
  if (!SR) return toast(t('Dictation is not supported in this browser'));
  if (rec) { rec.stop(); return; }
  const note = $('#note'); const d = draft(ctx()?.key);
  const base = (note.value || '').trim();
  rec = new SR(); rec.lang = S.lang === 'it' ? 'it-IT' : 'en-US'; rec.interimResults = true; rec.continuous = true;
  rec.onresult = (e) => { let s = ''; for (const r of e.results) s += r[0].transcript; note.value = (base ? base + ' ' : '') + s.trim(); d.note = note.value; autoGrow(note); };
  rec.onerror = (e) => { if (e.error !== 'aborted') toast(t('Dictation error: {x}', { x: e.error })); };
  rec.onend = () => { rec = null; persist(); renderDock(); };
  rec.start(); $('#bMic').classList.add('rec'); $('#bMic').title = t('Stop dictation'); toast(t('Listening… click the mic again to stop'));
}

// ---------------- wiring ----------------
(() => {
  const note = $('#note');
  note.addEventListener('input', () => { const c = ctx(); if (!c) return; draft(c.key).note = note.value; persist(); autoGrow(note); if (S.chipsOpen) renderChips(); });
  note.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendPrimary(); }
    if (e.key === 'Escape') note.blur();
  });
  $('#bChoose').onclick = () => submit('choose');
  $('#bRevise').onclick = () => { const c = ctx(); const n = c ? draft(c.key).selected.length : 0; submit(n >= 2 && c.kind !== 'approved' ? 'remix' : 'revise'); };
  $('#bMore').onclick = (e) => {
    const c = ctx(); if (!c) return;
    const acts = availableActions(c).filter(a => !['choose'].includes(a.action));
    showMenu(e.currentTarget, [
      { head: t('Send') },
      ...acts.map(a => ({ label: a.label, icon: { revise: 'redo', remix: 'layers', more: 'spark', regenerate: 'refresh', unapprove: 'undo' }[a.action], run: () => submit(a.action) })),
      { sep: true },
      { label: t('Attach reference image'), icon: 'image', disabled: STATIC, run: () => $('#fileIn').click() },
      { label: draft(c.key).ranking?.length ? t('Remove attached ranking') : t('Rank with an A vs B tournament'), icon: 'trophy', run: () => { const d = draft(c.key); if (d.ranking?.length) { d.ranking = null; persist(); renderDock(); } else { S.cmp.mode = 'duel'; setLayout('compare'); } } },
      { label: t('Clear selection and note'), icon: 'x', run: () => { const d = draft(c.key); d.selected = c.kind === 'approved' ? [c.ap] : []; d.note = ''; d.refs = []; d.ranking = null; persist(); updateCards(); renderDock(); } },
    ]);
  };
  $('#bAttach').onclick = () => $('#fileIn').click();
  $('#fileIn').onchange = (e) => { addRefs(e.target.files); e.target.value = ''; };
  $('#bMic').onclick = toggleMic;
  $('#bChips').onclick = () => { S.chipsOpen = !S.chipsOpen; persist(); renderDock(); };
  // paste and drop images anywhere in the studio
  addEventListener('paste', (e) => { const files = [...(e.clipboardData?.files || [])]; if (files.some(f => f.type.startsWith('image/'))) { e.preventDefault(); addRefs(files); } });
  let dragN = 0;
  addEventListener('dragenter', (e) => { if (e.dataTransfer?.types?.includes('Files')) { dragN++; $('#dock').classList.add('drag'); } });
  addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; $('#dock').classList.remove('drag'); } });
  addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  addEventListener('drop', (e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); dragN = 0; $('#dock').classList.remove('drag'); addRefs(e.dataTransfer.files); });
})();

// Ctrl/⌘ Enter: approve when exactly one is selected and nothing was written, otherwise request changes / combine
function sendPrimary() {
  const c = ctx(); if (!c || TEAM) return;
  const d = draft(c.key);
  if (c.kind === 'approved' || c.kind === 'discarded') return submit('revise');
  if (d.selected.length === 1 && !(d.note || '').trim()) return submit('choose');
  if (d.selected.length >= 2) return submit('remix');
  if (d.selected.length === 1) return submit('revise');
  if ((d.note || '').trim()) return submit('regenerate');
  toast(t('Select a variant first'));
}
