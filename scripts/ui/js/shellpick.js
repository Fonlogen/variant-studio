// Shell picker: the design mode's options (terminal style, phone and frame, window and size) behind one button,
// in a popover of collapsible groups. Round-wide from the top bar, per variant from the card's ⋯ menu.
'use strict';

const PHONE_SKINS = { ip8: 'iPhone 8', ipx: 'iPhone X', ip18: 'iPhone 18', px3: 'Pixel 3', px6: 'Pixel 6', px8: 'Pixel 8', px10p: 'Pixel 10 Pro', s25: 'Galaxy S25', s25u: 'Galaxy S25 Ultra' };
const DESK_SKINS = { mac: 'macOS', yosemite: 'OS X Yosemite', leopard: 'Mac OS X Leopard', aqua: 'Mac OS X Aqua', win11: 'Windows 11', win10: 'Windows 8 / 10', win7: 'Windows 7', xp: 'Windows XP', gnome: 'Ubuntu GNOME', kde: 'KDE Plasma' };
const pickOf = (src, ids) => ids.map(k => [k, src[k]]);
// keys: one option each, its default and its groups ([title, [[value, label]…]]); toggle: an on/off option; lead: the button's first word
function shellChoices(r) {
  if (r.design === 'tui') return { lead: t('Terminal'), keys: [{ key: 'shell', def: 'acrylic', groups: [
    [t('Styles'), [['acrylic', t('Acrylic')], ['tabs', t('Tabs')], ['tmux', 'tmux']]],
    [t('Systems'), [['plain', t('Plain')], ['ubuntu', 'Ubuntu'], ['cmd', 'CMD'], ['powershell', 'PowerShell'], ['wt', 'Windows Terminal']]]] }] };
  if (r.design === 'app') return { keys: [
    { key: 'skin', def: 'ip18', groups: [['iOS', pickOf(PHONE_SKINS, ['ip8', 'ipx', 'ip18'])], ['Android', pickOf(PHONE_SKINS, ['px3', 'px6', 'px8', 'px10p', 's25', 's25u'])]] },
    { key: 'frame', def: 'real', groups: [[t('Frame'), [['real', t('Realistic')], ['flat', t('Flat outline')], ['clay', t('Clay')]]]] }] };
  if (r.design === 'desktop') return { toggle: { key: 'desk', label: t('Show desktop') }, keys: [
    { key: 'skin', def: 'mac', groups: [['macOS', pickOf(DESK_SKINS, ['mac', 'yosemite', 'leopard', 'aqua'])], ['Windows', pickOf(DESK_SKINS, ['win11', 'win10', 'win7', 'xp'])], ['Linux', pickOf(DESK_SKINS, ['gnome', 'kde'])]] },
    { key: 'win', def: '1280x800', groups: [[t('Window'), ['1024x768', '1280x800', '1440x900', '1920x1080'].map(x => [x, x.replace('x', '×')])]] }] };
  return null;
}
const shellVal = (o, k) => String(o[k.key] ?? k.def);
const shellLabel = (k, v) => (k.groups.flatMap(g => g[1]).find(([x]) => x === v) || [v, v])[1];
function shellSummary(r, vid) {
  const ch = shellChoices(r), o = shellOpts(r, vid);
  return [ch.lead, ...ch.keys.map(k => shellLabel(k, shellVal(o, k)))].filter(Boolean).join(' · ');
}

