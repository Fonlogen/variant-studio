// Desktop window frame. Options: skin (see SKINS), win WxH (client area, default 1280x800), desk (show taskbar / dock / wallpaper).
(() => {
  const S = window.vsShell, C = S.C;
  const svg = (d) => `<svg viewBox="0 0 10 10">${d}</svg>`;
  const G = { min: svg('<path d="M1 5.5h8"/>'), max: svg('<rect x="1.5" y="1.5" width="7" height="7"/>'), cls: svg('<path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/>'), up: svg('<path d="M2 6.5 5 3.5l3 3"/>'), down: svg('<path d="M2 3.5 5 6.5l3-3"/>'), menu: svg('<path d="M1.5 2.5h7M1.5 5h7M1.5 7.5h7"/>'), pin: svg('<path d="M5 1.5v7M2 4.5h6"/>') };
  const cb = (o = {}) => `<span class="cb"><i class="min">${o.min || G.min}</i><i class="max">${o.max || G.max}</i><i class="cls">${G.cls}</i></span>`;
  const lights = '<span class="lights"><i class="x"></i><i class="m"></i><i class="f"></i></span>';
  const tools = '<span class="tools"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></span>';
  const apps = (n) => '<i class="app"></i>'.repeat(n);
  // os: data-vs-os for the variant; mx/my: free desktop around the window; panels: [top, right, bottom, left] space they take
  const SKINS = {
    xp: { name: 'Windows XP', os: 'windows', pad: [0, 0, 30, 0], tb: (t) => `<i class="aic"></i><span class="ttl">${t}</span>${cb()}`, desk: (t) => `<div class="pn"><span class="start"><i class="app" style="width:18px;height:18px;border-radius:3px"></i>start</span><span class="task">${t}</span><span class="tray">9:41</span></div>` },
    win7: { name: 'Windows 7', os: 'windows', pad: [0, 0, 40, 0], tb: (t) => `<i class="aic"></i><span class="ttl">${t}</span>${cb()}`, desk: () => `<div class="pn"><i class="orb"></i>${apps(4)}<span class="tray">9:41</span></div>` },
    win10: { name: 'Windows 8 / 10', os: 'windows', pad: [0, 0, 40, 0], tb: (t) => `<i class="aic"></i><span class="ttl">${t}</span>${cb()}`, desk: () => `<div class="pn"><span class="start"><i class="g"></i></span><span class="search">${S.esc(S.L('Search'))}</span>${apps(4)}<span class="tray">9:41</span></div>` },
    win11: { name: 'Windows 11', os: 'windows', pad: [0, 0, 48, 0], tb: (t) => `<i class="aic"></i><span class="ttl">${t}</span>${cb()}`, desk: () => `<div class="pn"><span class="start"><i class="g"></i></span>${apps(5)}<span class="tray">9:41</span></div>` },
    gnome: { name: 'Ubuntu GNOME', os: 'linux', pad: [28, 0, 0, 60], tb: (t) => `<span class="hbtn">${G.menu}</span><span class="sp"></span><span class="ttl">${t}</span>${cb()}`, desk: () => `<div class="pn top"><span class="act"><i></i><i></i><i></i></span>9:41<span class="tray">◔ ▾</span></div><div class="pn dock">${apps(5)}<i class="grid"></i></div>` },
    kde: { name: 'KDE Plasma', os: 'linux', pad: [0, 0, 44, 0], tb: (t) => `<i class="aic"></i><span class="menu">${G.menu}</span><span class="pin">${G.pin}</span><span class="ttl">${t}</span>${cb({ min: G.down, max: G.up })}`, desk: (t) => `<div class="pn"><i class="launch"></i>${apps(3)}<span class="task">${t}</span><span class="tray">9:41</span></div>` },
    mac: { name: 'macOS', os: 'mac', pad: [24, 0, 74, 0], tb: (t) => `${lights}${tools}<span class="ttl">${t}</span>`, desk: (t, a) => macDesk(a) },
    yosemite: { name: 'OS X Yosemite', os: 'mac', pad: [22, 0, 62, 0], tb: (t) => `${lights}<span class="ttl">${t}</span>`, desk: (t, a) => macDesk(a) },
    leopard: { name: 'Mac OS X Leopard', os: 'mac', pad: [22, 0, 56, 0], tb: (t) => `${lights}<span class="ttl">${t}</span>`, desk: (t, a) => macDesk(a) },
    aqua: { name: 'Mac OS X Aqua', os: 'mac', pad: [22, 0, 62, 0], tb: (t) => `${lights}<span class="ttl">${t}</span>`, desk: (t, a) => macDesk(a) },
  };
  // generic menu bar (no vendor glyph) + dock
  const macDesk = (app) => `<div class="pn mbar"><i class="glyph"></i><b>${app}</b>${['File', 'Edit', 'View', 'Window', 'Help'].map((m) => `<span>${S.esc(S.L(m))}</span>`).join('')}<span class="tray">9:41</span></div><div class="pn dock">${apps(7)}</div>`;
  window.vsDesktopSkins = SKINS;
  const SIZES = ['1024x768', '1280x800', '1440x900', '1920x1080'];

  const dk = S.el('div', 'dk'), fit = S.el('div', 'fit'), scr = S.el('div', 'scr'), panels = S.el('div'), win = S.el('div', 'win'), tb = S.el('div', 'tb'), client = S.el('div', 'client'), cap = S.el('div', 'cap');
  client.append(S.makeInner()); win.append(tb, client); scr.append(panels, win); fit.append(scr); dk.append(fit, cap); S.root.append(dk);
  const pick = () => ({ sk: SKINS[S.opts.skin] ? S.opts.skin : 'mac', size: SIZES.includes(S.opts.win) ? S.opts.win : '1280x800', desk: !!S.opts.desk && S.opts.desk !== '0' });
  const osVar = () => { const d = S.innerDoc(); if (d?.documentElement) d.documentElement.dataset.vsOs = SKINS[pick().sk].os; };
  let built = '';
  S.render = () => {
    const { sk, size, desk } = pick(), k = SKINS[sk];
    const [w, h] = size.split('x').map(Number);
    const title = S.esc(`${C.title} — ${C.label}`);
    const key = [sk, size, desk, JSON.stringify(S.labels)].join();
    if (key !== built) {
      built = key;
      dk.className = `dk sk-${sk}${desk ? ' desk' : ''}`;
      tb.innerHTML = k.tb(title);
      panels.innerHTML = desk ? k.desk(title, S.esc(C.title)) : '';
      scr.style.setProperty('--wall', `url("${C.wallpaper}")`);
      client.style.width = w + 'px'; client.style.height = h + 'px';
      cap.innerHTML = `<b>${S.esc(k.name)}</b> · ${w} × ${h}`;
      osVar();
    }
    dk.classList.toggle('c-' + S.canvas, !!S.canvas && S.canvas !== 'none');
    for (const c of [...dk.classList]) if (c.startsWith('c-') && c !== 'c-' + S.canvas) dk.classList.remove(c);
    const ww = win.offsetWidth, wh = win.offsetHeight;
    const [pt, pr, pb, pl] = desk ? k.pad : [0, 0, 0, 0], m = desk ? 40 : 0;
    const W = ww + pl + pr + 2 * m, H = wh + pt + pb + 2 * m;
    win.style.left = pl + m + 'px'; win.style.top = pt + m + 'px';
    scr.style.width = W + 'px'; scr.style.height = H + 'px';
    const aw = Math.max(120, S.root.clientWidth - 24), ah = S.fitH ? Math.max(200, S.fitH - 64) : Infinity;
    const s = Math.min(1, aw / W, ah / H);
    scr.style.transform = `scale(${s})`;
    fit.style.width = W * s + 'px'; fit.style.height = H * s + 'px';
  };
  S.onInner = osVar;
  S.render();
})();
