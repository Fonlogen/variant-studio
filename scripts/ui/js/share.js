// Variant Studio 4.0 — anchored popovers: the background behind the variants, and "open on your phone" (QR, PIN, link).
'use strict';

// ---------------- anchored popovers ----------------
// Popover API for top layer and light dismiss. CSS anchor positioning places them where supported (app.css, @supports);
// elsewhere they are placed here, under the trigger, flipped above when there is no room.
const ANCHORS = CSS.supports('position-area: block-end');
let anchorEl = null;
function placeAnchored(pop, anchor) {
  if (anchorEl && anchorEl !== anchor) anchorEl.style.anchorName = '';
  anchorEl = anchor;
  if (ANCHORS) { anchor.style.anchorName = '--vs-anchor'; pop.style.positionAnchor = '--vs-anchor'; }
  requestAnimationFrame(() => {
    const r = anchor.getBoundingClientRect();
    if (!ANCHORS) {
      const w = pop.offsetWidth, hh = pop.offsetHeight;
      const below = r.bottom + 10 + hh <= innerHeight - 8 || r.top < hh + 18;
      Object.assign(pop.style, { margin: '0', inset: 'auto', left: Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px', top: (below ? r.bottom + 10 : Math.max(8, r.top - hh - 10)) + 'px' });
    }
    // the arrow points at the middle of the trigger, wherever the popover ended up
    const p = pop.getBoundingClientRect();
    pop.style.setProperty('--ax', Math.max(18, Math.min(p.width - 18, r.left + r.width / 2 - p.left)) + 'px');
    pop.classList.toggle('up', p.top < r.top);
    pop.classList.toggle('noarrow', p.right < r.left || p.left > r.right);
  });
}

// ---------------- background behind the variants ----------------
const CANVASES = () => [['light', t('Light'), '#f4f4f6'], ['gray', t('Gray'), '#c9c9cf'], ['dark', t('Dark'), '#232328'], ['black', t('Black'), '#000000'], ['checker', t('Checkerboard'), null], ['custom', t('Custom'), null]];
const CHECKER = 'conic-gradient(#e2e2e7 25%, #fff 0 50%, #e2e2e7 0 75%, #fff 0)';
function canvasInfo() {
  if (S.canvas === 'custom') return { name: t('Custom'), color: S.canvasColor };
  if (S.canvas === 'white') return { name: t('White'), color: '#ffffff' };
  if (S.canvas === 'none') return { name: t('Page background'), color: null };
  const c = CANVASES().find(x => x[0] === S.canvas) || CANVASES()[0];
  return { name: c[1], color: c[2] };
}
// the card stages take the same background as the variants, so components sit on what the user picked
function applyStageCanvas() {
  const st = document.documentElement.style, { color } = canvasInfo();
  if (S.canvas === 'checker') { st.setProperty('--stage', '#fff'); st.setProperty('--stage-img', CHECKER); }
  else { st.removeProperty('--stage-img'); if (color) st.setProperty('--stage', color); else st.removeProperty('--stage'); }
}
function paintBgButton() {
  const sw = $('#bgSw'); if (!sw) return;
  const { name, color } = canvasInfo();
  sw.classList.toggle('ck', S.canvas === 'checker');
  sw.style.setProperty('--sw', color || 'transparent');
  $('#bgBtn').title = t('Background behind the variants: {x}', { x: name });
  $('#bgBtn').setAttribute('aria-label', t('Background behind the variants: {x}', { x: name }));
}
function setCanvas(v, color) {
  S.canvas = v; S.canvasPicked = true; if (color) S.canvasColor = color;
  persist(); applyStageCanvas(); paintBgButton(); broadcastFrames();
  if ($('#bgPop').matches(':popover-open')) renderBgPop();
}
function renderBgPop() {
  const { name, color } = canvasInfo();
  $('#bgTitle').textContent = t('Background'); $('#bgName').textContent = name;
  const box = $('#bgSws'); box.innerHTML = ''; box.setAttribute('aria-label', t('Background'));
  for (const [v, label, col] of CANVASES()) {
    const b = h('button', { class: v === 'checker' ? 'ck' : v === 'custom' ? 'cu' : null, title: label, 'aria-label': label, 'aria-pressed': String(S.canvas === v), style: col ? `--sw:${col}` : null, html: v === 'custom' ? I.palette : null });
    b.onclick = () => (v === 'custom' ? $('#bgCustom').click() : setCanvas(v));
    box.append(b);
  }
  $('#bgCustom').value = S.canvasColor || '#ffffff';
  $('#bgHex').textContent = (color || '—').toUpperCase();
  $('#bgCustomLbl').textContent = t('Custom colour…');
}
(() => {
  const pop = $('#bgPop');
  pop.addEventListener('toggle', (e) => {
    $('#bgBtn').setAttribute('aria-expanded', String(e.newState === 'open'));
    if (e.newState === 'open') { renderBgPop(); placeAnchored(pop, $('#bgBtn')); }
  });
  $('#bgCustom').addEventListener('input', (e) => setCanvas('custom', e.target.value));
})();

// ---------------- open on your phone ----------------
// One popover for the top bar button (the whole session) and for each card (that variant, deep link).
// Data from /api/share: owner and guest PIN, local / LAN / tunnel URLs, the per-variant URL template.
const QR = { anchor: null, it: null, net: 'lan', role: 'owner', data: null, starting: false, error: '' };
async function loadShare() {
  const r = await fetch('/api/share', { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
function openQr(anchor, it = null) {
  if (STATIC || TEAM) return;
  const pop = $('#qrPop');
  if (pop.matches(':popover-open') && QR.anchor === anchor) { pop.hidePopover(); return; }
  QR.anchor = anchor; QR.it = it; QR.error = '';
  if (QR.data?.remote?.state !== 'on' && !QR.starting) QR.net = 'lan';
  renderQr();
  if (!pop.matches(':popover-open')) pop.showPopover();
  placeAnchored(pop, anchor);
  loadShare().then(d => { QR.data = d; renderQr(); placeAnchored(pop, anchor); }).catch(e => { QR.error = t('Could not reach the studio'); renderQr(); });
}
function qrSvgOf(text) {
  try {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const q = qrcode(0, 'M'); q.addData(text, 'Byte'); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true, alt: t('QR code for {x}', { x: text }) });
  } catch { return ''; }
}
function qrUrl() {
  const d = QR.data; if (!d) return '';
  const set = QR.role === 'owner' ? d.urls : d.guest_urls;
  const base = QR.net === 'tunnel' ? set.tunnel : (set.lan || set.local);
  if (!base) return '';
  if (!QR.it) return base;
  return d.variant_url_template.replace('{url}', base).replace('{round}', encodeURIComponent(QR.it.r.id)).replace('{variant}', encodeURIComponent(QR.it.v.id));
}
async function startTunnel() {
  const rm = QR.data?.remote || {};
  if (rm.enabled === false || rm.state === 'disabled') { QR.error = t('Remote sharing is turned off. Run the Variant Studio installer again and enable it.'); return renderQr(); }
  if (!rm.available || rm.state === 'missing') { QR.error = t('The tunnel needs cloudflared. Run the Variant Studio installer again and enable remote sharing.'); return renderQr(); }
  QR.net = 'tunnel'; QR.error = '';
  if (rm.state === 'on') return renderQr();
  QR.starting = true; renderQr();
  try { await fetch('/api/remote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: true }) }); } catch {}
  const until = Date.now() + 45000;
  while (Date.now() < until && $('#qrPop').matches(':popover-open')) {
    try { QR.data = await loadShare(); } catch {}
    const st = QR.data?.remote?.state;
    if (st === 'on' && QR.data.urls.tunnel) break;
    if (st === 'error') { QR.error = t('The tunnel stopped: {x}', { x: QR.data.remote.error || '?' }); QR.net = 'lan'; break; }
    await new Promise(r => setTimeout(r, 1000));
  }
  QR.starting = false; renderQr(); placeAnchored($('#qrPop'), QR.anchor);
}
function renderQr() {
  const pop = $('#qrPop'); pop.innerHTML = '';
  const d = QR.data;
  const url = qrUrl();
  const pin = d ? (QR.role === 'owner' ? d.pin : d.guest_pin) : '·····';
  const tile = h('div', { class: 'qr-tile' });
  if (QR.starting) tile.append(h('div', {}, h('div', { class: 'spin' }), t('Opening the tunnel…')));
  else if (url) tile.innerHTML = qrSvgOf(url);
  else tile.append(h('div', { class: 'spin' }));
  const copy = h('button', { html: I.copy + `<span>${t('Copy')}</span>`, disabled: !url || null, onclick: () => copyText(url).then(() => toast(t('Link copied'))) });
  const netSeg = h('div', { class: 'qr-seg', role: 'group', 'aria-label': t('Network') },
    h('button', { 'aria-pressed': String(QR.net === 'lan'), html: I.wifi + `<span>${t('Local network')}</span>`, onclick: () => { QR.net = 'lan'; QR.error = ''; renderQr(); } }),
    h('button', { 'aria-pressed': String(QR.net === 'tunnel'), disabled: QR.starting || null, html: I.globe + `<span>${t('Tunnel')}</span>`, onclick: startTunnel }));
  const roleSeg = h('div', { class: 'qr-seg', role: 'group', 'aria-label': t('Permission') },
    h('button', { 'aria-pressed': String(QR.role === 'owner'), onclick: () => { QR.role = 'owner'; renderQr(); } }, t('Owner (decides)')),
    h('button', { 'aria-pressed': String(QR.role === 'guest'), onclick: () => { QR.role = 'guest'; renderQr(); } }, t('Guest (views and votes)')));
  const hint = QR.error || (d && QR.net === 'lan' && !d.urls.lan ? t('The studio only listens on this computer: a phone cannot reach it. Use the tunnel.')
    : QR.net === 'tunnel' ? (QR.role === 'owner' ? t('Anyone with this link can decide for you until you stop sharing (Team panel).') : t('Anyone with this link can view and vote until you stop sharing (Team panel).'))
      : t('The phone must be on the same Wi-Fi'));
  pop.append(h('div', { class: 'qr-b' },
    h('div', { class: 'qr-h' }, h('h2', { id: 'qrTitle' }, t('Open on your phone'), QR.it ? h('small', {}, `${letterOf(ctx() || {}, QR.it)} · ${labelOf(QR.it)}`) : null),
      h('button', { class: 'ib sm', title: t('Close'), 'aria-label': t('Close'), html: I.x, onclick: () => pop.hidePopover() })),
    tile,
    h('div', { class: 'qr-pin' }, h('span', {}, 'PIN'), h('b', {}, pin)),
    h('div', { class: 'qr-url' }, h('code', { title: url }, url || '…'), copy),
    h('div', { class: 'qr-opt' }, netSeg, roleSeg),
    h('p', { class: 'qr-hint' + (QR.error || (d && QR.net === 'lan' && !d.urls.lan) ? ' bad' : '') }, hint)));
}
(() => {
  const pop = $('#qrPop');
  pop.addEventListener('toggle', (e) => { QR.anchor?.setAttribute('aria-expanded', String(e.newState === 'open')); });
  $('#qrBtn').onclick = (e) => openQr(e.currentTarget, null);
  addEventListener('resize', () => { if (pop.matches(':popover-open') && QR.anchor?.isConnected) placeAnchored(pop, QR.anchor); });
})();