// ---- the popover: one element, scoped to a round (vid null) or a variant ----
let SP = null, spBtn = null;
const anchorOk = CSS.supports('position-area: block-end');
function spEl() {
  let el = $('#shellPick');
  if (el) return el;
  el = h('div', { id: 'shellPick', class: 'spick', popover: 'auto' });
  el.addEventListener('beforetoggle', (e) => {
    if (!SP) return;
    SP.anchor.setAttribute('aria-expanded', String(e.newState === 'open'));
    if (e.newState === 'open') { SP.anchor.style.setProperty('anchor-name', '--vs-spick'); SP.fresh = true; paintPick(); }
    else SP.anchor.style.removeProperty('anchor-name');
  });
  el.addEventListener('toggle', (e) => {
    if (e.newState !== 'open') { if (el.contains(document.activeElement) || document.activeElement === document.body) SP?.anchor.focus({ preventScroll: true }); return; }
    if (!anchorOk) placePick();
    (el.querySelector('details[open] input:checked') || el.querySelector('summary'))?.focus({ preventScroll: true });
  });
  document.body.append(el);
  return el;
}
// browsers without anchor positioning: under the anchor, right-aligned, flipped up when it would not fit
function placePick() {
  const el = spEl(), rc = SP.anchor.getBoundingClientRect(), w = el.offsetWidth, hh = el.offsetHeight;
  el.style.left = Math.max(8, Math.min(innerWidth - w - 8, rc.right - w)) + 'px';
  el.style.top = (rc.bottom + hh + 8 > innerHeight ? Math.max(8, rc.top - hh - 6) : rc.bottom + 6) + 'px';
}
function paintPick() {
  const el = spEl(), { r, vid } = SP, ch = shellChoices(r);
  if (!ch) return el.hidePopover();
  const o = shellOpts(r, vid), own = vid ? (((S.rstate[r.id] || {}).by || {})[vid] || {}) : {};
  // first paint: only the groups holding a current choice are open; later paints keep what the user expanded
  const was = SP.fresh ? null : new Set([...el.querySelectorAll('details[open]')].map(d => d.dataset.g));
  const focusK = el.contains(document.activeElement) ? document.activeElement.dataset?.k : null;
  const scroll = el.scrollTop; SP.fresh = false;
  el.innerHTML = '';
  const v = vid && r.variants.find(x => x.id === vid);
  el.append(h('div', { class: 'sp-h' }, h('b', {}, vid ? t('Shell style for {x}', { x: v?.label || vid }) : t('Shell style')),
    h('small', {}, vid ? t('Only this variant') : t('Every variant of this round'))));
  if (vid) el.append(h('button', { class: 'sp-reset', type: 'button', disabled: Object.keys(own).length ? null : true,
    onclick: () => { setShell(r, Object.fromEntries([...ch.keys.map(k => k.key), ch.toggle?.key].filter(Boolean).map(k => [k, null])), vid); afterPick(); } },
    h('span', { html: I.refresh || '' }), t('Use the round\'s')));
  for (const k of ch.keys) {
    const val = shellVal(o, k);
    k.groups.forEach(([title, opts], gi) => {
      const id = k.key + gi, cur = opts.find(([x]) => x === val);
      const d = h('details', { class: 'sp-g', 'data-g': id, open: (was ? was.has(id) : !!cur) || null },
        h('summary', {}, h('span', { class: 'lb' }, title), cur ? h('span', { class: 'sp-cur' }, cur[1]) : null));
      const grp = h('div', { role: 'radiogroup', 'aria-label': title });
      for (const [x, l] of opts) {
        grp.append(h('label', { class: 'sp-o' },
          h('input', { type: 'radio', name: 'sp-' + id, value: x, 'data-k': k.key, checked: x === val || null,
            onchange: () => { setShell(r, { [k.key]: !vid && x === k.def ? null : x }, vid); afterPick(); } }),
          h('span', {}, l), vid && own[k.key] === x ? h('small', {}, t('this variant')) : null));
      }
      d.append(grp); el.append(d);
    });
  }
  if (ch.toggle) {
    const tk = ch.toggle.key, on = !!o[tk] && o[tk] !== '0';
    el.append(h('label', { class: 'sp-t' }, h('input', { type: 'checkbox', 'data-k': tk, checked: on || null,
      onchange: (e) => { setShell(r, { [tk]: e.target.checked ? '1' : vid ? '0' : null }, vid); afterPick(); } }), h('span', {}, ch.toggle.label)));
  }
  el.scrollTop = scroll;
  if (focusK) (el.querySelector(`input[data-k="${focusK}"]:checked`) || el.querySelector(`input[data-k="${focusK}"]`))?.focus({ preventScroll: true });
}
function afterPick() {
  paintPick();
  if (spBtn && SP && !SP.vid) paintPickBtn(SP.r);
}
function paintPickBtn(r) {
  spBtn.dataset.round = r.id;
  spBtn.innerHTML = '';
  spBtn.append(h('span', {}, shellSummary(r)), h('span', { html: I.chevD }));
  spBtn.title = t('{x}: every variant of this round (a variant can override it from its ⋯ menu)', { x: t('Shell style') });
}
// the top bar's button (one per round, reused so an open popover keeps its anchor)
function shellPickInto(box, r) {
  if (!r || !shellChoices(r)) return;
  spEl();
  spBtn ||= h('button', { class: 'pillbtn spbtn', type: 'button', popovertarget: 'shellPick', 'aria-expanded': 'false',
    onclick: () => { SP = { r: round(spBtn.dataset.round), vid: null, anchor: spBtn }; } });
  paintPickBtn(r);
  box.append(spBtn);
}
function openShellPick(anchor, r, vid) {
  const el = spEl();
  if (el.matches(':popover-open')) el.hidePopover();
  SP = { r, vid, anchor };
  el.showPopover();
}
// card ⋯ menu: one entry that opens the same picker for this variant
function shellMenu(it, anchor) {
  if (!shellChoices(it.r)) return [];
  const own = ((S.rstate[it.r.id] || {}).by || {})[it.v.id];
  return [{ label: t('Shell style…'), icon: 'sliders', checked: !!own, title: shellSummary(it.r, it.v.id), run: () => openShellPick(anchor, it.r, it.v.id) }, { sep: true }];
}
