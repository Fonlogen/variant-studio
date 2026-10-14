// Variant Studio 3.0 — inspector, element popover, settings / team / help sheets, command palette.
'use strict';

const FONTS = ['Inter', 'Instrument Sans', 'Figtree', 'Onest', 'Manrope', 'DM Sans', 'Plus Jakarta Sans', 'Outfit', 'Sora', 'Space Grotesk', 'Bricolage Grotesque', 'Work Sans', 'IBM Plex Sans', 'Geologica', 'Fraunces', 'Instrument Serif', 'Newsreader', 'Source Serif 4', 'Lora', 'Playfair Display', 'DM Serif Display', 'JetBrains Mono', 'Space Mono'];

// ---------------- inspector ----------------
function toggleInsp(v = !S.insp) { if (TEAM) return; S.insp = v; persist(); document.body.classList.toggle('insp-open', S.insp); renderTopbar(); renderInspector(); setTimeout(layoutFrames, 30); }
const cnv = document.createElement('canvas').getContext('2d');
function toHex(v) { cnv.fillStyle = '#000'; cnv.fillStyle = v; const o = cnv.fillStyle; return /^#[0-9a-f]{6}$/i.test(o) ? o : null; }
const isColor = (v) => /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|oklch\(|oklab\(|color\()/i.test(String(v).trim()) && toHex(v);
function renderInspector() {
  document.body.classList.toggle('insp-open', S.insp && !TEAM);
  if (!S.insp || TEAM) return;
  const c = ctx();
  seg($('#inspTabs'), [['tune', t('Tune')], ['tokens', t('Tokens')], ['checklist', t('Checklist')], ['audit', t('Audit')], ['edits', t('Edits')]], S.inspTab, (v) => { S.inspTab = v; persist(); renderInspector(); });
  icon($('#inspClose'), 'x'); $('#inspClose').title = t('Close (I)');
  const sel = $('#inspSel'); sel.innerHTML = '';
  const body = $('#inspBody'); body.innerHTML = '';
  if (!c || !c.items.length || ['tree', 'overview'].includes(S.layout)) { $('.in-sel').style.display = 'none'; body.append(h('p', { class: 'hint' }, t('Open a round to inspect its variants.'))); return; }
  $('.in-sel').style.display = S.inspTab === 'tune' ? 'none' : '';
  c.items.forEach(it => sel.append(h('option', { value: it.fk, selected: it.fk === S.active }, `${letterOf(c, it)} · ${labelOf(it)}${S.audit[it.fk]?.length ? `  ⚠ ${S.audit[it.fk].length}` : ''}`)));
  sel.onchange = () => { S.active = sel.value; updateCards(); renderInspector(); };
  const fk = S.active; const it = c.items.find(x => x.fk === fk); if (!it) return;
  const f = mainFrame(fk); const vd = vdata(fk);
  ({ tune: tuneTab, tokens: tokensTab, checklist: checklistTab, audit: auditTab, edits: editsTab }[S.inspTab] || tuneTab)(body, c, it, f, vd);
}

function tuneTab(body, c, it) {
  const r = it.r;
  // knobs declared by the agent in round.json
  if (r.knobs?.length) {
    body.append(h('h4', {}, t('Controls for this round')));
    const vals = (S.knobs[r.id] ||= {});
    for (const k of r.knobs) {
      const name = k.token || k.attr; if (!name) continue;
      const cur = vals[name] ?? k.value ?? (k.type === 'range' ? k.min ?? 0 : k.type === 'select' ? k.options?.[0] : k.type === 'color' ? '#888888' : '');
      const ctl = h('div', { class: 'ctl' });
      const row = h('div', { class: 'knob' + (vals[name] != null ? ' changed' : ''), title: name }, h('label', {}, k.label || name, h('small', {}, name)), ctl);
      const apply = (val) => { if (val === '' || val == null) delete vals[name]; else vals[name] = val; persist(); row.classList.toggle('changed', vals[name] != null); broadcastFrames(); renderDock(); };
      if (k.type === 'range') {
        const out = h('output', {}, cur + (k.unit || ''));
        const inp = h('input', { type: 'range', min: k.min ?? 0, max: k.max ?? 100, step: k.step ?? 1, value: cur, 'aria-label': k.label || name });
        inp.oninput = () => { out.textContent = inp.value + (k.unit || ''); apply(Number(inp.value)); };
        ctl.append(inp, out);
      } else if (k.type === 'select') {
        const s = h('select', { class: 'tx', 'aria-label': k.label || name }); (k.options || []).forEach(o => s.append(h('option', { value: o, selected: String(o) === String(cur) }, String(o))));
        s.onchange = () => apply(s.value); ctl.append(s);
      } else if (k.type === 'color') {
        const col = h('input', { type: 'color', value: toHex(cur) || '#888888', 'aria-label': k.label || name }); const tx = h('input', { class: 'tx', value: cur });
        col.oninput = () => { tx.value = col.value; apply(col.value); }; tx.onchange = () => apply(tx.value.trim()); ctl.append(col, tx);
      } else if (k.type === 'toggle') {
        const cb = h('input', { type: 'checkbox', checked: cur === true || cur === 'on' || null, 'aria-label': k.label || name });
        cb.onchange = () => apply(cb.checked ? (k.on ?? 'on') : (k.off ?? 'off')); ctl.append(cb);
      } else {
        const tx = h('input', { class: 'tx', value: cur }); tx.onchange = () => apply(tx.value.trim()); ctl.append(tx);
      }
      row.append(h('button', { class: 'rs', title: t('Reset'), 'aria-label': t('Reset'), html: I.x, onclick: () => { apply(null); reloadFrames(); renderInspector(); } }));
      body.append(row);
    }
    body.append(h('p', { class: 'hint' }, t('These apply to every variant of the round and are sent to the agent.')));
  } else body.append(h('p', { class: 'hint' }, t('This round declares no controls. Ask the agent to add "knobs" to round.json (radius, density, accent…) to tune them here.')));

  // fonts
  body.append(h('h4', {}, t('Fonts')));
  const fontRow = (key, label) => {
    const list = h('datalist', { id: 'fl-' + key }, ...FONTS.map(f => h('option', { value: f })));
    const inp = h('input', { class: 'tx', list: 'fl-' + key, value: S.fonts[key] || '', placeholder: t('Variant default'), 'aria-label': label });
    const apply = () => { S.fonts[key] = inp.value.trim(); persist(); broadcastFrames(); renderDock(); row.classList.toggle('changed', !!S.fonts[key]); };
    inp.onchange = apply;
    const row = h('div', { class: 'knob' + (S.fonts[key] ? ' changed' : '') }, h('label', {}, label), h('div', { class: 'ctl' }, inp, list),
      h('button', { class: 'rs', title: t('Reset'), 'aria-label': t('Reset'), html: I.x, onclick: () => { inp.value = ''; apply(); reloadFrames(); } }));
    return row;
  };
  body.append(fontRow('heading', t('Headings')), fontRow('body', t('Body text')));
  body.append(h('p', { class: 'hint' }, t('Any Google Fonts family or a font installed on your machine. Applied to every variant.')));

  // brand
  const b = S.data.brand;
  body.append(h('h4', {}, t('Brand palette')));
  body.append(h('p', { class: 'hint' }, b && b.enabled !== false && Object.keys(b.colors || {}).length ? t('{n} brand colors are injected as --brand-* variables.', { n: Object.keys(b.colors).length }) : t('No brand palette yet.')),
    h('button', { class: 'btn sm', disabled: STATIC || null, onclick: () => openSettings('brand') }, t('Edit brand palette')));
}

function tokensTab(body, c, it, f, vd) {
  const fk = it.fk;
  body.append(h('p', { class: 'hint' }, t('CSS custom properties found in this variant. Changes apply live and are sent to the agent.')));
  if (!S.tokens[fk]) { if (f) postTo(f, { type: 'tokens' }); body.append(h('p', { class: 'hint' }, f ? t('Reading tokens…') : t('Preview not loaded.'))); return; }
  const list = S.tokens[fk];
  if (!list.length) { body.append(h('p', { class: 'hint' }, t('This variant defines no CSS variables. Ask the agent to express colors, radii and spacing as --tokens to tune them here.'))); return; }
  const changed = Object.keys(vd.tokens).length;
  if (changed) body.append(h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px' }, h('span', { class: 'tag acc' }, t('{n} overrides', { n: changed })),
    h('button', { class: 'btn ghost sm', onclick: () => { for (const [name, tk] of Object.entries(vd.tokens)) framesOf(fk).forEach(fr => postTo(fr, { type: 'setToken', scope: tk.scope, name, value: null })); vd.tokens = {}; persist(); renderInspector(); renderDock(); } }, t('Reset all'))));
  for (const tk of list) {
    const ov = vd.tokens[tk.name];
    const cur = ov ? ov.to : tk.value;
    const orig = ov ? ov.from : tk.value;
    const apply = (val) => {
      if (val === orig || val === '') { delete vd.tokens[tk.name]; framesOf(fk).forEach(fr => postTo(fr, { type: 'setToken', scope: tk.scope, name: tk.name, value: null })); }
      else { vd.tokens[tk.name] = { scope: tk.scope, from: orig, to: val }; framesOf(fk).forEach(fr => postTo(fr, { type: 'setToken', scope: tk.scope, name: tk.name, value: val })); }
      persist(); row.classList.toggle('changed', !!vd.tokens[tk.name]); renderDock();
    };
    const ctl = h('div', { class: 'ctl' });
    const txt = h('input', { class: 'tx', value: cur, spellcheck: 'false', 'aria-label': tk.name });
    txt.addEventListener('change', () => apply(txt.value.trim()));
    const hex = isColor(cur) || isColor(orig);
    if (hex) {
      const col = h('input', { type: 'color', value: toHex(cur) || hex, 'aria-label': tk.name });
      col.addEventListener('input', () => { txt.value = col.value; apply(col.value); });
      ctl.append(col);
    } else if (/^(-?[\d.]+)(px|rem|em|%|vw|vh|ms|s)?$/.test(String(cur))) {
      txt.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const mm = txt.value.match(/^(-?[\d.]+)([a-z%]*)$/); if (!mm) return;
        const step = (mm[2] === 'rem' || mm[2] === 'em' ? 0.125 : mm[2] === 's' ? 0.05 : 1) * (e.shiftKey ? 10 : 1);
        txt.value = +(Number(mm[1]) + (e.key === 'ArrowUp' ? step : -step)).toFixed(3) + mm[2]; apply(txt.value);
      });
    }
    ctl.append(txt);
    const row = h('div', { class: 'tok' + (ov ? ' changed' : ''), title: `${tk.name} (${tk.scope})\n${t('original')}: ${orig}` },
      h('label', {}, tk.name, tk.scope !== ':root' ? h('small', {}, tk.scope) : null), ctl,
      h('button', { class: 'rs', title: t('Reset'), 'aria-label': t('Reset'), html: I.x, onclick: () => { txt.value = orig; apply(orig); renderInspector(); } }));
    body.append(row);
  }
}

