// Terminal shell. Options (vsShell.opts): shell acrylic|tabs|tmux|plain|ubuntu|cmd|powershell|wt, font, size, opacity, blur, wall. Typing goes to our prompt line.
(() => {
  const S = window.vsShell, C = S.C, $ = (q) => S.root.querySelector(q);
  const NF = 'https://cdn.jsdelivr.net/gh/ryanoasis/nerd-fonts@v3.2.1/patched-fonts/';
  const FONTS = {
    jetbrains: ['JetBrainsMono Nerd', 'JetBrainsMono/Ligatures/Regular/JetBrainsMonoNerdFont-Regular.ttf', 'JetBrainsMono/Ligatures/Bold/JetBrainsMonoNerdFont-Bold.ttf'],
    fira: ['FiraCode Nerd', 'FiraCode/Regular/FiraCodeNerdFont-Regular.ttf', 'FiraCode/Bold/FiraCodeNerdFont-Bold.ttf'],
    hack: ['Hack Nerd', 'Hack/Regular/HackNerdFont-Regular.ttf', 'Hack/Bold/HackNerdFont-Bold.ttf'],
    caskaydia: ['CaskaydiaCove Nerd', 'CascadiaCode/Regular/CaskaydiaCoveNerdFont-Regular.ttf', 'CascadiaCode/Bold/CaskaydiaCoveNerdFont-Bold.ttf'],
  };
  // web and system fonts the OS shells default to; Consolas falls back to Cascadia Mono where it is not installed
  const GF = (q) => `https://fonts.googleapis.com/css2?${q}&display=swap`;
  const WEB = {
    ubuntu: ['Ubuntu Mono', GF('family=Ubuntu+Mono:wght@400;700')],
    cascadia: ['Cascadia Mono', GF('family=Cascadia+Mono:wght@400;700')],
    consolas: ['Consolas', GF('family=Cascadia+Mono:wght@400;700'), 'Consolas,"Cascadia Mono"'],
  };
  // opaque shells have no see-through window: opacity, blur and wallpaper do not apply
  const STYLES = {
    acrylic: { opacity: 58, blur: 24, wall: 'img' }, tabs: { opacity: 82, blur: 12, wall: 'dunes' }, tmux: { opacity: 100, blur: 0, wall: 'night' },
    plain: { opacity: 100, blur: 0, wall: 'solid', opaque: true },
    ubuntu: { opacity: 100, blur: 0, wall: 'img', font: 'ubuntu', ui: GF('family=Ubuntu:wght@400;500;700') },
    cmd: { opacity: 100, blur: 0, wall: 'solid', font: 'consolas', opaque: true },
    powershell: { opacity: 100, blur: 0, wall: 'solid', font: 'consolas', opaque: true },
    wt: { opacity: 100, blur: 0, wall: 'img', font: 'cascadia' },
  };
  const WALLS = {
    img: () => `url("${C.wallpaper}")`,
    aurora: () => 'radial-gradient(60% 55% at 18% 22%, rgba(255,160,122,.55), transparent 62%), radial-gradient(50% 60% at 85% 18%, rgba(138,120,255,.6), transparent 60%), radial-gradient(70% 60% at 70% 95%, rgba(46,196,182,.45), transparent 62%), conic-gradient(from 210deg at 55% 45%, #1b1d3a, #2a1f4d, #13304a, #1b1d3a)',
    dunes: () => 'radial-gradient(140% 60% at 50% 118%, #1d3b44 0 38%, transparent 38.4%), radial-gradient(130% 55% at 90% 104%, #4f7d74 0 40%, transparent 40.4%), radial-gradient(40% 30% at 72% 30%, rgba(255,226,170,.95), rgba(255,190,130,.4) 45%, transparent 70%), linear-gradient(180deg, #f6c79a 0%, #ec9f86 38%, #b86f86 64%, #5a4a74 100%)',
    night: () => 'radial-gradient(70% 60% at 85% 10%, #3c5a8a 0%, transparent 60%), radial-gradient(60% 70% at 10% 90%, #5a3f6e 0%, transparent 62%), linear-gradient(160deg, #1c2333, #1a1c28 60%, #241b2c)',
    solid: () => '#111318',
  };
  const svgBtn = (d) => `<i><svg viewBox="0 0 10 10">${d}</svg></i>`;
  const MIN = svgBtn('<path d="M1 5h8"/>'), MAX = svgBtn('<rect x="1.5" y="1.5" width="7" height="7" rx="1"/>'), CLOSE = svgBtn('<path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/>');
  const WB = `<span class="wb">${MIN}${MAX}${CLOSE}</span>`, CAP = `<span class="wb cap">${MIN}${MAX.replace(' rx="1"', '')}${CLOSE}</span>`;
  const o = () => { const st = STYLES[S.opts.shell] ? S.opts.shell : 'acrylic'; return { st, font: 'jetbrains', size: 13, ...STYLES[st], ...Object.fromEntries(Object.entries(S.opts).filter(([, v]) => v != null && v !== '')) }; };
  const family = (f) => (FONTS[f] ? `"${FONTS[f][0]}"` : WEB[f] ? WEB[f][2] || `"${WEB[f][0]}"` : String(f || '').startsWith('local:') ? `"${f.slice(6).replace(/"/g, '')}"` : '"JetBrainsMono Nerd"');
  // Nerd glyphs (private use area) resolve whatever the text font: this face only downloads when such a glyph shows up
  const GLYPHS = `@font-face{font-family:"VS Nerd Glyphs";src:url("${NF}${FONTS.jetbrains[1]}") format("truetype");unicode-range:U+E000-F8FF,U+F0000-FFFFD}`;
  const faceCss = (f) => (FONTS[f] ? [400, 700].map((w, i) => `@font-face{font-family:"${FONTS[f][0]}";src:url("${NF}${FONTS[f][i + 1]}") format("truetype");font-weight:${w};font-display:swap}`).join('') : '') + GLYPHS;
  const stack = (f) => `${family(f)},"VS Nerd Glyphs","JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;
  function fontStyle(doc, f, size, ui) {
    if (!doc || !doc.head) return;
    let st = doc.getElementById('vs-term-font');
    if (!st) { st = doc.createElement('style'); st.id = 'vs-term-font'; doc.head.append(st); }
    const imports = [WEB[f]?.[1], ui].filter(Boolean).map((u) => `@import url("${u}");`).join('');
    const css = `${imports}${faceCss(f)}html[data-vs-design][data-vs-design]{--vs-mono:${stack(f)}}html[data-vs-design="tui"]{font-size:${size}px}html[data-vs-design],html[data-vs-design] body{background:transparent!important}`;
    if (st.textContent !== css) st.textContent = css;
  }

  // ---- stable skeleton: the iframe never moves, so switching styles never reloads the variant ----
  const st = S.el('div', 'st'), win = S.el('div', 'win'), top = S.el('div', 'top'), tools = S.el('div', 'tools'), term = S.el('div', 'term'), bottom = S.el('div');
  const typed = S.el('div', 'typed'), prompt = S.el('div', 'prompt');
  term.append(S.makeInner('screen'), typed, prompt);
  win.append(top, tools, term, bottom); st.append(win); S.root.append(st);
  const input = Object.assign(document.createElement('input'), { type: 'text', spellcheck: false, autocomplete: 'off' });
  input.setAttribute('aria-label', 'prompt');
  const hist = []; let hi = 0;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = input.value; input.value = '';
      if (/^(clear|cls)$/i.test(v.trim())) { typed.innerHTML = ''; return; }
      if (v.trim()) { hist.push(v); hi = hist.length; }
      const sys = SYS[o().st];
      const line = S.el('div'); line.innerHTML = (sys ? sys.ps : '<span class="p">❯</span> ') + S.esc(v);
      typed.append(line);
      if (sys && v.trim()) typed.append(S.el('div', 'err', S.esc(sys.err(v.trim().split(/\s+/)[0]))));
      while (typed.children.length > 8) typed.firstChild.remove();
    } else if (e.key === 'ArrowUp' && hist.length) { e.preventDefault(); hi = Math.max(0, hi - 1); input.value = hist[hi]; }
    else if (e.key === 'ArrowDown' && hist.length) { e.preventDefault(); hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ''; }
    else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); typed.innerHTML = ''; }
  });
  term.addEventListener('pointerup', () => { if (!getSelection().toString()) input.focus({ preventScroll: true }); });

  let builtTools = '', builtTop = '', lastSt = '';
  function buildTools(x) {
    const L = S.L;
    const opt = (v, l) => `<option value="${v}"${x.font === v ? ' selected' : ''}>${l}</option>`;
    const local = String(x.font).startsWith('local:');
    tools.innerHTML = `<label>${L('Font')} <select data-k="font">${Object.entries({ ...FONTS, ...WEB }).map(([k, f]) => opt(k, f[0])).join('')}${local ? opt(x.font, S.esc(x.font.slice(6))) : ''}<option value="__local">${L('Font on this computer…')}</option></select></label>
      <span class="sz"><button data-sz="-1" aria-label="−">−</button> <b>${x.size}</b> <button data-sz="1" aria-label="+">+</button></span>
      ${x.opaque ? '' : `<label>${L('Opacity')} <input type="range" min="30" max="100" value="${x.opacity}" data-k="opacity"><b>${x.opacity}%</b></label>
      <label>${L('Blur')} <input type="range" min="0" max="40" value="${x.blur}" data-k="blur"><b>${x.blur}px</b></label>
      <label>${L('Wallpaper')} <span class="sw">${Object.keys(WALLS).map((w) => `<button data-w="${w}" title="${w}" aria-pressed="${x.wall === w}" style="--b:${WALLS[w]().replace(/"/g, '&quot;')}"></button>`).join('')}</span></label>`}
      <span class="grow"></span>`;
    tools.querySelector('[data-k=font]').onchange = async (e) => {
      if (e.target.value !== '__local') return S.set({ font: e.target.value });
      // Local Font Access when the browser allows it, else a typed family name
      let names = [];
      try { if (window.queryLocalFonts) names = [...new Set((await queryLocalFonts()).map((f) => f.family))].sort(); } catch {}
      const box = S.el('label'); box.innerHTML = `<input type="text" list="vs-lf" placeholder="${S.esc(L('Font family name'))}"><datalist id="vs-lf">${names.map((n) => `<option value="${S.esc(n)}">`).join('')}</datalist>`;
      e.target.parentElement.replaceWith(box);
      const inp = box.querySelector('input'); inp.focus();
      inp.onchange = () => { if (inp.value.trim()) S.set({ font: 'local:' + inp.value.trim() }); else S.render(true); };
    };
    tools.querySelectorAll('input[type=range]').forEach((r) => { r.oninput = () => { r.nextElementSibling.textContent = r.value + (r.dataset.k === 'blur' ? 'px' : '%'); apply({ ...o(), [r.dataset.k]: Number(r.value) }); }; r.onchange = () => S.set({ [r.dataset.k]: Number(r.value) }); });
    tools.querySelectorAll('[data-w]').forEach((b) => { b.onclick = () => S.set({ wall: b.dataset.w }); });
    tools.querySelectorAll('[data-sz]').forEach((b) => { b.onclick = () => S.set({ size: Math.min(20, Math.max(10, o().size + Number(b.dataset.sz))) }); });
  }
  // the OS shells: their default chrome, prompt and "unknown command" reply
  const WIC = '<span class="wic">&gt;_</span>';
  // the real user and host for the owner, neutral names for guests (the server decides: shells.mjs termWho)
  const U = S.esc(C.who?.user || 'user'), H = S.esc(C.who?.host || 'host');
  const SYS = {
    plain: { ps: `${U}@${H}:~$ `, err: (c) => `${c}: command not found` },
    ubuntu: { ps: `<b class="pu">${U}@${H}</b>:<b class="pd">~</b>$ `, err: (c) => `${c}: command not found`,
      top: () => `<span class="hb">${svgBtn('<path d="M5 1.5v7M1.5 5h7"/>')}</span><span class="ttl">${U}@${H}: ~</span><span class="hb">${svgBtn('<circle cx="4.3" cy="4.3" r="2.8"/><path d="M6.4 6.4l2.3 2.3"/>')}${svgBtn('<path d="M1.5 2.5h7M1.5 5h7M1.5 7.5h7"/>')}</span><span class="yaru">${MIN}${MAX}${svgBtn('<path d="M2.5 2.5l5 5M7.5 2.5l-5 5"/>')}</span>` },
    cmd: { ps: `C:\\Users\\${U}&gt;`, err: (c) => `'${c}' is not recognized as an internal or external command,\noperable program or batch file.`,
      top: () => `${WIC}<span class="ttl">${S.esc(S.L('Command Prompt'))}</span>${CAP}` },
    powershell: { ps: `PS C:\\Users\\${U}&gt; `, err: (c) => `${c} : The term '${c}' is not recognized as the name of a cmdlet, function, script file, or operable program.\n    + CategoryInfo          : ObjectNotFound: (${c}:String) [], CommandNotFoundException`,
      top: () => `${WIC}<span class="ttl">Windows PowerShell</span>${CAP}` },
    wt: { ps: `PS C:\\Users\\${U}&gt; `, err: (c) => `${c}: The term '${c}' is not recognized as a name of a cmdlet, function, script file, or executable program.`,
      top: () => `<div class="tab on"><span class="ic">&gt;_</span><span class="tt">${S.esc(C.title)}</span><span class="x">✕</span></div><span class="plus">+</span><span class="plus dd">⌄</span><span class="sp"></span>${CAP}` },
  };
  function buildTop(x) {
    const sys = SYS[x.st];
    if (x.st !== lastSt) { lastSt = x.st; typed.innerHTML = ''; } // another shell starts clean
    top.hidden = !!sys && !sys.top;
    if (sys) {
      top.className = 'top' + (x.st === 'wt' ? ' tabs' : '');
      top.innerHTML = sys.top ? sys.top() : '';
      prompt.innerHTML = sys.ps; prompt.append(input);
      bottom.className = ''; bottom.innerHTML = '';
      return;
    }
    const title = `${S.esc(C.title)} <span>— ${S.esc(C.label)} · zsh</span>`;
    top.className = 'top' + (x.st === 'tabs' ? ' tabs' : x.st === 'tmux' ? ' tmuxbar' : '');
    if (x.st === 'tabs') top.innerHTML = `<div class="tab on"><span class="ic">&#xf489;</span>${S.esc(C.label)}<span class="x">✕</span></div><div class="tab"><span class="ic">&#xf120;</span>zsh<span class="x">✕</span></div><span class="plus">+</span><span class="sp"></span>${WB}`;
    else if (x.st === 'tmux') top.innerHTML = `<i>&#xf120;</i> tmux · ${S.esc(C.title)}`;
    else top.innerHTML = `<span class="appic">&#xf120;</span><span class="ttl">${title}</span>${WB}`;
    const dir = String(C.title || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18) || 'app';
    prompt.innerHTML = `<span class="seg s1">${U}@${H} &#xf07b; ${S.esc(dir)}</span><span class="seg a1">&#xe0b0;</span><span class="seg s2">&#xe725; main</span><span class="seg a2">&#xe0b0;</span><span class="caret">❯</span>`;
    prompt.append(input);
    if (x.st === 'tmux') { bottom.className = 'tmux'; bottom.innerHTML = `<span class="sess">${S.esc(dir)}</span><span class="w on">0:<b>${S.esc(C.label)}</b>*</span><span class="w">1:zsh</span><span class="r"><span>&#xe725; main</span><span>"${H}"</span><span class="clk">${new Date().toTimeString().slice(0, 5)}</span></span>`; }
    else { bottom.className = ''; bottom.innerHTML = ''; }
  }
  function apply(x) {
    S.root.className = 's-' + x.st + (x.opaque ? ' opq' : '');
    S.root.style.setProperty('--op', x.opaque ? 1 : x.opacity / 100);
    S.root.style.setProperty('--blur', (x.opaque ? 0 : x.blur) + 'px');
    S.root.style.setProperty('--fs', x.size + 'px');
    S.root.style.setProperty('--vs-mono', stack(x.font));
    st.style.setProperty('--wall', (WALLS[x.wall] || WALLS.img)());
  }
  S.render = (force) => {
    const x = o();
    const tk = JSON.stringify([x.font, x.size, x.opacity, x.blur, x.wall, !!x.opaque, S.labels]);
    if (force || tk !== builtTools) { builtTools = tk; buildTools(x); }
    const tp = x.st + C.label + S.L('Command Prompt');
    if (tp !== builtTop) { builtTop = tp; buildTop(x); }
    apply(x);
    fontStyle(document, x.font, x.size, x.ui);
    fontStyle(S.innerDoc(), x.font, x.size);
    if (S.innerH) S.inner.style.height = S.innerH + 'px';
  };
  S.onInner = () => { const x = o(); fontStyle(S.innerDoc(), x.font, x.size); };
  S.render();
})();
