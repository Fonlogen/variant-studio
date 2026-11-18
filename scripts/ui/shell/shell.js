// Shell around a variant (tui / app / desktop / logo rounds). The variant runs in an inner iframe (?raw=1) with frame.js;
// this page relays the gallery's messages to it and reports its own size. Each design script sets vsShell.render().
// canvas presets match the gallery picker; a hex colour is 'custom', painted with --vs-canvas
function canvasName(c) { if (/^#[0-9a-f]{3,8}$/i.test(c)) { document.documentElement.style.setProperty('--vs-canvas', c); return 'custom'; } return c; }
(() => {
  const C = window.__VS_SHELL__ || {};
  const qs = new URLSearchParams(location.search);
  const meta = { round: C.round || qs.get('round') || '', variant: C.variant || qs.get('variant') || '' };
  let opts = {};
  try { opts = JSON.parse(qs.get('so') || '{}') || {}; } catch {}
  const S = window.vsShell = {
    C, qs, opts, labels: {}, theme: qs.get('theme') || 'light', canvas: canvasName(qs.get('canvas') || 'gray'), fitH: 0, innerH: 0, inner: null,
    root: document.getElementById('vs-shell'),
    L: (k) => S.labels[k] || k,
    up: (m) => { try { parent.postMessage({ vs: true, ...meta, ...m }, '*'); } catch {} },
    // user changed a shell option inside the shell: the gallery stores it for the round and tells every variant
    set: (patch) => { Object.assign(S.opts, patch); S.render(); S.up({ type: 'shellOpts', opts: patch }); },
    render: () => {}, onInner: () => {},
    innerDoc: () => { try { return S.inner.contentDocument; } catch { return null; } },
    makeInner(cls) {
      const f = document.createElement('iframe');
      f.className = cls || 'vs-inner'; f.title = C.label || 'variant';
      if (C.srcdoc != null) f.srcdoc = C.srcdoc;
      else { const q = new URLSearchParams(location.search); q.delete('so'); q.delete('canvas'); q.set('raw', '1'); f.src = location.pathname + '?' + q; }
      f.addEventListener('load', () => S.onInner());
      return (S.inner = f);
    },
    el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; },
    esc: (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  };
  addEventListener('message', (e) => {
    const d = e.data || {};
    if (S.inner && e.source === S.inner.contentWindow && d.vs) {
      if (d.type === 'size') { S.innerH = d.h; S.render(); return; }
      try { parent.postMessage(d, '*'); } catch {}
      return;
    }
    if (!d.vsHost) return;
    if (d.type === 'shell') { document.documentElement.classList.toggle('vs-bare', !!d.bare); S.opts = d.opts || {}; if (d.labels) S.labels = d.labels; if (d.fit) S.fitH = d.fit; S.render(); return; }
    if (d.type === 'canvas') { S.canvas = canvasName(d.value || ''); S.render(); return; } // the shell paints its own backdrop
    if (d.type === 'theme') { S.theme = d.value; scheme(); S.render(); }
    try { S.inner?.contentWindow.postMessage(d, '*'); } catch {}
  });
  // an iframe whose color-scheme differs from its parent's gets an opaque backdrop: keep ours equal to the variant's
  document.documentElement.classList.toggle('vs-bare', qs.get('bare') === '1');
  const scheme = () => { document.documentElement.style.colorScheme = S.theme === 'dark' ? 'dark' : 'light'; };
  scheme();
  let lastH = 0;
  new ResizeObserver(() => {
    const h = Math.ceil(S.root.getBoundingClientRect().height);
    if (Math.abs(h - lastH) > 1) { lastH = h; S.up({ type: 'size', h }); }
  }).observe(S.root);
  addEventListener('resize', () => S.render());
})();
