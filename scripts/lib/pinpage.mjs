// The page at / : enter a session PIN (round 004/b). Opened from this computer it also lists the active sessions.
import os from 'node:os';
import { esc } from './util.mjs';
import { VERSION, studioLang } from './config.mjs';

const L = {
  en: {
    title: 'Enter the session PIN', hint: 'The PIN is in your agent\'s terminal or under its QR code.', box: 'PIN character {n} of 5', pin: 'Session PIN', open: 'Open',
    unknown: 'No active session with PIN {pin}. Check the terminal, or ask your agent to run `start` again.', short: 'Type all 5 characters.', remote: 'This session is not shared outside the local network.',
    sessions: 'Active sessions', here: 'Only on this computer', listening: 'agent listening', working: 'agent working', idle: 'agent not active', last: 'Last activity: {x}',
    note: 'Type a PIN or open a session from the list.', none: 'No active sessions. Ask your agent to run `start`.', s: '{n} s ago', m: '{n} min ago', h: '{n} h ago',
  },
  it: {
    title: 'Inserisci il PIN della sessione', hint: 'Il PIN è nel terminale dell\'agente o sotto il suo QR.', box: 'Carattere {n} di 5 del PIN', pin: 'PIN della sessione', open: 'Apri',
    unknown: 'Nessuna sessione attiva con PIN {pin}. Controlla il terminale o chiedi all\'agente di rilanciare `start`.', short: 'Scrivi tutti e 5 i caratteri.', remote: 'Questa sessione non è condivisa fuori dalla rete locale.',
    sessions: 'Sessioni attive', here: 'Solo da questo computer', listening: 'agente in ascolto', working: 'agente al lavoro', idle: 'agente non attivo', last: 'Ultima attività: {x}',
    note: 'Scrivi un PIN oppure apri una sessione dalla lista.', none: 'Nessuna sessione attiva. Chiedi all\'agente di lanciare `start`.', s: '{n} s fa', m: '{n} min fa', h: '{n} h fa',
  },
  es: {
    title: 'Escribe el PIN de la sesión', hint: 'El PIN está en la terminal de tu agente o bajo su código QR.', box: 'Carácter {n} de 5 del PIN', pin: 'PIN de la sesión', open: 'Abrir',
    unknown: 'No hay ninguna sesión activa con el PIN {pin}. Revisa la terminal o pide a tu agente que ejecute `start` otra vez.', short: 'Escribe los 5 caracteres.', remote: 'Esta sesión no se comparte fuera de la red local.',
    sessions: 'Sesiones activas', here: 'Solo en este ordenador', listening: 'agente escuchando', working: 'agente trabajando', idle: 'agente inactivo', last: 'Última actividad: {x}',
    note: 'Escribe un PIN o abre una sesión de la lista.', none: 'No hay sesiones activas. Pide a tu agente que ejecute `start`.', s: 'hace {n} s', m: 'hace {n} min', h: 'hace {n} h',
  },
  fr: {
    title: 'Saisissez le PIN de la session', hint: 'Le PIN se trouve dans le terminal de votre agent ou sous son code QR.', box: 'Caractère {n} sur 5 du PIN', pin: 'PIN de la session', open: 'Ouvrir',
    unknown: 'Aucune session active avec le PIN {pin}. Vérifiez le terminal ou demandez à votre agent de relancer `start`.', short: 'Saisissez les 5 caractères.', remote: 'Cette session n\'est pas partagée hors du réseau local.',
    sessions: 'Sessions actives', here: 'Uniquement sur cet ordinateur', listening: 'agent à l\'écoute', working: 'agent au travail', idle: 'agent inactif', last: 'Dernière activité : {x}',
    note: 'Saisissez un PIN ou ouvrez une session de la liste.', none: 'Aucune session active. Demandez à votre agent de lancer `start`.', s: 'il y a {n} s', m: 'il y a {n} min', h: 'il y a {n} h',
  },
  ru: {
    title: 'Введите PIN сессии', hint: 'PIN есть в терминале агента и под его QR-кодом.', box: 'Символ {n} из 5', pin: 'PIN сессии', open: 'Открыть',
    unknown: 'Нет активной сессии с PIN {pin}. Проверьте терминал или попросите агента снова запустить `start`.', short: 'Введите все 5 символов.', remote: 'Эта сессия не открыта за пределами локальной сети.',
    sessions: 'Активные сессии', here: 'Только на этом компьютере', listening: 'агент слушает', working: 'агент работает', idle: 'агент не активен', last: 'Последняя активность: {x}',
    note: 'Введите PIN или откройте сессию из списка.', none: 'Активных сессий нет. Попросите агента выполнить `start`.', s: '{n} с назад', m: '{n} мин назад', h: '{n} ч назад',
  },
};
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] ?? m));
const code = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const MARK = '<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><defs><mask id="pcut" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/><path d="M9 12h12l17 40H26z" fill="#000" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/></mask></defs><path d="M43 12h12L38 52H26z" fill="currentColor" fill-opacity=".3" mask="url(#pcut)"/><path d="M9 12h12l17 40H26z" fill="var(--acc)"/></svg>';
const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const INFO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/></svg>';
const ALERT = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16v.01"/></svg>';

