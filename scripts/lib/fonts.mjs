// Font helpers for logo and brand work: curated Google Fonts pairs and the fonts installed on this machine.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PAIRS = [
  ['Inter', 'Inter', 'neutral product UI, dashboards'],
  ['Fraunces', 'Inter', 'editorial, warm brand with a modern body'],
  ['Space Grotesk', 'IBM Plex Sans', 'tech, developer tools'],
  ['Sora', 'Manrope', 'geometric startup brand'],
  ['DM Serif Display', 'DM Sans', 'premium, fashion, hospitality'],
  ['Syne', 'Inter', 'bold creative studio, wordmarks'],
  ['Bricolage Grotesque', 'Figtree', 'friendly consumer app'],
  ['Playfair Display', 'Source Sans 3', 'classic editorial, publishing'],
  ['Outfit', 'Outfit', 'rounded geometric, single family systems'],
  ['Unbounded', 'Onest', 'wide display wordmarks, crypto, gaming'],
  ['Instrument Serif', 'Instrument Sans', 'refined minimal, portfolios'],
  ['JetBrains Mono', 'Inter', 'terminal, CLI and code products'],
  ['Archivo Black', 'Archivo', 'sport, strong condensed headlines'],
  ['Cormorant Garamond', 'Lato', 'luxury, wedding, beauty'],
  ['Lexend', 'Lexend', 'readability first, education'],
].map(([heading, body, use]) => ({ heading, body, use, css: `https://fonts.googleapis.com/css2?family=${[...new Set([heading, body])].map((f) => f.replace(/ /g, '+') + ':wght@400..800').join('&family=')}&display=swap` }));

function fromDirs(dirs) {
  const fams = new Set();
  for (const d of dirs) {
    let list = []; try { list = fs.readdirSync(d, { recursive: true }); } catch { continue; }
    for (const f of list) if (/\.(ttf|otf|ttc|woff2?)$/i.test(f)) fams.add(path.basename(String(f)).replace(/\.\w+$/, '').replace(/[-_ ]?(Regular|Bold|Italic|Light|Medium|SemiBold|Semibold|Black|Thin|ExtraBold|ExtraLight|Heavy|Book|Roman|VariableFont.*|\[.*\])+$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim());
  }
  return [...fams];
}
export function localFonts() {
  const run = (cmd, a, timeout = 8000) => { try { const r = spawnSync(cmd, a, { encoding: 'utf8', timeout, maxBuffer: 64e6, windowsHide: true }); return r.status === 0 ? r.stdout : null; } catch { return null; } };
  let out = run('fc-list', [':', 'family']), source = 'fc-list', fams = [];
  if (out) fams = out.split('\n').flatMap((l) => l.split(',')[0] ? [l.split(',')[0].trim()] : []);
  else if (process.platform === 'darwin' && (out = run('system_profiler', ['SPFontsDataType', '-json'], 30000))) {
    source = 'system_profiler';
    try { for (const f of JSON.parse(out).SPFontsDataType || []) for (const t of f.typefaces || []) if (t.family) fams.push(t.family); } catch {}
  }
  if (!fams.length) {
    source = 'font folders';
    const h = os.homedir();
    fams = fromDirs(process.platform === 'win32' ? [path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'), path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Fonts')]
      : process.platform === 'darwin' ? ['/System/Library/Fonts', '/Library/Fonts', path.join(h, 'Library', 'Fonts')] : ['/usr/share/fonts', '/usr/local/share/fonts', path.join(h, '.fonts'), path.join(h, '.local', 'share', 'fonts')]);
  }
  return { source, families: [...new Set(fams.filter((f) => f && !f.startsWith('.')))].sort((a, b) => a.localeCompare(b)) };
}
export function fontsReport(query) {
  const q = String(query || '').toLowerCase();
  const local = localFonts();
  const fams = q ? local.families.filter((f) => f.toLowerCase().includes(q)) : local.families;
  const pairs = q ? PAIRS.filter((p) => [p.heading, p.body, p.use].join(' ').toLowerCase().includes(q)) : PAIRS;
  return { type: 'fonts', pairs, local: { source: local.source, count: fams.length, families: fams.slice(0, 300), ...(fams.length > 300 ? { truncated: true } : {}) },
    note: 'Google pairs: add `css` to round.json `head` (or @import it in _shared.css). Local fonts only render on this machine: use them for previews, not for logos you ship (convert lettering to paths).' };
}
