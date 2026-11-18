// Turns a variant file into the page shown in the gallery's iframe (or inlined in a static gallery).
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, esc } from './util.mjs';
import { UI } from './config.mjs';
import { KINDS, SCREEN_DESIGNS, designOf } from './rounds.mjs';

// `prefix` is the session path (/<PIN>) the variant is served under
export function headItems(P, manifest, roundId, inline, prefix) {
  const items = [];
  const g = path.join(P.home, 'global.css');
  const shared = path.join(P.rounds, roundId, '_shared.css');
  if (fs.existsSync(g)) items.push(inline ? `<style>${fs.readFileSync(g, 'utf8')}</style>` : `<link rel="stylesheet" href="${prefix}/_global.css">`);
  if (fs.existsSync(shared)) items.push(inline ? `<style>${fs.readFileSync(shared, 'utf8')}</style>` : `<link rel="stylesheet" href="${prefix}/r/${roundId}/_shared.css">`);
  for (const h of manifest.head || []) {
    if (typeof h !== 'string') continue;
    const t = h.trim();
    if (t.startsWith('<')) items.push(t);
    else if (/\.css(\?|$)/i.test(t) || /fonts\.googleapis\.com\/css/i.test(t)) items.push(`<link rel="stylesheet" href="${esc(t)}">`);
    else if (/\.m?js(\?|$)/i.test(t)) items.push(`<script src="${esc(t)}"${/\.mjs/.test(t) ? ' type="module"' : ''}></script>`);
  }
  return items.join('\n');
}
export function brandCss(P) {
  const b = readJSON(P.brand);
  if (!b || b.enabled === false) return '';
  const vars = Object.entries(b.colors || {}).filter(([k, v]) => /^[\w-]+$/.test(k) && typeof v === 'string' && !/[;{}<]/.test(v)).map(([k, v]) => `--brand-${k}:${v};`).join('');
  const f = b.fonts || {};
  const fam = (x) => (typeof x === 'string' && /^[\w \-]+$/.test(x) ? `"${x}"` : null);
  const fonts = [fam(f.heading) && `--brand-font-heading:${fam(f.heading)},system-ui,sans-serif;`, fam(f.body) && `--brand-font-body:${fam(f.body)},system-ui,sans-serif;`].filter(Boolean).join('');
  return vars || fonts ? `<style id="vs-brand">:root{${vars}${fonts}}</style>` : '';
}
export function renderVariant(P, roundId, file, opts = {}) {
  const dir = path.join(P.rounds, roundId);
  const prefix = opts.prefix || '';
  const manifest = readJSON(path.join(dir, 'round.json'), {}) || {};
  const design = designOf(manifest);
  // inside a terminal or a phone the variant is the whole screen, not a centred component
  const kind = SCREEN_DESIGNS.includes(design) ? 'screen' : KINDS.includes(manifest.kind) ? manifest.kind : 'component';
  const raw = fs.readFileSync(path.join(dir, file), 'utf8');
  const frameJs = opts.bare ? '' : opts.inline ? `<script>${fs.readFileSync(path.join(UI, 'frame.js'), 'utf8')}</script>` : `<script src="/_ui/frame.js"></script>`;
  const brand = brandCss(P);
  const isDoc = /^\s*(<!doctype|<html)/i.test(raw);
  if (isDoc) {
    // inject as early as possible so errors thrown by the page are captured
    if (/<head[^>]*>/i.test(raw)) return raw.replace(/<head[^>]*>/i, (m) => `${m}${frameJs}${brand}`);
    if (/<html[^>]*>/i.test(raw)) return raw.replace(/<html[^>]*>/i, (m) => `${m}${frameJs}${brand}`);
    return frameJs + brand + raw;
  }
  const baseCss = opts.inline ? `<style>${fs.readFileSync(path.join(UI, 'base.css'), 'utf8')}</style>` : `<link rel="stylesheet" href="/_ui/base.css">`;
  return `<!doctype html>
<html lang="en" data-vs-kind="${kind}" data-vs-design="${design}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${opts.inline ? '' : `<base href="${prefix}/r/${roundId}/">`}
${frameJs}
${baseCss}
${brand}
${headItems(P, manifest, roundId, opts.inline, prefix)}
</head>
<body>
<div id="vs-root">
${raw}
</div>
</body>
</html>`;
}
