// Static, server-less gallery (fallback for sandboxes that can't keep a server alive, or to share with a team), and one variant as files.
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, esc, MIME } from './util.mjs';
import { VERSION, UI, SCRIPTS } from './config.mjs';
import { listRounds, loadRound, SCREEN_DESIGNS } from './rounds.mjs';
import { brandCss } from './render.mjs';
import { renderPreview } from './shells.mjs';

export function buildGallery(P, { out, round, team } = {}) {
  const file = path.resolve(out || path.join(P.home, 'gallery.html'));
  const rounds = (round ? [round] : listRounds(P)).map((id) => loadRound(P, id)).filter(Boolean).map((r) => ({
    ...r,
    variants: r.variants.map((v) => ({ ...v, html: v.file && v.ready ? renderPreview(P, r.id, v.file, { inline: true }) : null })),
  }));
  const app = fs.readFileSync(path.join(UI, 'app.html'), 'utf8');
  const data = JSON.stringify({ version: VERSION, project: P.name, team: !!team, rounds, votes: readJSON(P.votes, {}), brand: readJSON(P.brand, null) }).replace(/</g, '\\u003c');
  // inline the studio's own CSS and scripts so the file works from file:// with no server
  const ui = (f) => fs.readFileSync(path.join(UI, f), 'utf8');
  const safeScript = (js) => js.replace(/<\/script/gi, '<\\/script');
  const html = app
    .replace(/<link rel="stylesheet" href="\/_ui\/([\w./-]+\.css)">/g, (m, f) => `<style>\n${ui(f)}\n</style>`)
    .replace(/<script src="\/_ui\/([\w./-]+\.js)"><\/script>/g, (m, f) => `<script>\n${safeScript(ui(f))}\n</script>`)
    .replace('<!--VS_STATIC-->', () => `<script>window.__VS_STATIC__=${data};</script>`);
  fs.writeFileSync(file, html);
  return file;
}

// ---------- one variant as files: single (everything inlined), split (index + style + script), shared (shared.css apart) ----------
export const EXPORT_AS = ['single', 'split', 'shared'];
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36' };
async function fetchRemote(u, asText) {
  try {
    const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8e6) return null;
    return asText ? buf.toString('utf8') : `data:${(r.headers.get('content-type') || 'application/octet-stream').split(';')[0]};base64,${buf.toString('base64')}`;
  } catch { return null; }
}
const replaceAsync = async (str, re, fn) => {
  const parts = []; let last = 0;
  for (const m of str.matchAll(re)) { parts.push(str.slice(last, m.index), await fn(...m)); last = m.index + m[0].length; }
  parts.push(str.slice(last));
  return parts.join('');
};
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');

