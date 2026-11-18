// Logo set rasterizer: SVG -> PNG data URLs with a canvas. Used by the gallery ("Export logo set") and by `logo-export` in headless Chrome.
(() => {
  const PNG = [16, 32, 48, 64, 128, 180, 192, 256, 512, 1024];
  const sized = (svg, w, h) => {
    let s = String(svg).replace(/^<svg\b([^>]*)>/i, (m, a) => '<svg' + a.replace(/\s(width|height)="[^"]*"/gi, '') + ` width="${w}" height="${h}">`);
    if (!/^<svg[^>]*\sxmlns=/i.test(s)) s = s.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    return s;
  };
  const aspect = (svg) => {
    const vb = String(svg).match(/viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    return vb ? Number(vb[1]) / Number(vb[2]) || 1 : 1;
  };
  const load = (svg, w, h) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img); img.onerror = () => rej(new Error('the SVG could not be drawn (invalid markup or external references)'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized(svg, w, h));
  });
  // draw `svg` contained in a size×size square, inset by `pad` (0..0.5), over `bg` (null = transparent)
  async function draw(svg, size, { pad = 0, bg = null } = {}) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d');
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, size, size); }
    const box = size * (1 - 2 * pad), a = aspect(svg);
    const w = a >= 1 ? box : box * a, hh = a >= 1 ? box / a : box;
    const img = await load(svg, Math.max(1, Math.round(w)), Math.max(1, Math.round(hh)));
    x.drawImage(img, (size - w) / 2, (size - hh) / 2, w, hh);
    return c.toDataURL('image/png');
  }
  async function render(mark, icon, opts = {}) {
    const bg = opts.bg || '#ffffff';
    const out = {};
    for (const n of PNG) out[`logo-${n}.png`] = await draw(mark, n);
    // iOS ignores transparency (black corners): always opaque. Maskable keeps the mark inside the 80% safe circle.
    out['apple-touch-icon.png'] = icon ? await draw(icon, 180) : await draw(mark, 180, { pad: 0.14, bg });
    out['maskable-512.png'] = icon ? await draw(icon, 512) : await draw(mark, 512, { pad: 0.22, bg });
    return out;
  }
  self.vsRaster = { PNG, draw, render };
})();
