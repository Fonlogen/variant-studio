// Phone frame. Options: skin (see SKINS), frame real|flat|clay. The variant renders at the skin's logical size with
// --vs-safe-top / --vs-safe-bottom set on its <html>; status bar and home indicator are drawn over those areas.
(() => {
  const S = window.vsShell, C = S.C;
  // logical size (pt/dp), screen radius, side / top / bottom bezel, outer radius, safe areas, cut-out, side keys [side, top as share of height, length]
  const SKINS = {
    ip8: { name: 'iPhone 8', os: 'ios', w: 375, h: 667, sr: 0, bz: 22, bt: 118, bb: 118, br: 64, top: 20, bottom: 0, cut: 'none', note: 'Home button', keys: [['l', .17, 30], ['l', .28, 56], ['l', .39, 56], ['r', .28, 76]] },
    ipx: { name: 'iPhone X', os: 'ios', w: 375, h: 812, sr: 39, bz: 12, top: 44, bottom: 34, cut: 'notch', note: 'Notch', keys: [['l', .17, 30], ['l', .26, 60], ['l', .35, 60], ['r', .3, 100]] },
    // iPhone 18: not released at the time of writing. Drawn with iPhone 17 Pro proportions (402×874 pt, Dynamic Island): an approximation to verify.
    ip18: { name: 'iPhone 18', os: 'ios', w: 402, h: 874, sr: 55, bz: 11, top: 62, bottom: 34, cut: 'island', note: 'Dynamic Island', keys: [['l', .19, 34], ['l', .27, 62], ['l', .36, 62], ['r', .3, 100], ['r', .68, 58]] },
    px3: { name: 'Pixel 3', os: 'android', w: 393, h: 786, sr: 10, bz: 14, bt: 72, bb: 72, br: 46, top: 24, bottom: 24, cut: 'none', note: 'Bezels', keys: [['r', .25, 56], ['r', .38, 100]] },
    px6: { name: 'Pixel 6', os: 'android', w: 412, h: 915, sr: 30, bz: 12, top: 44, bottom: 24, cut: 'punch', note: 'Punch-hole', keys: [['r', .22, 60], ['r', .33, 110]] },
    px8: { name: 'Pixel 8', os: 'android', w: 412, h: 915, sr: 38, bz: 11, top: 44, bottom: 24, cut: 'punch', note: 'Punch-hole', keys: [['r', .22, 60], ['r', .33, 110]] },
    px10p: { name: 'Pixel 10 Pro', os: 'android', w: 410, h: 914, sr: 46, bz: 12, top: 50, bottom: 24, cut: 'punch', note: 'Punch-hole', keys: [['r', .22, 62], ['r', .33, 120]] },
    s25: { name: 'Galaxy S25', os: 'android', w: 360, h: 780, sr: 36, bz: 9, top: 40, bottom: 24, cut: 'punch', ph: 20, note: 'Punch-hole', keys: [['r', .22, 90], ['r', .36, 50]] },
    s25u: { name: 'Galaxy S25 Ultra', os: 'android', w: 412, h: 891, sr: 16, bz: 9, top: 40, bottom: 24, cut: 'punch', ph: 22, note: 'Squarer corners', keys: [['r', .22, 100], ['r', .36, 56]] },
  };
  const PAD = { real: 4, flat: 3, clay: 0 }, EXTRA = { real: 0, flat: 4, clay: 9 };
  window.vsSkins = SKINS;
  const sig = '<svg viewBox="0 0 18 12" width="17" height="11"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>';
  const wifi = '<svg viewBox="0 0 16 12" width="15" height="11"><path d="M8 2.2c2.4 0 4.6.9 6.3 2.5l1.2-1.3A10.8 10.8 0 0 0 8 .4C5.1.4 2.5 1.5.5 3.4l1.2 1.3A9 9 0 0 1 8 2.2Zm0 3.6c1.4 0 2.7.5 3.7 1.4l1.2-1.3A7.3 7.3 0 0 0 8 4C6.1 4 4.4 4.7 3.1 5.9l1.2 1.3c1-.9 2.3-1.4 3.7-1.4Zm0 3.5c-.6 0-1.1.2-1.5.6L8 11.6l1.5-1.7c-.4-.4-.9-.6-1.5-.6Z"/></svg>';
  const awifi = '<svg viewBox="0 0 16 13" width="15" height="12"><path d="M8 12.5 0 3.2A12.6 12.6 0 0 1 8 .5c3 0 5.8 1 8 2.7L8 12.5Z"/></svg>';
  const acell = '<svg viewBox="0 0 13 13" width="12" height="12"><path d="M13 0v13H0L13 0Z"/></svg>';

  const cv = S.el('div', 'cv'), fit = S.el('div', 'fit'), ph = S.el('div', 'ph'), body = S.el('div', 'body'), bez = S.el('div', 'bez'), screen = S.el('div', 'screen'), cap = S.el('div', 'cap');
  const over = S.el('div'), keys = S.el('div'), bezel = S.el('div');
  screen.append(S.makeInner(), over); bez.append(screen, bezel); body.append(keys, bez); ph.append(body); fit.append(ph); cv.append(fit, cap); S.root.append(cv);

  const pick = () => { const sk = SKINS[S.opts.skin] ? S.opts.skin : 'ip18'; const fr = PAD[S.opts.frame] != null ? S.opts.frame : 'real'; return { sk, k: SKINS[sk], fr }; };
  function safeVars() {
    const d = S.innerDoc(); if (!d || !d.documentElement) return;
    const { k } = pick();
    d.documentElement.style.setProperty('--vs-safe-top', k.top + 'px');
    d.documentElement.style.setProperty('--vs-safe-bottom', k.bottom + 'px');
    d.documentElement.dataset.vsPlatform = k.os;
    // status bar and home indicator follow what the variant paints under them, not the gallery theme
    const ink = (y) => { const c = bgAt(d, k.w / 2, y); return c ? (c < 0.45 ? '#fff' : '#111') : ''; };
    ph.style.setProperty('--sbc', ink(k.top / 2) || (S.theme === 'dark' ? '#fff' : '#111'));
    ph.style.setProperty('--hic', ink(k.h - 10) || 'var(--sbc)');
  }
  // relative luminance of the first opaque background under a point of the variant (null when unknown)
  function bgAt(d, x, y) {
    for (let n = d.elementFromPoint(x, y); n && n.nodeType === 1; n = n.parentElement) {
      const cs = d.defaultView.getComputedStyle(n);
      const m = cs.backgroundColor.match(/[\d.]+/g);
      if (m && (m[3] == null || +m[3] > 0.5)) { const [r, g, b] = m.map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }
      if (cs.backgroundImage !== 'none') return null;
    }
    return null;
  }
  let built = '';
  S.render = () => {
    const { sk, k, fr } = pick();
    const bz = k.bz + EXTRA[fr], bt = (k.bt || k.bz) + EXTRA[fr], bb = (k.bb || k.bz) + EXTRA[fr], pad = PAD[fr];
    const br = Math.max(k.br || 0, k.sr + bz + pad);
    const W = k.w + 2 * (bz + pad), H = k.h + bt + bb + 2 * pad;
    const dark = S.theme === 'dark';
    const key = [sk, fr, dark, S.labels['Phone']].join();
    if (key !== built) {
      built = key;
      ph.className = `ph f-${fr} ${k.os} cut-${k.cut}${k.cut === 'notch' ? ' notch' : ''}`;
      Object.entries({ '--sw': k.w + 'px', '--sh': k.h + 'px', '--sr': k.sr + 'px', '--bz': bz + 'px', '--bt': bt + 'px', '--bb': bb + 'px', '--br': br + 'px', '--pad': pad + 'px', '--ph': (k.ph || 24) + 'px' })
        .forEach(([n, v]) => ph.style.setProperty(n, v));
      keys.innerHTML = k.keys.map(([side, t, len]) => `<i class="k ${side}" style="top:${Math.round(t * H)}px;height:${len}px"></i>`).join('');
      const ios = k.os === 'ios';
      const icons = ios ? `<span class="ico">${sig}${wifi}<span class="bat"><i></i></span></span>` : `<span class="ico">${awifi}${acell}<span class="dbat"></span></span>`;
      const sb = k.cut === 'none' && ios ? `<span>●●●●○</span><span>9:41</span>${icons}` : `<span>9:41</span>${icons}`;
      over.innerHTML = `<div class="sb" style="height:${k.top}px">${sb}</div>${k.bottom ? '<span class="home"></span>' : ''}${k.cut === 'island' ? '<span class="island"></span>' : k.cut === 'notch' ? '<span class="notchc"></span>' : k.cut === 'punch' ? '<span class="punch"></span>' : ''}`;
      // thick-bezel phones: earpiece, front camera, home button in the bezel
      bezel.innerHTML = sk === 'ip8' ? `<span class="ear" style="top:${bt / 2 - 3}px"></span><span class="fcam" style="top:${bt / 2 - 6}px;left:calc(50% - 78px)"></span><span class="hbtn" style="bottom:${bb / 2 - 32}px"></span>`
        : sk === 'px3' ? `<span class="ear" style="top:${bt / 2 - 3}px"></span><span class="fcam" style="top:${bt / 2 - 6}px;left:calc(50% - 64px)"></span><span class="ear" style="bottom:${bb / 2 - 3}px"></span>` : '';
      cap.innerHTML = `<b>${S.esc(k.name)}</b><span>${S.esc(S.L(k.note))} · ${k.w} × ${k.h} ${ios ? 'pt' : 'dp'}</span>`;
      safeVars();
    }
    cv.className = 'cv' + (S.canvas && S.canvas !== 'none' ? ' c-' + S.canvas : '');
    const aw = Math.max(120, S.root.clientWidth - 24), ah = S.fitH ? Math.max(260, S.fitH - 70) : Infinity;
    const s = Math.min(1, aw / (W + 12), ah / H);
    ph.style.transform = `translateX(${6 * s}px) scale(${s})`;
    fit.style.width = (W + 12) * s + 'px'; fit.style.height = H * s + 'px';
  };
  S.onInner = () => { safeVars(); setTimeout(safeVars, 400); };
  S.render();
})();
