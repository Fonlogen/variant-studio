// Injected into every variant preview. Talks to the gallery via postMessage.
(() => {
  if (window.__vsFrame) return; window.__vsFrame = true;
  const qs = new URLSearchParams(location.search);
  const meta = { round: qs.get('round') || '', variant: qs.get('variant') || '' };
  const post = (msg) => { try { parent.postMessage({ vs: true, ...meta, ...msg }, '*'); } catch {} };
  const ACCENT = '#ff6a1a';

  // ---- theme / canvas (from query, then live via messages) ----
  const html = document.documentElement;
  function applyTheme(t) { if (!t) return; html.dataset.theme = t; html.style.colorScheme = t; html.classList.toggle('dark', t === 'dark'); }
  function applyCanvas(c) { if (c) html.dataset.vsCanvas = c; else delete html.dataset.vsCanvas; }
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
    else if (!/ResizeObserver loop/.test(e.message || '')) report(e.message || 'Script error', { line: e.lineno });
  }, true);
  addEventListener('unhandledrejection', (e) => report('Unhandled promise: ' + (e.reason && e.reason.message || e.reason)));

  // ---- helpers ----
  const isOverlay = (el) => el && el.closest && el.closest('[data-vs-overlay]');
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
  const q = (sel) => { try { return document.querySelector(sel); } catch { return null; } };

  // ---- modes: pick (comment on element) / edit (inline text editing) ----
  let mode = '', hoverEl = null;
  const box = document.createElement('div');
  box.setAttribute('data-vs-overlay', '');
  box.style.cssText = `position:fixed;pointer-events:none;z-index:2147483647;border:1.5px solid ${ACCENT};background:rgba(255,106,26,.10);border-radius:2px;display:none;transition:all .06s`;
  const tag = document.createElement('div');
  tag.style.cssText = `position:absolute;left:-1.5px;top:-20px;font:600 10.5px/18px ui-monospace,monospace;background:${ACCENT};color:#000;padding:0 6px;border-radius:2px;white-space:nowrap`;
  box.appendChild(tag);

  function onMove(e) {
    const el = e.target;
    if (!mode || el === box || el === html || el === document.body || isOverlay(el)) return;
    if (mode === 'edit' && el.isContentEditable) { box.style.display = 'none'; return; }
    hoverEl = el;
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    tag.textContent = mode === 'edit' ? '✎ edit text' : el.tagName.toLowerCase() + (el.classList[0] ? '.' + el.classList[0] : '');
    tag.style.top = r.top < 22 ? (r.height + 2) + 'px' : '-20px';
  }
  const originals = new Map(); // selector -> original text
  function onClick(e) {
    if (!mode) return;
    const el = hoverEl || e.target;
    if (mode === 'edit') {
      if (el.isContentEditable) return;
      e.preventDefault(); e.stopPropagation();
      startEdit(el);
      return;
    }
    e.preventDefault(); e.stopPropagation();
    const r = el.getBoundingClientRect();
    post({ type: 'picked', selector: selectorFor(el), text: describe(el), tag: el.tagName.toLowerCase(), rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } });
  }
  function startEdit(el) {
    const sel = selectorFor(el);
    if (!originals.has(sel)) originals.set(sel, el.innerText);
    el.contentEditable = 'true';
    el.style.outline = `1.5px dashed ${ACCENT}`; el.style.outlineOffset = '2px';
    el.focus();
    const done = () => {
      el.removeEventListener('blur', done);
      el.contentEditable = 'false'; el.removeAttribute('contenteditable');
      el.style.outline = ''; el.style.outlineOffset = '';
      const before = originals.get(sel), after = el.innerText;
      post({ type: 'textEdit', selector: sel, before, after, tag: el.tagName.toLowerCase() });
    };
    el.addEventListener('blur', done);
    el.addEventListener('keydown', (k) => { if (k.key === 'Enter' && !k.shiftKey) { k.preventDefault(); el.blur(); } if (k.key === 'Escape') { el.innerText = originals.get(sel); el.blur(); } });
  }
  function setMode(m) {
    mode = m || '';
    if (mode) { document.body.appendChild(box); html.style.cursor = mode === 'edit' ? 'text' : 'crosshair'; }
    else { box.remove(); box.style.display = 'none'; html.style.cursor = ''; }
  }
  addEventListener('mousemove', onMove, true);
  addEventListener('click', onClick, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && mode && !e.target.isContentEditable) post({ type: 'mode-cancel' }); });

  function applyEdits(list) {
    for (const ed of list || []) {
      const el = q(ed.selector); if (!el) continue;
      if (!originals.has(ed.selector)) originals.set(ed.selector, ed.before ?? el.innerText);
      if (el.innerText !== ed.after) el.innerText = ed.after;
    }
  }

  // ---- markers for annotations ----
  let marks = [];
  function showMarks(list) {
    marks.forEach((m) => m.remove()); marks = [];
    (list || []).forEach((a, i) => {
      const el = q(a.selector);
      if (!el) return;
      const m = document.createElement('div');
      m.setAttribute('data-vs-overlay', '');
      const place = () => { const r = el.getBoundingClientRect(); m.style.left = (r.right - 9) + 'px'; m.style.top = (r.top - 9) + 'px'; };
      m.textContent = i + 1;
      m.style.cssText = `position:fixed;z-index:2147483646;width:18px;height:18px;border-radius:2px;background:${ACCENT};color:#000;font:700 10.5px/18px ui-monospace,monospace;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.35);pointer-events:none`;
      place(); addEventListener('scroll', place, true); addEventListener('resize', place);
      document.body.appendChild(m); marks.push(m);
    });
  }
  function flash(selector) {
    const el = q(selector); if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const f = document.createElement('div');
    f.setAttribute('data-vs-overlay', '');
    const r = el.getBoundingClientRect();
    f.style.cssText = `position:fixed;z-index:2147483647;pointer-events:none;left:${r.left - 3}px;top:${r.top - 3}px;width:${r.width + 6}px;height:${r.height + 6}px;border:2px solid ${ACCENT};box-shadow:0 0 0 4000px rgba(0,0,0,.25);transition:opacity .4s`;
    document.body.appendChild(f);
    setTimeout(() => { const r2 = el.getBoundingClientRect(); Object.assign(f.style, { left: r2.left - 3 + 'px', top: r2.top - 3 + 'px' }); }, 350);
    setTimeout(() => f.style.opacity = '0', 1400); setTimeout(() => f.remove(), 1900);
  }

  // ---- design tokens (CSS custom properties) ----
  function collectTokens() {
    const found = new Map(); // name -> { name, scope, value }
    const visit = (rules) => {
      for (const rule of rules) {
        if (rule.cssRules && !rule.selectorText) { try { visit(rule.cssRules); } catch {} continue; }
        if (!rule.style || !rule.selectorText) continue;
        for (let i = 0; i < rule.style.length; i++) {
          const name = rule.style[i];
          if (!name.startsWith('--') || name.startsWith('--vs-') || name.startsWith('--tw-')) continue;
          if (found.has(name)) continue;
          const sel = rule.selectorText.split(',')[0].trim();
          const scope = /^(:root|html)(\b|$)/.test(sel) && !/\[data-theme|\.dark/.test(sel) ? ':root' : sel;
          found.set(name, { name, scope });
        }
      }
    };
    for (const sh of document.styleSheets) { try { visit(sh.cssRules); } catch {} }
    const list = [];
    for (const t of found.values()) {
      const el = t.scope === ':root' ? html : q(t.scope.replace(/:(hover|focus|active|focus-visible)\b/g, ''));
      if (!el) continue;
      const value = getComputedStyle(el).getPropertyValue(t.name).trim();
      if (!value || value.length > 120) continue;
      list.push({ ...t, value });
    }
    return list.slice(0, 80);
  }
  const overrides = new Map();
  function setToken(scope, name, value) {
    const els = scope === ':root' ? [html] : (() => { try { return [...document.querySelectorAll(scope.replace(/:(hover|focus|active|focus-visible)\b/g, ''))]; } catch { return []; } })();
    for (const el of els) { if (value == null) el.style.removeProperty(name); else el.style.setProperty(name, value); }
    if (value == null) overrides.delete(scope + '|' + name); else overrides.set(scope + '|' + name, value);
  }

  // ---- audit: contrast, touch targets, alt text, labels, overflow ----
  function parseColor(c) {
    const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  function bgOf(el) {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // gradient/image: can't judge
      const c = parseColor(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    if (html.dataset.theme === 'dark' && !layers.some((l) => l.a >= 1)) base = { r: 15, g: 15, b: 18, a: 1 };
    return layers.reverse().reduce((acc, l) => blend(l, acc), base);
  }
  function audit() {
    const issues = [];
    const add = (kind, el, detail) => { if (issues.length < 40) issues.push({ kind, selector: selectorFor(el), text: describe(el).slice(0, 50), detail }); };
    const root = document.getElementById('vs-root') || document.body;
    if (!root) return issues;
    const seen = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n, contrastCount = 0;
    while ((n = walker.nextNode()) && contrastCount < 12) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement;
      if (!el || seen.has(el) || isOverlay(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const fg = parseColor(cs.color); const bg = bgOf(el);
      if (!fg || !bg) continue;
      const fgc = blend(fg, bg);
      const L1 = lum(fgc), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const need = large ? 3 : 4.5;
      if (ratio < need) { add('contrast', el, `Contrast ${ratio.toFixed(2)}:1 (needs ${need}:1, ${Math.round(size)}px text)`); contrastCount++; }
    }
    if (vpMobile) {
      root.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=tab]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && (r.width < 44 || r.height < 44) && el.type !== 'checkbox' && el.type !== 'radio') add('target', el, `Touch target ${Math.round(r.width)}×${Math.round(r.height)}px (min 44×44)`);
      });
    }
    root.querySelectorAll('img:not([alt])').forEach((el) => add('alt', el, 'Image without alt text'));
    root.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea').forEach((el) => {
      const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label') || (el.id && q(`label[for="${CSS.escape(el.id)}"]`)) || el.getAttribute('title');
      if (!labelled) add('label', el, 'Form field without a label' + (el.placeholder ? ' (placeholder is not a label)' : ''));
    });
    root.querySelectorAll('button, a[href]').forEach((el) => { if (!describe(el)) add('name', el, 'Interactive element without an accessible name'); });
    if (document.documentElement.scrollWidth > innerWidth + 1) add('overflow', document.body, `Horizontal overflow: content is ${document.documentElement.scrollWidth}px wide in a ${innerWidth}px viewport`);
    return issues;
  }
  let auditT = null, vpMobile = innerWidth <= 820;
  const runAudit = () => { clearTimeout(auditT); auditT = setTimeout(() => { try { post({ type: 'audit', issues: audit(), width: innerWidth }); } catch {} }, 250); };
  addEventListener('load', () => setTimeout(runAudit, 500));
  addEventListener('resize', runAudit);

  // ---- PNG snapshot (html-to-image loaded on demand from CDN) ----
  function loadLib() {
    if (window.htmlToImage) return Promise.resolve(window.htmlToImage);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js';
      s.onload = () => res(window.htmlToImage); s.onerror = () => rej(new Error('Could not load html-to-image from CDN'));
      document.head.appendChild(s);
    });
  }
  async function snapshot(id) {
    try {
      const lib = await loadLib();
      const target = document.getElementById('vs-root') || document.body;
      const bg = getComputedStyle(document.body).backgroundColor;
      const url = await lib.toPng(target, { pixelRatio: 2, backgroundColor: bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : undefined, filter: (n) => !(n.hasAttribute && n.hasAttribute('data-vs-overlay')) });
      post({ type: 'snapshot', id, url });
    } catch (e) { post({ type: 'snapshot', id, error: String(e && e.message || e) }); }
  }

  addEventListener('message', (e) => {
    const d = e.data || {};
    if (!d.vsHost) return;
    if (d.type === 'mode') setMode(d.value);
    if (d.type === 'theme') { applyTheme(d.value); runAudit(); }
    if (d.type === 'canvas') applyCanvas(d.value);
    if (d.type === 'marks') showMarks(d.list);
    if (d.type === 'edits') applyEdits(d.list);
    if (d.type === 'scroll') scrollTo({ top: d.y || 0, behavior: 'instant' });
    if (d.type === 'flash') flash(d.selector);
    if (d.type === 'tokens') post({ type: 'tokens', list: collectTokens() });
    if (d.type === 'setToken') { setToken(d.scope, d.name, d.value); runAudit(); }
    if (d.type === 'setTokens') { for (const t of d.list || []) setToken(t.scope, t.name, t.value); runAudit(); }
    if (d.type === 'audit') runAudit();
    if (d.type === 'vp') { if (vpMobile !== !!d.mobile) { vpMobile = !!d.mobile; runAudit(); } }
    if (d.type === 'snapshot') snapshot(d.id);
  });
  addEventListener('scroll', () => post({ type: 'scrolled', y: scrollY }), { passive: true });
  post({ type: 'ready' });
})();