// error: 'unknown' (no session with that PIN) | 'remote' (session not shared through the tunnel) | ''
export function pinPage({ error = '', pin = '', sessions = null, host = '' } = {}) {
  const lang = studioLang(), T = L[lang] || L.en;
  const ago = (ms) => { const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 60 ? fill(T.s, { n: s }) : s < 3600 ? fill(T.m, { n: Math.round(s / 60) }) : fill(T.h, { n: Math.round(s / 3600) }); };
  const home = os.homedir();
  const short = (p) => (p.startsWith(home) ? '~' + p.slice(home.length) : p);
  const bad = error === 'unknown' ? String(pin).toUpperCase().slice(0, 5) : '';
  const boxes = [0, 1, 2, 3, 4].map((i) => `<input class="box${bad ? ' bad' : ''}" value="${esc(bad[i] || '')}" maxlength="5" inputmode="text" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="${esc(fill(T.box, { n: i + 1 }))}"${i === 0 && !bad ? ' autofocus' : ''}>`).join('');
  const msg = error === 'unknown' ? fill(T.unknown, { pin: bad }) : error === 'remote' ? T.remote : '';
  const rows = (sessions || []).map((s) => {
    const st = s.agent === 'waiting' ? ['on', T.listening] : s.agent === 'working' ? ['on', T.working] : ['off', T.idle];
    return `<li class="row" data-pin="${esc(s.pin)}"><div class="info"><b>${esc(s.name)}</b><code title="${esc(s.project)}">${esc(short(s.project))}</code></div>`
      + `<code class="spin">${esc(s.pin)}</code><div class="stat"><span class="st ${st[0]}"><i></i>${esc(st[1])}</span><small>${esc(fill(T.last, { x: ago(s.last_activity) }))}</small></div>`
      + `<a class="open" href="/${esc(s.pin)}/">${esc(T.open)}${ARROW}</a></li>`;
  }).join('');
  const panel = sessions ? `<section class="panel"><div class="ph"><h2>${esc(T.sessions)}</h2><span>${LOCK}${esc(T.here)}</span></div>`
    + (sessions.length ? `<ul class="list">${rows}</ul><p class="pnote">${esc(T.note)}</p>` : `<p class="pnote">${code(T.none)}</p>`) + '</section>' : '';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="same-origin">
<meta name="color-scheme" content="dark light">
<title>Variant Studio</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect width='16' height='16' rx='3.6' fill='%231c1c22'/><path d='M11.2 3.2h2.6L10 12.8H7.4z' fill='%23ededf0' fill-opacity='.4'/><path d='M2.2 3.2h2.6l3.8 9.6H6z' fill='%23ff8a3d'/></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap">
<style>
:root{--bg:#1a1a1e;--surf:#222227;--surf-2:#28282e;--line:#2e2e35;--line-2:#3a3a42;--ink:#ededf0;--ink-2:#b3b3bc;--ink-3:#a9a9b3;--acc:#ff8a3d;--acc-fg:#ff8a3d;--acc-ink:#1c1006;--acc-soft:rgba(255,138,61,.14);--acc-line:rgba(255,138,61,.55);--good:#5fd39a;--bad:#ff8a8a;--bad-soft:rgba(255,123,123,.1);
--font:"Instrument Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;color-scheme:dark}
@media (prefers-color-scheme:light){:root{--bg:#f4f4f6;--surf:#fff;--surf-2:#ececf0;--line:#e3e3e8;--line-2:#d3d3da;--ink:#1a1a1e;--ink-2:#4f4f59;--ink-3:#5c5c66;--acc-fg:#c2410c;--acc-soft:rgba(255,138,61,.16);--acc-line:rgba(194,65,12,.5);--good:#18794a;--bad:#c92a2a;--bad-soft:rgba(201,42,42,.07);color-scheme:light}}
*{box-sizing:border-box}html,body{margin:0}
body{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;padding:28px 20px 22px;background:var(--bg);color:var(--ink);font:13px/1.45 var(--font);-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
svg{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.mark{width:30px;height:30px;stroke:none}
h1,h2,p{margin:0}
.wrap{margin:auto 0;width:min(1060px,100%);display:grid;grid-template-columns:minmax(0,380px) minmax(0,1fr);gap:64px;align-items:center}
.wrap.solo{grid-template-columns:minmax(0,380px);justify-content:center}
.left{display:flex;flex-direction:column;align-items:flex-start;min-width:0}
.logo{display:flex;align-items:center;gap:10px;font-weight:600;font-size:15px;letter-spacing:-.005em}
h1{font-size:28px;line-height:1.15;font-weight:600;letter-spacing:-.015em;margin:34px 0 26px}
form{display:flex;flex-direction:column;align-items:flex-start;gap:0;width:100%}
.boxes{display:flex;align-items:center;gap:10px}
.box{width:clamp(46px,14vw,58px);height:clamp(58px,17.5vw,74px);border-radius:8px;background:var(--surf);border:1.5px solid var(--line-2);color:var(--ink);font:700 clamp(26px,8vw,32px)/1 var(--mono);text-align:center;text-transform:uppercase;padding:0;caret-color:var(--acc);outline:none;transition:border-color .12s,box-shadow .12s}
.box:focus{border-color:var(--acc);box-shadow:0 0 0 4px var(--acc-soft)}
.box.bad{border-color:var(--bad);background:var(--bad-soft)}
.box.bad:focus{box-shadow:0 0 0 4px var(--bad-soft)}
.hint{display:flex;align-items:center;gap:8px;color:var(--ink-3);font-size:13.5px;margin-top:18px}
.err{display:flex;align-items:flex-start;gap:7px;color:var(--bad);font-size:13px;font-weight:500;margin-top:14px;max-width:380px}
.err svg{margin-top:2px}.err:empty{display:none}
.err code,.pnote code{font-family:var(--mono);font-size:12px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.shake{animation:shake .3s}
@keyframes shake{25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
@media (prefers-reduced-motion:reduce){.shake{animation:none}.box{transition:none}}
.panel{background:var(--surf);border:1px solid var(--line);border-radius:12px;overflow:hidden;min-width:0}
.ph{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--line)}
.ph h2{font-size:15px;font-weight:600;flex:1}
.ph span{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:500;color:var(--ink-3);border:1px solid var(--line-2);border-radius:999px;padding:3px 10px 3px 8px;white-space:nowrap}
.ph span svg{width:13px;height:13px}
.list{list-style:none;margin:0;padding:6px}
.row{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;align-items:center;gap:16px;padding:14px 12px;border-radius:8px;border:1px solid transparent}
.row+.row{margin-top:2px}
.row.hit{background:var(--acc-soft);border-color:var(--acc-line)}
.info{display:flex;flex-direction:column;gap:3px;min-width:0}
.info b{font-size:14.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.info code{font:500 12px var(--mono);color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.spin{font:700 14px var(--mono);letter-spacing:.1em;padding:6px 10px;border-radius:6px;background:var(--bg);border:1px solid var(--line-2)}
.spin em{font-style:normal;color:var(--acc-fg)}
.stat{display:flex;flex-direction:column;gap:3px;min-width:132px}
.st{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600}
.st i{width:8px;height:8px;border-radius:50%;background:var(--ink-3)}
.st.on{color:var(--good)}.st.on i{background:var(--good);box-shadow:0 0 0 3px rgba(95,211,154,.18)}
.st.off{color:var(--ink-2)}
.stat small{font-size:11.5px;color:var(--ink-3)}
.open{height:34px;padding:0 12px;border-radius:6px;border:1px solid var(--line-2);background:var(--surf-2);color:var(--ink);font-weight:600;font-size:12.5px;display:inline-flex;align-items:center;justify-content:center;gap:6px;text-decoration:none}
.open:hover{border-color:var(--ink-3)}
.row.hit .open{background:var(--acc);border-color:var(--acc);color:var(--acc-ink)}
.pnote{padding:12px 18px 14px;border-top:1px solid var(--line);font-size:12px;color:var(--ink-3)}
.list+.pnote{border-top:1px solid var(--line)}
.foot{margin-top:24px;font:500 12px var(--mono);color:var(--ink-3)}
:focus-visible{outline:2px solid var(--acc-fg);outline-offset:2px}
@media (max-width:900px){
 .wrap{grid-template-columns:minmax(0,1fr);gap:36px;max-width:520px}
 .left,form{align-items:center}h1{text-align:center;font-size:clamp(22px,6vw,28px);margin:26px 0 24px}
 .hint,.err{justify-content:center;text-align:center}
 .row{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"info stat" "pin open";gap:12px 10px;padding:14px 12px 12px}
 .info{grid-area:info}.stat{grid-area:stat;min-width:0;align-items:flex-end;text-align:right}.spin{grid-area:pin;justify-self:start}.open{grid-area:open}
 .stat small{font-size:11px}
}
@media (max-width:400px){.boxes{gap:8px}.ph span{display:none}}
</style>
</head>
<body>
<main class="wrap${panel ? '' : ' solo'}">
<div class="left">
<div class="logo">${MARK}Variant Studio</div>
<h1 id="ttl">${esc(T.title)}</h1>
<form action="/" method="get" autocomplete="off" id="f" aria-labelledby="ttl">
<input type="hidden" name="pin" id="pin">
<div class="boxes" role="group" aria-label="${esc(T.pin)}">${boxes}</div>
<noscript><p><input name="pin" maxlength="5" aria-label="${esc(T.pin)}" style="margin-top:12px"> <button>${esc(T.open)}</button></p></noscript>
<button type="submit" class="sr">${esc(T.open)}</button>
<p class="hint">${INFO}${esc(T.hint)}</p>
<p class="err" id="err" role="alert">${msg ? ALERT + '<span>' + code(msg) + '</span>' : ''}</p>
</form>
</div>
${panel}
</main>
<div class="foot">${esc(host || 'variant-studio.localhost')} · ${esc(VERSION)}</div>
<script>
(() => {
  const boxes = [...document.querySelectorAll('.box')], form = document.getElementById('f'), err = document.getElementById('err');
  const rows = [...document.querySelectorAll('.row[data-pin]')];
  const SHORT = ${JSON.stringify(T.short)}, ALERT = ${JSON.stringify(ALERT)};
  const clean = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const value = () => boxes.map((b) => b.value).join('');
  // highlight the sessions whose PIN starts with what is typed so far
  function paint() {
    const v = value();
    for (const r of rows) {
      const p = r.dataset.pin, hit = v.length > 0 && p.startsWith(v);
      r.classList.toggle('hit', hit);
      const c = r.querySelector('.spin'); c.textContent = '';
      if (hit) { const em = document.createElement('em'); em.textContent = p.slice(0, v.length); c.append(em, p.slice(v.length)); } else c.textContent = p;
    }
  }
  function clearBad() { if (boxes.some((b) => b.classList.contains('bad'))) { boxes.forEach((b) => b.classList.remove('bad')); err.innerHTML = ''; } }
  function submit() {
    const v = value();
    if (v.length < 5) { err.innerHTML = ALERT + SHORT; const g = document.querySelector('.boxes'); g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake'); (boxes.find((b) => !b.value) || boxes[4]).focus(); return; }
    document.getElementById('pin').value = v; form.submit();
  }
  // put text (typed, pasted or autofilled) into the boxes from index i on
  function spread(i, text) {
    const chars = clean(text).split('');
    let j = i;
    for (const ch of chars) { if (j > 4) break; boxes[j++].value = ch; }
    return Math.min(j, 4);
  }
  boxes.forEach((b, i) => {
    b.addEventListener('input', () => {
      clearBad();
      const v = clean(b.value);
      if (v.length > 1) { const j = spread(i, v); boxes[j].focus(); }
      else { b.value = v; if (v && i < 4) boxes[i + 1].focus(); }
      paint();
      if (value().length === 5 && document.activeElement === boxes[4] && boxes[4].value) submit();
    });
    b.addEventListener('paste', (e) => {
      e.preventDefault(); clearBad();
      const j = spread(i, (e.clipboardData || window.clipboardData).getData('text'));
      boxes[j].focus(); paint();
      if (value().length === 5) submit();
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Backspace' && !b.value && i > 0) { e.preventDefault(); boxes[i - 1].value = ''; boxes[i - 1].focus(); clearBad(); paint(); }
      else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); boxes[i - 1].focus(); }
      else if (e.key === 'ArrowRight' && i < 4) { e.preventDefault(); boxes[i + 1].focus(); }
    });
    b.addEventListener('focus', () => b.select());
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  if (boxes.some((b) => b.classList.contains('bad'))) { boxes[4].focus(); }
  paint();
})();
</script>
</body>
</html>`;
}
