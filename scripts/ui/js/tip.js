// Variant Studio 3.0 — tooltips. Any element with a title (or data-tip) gets a styled tooltip placed where it fits:
// above by default, then below, right, left; data-tip-pos="bottom|right|left|top" sets the preferred side.
'use strict';
(() => {
  const tip = document.createElement('div');
  tip.id = 'tip'; tip.setAttribute('role', 'tooltip');
  const txt = document.createElement('span'); const key = document.createElement('kbd'); const arrow = document.createElement('i');
  tip.append(txt, key, arrow);
  document.addEventListener('DOMContentLoaded', () => document.body.append(tip));
  if (document.body) document.body.append(tip);
  let cur = null, timer = 0, lastHide = 0;
  const GAP = 8, M = 8;

  function source(el) {
    const n = el && el.closest && el.closest('[title], [data-tip]');
    if (!n || n.tagName === 'IFRAME' || n.closest('#tip')) return null;
    if (n.hasAttribute('title')) { // take over the native tooltip
      const t = n.getAttribute('title'); n.removeAttribute('title');
      if (t) { n.dataset.tip = t; if (!n.hasAttribute('aria-label') && !n.textContent.trim()) n.setAttribute('aria-label', t.replace(/\s*\(([^()]{1,14})\)\s*$/, '')); }
    }
    return n.dataset.tip ? n : null;
  }
  function place(n) {
    const raw = n.dataset.tip;
    const m = raw.match(/^([\s\S]*?)\s*\(([^()]{1,14})\)\s*$/); // "Close (I)" -> text + key
    txt.textContent = m ? m[1] : raw; key.textContent = m ? m[2] : ''; key.hidden = !m;
    tip.className = 'show'; tip.style.left = '0px'; tip.style.top = '0px';
    const a = n.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
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
    // arrow keeps pointing at the anchor even when the bubble was clamped
    if (side === 'top' || side === 'bottom') { arrow.style.left = Math.max(10, Math.min(w - 10, a.left + a.width / 2 - cx)) + 'px'; arrow.style.top = ''; }
    else { arrow.style.top = Math.max(10, Math.min(h - 10, a.top + a.height / 2 - cy)) + 'px'; arrow.style.left = ''; }
  }
  function show(n, now) {
    clearTimeout(timer);
    if (cur === n) return;
    cur = n;
    timer = setTimeout(() => { if (cur === n && n.isConnected) place(n); }, now || Date.now() - lastHide < 400 ? 0 : 420);
  }
  function hide() { clearTimeout(timer); if (tip.classList.contains('show')) lastHide = Date.now(); tip.className = ''; cur = null; }
  addEventListener('pointerover', (e) => { if (e.pointerType === 'touch') return; const n = source(e.target); if (n) show(n); else if (cur && !cur.contains(e.target)) hide(); }, true);
  addEventListener('pointerout', (e) => { if (cur && !cur.contains(e.relatedTarget)) hide(); }, true);
  addEventListener('focusin', (e) => { const n = source(e.target); if (n && e.target.matches(':focus-visible')) show(n, true); });
  addEventListener('focusout', hide);
  for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, hide, true);
  addEventListener('scroll', hide, true);
  window.hideTip = hide;
})();
