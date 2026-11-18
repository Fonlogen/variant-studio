// Palettes in OKLCH (tonal scales per hue, kept inside sRGB) with WCAG contrast ratios.
const SCHEMES = { analogous: [0, -30, 30], complementary: [0, 180], triad: [0, 120, 240], mono: [0] };
const ROLES = { analogous: ['primary', 'analogous-1', 'analogous-2'], complementary: ['primary', 'complement'], triad: ['primary', 'triad-1', 'triad-2'], mono: ['primary'] };
const STEPS = { 50: 0.97, 100: 0.93, 200: 0.87, 300: 0.79, 400: 0.70, 500: 0.61, 600: 0.53, 700: 0.45, 800: 0.37, 900: 0.29, 950: 0.22 };
export const PALETTE_SCHEMES = Object.keys(SCHEMES);

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
export function parseHex(hex) {
  const m = String(hex).trim().replace(/^#/, '').match(/^([\da-f]{3}|[\da-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
const toHex = (rgb) => '#' + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('');
export function rgbToOklch([r, g, b]) {
  [r, g, b] = [r, g, b].map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}
function oklchToRgb([L, C, H]) {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(gam);
}
const inGamut = (rgb) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);
// lower chroma until the colour exists in sRGB
function fit([L, C, H]) {
  let lo = 0, hi = C;
  if (inGamut(oklchToRgb([L, C, H]))) return [L, C, H];
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(oklchToRgb([L, mid, H]))) lo = mid; else hi = mid; }
  return [L, lo, H];
}
const lum = (rgb) => { const [r, g, b] = rgb.map((c) => lin(Math.min(1, Math.max(0, c)))); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const fmt = ([L, C, H]) => `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${H.toFixed(1)})`;
const r2 = (n) => Math.round(n * 100) / 100;

export function palette(base, scheme = 'analogous') {
  const rgb = parseHex(base);
  if (!rgb) throw new Error('base color must be a hex color like #3b5bdb');
  if (!SCHEMES[scheme]) throw new Error(`unknown scheme: use ${PALETTE_SCHEMES.join('|')}`);
  const [L0, C0, H0] = rgbToOklch(rgb);
  const W = [1, 1, 1], K = [0, 0, 0];
  const colors = SCHEMES[scheme].map((dh, i) => {
    const H = (H0 + dh + 360) % 360;
    const scale = {};
    for (const [step, L] of Object.entries(STEPS)) {
      // chroma follows the base but tapers at the light and dark ends, like hand-made scales
      const taper = 1 - Math.abs(L - 0.6) * 0.9;
      const c = fit([L, Math.max(0.01, C0 * taper), H]);
      const out = oklchToRgb(c);
      scale[step] = { hex: toHex(out), oklch: fmt(c), on_white: r2(contrast(out, W)), on_black: r2(contrast(out, K)) };
    }
    return { role: ROLES[scheme][i], hue: Math.round(H), scale };
  });
  const neutral = {};
  for (const [step, L] of Object.entries(STEPS)) { const c = fit([L, Math.min(0.02, C0 * 0.12), H0]); const out = oklchToRgb(c); neutral[step] = { hex: toHex(out), oklch: fmt(c), on_white: r2(contrast(out, W)), on_black: r2(contrast(out, K)) }; }
  const p = colors[0].scale;
  const pair = (fg, bg, use) => ({ use, fg: fg.hex, bg: bg.hex, ratio: r2(contrast(parseHex(fg.hex), parseHex(bg.hex))) });
  const pairs = [pair(neutral[900], neutral[50], 'body text'), pair(neutral[600], neutral[50], 'muted text'), pair(p[50], p[600], 'button label on primary'), pair(p[700], p[100], 'primary on tint'), pair(neutral[100], neutral[950], 'dark mode text')]
    .map((x) => ({ ...x, wcag: x.ratio >= 7 ? 'AAA' : x.ratio >= 4.5 ? 'AA' : x.ratio >= 3 ? 'AA large' : 'fail' }));
  const css = ':root {\n' + [...colors.map((c) => [c.role, c.scale]), ['neutral', neutral]].flatMap(([role, sc]) => Object.entries(sc).map(([k, v]) => `  --${role}-${k}: ${v.oklch}; /* ${v.hex} */`)).join('\n') + '\n}';
  return { type: 'palette', base: { hex: toHex(rgb), oklch: fmt([L0, C0, H0]) }, scheme, colors, neutral, pairs, css };
}
