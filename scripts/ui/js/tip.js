// Variant Studio 3.0 — tooltips on every control, placed where they fit:
// above by default, then below, right, left; data-tip-pos="bottom|right|left|top" sets the preferred side.
// Text comes from title (taken over from the native tooltip), data-tip, aria-label, or the button's own text.
'use strict';
(() => {
  const tip = document.createElement('div');
  tip.id = 'tip'; tip.setAttribute('role', 'tooltip');
  const txt = document.createElement('span'); const key = document.createElement('kbd'); const arrow = document.createElement('i');
  tip.append(txt, key, arrow);
  const mount = () => { if (!tip.isConnected && document.body) document.body.append(tip); };
  mount(); document.addEventListener('DOMContentLoaded', mount);

  const GAP = 8, M = 8, DELAY = 120;
  const CONTROLS = '[title], [data-tip], button, [role=button], [role=tab], [role=option], a[href], select, input[type=checkbox], input[type=color], input[type=range]';
  let cur = null, curText = '', timer = 0, lastHide = 0, px = -1, py = -1, quiet = false;

  // the element under the pointer that should have a tooltip, and its text (read fresh every time)
  function source(el) {
    const n = el && el.closest && el.closest(CONTROLS);
    if (!n || n.tagName === 'IFRAME' || n.closest('#tip') || n.closest('[data-no-tip]')) return null;
    if (n.hasAttribute('title')) { // take over the native tooltip so the browser does not show its own
      const t = n.getAttribute('title'); n.removeAttribute('title');
      if (t) n.dataset.tip = t; else delete n.dataset.tip;
    }
    return textOf(n) ? n : null;
  }
  function textOf(n) {
    if (n.dataset.tip) return n.dataset.tip;
    const al = n.getAttribute('aria-label'); if (al) return al;
    if (n.matches('input, select')) { const l = n.closest('label'); return l ? l.textContent.trim().slice(0, 80) : ''; }
    const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
    return t.length <= 60 ? t : '';
  }
  function place(n) {
    const raw = textOf(n); if (!raw) return hide();
    curText = raw;
    const m = raw.match(/^([\s\S]*?)\s*\(([^()]{1,14})\)\s*$/); // "Close (I)" -> text + key
    txt.textContent = m ? m[1] : raw; key.textContent = m ? m[2] : ''; key.hidden = !m;
    mount();
    tip.className = 'show'; tip.style.left = '0px'; tip.style.top = '0px';
    const a = n.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    if (!a.width && !a.height) return hide();
    const pref = n.dataset.tipPos || n.closest('[data-tip-pos]')?.dataset.tipPos || 'top';
    const order = [pref, ...['top', 'bottom', 'right', 'left'].filter(s => s !== pref)];
    const fits = {
      top: a.top - h - GAP >= M, bottom: a.bottom + h + GAP <= innerHeight - M,
      right: a.right + w + GAP <= innerWidth - M, left: a.left - w - GAP >= M,
    };
    const side = order.find(s => fits[s]) || 'bottom';
    let x, y;
    if (side === 'top' || side === 'bottom') { x = a.left + a.width / 2 - w / 2; y = side === 'top' ? a.top - h - GAP : a.bottom + GAP; }
    else { y = a.top + a.height / 2 - h / 2; x = side === 'right' ? a.right + GAP : a.left - w - GAP; }
    const cx = Math.max(M, Math.min(innerWidth - w - M, x)), cy = Math.max(M, Math.min(innerHeight - h - M, y));
    tip.style.left = cx + 'px'; tip.style.top = cy + 'px';
    tip.dataset.side = side;
    if (side === 'top' || side === 'bottom') { arrow.style.left = Math.max(10, Math.min(w - 10, a.left + a.width / 2 - cx)) + 'px'; arrow.style.top = ''; }
    else { arrow.style.top = Math.max(10, Math.min(h - 10, a.top + a.height / 2 - cy)) + 'px'; arrow.style.left = ''; }
  }
  function show(n, now) {
    if (cur === n && tip.classList.contains('show')) return;
    clearTimeout(timer);
    cur = n;
    const wait = now || Date.now() - lastHide < 700 ? 0 : DELAY;
    timer = setTimeout(() => { if (cur === n && n.isConnected) place(n); }, wait);
  }
  function hide() { clearTimeout(timer); if (tip.classList.contains('show')) lastHide = Date.now(); tip.className = ''; cur = null; curText = ''; }
  const silence = () => { quiet = true; hide(); };

  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    px = e.clientX; py = e.clientY; quiet = false;
    const n = source(e.target);
    if (n) show(n); else if (cur) hide();
  }, { capture: true, passive: true });
  addEventListener('pointerover', (e) => { if (e.pointerType !== 'touch' && !quiet) { const n = source(e.target); if (n) show(n); } }, true);
  document.addEventListener('pointerleave', hide);
  addEventListener('blur', hide);
  addEventListener('focusin', (e) => { const n = source(e.target); if (n && e.target.matches(':focus-visible')) show(n, true); });
  addEventListener('focusout', (e) => { if (cur && cur.contains(e.target)) hide(); });
  for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, silence, true);
  addEventListener('scroll', silence, true);

  // The studio re-renders controls often (agent badge every second, dock, rounds list). Keep the tooltip in sync
  // with what is really under the pointer, so it appears even when the hovered node was just replaced.
  setInterval(() => {
    if (quiet || px < 0 || document.hidden) return;
    const el = document.elementFromPoint(px, py);
    const n = el && source(el);
    if (!n) { if (cur) hide(); return; }
    if (n !== cur) show(n, true);
    else if (tip.classList.contains('show') && textOf(n) !== curText) place(n);
  }, 250);
  window.hideTip = hide;
})();