function checklistTab(body, c, it, f, vd) {
  const crits = [...new Set([...(it.r.checklist || []), ...S.criteria])];
  body.append(h('p', { class: 'hint' }, t('Acceptance criteria. Mark each one for this variant: the agent receives what is missing.')));
  if (!crits.length) body.append(h('p', { class: 'hint' }, t('No criteria yet. Add your own below; the agent can also declare them in round.json ("checklist").')));
  for (const cr of crits) {
    const val = vd.checks[cr];
    const set = (v) => { if (vd.checks[cr] === v) delete vd.checks[cr]; else vd.checks[cr] = v; persist(); renderInspector(); renderDock(); };
    const mine = S.criteria.includes(cr) && !(it.r.checklist || []).includes(cr);
    body.append(h('div', { class: 'crit' }, h('span', {}, cr),
      h('span', { class: 'tri' }, h('button', { class: 'y', 'aria-pressed': String(val === true), title: t('Passes'), onclick: () => set(true) }, '✓'), h('button', { class: 'n', 'aria-pressed': String(val === false), title: t('Fails'), onclick: () => set(false) }, '✕')),
      mine ? h('button', { class: 'ib sm', title: t('Remove'), 'aria-label': t('Remove'), html: I.x, onclick: () => { S.criteria = S.criteria.filter(x => x !== cr); persist(); renderInspector(); } }) : null));
  }
  const inp = h('input', { class: 'tx', placeholder: t('e.g. Main action visible above the fold') });
  const add = () => { const v = inp.value.trim(); if (v && !S.criteria.includes(v)) { S.criteria.push(v); persist(); renderInspector(); } };
  inp.onkeydown = (e) => { if (e.key === 'Enter') add(); };
  body.append(h('div', { class: 'addrow' }, inp, h('button', { class: 'btn sm', onclick: add }, t('Add'))));
}

