// Injected into every variant preview. Talks to the gallery via postMessage.
(() => {
  if (window.__vsFrame) return; window.__vsFrame = true;
  const qs = new URLSearchParams(location.search);
  const meta = { round: qs.get('round') || '', variant: qs.get('variant') || '' };
  const post = (msg) => { try { parent.postMessage({ vs: true, ...meta, ...msg }, '*'); } catch {} };

  // ---- theme / canvas (from query, then live via messages) ----
  const html = document.documentElement;
  function applyTheme(t) { if (!t) return; html.dataset.theme = t; html.style.colorScheme = t; html.classList.toggle('dark', t === 'dark'); }
  function applyCanvas(c) { if (c) html.dataset.vsCanvas = c; }
  applyTheme(qs.get('theme')); applyCanvas(qs.get('canvas'));

  // ---- size reporting ----
  let lastH = 0;
  function measure() {
    const root = document.getElementById('vs-root');
    const b = document.body;
    if (!b) return;
    // never use html.scrollHeight: it is >= the iframe height and would prevent shrinking
    const h = Math.ceil(root ? root.getBoundingClientRect().bottom + scrollY : b.scrollHeight);
    if (Math.abs(h - lastH) > 1) { lastH = h; post({ type: 'size', h }); }
  }
  const ro = new ResizeObserver(measure);
  const observe = () => { ro.observe(document.body); const r = document.getElementById('vs-root'); if (r) ro.observe(r); measure(); };
  if (document.body) observe(); else document.addEventListener('DOMContentLoaded', observe);
  addEventListener('load', () => { measure(); setTimeout(measure, 300); setTimeout(measure, 1200); });

  // ---- errors ----
  function report(message, extra = {}) {
    post({ type: 'error', message });
    if (location.protocol.startsWith('http')) {
      fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...meta, message, ...extra }) }).catch(() => {});
    }
  }
  addEventListener('error', (e) => {
    if (e.target && e.target !== window && (e.target.src || e.target.href)) report(`Failed to load ${e.target.tagName.toLowerCase()}: ${e.target.src || e.target.href}`);
    else report(e.message || 'Script error', { line: e.lineno });
  }, true);
  addEventListener('unhandledrejection', (e) => report('Unhandled promise: ' + (e.reason && e.reason.message || e.reason)));

  // ---- element picking (comment on a specific element) ----
  let picking = false, hoverEl = null;
  const box = document.createElement('div');
  box.setAttribute('data-vs-overlay', '');
  box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #2f5bff;background:rgba(47,91,255,.12);border-radius:4px;display:none;transition:all .06s';
  const tag = document.createElement('div');
  tag.style.cssText = 'position:absolute;left:-2px;top:-22px;font:600 11px/18px system-ui;background:#2f5bff;color:#fff;padding:0 6px;border-radius:4px;white-space:nowrap';
  box.appendChild(tag);

  function selectorFor(el) {
    if (!(el instanceof Element)) return '';
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.body && el.id !== 'vs-root') {
      if (el.id) { parts.unshift('#' + CSS.escape(el.id)); break; }
      let s = el.tagName.toLowerCase();
      const cls = [...el.classList].filter((c) => !/^(hover|focus|active)/.test(c)).slice(0, 2);
      if (cls.length) s += '.' + cls.map((c) => CSS.escape(c)).join('.');
      const sib = el.parentElement ? [...el.parentElement.children].filter((c) => c.tagName === el.tagName) : [];
      if (sib.length > 1) s += `:nth-of-type(${sib.indexOf(el) + 1})`;
      parts.unshift(s);
      el = el.parentElement;
    }
    return parts.join(' > ');
  }
  function describe(el) {
    const t = (el.getAttribute('aria-label') || el.getAttribute('alt') || el.textContent || '').replace(/\s+/g, ' ').trim();
    return t.length > 80 ? t.slice(0, 77) + '…' : t;
  }
  function onMove(e) {
    const el = e.target;
    if (!picking || el === box || el === html || el === document.body) return;
    hoverEl = el;
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    tag.textContent = el.tagName.toLowerCase() + (el.classList[0] ? '.' + el.classList[0] : '');
    tag.style.top = r.top < 24 ? (r.height + 2) + 'px' : '-22px';
  }
  function onClick(e) {
    if (!picking) return;
    e.preventDefault(); e.stopPropagation();
    const el = hoverEl || e.target;
    const r = el.getBoundingClientRect();
    post({ type: 'picked', selector: selectorFor(el), text: describe(el), tag: el.tagName.toLowerCase(), rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } });
  }
  function setPicking(on) {
    picking = on;
    if (on) { document.body.appendChild(box); html.style.cursor = 'crosshair'; }
    else { box.remove(); box.style.display = 'none'; html.style.cursor = ''; }
  }
  addEventListener('mousemove', onMove, true);
  addEventListener('click', onClick, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && picking) post({ type: 'pick-cancel' }); });

  // highlight previously annotated elements
  let marks = [];
  function showMarks(list) {
    marks.forEach((m) => m.remove()); marks = [];
    (list || []).forEach((a, i) => {
      let el; try { el = document.querySelector(a.selector); } catch {}
      if (!el) return;
      const m = document.createElement('div');
      m.setAttribute('data-vs-overlay', '');
      const place = () => { const r = el.getBoundingClientRect(); m.style.left = (r.right - 10) + 'px'; m.style.top = (r.top - 10) + 'px'; };
      m.textContent = i + 1;
      m.style.cssText = 'position:fixed;z-index:2147483646;width:20px;height:20px;border-radius:50%;background:#2f5bff;color:#fff;font:700 11px/20px system-ui;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.3);pointer-events:none';
      place(); addEventListener('scroll', place, true); addEventListener('resize', place);
      document.body.appendChild(m); marks.push(m);
    });
  }

  addEventListener('message', (e) => {
    const d = e.data || {};
    if (!d.vsHost) return;
    if (d.type === 'pick') setPicking(!!d.on);
    if (d.type === 'theme') applyTheme(d.value);
    if (d.type === 'canvas') applyCanvas(d.value);
    if (d.type === 'marks') showMarks(d.list);
    if (d.type === 'scroll') scrollTo({ top: d.y || 0, behavior: 'instant' });
  });
  addEventListener('scroll', () => post({ type: 'scrolled', y: scrollY }), { passive: true });
  post({ type: 'ready' });
})();
