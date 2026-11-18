// The studio's own frame around a variant in tui / app / logo rounds: a terminal window, a phone, or the logo's usage previews.
// The shell is our page (scripts allowed even in mockup mode); the variant stays a static page in an inner iframe (?raw=1).
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, MIME } from './util.mjs';
import { UI, SCRIPTS } from './config.mjs';
import { designOf, SHELLED } from './rounds.mjs';
import { renderVariant } from './render.mjs';
import { extractSvgs } from './logo.mjs';

export const DEFAULT_WALLPAPER = path.join(SCRIPTS, '..', 'assets', 'wallpapers', 'default.svg');
export function wallpaperFile(P) {
  for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'svg']) { const f = path.join(P.home, `wallpaper.${ext}`); if (fs.existsSync(f)) return f; }
  return DEFAULT_WALLPAPER;
}
const dataUri = (f) => `data:${MIME[path.extname(f).toLowerCase()].split(';')[0]};base64,${fs.readFileSync(f).toString('base64')}`;
const safe = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

export const shellDesign = (P, roundId) => {
  const d = designOf(readJSON(path.join(P.rounds, roundId, 'round.json'), {}) || {});
  return SHELLED.includes(d) ? d : null;
};

export function renderShell(P, roundId, file, design, opts = {}) {
  const dir = path.join(P.rounds, roundId);
  const m = readJSON(path.join(dir, 'round.json'), {}) || {};
  const id = file.replace(/\.html?$/i, '');
  const v = (m.variants || []).find((x) => (typeof x === 'string' ? x : x.id) === id) || {};
  const prefix = opts.prefix || '';
  const cfg = {
    design, round: roundId, variant: id, title: m.title || roundId, label: v.label || id.toUpperCase(),
    wallpaper: opts.inline ? dataUri(wallpaperFile(P)) : `${prefix}/_wallpaper`,
    ...(opts.inline ? { srcdoc: renderVariant(P, roundId, file, { inline: true }) } : {}),
    ...(design === 'logo' ? { svg: extractSvgs(fs.readFileSync(path.join(dir, file), 'utf8')) } : {}),
  };
  const own = (f) => (opts.inline ? (f.endsWith('.css') ? `<style>${fs.readFileSync(path.join(UI, f), 'utf8')}</style>` : `<script>${fs.readFileSync(path.join(UI, f), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`)
    : f.endsWith('.css') ? `<link rel="stylesheet" href="/_ui/${f}">` : `<script src="/_ui/${f}"></script>`);
  return `<!doctype html>
<html lang="en" data-vs-shell="${design}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${own(`shell/${design}.css`)}
<script>window.__VS_SHELL__=${safe(cfg)};</script>
</head>
<body>
<div id="vs-shell"></div>
${own('shell/shell.js')}
${design === 'logo' ? own('shell/raster.js') : ''}
${own(`shell/${design}.js`)}
</body>
</html>`;
}

// what an iframe of the gallery shows for a variant
export function renderPreview(P, roundId, file, opts = {}) {
  const design = !opts.raw && shellDesign(P, roundId);
  return design ? renderShell(P, roundId, file, design, opts) : renderVariant(P, roundId, file, opts);
}