function auditTab(body, c, it, f) {
  const a = S.audit[it.fk];
  body.append(h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px' },
    h('span', { class: 'hint' }, t('Checked at {x}', { x: `${vpLabel(it.r)} · ${S.theme}` })),
    h('button', { class: 'btn ghost sm', html: I.refresh + `<span>${t('Run again')}</span>`, onclick: () => f && postTo(f, { type: 'audit' }) })));
  if (!a) { body.append(h('p', { class: 'hint' }, t('Running…'))); return; }
  if (!a.length) { body.append(h('p', { class: 'hint' }, t('No issues found: contrast, touch targets, alt text, labels and overflow look fine.'))); return; }
  const names = { contrast: t('Low contrast'), target: t('Small touch target'), alt: t('Missing alt text'), label: t('Unlabelled field'), name: t('No accessible name'), overflow: t('Horizontal overflow') };
  for (const i of a) body.append(h('button', { class: 'issue', onclick: () => f && postTo(f, { type: 'flash', selector: i.selector }) }, h('span', { html: I.warn }),
    h('span', {}, h('b', {}, names[i.kind] || i.kind), ': ', i.detail, h('small', {}, i.text ? `“${i.text}”` : i.selector))));
  body.append(h('p', { class: 'hint' }, S.sendAudit ? t('These issues go with your decision so the agent fixes them.') : t('Audit issues are not sent to the agent (Settings).')));
}

