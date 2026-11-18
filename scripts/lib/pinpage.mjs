// The page at / : enter a session PIN. Opened from this computer it also lists the active sessions.
import { esc } from './util.mjs';
import { VERSION } from './config.mjs';

const ago = (ms) => { const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };

export function pinPage({ error = '', pin = '', sessions = null } = {}) {
  const rows = (sessions || []).map((s) => `<tr><td><b>${esc(s.name)}</b><br><small>${esc(s.project)}</small></td><td><code>${esc(s.pin)}</code><br><small>guest <code>${esc(s.guest_pin)}</code></small></td>`
    + `<td>${s.agent === 'waiting' ? '<span class="on">listening</span>' : s.agent === 'working' ? 'working' : '<span class="off">no</span>'}</td><td>${ago(s.last_activity)}</td><td><a href="/${esc(s.pin)}">Open</a></td></tr>`).join('');
  const list = sessions ? (sessions.length
    ? `<h2>Active sessions</h2><div class="scroll"><table><thead><tr><th>Project</th><th>PIN</th><th>Agent listening</th><th>Last activity</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><p class="hint">Only shown on this computer.</p>`
    : '<p class="hint">No active sessions. Ask your agent to run <code>start</code>.</p>') : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="same-origin">
<title>Variant Studio</title>
<style>
:root{--bg:#f6f6f4;--fg:#1c1c1a;--mut:#6b6b66;--line:#dcdcd6;--card:#fff;--acc:#3b5bdb;--bad:#c92a2a;--ok:#2b8a3e;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#ececea;--mut:#9a9a94;--line:#2e2e2b;--card:#1d1d1b;--acc:#7b93f0;--bad:#ff8787;--ok:#69db7c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
main{max-width:720px;margin:12vh auto 0}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:36px 0 8px}
p{margin:0 0 16px;color:var(--mut)}form{display:flex;gap:8px;flex-wrap:wrap}
input{font:600 24px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.3em;text-transform:uppercase;width:9.5em;max-width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg)}
input:focus{outline:2px solid var(--acc);outline-offset:1px}
button{font:inherit;font-weight:600;padding:0 22px;min-height:50px;border:0;border-radius:10px;background:var(--acc);color:#fff;cursor:pointer}
.err{color:var(--bad);margin-top:12px}.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:var(--mut);font-weight:600}tr:last-child td{border-bottom:0}
small{color:var(--mut)}code{font-family:ui-monospace,Menlo,Consolas,monospace}a{color:var(--acc)}.on{color:var(--ok);font-weight:600}.off{color:var(--mut)}.hint{font-size:13px;margin-top:8px}
</style>
</head>
<body>
<main>
<h1>Variant Studio</h1>
<p>Enter the 5-character PIN of the session you want to open.</p>
<form action="/" method="get" autocomplete="off">
<input name="pin" value="${esc(pin)}" maxlength="5" minlength="5" required autofocus autocapitalize="characters" spellcheck="false" aria-label="Session PIN" pattern="[A-Za-z0-9]{5}">
<button type="submit">Open</button>
</form>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
${list}
<p class="hint">Variant Studio ${VERSION}</p>
</main>
</body>
</html>`;
}