export async function exportVariant(P, roundId, variantId, as = 'single') {
  const r = loadRound(P, roundId);
  const v = r && r.variants.find((x) => x.id === variantId);
  if (!v || !v.file || !v.ready) throw new Error(`variant ${variantId} of ${roundId} not found`);
  if (!EXPORT_AS.includes(as)) throw new Error(`--as must be ${EXPORT_AS.join('|')}`);
  const dir = path.join(P.rounds, roundId);
  const manifest = readJSON(path.join(dir, 'round.json'), {}) || {};
  const single = as === 'single';
  const cache = new Map();
  // local paths (relative, /p/…, /r/<round>/…) become data URIs; remote ones too in single mode, when reachable
  async function asset(u, base = dir) {
    const raw = String(u).trim();
    if (!raw || /^(data:|#|about:|javascript:|mailto:|tel:)/i.test(raw)) return raw;
    if (cache.has(raw)) return cache.get(raw);
    let out = raw;
    if (/^(https?:)?\/\//i.test(raw)) { if (single) out = (await fetchRemote(raw.startsWith('//') ? 'https:' + raw : raw)) || raw; }
    else {
      const clean = decodeURIComponent(raw.split(/[?#]/)[0]);
      const f = clean.startsWith('/p/') ? path.join(P.root, clean.slice(3)) : clean.startsWith(`/r/${roundId}/`) ? path.join(dir, clean.slice(roundId.length + 4)) : clean.startsWith('/') ? null : path.resolve(base, clean);
      const inside = f && (f.startsWith(P.root + path.sep) || f.startsWith(SCRIPTS + path.sep));
      if (inside && fs.existsSync(f) && fs.statSync(f).isFile() && fs.statSync(f).size < 8e6) out = `data:${(MIME[path.extname(f).toLowerCase()] || 'application/octet-stream').split(';')[0]};base64,${fs.readFileSync(f).toString('base64')}`;
    }
    cache.set(raw, out);
    return out;
  }
  const cssAssets = (css, base) => replaceAsync(css, /url\(\s*(["']?)([^"')]+)\1\s*\)/g, async (m, q, u) => `url("${await asset(u, base)}")`);
  const htmlAssets = async (html) => {
    const tags = await replaceAsync(html, /<(img|source|video|audio|image|use|input)\b[^>]*>/gi, (tag) => replaceAsync(tag, /\s(src|poster|href|xlink:href)=(["'])(.*?)\2/gi, async (m, a, q, u) => ` ${a}=${q}${await asset(u)}${q}`));
    return replaceAsync(tags, /\sstyle=(["'])(.*?)\1/gi, async (m, q, css) => ` style=${q}${await cssAssets(css, dir)}${q}`);
  };
  // a stylesheet's text with its assets resolved, or null to keep the <link>
  async function linkCss(href) {
    if (!/^(https?:)?\/\//i.test(href)) { const u = await asset(href); return u.startsWith('data:') ? Buffer.from(u.split(',')[1], 'base64').toString('utf8') : null; }
    if (!single) return null;
    const css = await fetchRemote(href.startsWith('//') ? 'https:' + href : href, true);
    return css == null ? null : cssAssets(css, dir);
  }

  const brand = brandCss(P).replace(/^<style[^>]*>|<\/style>$/g, '');
  const sharedCss = [['base', read(path.join(UI, 'base.css'))], ['brand', brand], ['global', read(path.join(P.home, 'global.css'))], ['round', read(path.join(dir, '_shared.css'))]]
    .filter(([, c]) => c.trim()).map(([n, c]) => `/* ---- ${n} ---- */\n${c}`).join('\n\n');
  const headCss = [], headTags = [];
  for (const hd of manifest.head || []) {
    if (typeof hd !== 'string') continue;
    const tt = hd.trim();
    if (tt.startsWith('<')) headTags.push(tt);
    else if (/\.css(\?|$)/i.test(tt) || /fonts\.googleapis\.com\/css/i.test(tt)) { const css = await linkCss(tt); if (css != null) headCss.push(`/* ---- ${tt} ---- */\n${css}`); else headTags.push(`<link rel="stylesheet" href="${esc(tt)}">`); }
    else if (/\.m?js(\?|$)/i.test(tt)) headTags.push(`<script src="${esc(tt)}"${/\.mjs/.test(tt) ? ' type="module"' : ''}></script>`);
  }

  let raw = read(path.join(dir, v.file));
  const isDoc = /^\s*(<!doctype|<html)/i.test(raw);
  const own = [], scripts = [];
  raw = await replaceAsync(raw, /<style\b[^>]*>([\s\S]*?)<\/style>/gi, async (m, css) => { const c = await cssAssets(css, dir); if (single) return `<style>${c}</style>`; own.push(c); return ''; });
  raw = await replaceAsync(raw, /<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, async (tag) => {
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    const css = href ? await linkCss(href) : null;
    if (css == null) return tag;
    if (single) return `<style>${css}</style>`;
    own.push(css); return '';
  });
  if (as === 'split') raw = raw.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, a, js) => (/\bsrc\s*=/i.test(a) || /application\/(ld\+)?json/i.test(a) || !js.trim() ? m : (scripts.push(js.trim()), '')));
  raw = await htmlAssets(raw);

  const kind = SCREEN_DESIGNS.includes(r.design) ? 'screen' : r.kind;
  const styleTags = (list) => list.filter((c) => c.trim()).map((c) => `<style>\n${c}\n</style>`).join('\n');
  const files = {};
  let links;
  if (single) links = styleTags([sharedCss, ...headCss]);
  else if (as === 'split') { files['style.css'] = [sharedCss, ...headCss, ...own.map((c) => `/* ---- variant ---- */\n${c}`)].filter((c) => c.trim()).join('\n\n') + '\n'; links = '<link rel="stylesheet" href="style.css">'; }
  else { files['shared.css'] = [sharedCss, ...headCss].filter((c) => c.trim()).join('\n\n') + '\n'; files['style.css'] = own.join('\n\n').trim() + '\n'; links = '<link rel="stylesheet" href="shared.css">\n<link rel="stylesheet" href="style.css">'; }
  const tail = as === 'split' ? '<script src="script.js"></script>' : '';
  let index;
  if (isDoc) {
    const inject = [links, ...headTags].join('\n');
    index = /<\/head>/i.test(raw) ? raw.replace(/<\/head>/i, `${inject}\n</head>`) : inject + raw;
    if (tail) index = /<\/body>/i.test(index) ? index.replace(/<\/body>/i, `${tail}\n</body>`) : index + tail;
  } else {
    index = `<!doctype html>
<html lang="en" data-vs-kind="${kind}" data-vs-design="${r.design}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${r.title} · ${v.label}`)}</title>
${links}
${headTags.join('\n')}
</head>
<body>
<div id="vs-root">
${raw.trim()}
</div>
${tail}
</body>
</html>
`;
  }
  const base = `${roundId}-${variantId}`;
  if (single) return { name: `${base}.html`, files: { [`${base}.html`]: index } };
  if (as === 'split') files['script.js'] = scripts.length ? scripts.join('\n\n') + '\n' : '// no scripts: this variant is a static mockup\n';
  return { name: `${base}-${as}`, files: { 'index.html': index, ...files } };
}