function editsTab(body, c, it, f, vd) {
  body.append(h('p', { class: 'hint' }, t('Press E and click any text in a preview to rewrite it. Edits are sent to the agent as exact copy.')));
  const list = Object.entries(vd.edits);
  if (!list.length) body.append(h('p', { class: 'hint' }, t('No text edits on this variant.')));
  for (const [selector, e] of list) body.append(h('div', { class: 'edit-row' },
    h('div', { class: 'el' }, h('span', {}, e.tag || 'text'), h('button', { class: 'ib sm', title: t('Revert'), 'aria-label': t('Revert'), html: I.x, onclick: () => {
      delete vd.edits[selector]; persist(); renderInspector(); renderDock();
      framesOf(it.fk).forEach(fr => { if (STATIC) fr.iframe.srcdoc = it.v.html || ''; else fr.iframe.src = frameSrc(it.r, it.v); });
    } })),
    h('del', {}, e.before), h('br'), h('ins', {}, e.after)));
}

// ---------------- element popover: comment or lock ----------------
let popCtx = null;
function openPop(f, d) {
  popCtx = { f, d };
  const rc = f.iframe.getBoundingClientRect();
  const sc = (rc.width / f.iframe.offsetWidth) || 1;
  const x = Math.min(innerWidth - 336, Math.max(8, rc.left + (d.rect.x + d.rect.w) * sc + 8));
  const y = Math.min(innerHeight - 200, Math.max(8, rc.top + d.rect.y * sc));
  const pop = $('#pop');
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
  $('#popEl').textContent = `${f.v.id.toUpperCase()} · <${d.tag}> ${d.text ? '“' + d.text + '”' : d.selector}`;
  $('#popText').value = ''; $('#popText').placeholder = t('What should change here?');
  $('#popLock').innerHTML = I.lock + `<span>${t('Lock as is')}</span>`; $('#popLock').title = t('The agent must not change this element');
  $('#popCancel').textContent = t('Cancel'); $('#popSave').textContent = t('Add comment');
  pop.classList.add('show');
  $('#popText').focus();
}
function closePop() { $('#pop').classList.remove('show'); popCtx = null; }
function savePop(lock) {
  if (!popCtx) return;
  const note = $('#popText').value.trim();
  if (note || lock) {
    const { f, d } = popCtx;
    vdata(f.it.fk).ann.push({ selector: d.selector, tag: d.tag, text: d.text, note: note || t('Keep exactly as it is'), ...(lock ? { lock: true } : {}) });
    persist(); updateCards(); framesOf(f.it.fk).forEach(sendFrame); renderDock();
    if (lock) toast(t('Locked: the agent will keep this element as it is'));
  }
  closePop();
}
$('#popCancel').onclick = closePop;
$('#popSave').onclick = () => savePop(false);
$('#popLock').onclick = () => savePop(true);
$('#popText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) savePop(false); if (e.key === 'Escape') closePop(); });

// ---------------- sheets ----------------
function openSheet(title, fill) {
  $('#shTitle').textContent = title; icon($('#shClose'), 'x'); $('#shClose').title = t('Close');
  const b = $('#shBody'); b.innerHTML = ''; fill(b);
  $('#sheet').classList.add('show');
}
function closeSheet() { $('#sheet').classList.remove('show'); }
$('#shClose').onclick = closeSheet;
$('#sheet').addEventListener('pointerdown', (e) => { if (e.target.id === 'sheet' && !TEAM_NAME_REQUIRED()) closeSheet(); });
const TEAM_NAME_REQUIRED = () => TEAM && !S.voter;
const sw = (label, checked, on, hint) => {
  const cb = h('input', { type: 'checkbox', checked: checked || null, 'aria-label': label });
  cb.onchange = () => on(cb.checked);
  return h('label', { class: 'switch' }, h('span', {}, label, hint ? h('div', { class: 'hint' }, hint) : null), cb);
};

function openSettings(focus) {
  openSheet(t('Settings'), (b) => {
    const langSeg = h('div', { class: 'seg' }); seg(langSeg, [['en', 'English'], ['it', 'Italiano']], S.lang, (v) => { S.lang = v; persist(); applyI18n(); openSettings(); renderAll(); });
    const uiSeg = h('div', { class: 'seg' }); seg(uiSeg, [['dark', t('Dark')], ['light', t('Light')]], S.ui, (v) => { setUi(v); openSettings(); });
    const cvSeg = h('select', { class: 'tx', 'aria-label': t('Canvas behind variants') });
    [['light', t('Soft grey')], ['white', t('White')], ['dark', t('Dark')], ['checker', t('Transparent')], ['none', t('Page background')]].forEach(([v, l]) => cvSeg.append(h('option', { value: v, selected: S.canvas === v }, l)));
    cvSeg.onchange = () => { S.canvas = cvSeg.value; persist(); broadcastFrames(); };
    b.append(h('h4', {}, t('Studio')),
      h('div', { class: 'switch' }, h('span', {}, t('Language')), langSeg),
      h('div', { class: 'switch' }, h('span', {}, t('Studio theme')), uiSeg),
      h('div', { class: 'switch' }, h('span', {}, t('Canvas behind variants')), cvSeg),
      sw(t('Device frames on mobile and tablet'), S.device, (v) => { S.device = v; persist(); renderRound(true); }),
      sw(t('Sync scroll between previews'), S.sync, (v) => { S.sync = v; persist(); }));
    b.append(h('h4', {}, t('Notifications')),
      sw(t('Notify me when new variants are ready'), S.notify, async (v) => {
        S.notify = v; persist();
        if (v && 'Notification' in window && Notification.permission === 'default') { const p = await Notification.requestPermission(); if (p !== 'granted') toast(t('The browser blocked notifications')); }
      }, t('A system notification when the tab is in the background.')),
      sw(t('Play a sound'), S.sound, (v) => { S.sound = v; persist(); if (v) chime(); }));
    b.append(h('h4', {}, t('What goes to the agent')),
      sw(t('Screenshots of the selected variants'), S.sendShots, (v) => { S.sendShots = v; persist(); }, t('The agent sees the variants exactly as you saw them.')),
      sw(t('Accessibility issues'), S.sendAudit, (v) => { S.sendAudit = v; persist(); }));
    const scSeg = h('div', { class: 'seg' }); seg(scSeg, [['1', '1×'], ['2', '2×'], ['3', '3×']], String(S.exportScale), (v) => { S.exportScale = Number(v); persist(); });
    b.append(h('h4', {}, t('Export')),
      h('div', { class: 'switch' }, h('span', {}, t('PNG / JPG resolution'), h('div', { class: 'hint' }, t('2× is sharp on retina screens; 3× for print and slides.'))), scSeg));
    // brand
    const br = S.data.brand || { enabled: true, colors: {}, fonts: {} };
    const colors = Object.entries(br.colors || {}); if (!colors.length) colors.push(['primary', '#5566e8'], ['surface', '#ffffff'], ['text', '#1a1a1e']);
    const rows = h('div', {});
    const addRow = (name = '', val = '#888888') => {
      const n = h('input', { class: 'tx', value: name, placeholder: 'primary', 'aria-label': t('Name') });
      const col = h('input', { type: 'color', value: toHex(val) || '#888888', 'aria-label': t('Color') });
      const tx = h('input', { class: 'tx', value: val, 'aria-label': t('Value') });
      col.oninput = () => { tx.value = col.value; }; tx.onchange = () => { const hx = toHex(tx.value); if (hx) col.value = hx; };
      const row = h('div', { class: 'colrow' }, n, col, tx, h('button', { class: 'ib sm', title: t('Remove'), 'aria-label': t('Remove'), html: I.x, onclick: () => row.remove() }));
      rows.append(row);
    };
    colors.forEach(([k, v]) => addRow(k, v));
    const fh = h('input', { class: 'tx', value: br.fonts?.heading || '', placeholder: t('Headings font'), list: 'fl-brand' });
    const fb = h('input', { class: 'tx', value: br.fonts?.body || '', placeholder: t('Body font'), list: 'fl-brand' });
    let enabled = br.enabled !== false;
    const sec = h('section', { id: 'brandSec' }, h('h4', {}, t('Brand palette')),
      h('p', {}, t('Saved in .variant-studio/brand.json and injected into every variant as --brand-<name> variables (and --brand-font-heading / --brand-font-body). The agent is told to use them, so you can judge structure with your real colors.')),
      sw(t('Inject the brand palette'), enabled, (v) => { enabled = v; }),
      rows,
      h('div', { class: 'addrow' }, h('button', { class: 'btn sm ghost', html: I.plus + `<span>${t('Add color')}</span>`, onclick: () => addRow() })),
      h('datalist', { id: 'fl-brand' }, ...FONTS.map(f => h('option', { value: f }))),
      h('div', { class: 'addrow' }, fh, fb),
      h('div', { class: 'addrow' }, h('span', { class: 'sp' }), h('button', { class: 'btn pri sm', disabled: STATIC || null, onclick: async () => {
        const out = {};
        rows.querySelectorAll('.colrow').forEach(r => { const [n, , tx] = r.querySelectorAll('input'); const k = n.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-'); if (k && tx.value.trim()) out[k] = tx.value.trim(); });
        const res = await fetch('/api/brand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, colors: out, fonts: { heading: fh.value.trim(), body: fb.value.trim() } }) });
        if (res.ok) { toast(t('Brand palette saved'), 'good'); await refresh(); reloadFrames(); } else toast(t('Error {n}', { n: res.status }));
      } }, t('Save palette'))));
    b.append(sec);
    // saved prompts
    b.append(h('h4', {}, t('Saved prompts')));
    if (!S.myChips.length) b.append(h('p', { class: 'hint' }, t('Write a note in the bar, open the prompt chips and choose “Save this note as a chip”.')));
    S.myChips.forEach((cp, i) => b.append(h('div', { class: 'switch' }, h('span', {}, cp), h('button', { class: 'ib sm', title: t('Remove'), 'aria-label': t('Remove'), html: I.x, onclick: () => { S.myChips.splice(i, 1); persist(); renderChips(); openSettings(); } }))));
    b.append(h('div', { class: 'addrow' }, h('button', { class: 'btn sm ghost', html: I.cmd + `<span>${t('Keyboard shortcuts')}</span>`, onclick: openHelp })));
    if (focus === 'brand') setTimeout(() => $('#brandSec')?.scrollIntoView({ block: 'start' }), 30);
  });
}

function openHelp() {
  const keys = [['1–9', t('Select a variant')], ['G / L / X', t('Grid, list, compare')], ['F / Z', t('Full screen on the active variant')], ['← →', t('Previous / next variant')], ['O / T', t('Overview, version tree')], ['C', t('Comment on an element (or lock it)')], ['E', t('Edit text inline')], ['I', t('Inspector: tune, tokens, checklist, audit')], ['D', t('Variant theme light / dark')], ['N', t('Show all descriptions')], ['+ − 0', t('Zoom')], ['/', t('Write a note')], ['Ctrl/⌘ Enter', t('Send: approve one, or request changes / combine')], ['Ctrl/⌘ K', t('Command palette')], ['R', t('Rounds panel')], ['U', t('Studio theme')], ['Esc', t('Close, leave full screen, stop a tool')]];
  openSheet(t('Keyboard shortcuts'), (b) => { const g = h('div', { class: 'keys' }); keys.forEach(([k, l]) => g.append(h('kbd', {}, k), h('span', {}, l))); b.append(g); });
}

// ---------------- team ----------------
function openTeam() {
  openSheet(t('Team'), (b) => {
    if (TEAM) {
      const nm = h('input', { class: 'tx', value: S.voter, placeholder: t('Your name'), style: 'width:100%' });
      b.append(h('p', {}, t('You are reviewing as a teammate. Vote and comment on the variants; the owner of the studio sees your votes and can send them to the agent.')),
        h('h4', {}, t('Your name')), nm,
        h('div', { class: 'addrow' }, h('span', { class: 'sp' }), h('button', { class: 'btn pri sm', onclick: () => { const v = nm.value.trim(); if (!v) return toast(t('Write your name first')); renameVoter(v); closeSheet(); } }, t('Save'))));
      if (STATIC) b.append(h('h4', {}, t('Send your votes')), h('p', {}, t('This is an offline gallery: download your votes and send the file to the owner of the studio.')),
        h('button', { class: 'btn sm', html: I.download + `<span>${t('Download my votes')}</span>`, onclick: downloadVotes }));
      return;
    }
    const url = S.data.team_url;
    b.append(h('h4', {}, t('Review on your network')),
      url ? h('p', {}, t('Teammates on your network can open this link, enter their name and vote:'), h('br'), h('code', {}, url), ' ', h('button', { class: 'btn sm ghost', html: I.copy + `<span>${t('Copy')}</span>`, onclick: () => navigator.clipboard.writeText(url).then(() => toast(t('Link copied'))) }))
        : h('p', {}, t('Ask the agent to restart the studio with'), ' ', h('code', {}, 'start --team'), ' ', t('to get a link teammates on your network can open.')),
      h('h4', {}, t('Review offline')),
      h('p', {}, t('Ask the agent to run'), ' ', h('code', {}, 'build --team'), ' ', t('and send the gallery file. Teammates vote and download a votes file; import it here.')),
      h('div', { class: 'addrow' }, h('button', { class: 'btn sm', disabled: STATIC || null, html: I.upload + `<span>${t('Import votes')}</span>`, onclick: importVotes })));
    const voters = new Map();
    for (const [rid, vs] of Object.entries(S.data.votes || {})) for (const [vid, by] of Object.entries(vs)) for (const who of Object.keys(by)) voters.set(who, (voters.get(who) || 0) + 1);
    b.append(h('h4', {}, t('Votes so far')));
    if (!voters.size) b.append(h('p', { class: 'hint' }, t('No votes yet.')));
    voters.forEach((n, who) => b.append(h('div', { class: 'switch' }, h('span', {}, who), h('span', { class: 'hint' }, t('{n} votes', { n })))));
    b.append(h('p', { class: 'hint' }, t('Team votes for the round go with your decision; your own choice still wins.')));
  });
}
function askVoterName() {
  openSheet(t('Welcome'), (b) => {
    const nm = h('input', { class: 'tx', placeholder: t('Your name'), style: 'width:100%' });
    const go = () => { const v = nm.value.trim(); if (!v) return; renameVoter(v); closeSheet(); };
    nm.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    b.append(h('p', {}, t('You have been invited to review design variants. Enter your name, then vote and comment on each variant.')), nm,
      h('div', { class: 'addrow' }, h('span', { class: 'sp' }), h('button', { class: 'btn pri sm', onclick: go }, t('Start reviewing'))));
    setTimeout(() => nm.focus(), 30);
  });
  $('#shClose').style.display = 'none';
}
function renameVoter(v) { S.voter = v; persist(); $('#shClose').style.display = ''; renderDock(); refresh(); }
const pushVote = debounce(async (it, o) => {
  if (STATIC) return;
  try { await fetch('/api/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ round: it.r.id, variant: it.v.id, voter: S.voter, vote: o.vote, comment: o.comment }) }); } catch { toast(t('Could not save your vote')); }
}, 400);
function teamVote(it, vote) {
  if (!S.voter) return askVoterName();
  const o = (S.myVotes[it.fk] ||= { vote: null, comment: '' });
  o.vote = o.vote === vote ? null : vote;
  ((S.data.votes[it.r.id] ||= {})[it.v.id] ||= {})[S.voter] = { ...o };
  persist(); updateCards(); pushVote(it, o);
}
function teamComment(it, text) {
  if (!S.voter) return;
  const o = (S.myVotes[it.fk] ||= { vote: null, comment: '' });
  o.comment = text;
  ((S.data.votes[it.r.id] ||= {})[it.v.id] ||= {})[S.voter] = { ...o };
  persist(); updateBadges(it.fk); pushVote(it, o);
}
function downloadVotes() {
  const votes = Object.entries(S.myVotes).map(([fk, o]) => { const i = fk.indexOf('/'); return { round: fk.slice(0, i), variant: fk.slice(i + 1), voter: S.voter, vote: o.vote, comment: o.comment }; });
  const blob = new Blob([JSON.stringify({ variant_studio_votes: 1, voter: S.voter, votes }, null, 2)], { type: 'application/json' });
  const u = URL.createObjectURL(blob); download(u, `votes-${(S.voter || 'me').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`); setTimeout(() => URL.revokeObjectURL(u), 2000);
}
function importVotes() {
  const inp = h('input', { type: 'file', accept: 'application/json,.json', multiple: true });
  inp.onchange = async () => {
    let n = 0;
    for (const file of inp.files) {
      try {
        const j = JSON.parse(await file.text());
        const res = await fetch('/api/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ votes: j.votes || [] }) });
        const o = await res.json(); n += o.saved || 0;
      } catch { toast(t('Could not read {x}', { x: file.name })); }
    }
    toast(t('{n} votes imported', { n }), 'good'); await refresh(); openTeam();
  };
  inp.click();
}

// ---------------- command palette ----------------
function commands() {
  const c = ctx();
  const L = [];
  const add = (g, label, run, kbd) => L.push({ g, label, run, kbd });
  add(t('View'), t('Grid'), () => setLayout('grid'), 'G');
  add(t('View'), t('Full screen'), () => setLayout('focus'), 'F');
  add(t('View'), t('List'), () => setLayout('list'), 'L');
  add(t('View'), t('Compare: swipe'), () => { S.cmp.mode = 'swipe'; setLayout('compare'); }, 'X');
  add(t('View'), t('Compare: overlay'), () => { S.cmp.mode = 'overlay'; setLayout('compare'); });
  add(t('View'), t('Compare: A vs B tournament'), () => { S.cmp.mode = 'duel'; setLayout('compare'); });
  add(t('View'), t('Overview'), () => setLayout('overview'), 'O');
  add(t('View'), t('Version tree'), () => setLayout('tree'), 'T');
  [['auto', t('Fit to card')], ['mobile', t('Mobile') + ' 390'], ['tablet', t('Tablet') + ' 820'], ['laptop', t('Laptop') + ' 1280'], ['desktop', t('Desktop') + ' 1440']].forEach(([k, l]) => add(t('Viewport'), l, () => setVp(k)));
  add(t('View'), (S.device ? t('Hide') : t('Show')) + ' ' + t('device frames'), () => { S.device = !S.device; persist(); renderRound(true); });
  add(t('View'), t('Zoom in'), () => zoomAll(1), '+'); add(t('View'), t('Zoom out'), () => zoomAll(-1), '−'); add(t('View'), t('Zoom to fit'), () => zoomAll(0), '0');
  add(t('View'), t('Variant theme: {x}', { x: S.theme === 'light' ? t('dark') : t('light') }), () => setTheme(S.theme === 'light' ? 'dark' : 'light'), 'D');
  add(t('View'), (S.notesAll ? t('Hide') : t('Show')) + ' ' + t('all descriptions'), toggleNotes, 'N');
  add(t('View'), (S.sync ? t('Disable') : t('Enable')) + ' ' + t('sync scroll'), () => { S.sync = !S.sync; persist(); });
  add(t('Studio'), t('Studio theme: {x}', { x: S.ui === 'dark' ? t('light') : t('dark') }), () => setUi(S.ui === 'dark' ? 'light' : 'dark'), 'U');
  add(t('Studio'), t('Language: {x}', { x: S.lang === 'it' ? 'English' : 'Italiano' }), () => { S.lang = S.lang === 'it' ? 'en' : 'it'; persist(); applyI18n(); renderAll(); });
  add(t('Studio'), t('Rounds panel'), () => toggleDrawer(), 'R');
  add(t('Studio'), t('Settings'), () => openSettings());
  add(t('Studio'), t('Team'), () => openTeam());
  add(t('Studio'), t('Keyboard shortcuts'), openHelp, '?');
  add(t('Tools'), t('Comment on an element'), () => setMode(S.mode === 'pick' ? '' : 'pick'), 'C');
  add(t('Tools'), t('Edit text inline'), () => setMode(S.mode === 'edit' ? '' : 'edit'), 'E');
  add(t('Tools'), t('Tune and fonts'), () => { S.inspTab = 'tune'; toggleInsp(true); }, 'I');
  add(t('Tools'), t('CSS tokens'), () => { S.inspTab = 'tokens'; toggleInsp(true); });
  add(t('Tools'), t('Checklist'), () => { S.inspTab = 'checklist'; toggleInsp(true); });
  add(t('Tools'), t('Accessibility audit'), () => { S.inspTab = 'audit'; toggleInsp(true); });
  add(t('Tools'), t('Brand palette'), () => openSettings('brand'));
  if (!STATIC) add(t('Tools'), t('Attach reference image'), () => $('#fileIn').click());
  if (c && !['tree', 'overview'].includes(S.layout)) {
    c.items.forEach((it, i) => {
      add(t('Variant'), t('Select {x}', { x: `${letterOf(c, it)} · ${it.v.label}` }), () => toggleSel(it.key, it.fk), i < 9 ? String(i + 1) : null);
      add(t('Variant'), t('Full screen {x}', { x: `${letterOf(c, it)} · ${it.v.label}` }), () => openFocus(it.fk));
      add(t('Variant'), t('More like {x}', { x: letterOf(c, it) }), () => sendQuick('more', it));
      add(t('Variant'), `${S.stars.includes(it.fk) ? t('Unstar') : t('Star')} ${letterOf(c, it)}`, () => toggleStar(it.fk));
      add(t('Export'), t('Download {x} as PNG', { x: letterOf(c, it) }), () => exportImage(it, 'png'));
      add(t('Export'), t('Download {x} as JPG', { x: letterOf(c, it) }), () => exportImage(it, 'jpeg'));
      add(t('Export'), t('Download {x} as HTML with my changes', { x: letterOf(c, it) }), () => exportHtml(it, 'live'));
      add(t('Export'), t('Download {x} as original HTML', { x: letterOf(c, it) }), () => exportHtml(it, 'source'));
    });
    if (c.kind === 'approved') { add(t('Round'), t('Revoke approval'), () => revokeApproval(c)); if (c.r.variants.length > 1) add(t('Round'), t('Show discarded variants'), () => { S.showDiscarded[c.r.id] = true; renderRound(true); }); }
    if (c.kind === 'discarded') add(t('Round'), t('Back to approved design'), () => { S.showDiscarded[c.r.id] = false; renderRound(true); });
    for (const a of availableActions(c)) add(t('Send'), a.label, () => submit(a.action));
  }
  add(t('Go'), t('Shortlist'), () => selectRound(SHORT));
  S.data.rounds.slice().reverse().forEach(r => add(t('Go'), `${rnum(r.id)} ${[r.group, r.subgroup].filter(Boolean).join(' / ')}${r.group ? ' · ' : ''}${r.title}`, () => selectRound(r.id)));
  return L;
}
let palItems = [], palIdx = 0;
function openPalette() { hideMenu(); $('#pal').classList.add('show'); $('#palIn').value = ''; $('#palIn').placeholder = t('Type a command or a round…'); renderPalette(); $('#palIn').focus(); }
function closePalette() { $('#pal').classList.remove('show'); }
function renderPalette() {
  const q = $('#palIn').value.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  palItems = commands().filter(cm => words.every(w => (cm.g + ' ' + cm.label).toLowerCase().includes(w))).slice(0, 80);
  palIdx = Math.min(palIdx, Math.max(0, palItems.length - 1));
  const ul = $('#palList'); ul.innerHTML = '';
  palItems.forEach((cm, i) => ul.append(h('li', { role: 'option', 'aria-selected': String(i === palIdx), onclick: () => runPal(i), onmousemove: () => { if (palIdx !== i) { palIdx = i; renderPalette(); } } },
    h('span', { class: 'g' }, cm.g), h('span', { class: 'l' }, cm.label), cm.kbd ? h('kbd', {}, cm.kbd) : null)));
  if (!palItems.length) ul.append(h('li', {}, h('span', { class: 'l hint' }, t('No matching command'))));
  ul.children[palIdx]?.scrollIntoView({ block: 'nearest' });
}
function runPal(i) { const cm = palItems[i]; closePalette(); cm && cm.run(); }
$('#palIn').addEventListener('input', () => { palIdx = 0; renderPalette(); });
$('#palIn').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); palIdx = Math.min(palItems.length - 1, palIdx + 1); renderPalette(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); palIdx = Math.max(0, palIdx - 1); renderPalette(); }
  if (e.key === 'Enter') { e.preventDefault(); runPal(palIdx); }
  if (e.key === 'Escape') closePalette();
});
$('#pal').addEventListener('pointerdown', (e) => { if (e.target.id === 'pal') closePalette(); });
function toggleNotes() { S.notesAll = !S.notesAll; persist(); updateCards(); }
