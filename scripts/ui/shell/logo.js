// Logo canvas: the variant itself, then the mark at real sizes: browser tab favicon, iOS / Android icons, light/dark, monochrome.
(() => {
  const S = window.vsShell, C = S.C, svg = C.svg || {};
  const url = (s) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(/\sxmlns=/.test(s.slice(0, s.indexOf('>'))) ? s : s.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"'));
  const lg = S.el('div', 'lg'), use = S.el('div', 'use');
  lg.append(S.makeInner('mark'), use); S.root.append(lg);
  const fav = {};
  // favicons are judged at their real pixels: rasterize 16 and 32, show them 1:1 and zoomed
  if (svg.mark && window.vsRaster) Promise.all([16, 32].map((n) => vsRaster.draw(svg.mark, n).then((d) => { fav[n] = d; }))).then(() => { built = ''; S.render(); }).catch(() => {});
  const img = (src, size, extra = '') => `<img src="${src}" width="${size}" height="${size}" alt="" ${extra}>`;
  function tile(cls, size, label, bg) {
    const inner = svg.icon ? img(url(svg.icon), size) : img(url(svg.mark), Math.round(size * (cls === 'circle' ? 0.6 : 0.68)));
    return `<div class="ic"><div class="tile ${cls}" style="width:${size}px;height:${size}px;--bg:${svg.icon ? 'transparent' : bg}">${inner}</div>${label ? `<span>${S.esc(label)}</span>` : ''}</div>`;
  }
  let built = '';
  S.render = () => {
    lg.className = 'lg' + (S.canvas && S.canvas !== 'none' ? ' c-' + S.canvas : '');
    if (S.innerH) S.inner.style.height = Math.min(S.innerH, 560) + 'px';
    const key = JSON.stringify([S.labels, Object.keys(fav)]);
    if (key === built) return;
    built = key;
    const L = S.L, name = C.title || 'App';
    if (!svg.mark) { use.innerHTML = `<div class="miss">${S.esc(L('No inline <svg> found in this variant: the usage previews need the mark as an <svg> element.'))}</div>`; return; }
    const m = url(svg.mark);
    const f16 = fav[16] || m, f32 = fav[32] || m;
    const tabs = (dk) => `<div class="tabbar${dk ? ' dk' : ''}"><div class="tab">${img(f16, 16)}<span>${S.esc(name)}</span></div><span class="tab2">${S.esc(L('New tab'))}</span></div>`;
    const sizes = (cls) => `<div class="sizes ${cls}">${[16, 24, 32, 48, 64, 128].map((n) => `<figure>${img(m, n)}<span>${n}</span></figure>`).join('')}</div>`;
    use.innerHTML = `
      <div class="box"><h5>${S.esc(L('Browser tab'))}</h5>${tabs(false)}${tabs(true)}
        <div class="row">${img(f16, 64, 'class="px lt"')}${img(f32, 64, 'class="px dkb"')}<span class="hint">16 px · 32 px ×4</span></div></div>
      <div class="box"><h5>iOS</h5><div class="home lt">${tile('ios', 60, name, '#fff')}${tile('ios', 76, '', '#fff')}</div><div class="home dkb">${tile('ios', 60, name, '#fff')}${tile('ios', 40, '', '#fff')}</div></div>
      <div class="box"><h5>Android</h5><div class="home lt">${tile('circle', 56, name, '#fff')}${tile('squircle', 56, '', '#fff')}</div><div class="home dkb">${tile('circle', 56, name, '#fff')}${tile('squircle', 40, '', '#fff')}</div></div>
      <div class="box wide"><h5>${S.esc(L('Sizes'))}</h5>${sizes('lt')}${sizes('dkb')}</div>
      <div class="box"><h5>${S.esc(L('Monochrome'))}</h5><div class="mono"><div class="b">${img(m, 56)}</div><div class="w">${img(m, 56)}</div></div></div>`;
  };
  S.render();
})();
