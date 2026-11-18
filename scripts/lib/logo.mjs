// Logo mode: the mark inside a variant, its export set (SVG, PNGs, favicon.ico, app icons) and a headless browser to rasterize it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { UI, userConfig } from './config.mjs';

export const PNG_SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512, 1024];
export const ICO_SIZES = [16, 32, 48];

// first <svg> = the mark; <svg data-vs-icon> = the full-bleed app icon (optional)
export function extractSvgs(src) {
  const all = [...String(src).matchAll(/<svg\b[\s\S]*?<\/svg>/gi)].map((m) => m[0]);
  const icon = all.find((s) => /^<svg\b[^>]*\bdata-vs-icon\b/i.test(s)) || null;
  const mark = all.find((s) => s !== icon) || icon;
  // cleaned (xmlns, no bare data-vs-* attributes): they are used as standalone SVG images, which must be valid XML
  return { mark: mark && optimizeSvg(mark), icon: icon && optimizeSvg(icon) };
}

export function optimizeSvg(svg) {
  let s = String(svg)
    .replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
    .replace(/\sdata-vs-[\w-]+(="[^"]*")?/g, '')
    .replace(/(\d+\.\d{3})\d+/g, '$1').replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();
  if (!/\sxmlns=/.test(s.slice(0, s.indexOf('>')))) s = s.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return s;
}

// a Chromium-family browser on this machine, found like cloudflared is
export function findChrome() {
  const cfg = userConfig().chrome || process.env.CHROME_PATH;
  const home = os.homedir();
  const mac = ['Google Chrome.app/Contents/MacOS/Google Chrome', 'Chromium.app/Contents/MacOS/Chromium', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge', 'Brave Browser.app/Contents/MacOS/Brave Browser']
    .flatMap((a) => ['/Applications', path.join(home, 'Applications')].map((d) => path.join(d, a)));
  const pf = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const win = pf.flatMap((d) => [path.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(d, 'Chromium', 'Application', 'chrome.exe')]);
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser'];
  const onPath = (process.env.PATH || '').split(path.delimiter).filter(Boolean).flatMap((d) => names.map((n) => path.join(d, n)));
  const list = [cfg, ...(process.platform === 'darwin' ? mac : process.platform === 'win32' ? win : []), ...onPath];
  for (const c of list) { try { if (c && fs.statSync(c).isFile()) return c; } catch {} }
  return null;
}

// rasterize with the same code the gallery uses (ui/shell/raster.js), in headless Chrome; returns { name: Buffer } or null
export function rasterizeWithChrome(chrome, mark, icon, opts = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-logo-'));
  try {
    const page = path.join(tmp, 'raster.html');
    const js = fs.readFileSync(path.join(UI, 'shell', 'raster.js'), 'utf8');
    fs.writeFileSync(page, `<!doctype html><meta charset="utf-8"><body><script>${js}</script><script>
vsRaster.render(${JSON.stringify(mark)}, ${JSON.stringify(icon)}, ${JSON.stringify(opts)}).then((o) => { const p = document.createElement('pre'); p.id = 'out'; p.textContent = JSON.stringify(o); document.body.append(p); }, (e) => { document.body.dataset.err = String(e && e.message || e); });
</script>`);
    const r = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${path.join(tmp, 'profile')}`, '--virtual-time-budget=15000', '--dump-dom', 'file://' + page],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 256e6, windowsHide: true });
    const m = String(r.stdout || '').match(/<pre id="out">([\s\S]*?)<\/pre>/);
    if (!m) return null;
    const o = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Buffer.from(String(v).split(',')[1] || '', 'base64')]));
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
}

// ICO container with PNG entries (Vista+ reads them; every current browser does)
export function icoFrom(pngs) {
  const list = pngs.filter((p) => p.buf?.length);
  const head = Buffer.alloc(6 + 16 * list.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(list.length, 4);
  let off = head.length;
  list.forEach((p, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(p.size >= 256 ? 0 : p.size, e); head.writeUInt8(p.size >= 256 ? 0 : p.size, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(p.buf.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += p.buf.length;
  });
  return Buffer.concat([head, ...list.map((p) => p.buf)]);
}

// write the set; `pngs` = { 'logo-16.png': Buffer, …, 'apple-touch-icon.png', 'maskable-512.png' } (any subset)
export function writeLogoSet(dir, { mark, icon, pngs = {} }) {
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  const put = (name, data) => { fs.writeFileSync(path.join(dir, name), data); files.push(path.join(dir, name)); };
  if (mark) put('logo.svg', optimizeSvg(mark));
  if (icon) put('icon.svg', optimizeSvg(icon));
  for (const [name, buf] of Object.entries(pngs)) if (/^[\w.-]+\.png$/.test(name) && buf?.length) put(name, buf);
  const ico = ICO_SIZES.map((size) => ({ size, buf: pngs[`logo-${size}.png`] })).filter((p) => p.buf);
  if (ico.length) put('favicon.ico', icoFrom(ico));
  if (files.some((f) => f.endsWith('logo-192.png'))) {
    put('site.webmanifest', JSON.stringify({ icons: [{ src: 'logo-192.png', sizes: '192x192', type: 'image/png' }, { src: 'logo-512.png', sizes: '512x512', type: 'image/png' }, { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] }, null, 2));
    put('head-snippet.html', '<link rel="icon" href="/favicon.ico" sizes="48x48">\n<link rel="icon" href="/logo.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n<link rel="manifest" href="/site.webmanifest">\n');
  }
  return files;
}
