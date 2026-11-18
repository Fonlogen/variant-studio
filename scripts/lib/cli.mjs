// Commands. Every command works on one project (--project, default: the current folder).
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, writeJSON, print, sleep, now, pidAlive, openBrowser } from './util.mjs';
import { VERSION, SCRIPTS, userConfig, saveUserConfig, studioLang, langNote } from './config.mjs';
import { project, ensureDirs, ensureGitignore, setAgent } from './project.mjs';
import { LETTERS, DESIGNS, SHELLED, listRounds, loadRound, prettyId, latestRoundId, nextRoundId, pendingEntries, recentErrors, publicDecision } from './rounds.mjs';
import { formatDecision, nextStep, waitLoop } from './decisions.mjs';
import { MODES, SUB_MODELS, cleanSettings, settings, generationBrief, mockupViolations } from './generation.mjs';
import { liveServer, control, ensureSession, findSession } from './client.mjs';
import { buildGallery, exportVariant, EXPORT_AS } from './export.mjs';
import { extractSvgs, findChrome, rasterizeWithChrome, writeLogoSet } from './logo.mjs';
import { palette, PALETTE_SCHEMES } from './palette.mjs';
import { fontsReport } from './fonts.mjs';
import { generateImage } from './imagegen.mjs';
import { serve } from './server.mjs';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) out[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}
let args, P;
const serverOpts = () => Object.fromEntries(['port', 'host', 'url-host', 'idle'].filter((k) => args[k]).map((k) => [k, args[k]]));
const fail = (o) => { print({ type: 'error', ...o }); process.exit(1); };
// what the agent sees of a session (never the control token)
const sessionOut = (s, type) => ({ type, version: VERSION, url: s.url, lan_url: s.lan_url, loopback_url: s.loopback_url, ...(s.team_url ? { team_url: s.team_url } : {}), ...(s.remote_url ? { remote_url: s.remote_url } : {}),
  pin: s.pin, guest_pin: s.guest_pin, port: s.port, pid: s.pid, project: s.project, rounds_dir: s.rounds_dir, state_dir: s.state_dir });
async function session() { try { return await ensureSession(P, serverOpts()); } catch (e) { fail({ message: e.message }); } }
const waitDead = async (pid) => { for (let i = 0; i < 30 && pidAlive(pid); i++) await sleep(100); };

async function start() {
  ensureDirs(P);
  ensureGitignore(P);
  if (args.foreground && !(await liveServer())) return serve({ ...serverOpts(), project: P.root, foreground: true });
  const s = await session();
  if (args.open) openBrowser(s.url);
  if (args.remote) return share();
  print(sessionOut(s, s.existed ? 'server-already-running' : 'server-started'));
}

async function stop() {
  const srv = await liveServer();
  if (!srv) return print({ type: 'not-running' });
  if (args.all) {
    const { sessions } = await control(srv, 'sessions');
    const list = sessions.map((x) => ({ project: x.project, name: x.name, pin: x.pin, agent_listening: x.agent === 'waiting', last_activity: new Date(x.last_activity).toISOString() }));
    if (!args.confirm) fail({ type: 'confirm-required', sessions: list, message: '`stop --all` stops the studio for every project listed in `sessions`, including the ones other agents are using. Show the list to the user and ask first; run `stop --all --confirm` only if they agree. To stop only this project, run `stop`.' });
    await control(srv, 'stop-all', { project: P.root, by: P.name });
    await waitDead(srv.pid);
    return print({ type: 'server-stopped', pid: srv.pid, sessions: list, note: 'The other sessions were told who stopped them: their galleries show it and their `wait` returns {"type":"server-stopping"}.' });
  }
  const r = await control(srv, 'stop', { project: P.root }).catch(() => null);
  if (!r) return print({ type: 'not-running', project: P.root, note: 'This project has no session. Other projects keep theirs.' });
  if (r.server === 'stopped') await waitDead(srv.pid);
  print({ type: r.remaining ? 'session-stopped' : 'server-stopped', pin: r.stopped, project: r.project, other_sessions: r.remaining, server: r.server });
}

async function status() {
  const s = await findSession(P).catch(() => null);
  const latest = latestRoundId(P);
  const r = latest && loadRound(P, latest);
  const pend = pendingEntries(P);
  print({
    running: !!s, version: VERSION, ...(s ? sessionOut(s, undefined) : { url: null }), type: undefined, project: P.root, rounds_dir: P.rounds,
    latest_round: r ? { id: r.id, title: r.title, variants: r.variants.map((v) => `${v.id}${v.ready ? '' : ' (missing)'}`), decision: r.decision ? { action: r.decision.action, selected: r.decision.selected, consumed: r.decision.consumed } : null } : null,
    pending_decisions: pend.length, ...langNote(), settings: settings(P),
    hint: s ? (pend.length ? 'Decisions are waiting: run `wait` to receive them.' : undefined) : 'Run: node <skill>/scripts/studio.mjs start --project <dir> --open',
  });
}

async function wait() {
  if (args.round && !fs.existsSync(path.join(P.rounds, String(args.round)))) fail({ message: `round ${args.round} not found` });
  const timeoutMs = Number(args.timeout || 110) * 1000;
  const d = await waitLoop(P, { round: args.round ? String(args.round) : null, timeoutMs });
  if (d) return print(d);
  print({ type: 'still-waiting', message: 'No decision yet: the user is still looking. Run this same command again right now. Do NOT end your turn and do not ask the user to reply in chat; stop waiting only if the user writes to you in chat.' });
  process.exit(2);
}

async function present() {
  ensureDirs(P);
  const id = args.round || latestRoundId(P);
  const r = id && loadRound(P, id);
  if (!r) fail({ message: 'no round to present: run `new` first' });
  const missing = r.variants.filter((v) => !v.ready).map((v) => v.id);
  if (missing.length) fail({ message: `write these variants first: ${missing.map((m) => path.join(P.rounds, id, m + '.html')).join(', ')}` });
  const violations = settings(P).mode === 'mockup' ? mockupViolations(P, id, r) : [];
  if (violations.length) fail({ mode: 'mockup', violations, message: 'Mockup mode: variants must be static designs. Remove the scripts, handlers and project files listed in `violations` (express states with the round\'s `states` list and CSS), then run `present` again. Switch to prototype mode (`settings --mode prototype`) only if the user explicitly asked for working prototypes.' });
  const s = await session();
  const errs = recentErrors(P, id).filter((e) => Date.parse(e.at) > Date.now() - 10 * 60000);
  print({
    type: 'presented', round: id, studio_language: studioLang(), url: s.url, lan_url: s.lan_url, question: r.question || r.title,
    variants: r.variants.map((v) => `${v.id.toUpperCase()} — ${v.label}`),
    ...(errs.length ? { render_errors: errs } : {}),
    tell_user: 'Give the user the url and one or two sentences on what they are comparing. This command keeps waiting for their decision.',
  });
  const timeoutMs = Number(args.timeout || 110) * 1000;
  const d = await waitLoop(P, { round: null, timeoutMs });
  if (d) return print(d);
  print({ type: 'still-waiting', message: 'No decision yet. Run `wait` (same --project) right now and keep running it until a decision arrives. Do NOT end your turn; stop only if the user writes to you in chat.' });
  process.exit(2);
}

function decision() {
  const id = args.round || latestRoundId(P);
  const pend = pendingEntries(P, args.round ? id : null);
  if (pend.length) return print({ ...formatDecision(P, pend[0], pend.slice(1)), note_for_agent: 'Not marked as received. Run `wait` to receive it.' });
  const d = id && readJSON(path.join(P.rounds, id, 'decision.json'));
  if (!d) return print({ type: 'no-decision', round: id });
  print({ type: 'decision', ...publicDecision(d), next_step: nextStep(P, d) });
}

function newRound() {
  ensureDirs(P);
  const slug = args._[1] || args.slug || 'round';
  const id = nextRoundId(P, slug);
  const dir = path.join(P.rounds, id);
  fs.mkdirSync(dir, { recursive: true });
  const count = Number(args.count || 0);
  const parentManifest = args.parent ? readJSON(path.join(P.rounds, String(args.parent), 'round.json'), {}) || {} : {};
  const group = args.group ? String(args.group) : parentManifest.group ? [parentManifest.group, parentManifest.subgroup].filter(Boolean).join(' / ') : '';
  const ids = args.variants ? String(args.variants).split(',').map((s) => s.trim()).filter(Boolean) : LETTERS.slice(0, count || 3);
  const design = args.design ? String(args.design).toLowerCase() : DESIGNS.includes(parentManifest.design) ? parentManifest.design : 'ui';
  if (!DESIGNS.includes(design)) { fs.rmSync(dir, { recursive: true, force: true }); fail({ message: `unknown --design ${design}: use ${DESIGNS.join('|')}` }); }
  // shelled designs size themselves inside the card; component is today's centred component
  const kind = SHELLED.includes(design) || design === 'component' ? 'component' : args.kind || parentManifest.kind || 'component';
  const manifest = {
    ...(group ? { group } : {}),
    title: args.title || slug.replace(/[-_]/g, ' '),
    question: args.question || '',
    // iterations keep the parent's kind and target viewports unless told otherwise: losing them made desktop rounds render as mobile (and vice versa)
    kind,
    design,
    ...(args.viewports ? { viewports: String(args.viewports).split(',').map((v) => v.trim()) } : parentManifest.viewports ? { viewports: parentManifest.viewports } : {}),
    ...(args.parent ? { parent: args.parent } : {}),
    head: args.head ? String(args.head).split(',') : [],
    variants: ids.map((v) => ({ id: v, label: prettyId(v), notes: '' })),
    created: now(),
  };
  writeJSON(path.join(dir, 'round.json'), manifest);
  setAgent(P, 'working', { round: id });
  const w = [];
  if (!group) w.push('No --group given: the round will appear under "Ungrouped". Run `groups` and pass --group "Area / Item".');
  if (args.kind && kind !== args.kind) w.push(`--kind ${args.kind} ignored: design ${design} renders as a component.`);
  if (manifest.kind !== 'component' && !manifest.viewports) w.push(`No --viewports for a ${manifest.kind}: it will be shown at laptop width (1280). Pass --viewports with the target the user asked for (e.g. laptop, or mobile, or laptop,mobile) and design for that target.`);
  print({ type: 'round-created', id, dir, group: group || null, ...(w.length ? { warning: w.join(' ') } : {}), manifest: path.join(dir, 'round.json'), ...langNote(), write_variants_to: ids.map((v) => path.join(dir, `${v}.html`)), design, generation: generationBrief(P, { dir, ids, agent: args.agent, design }), then: 'Follow `generation` (mode rules and subagents), write every variant file, fill label/notes in round.json, then run `present`.' });
}

function list() {
  print(listRounds(P).map((id) => loadRound(P, id)).map((r) => ({ id: r.id, group: [r.group, r.subgroup].filter(Boolean).join(' / ') || null, title: r.title, kind: r.kind, design: r.design, parent: r.parent, variants: r.variants.length, decision: r.decision ? `${r.decision.action}:${(r.decision.selected || []).join('+')}` : null, approved: r.decision?.approved?.variant || null })));
}
function groups() {
  const tree = {};
  for (const r of listRounds(P).map((id) => loadRound(P, id))) {
    const g = r.group || '(ungrouped)';
    tree[g] ||= {};
    const sg = r.subgroup || '(none)';
    (tree[g][sg] ||= []).push(r.id);
  }
  print({ type: 'groups', hint: 'Reuse these names exactly with --group "Group / Subgroup".', groups: tree });
}
function inbox() {
  print({ type: 'inbox', pending: pendingEntries(P).map((e) => ({ id: e.d.id, round: e.d.round, action: e.d.action, selected: e.d.selected, note: e.d.note || '', at: e.d.at, held_until: e.d.hold_until || null })) });
}

function build() {
  const file = buildGallery(P, { out: args.out, round: args.round, team: args.team });
  print({ type: 'static-gallery', file, note: args.team
    ? 'Team gallery: send this file to teammates. They vote and comment, then download a votes file; the user imports it in the studio (Team > Import votes).'
    : 'Open this file in a browser. Decisions are copied to the clipboard as JSON for the user to paste back into chat.' });
}

function demo() {
  ensureDirs(P);
  const src = path.join(SCRIPTS, '..', 'assets', 'demo-round');
  const id = nextRoundId(P, 'demo-product-card');
  fs.cpSync(src, path.join(P.rounds, id), { recursive: true });
  const m = readJSON(path.join(P.rounds, id, 'round.json')); m.created = now(); writeJSON(path.join(P.rounds, id, 'round.json'), m);
  print({ type: 'round-created', id, dir: path.join(P.rounds, id) });
}

async function open() {
  const s = await session();
  openBrowser(s.url);
  print({ type: 'opened', url: s.url });
}

function help() {
  process.stdout.write(`Variant Studio ${VERSION}
  start     start the shared server (or reuse it) and open a session for this project   --project DIR --open --remote --foreground --port N --host H --url-host H --idle MIN
  new       scaffold a round: new <slug> --group "Area / Item" --title T --question Q --design ui|component|tui|app|desktop|logo --kind component|section|page --viewports laptop,mobile --variants a,b,c --parent ID
  present   hand the latest round to the user and wait for the decision   --round ID --timeout SEC
  wait      wait for the next decision (exit 2 = still waiting: run it again)   --round ID --timeout SEC
  decision  print the next or latest decision without waiting   --round ID
  inbox     decisions queued for the agent
  status    session + latest round summary
  list      all rounds
  groups    existing groups/subgroups (reuse their names)
  settings  show or change how variants are generated   --mode mockup|prototype --subagents on|off --cc-subagent-model auto|haiku|sonnet|opus|fable --cdx-subagent-model auto|luna|terra|sol|astra --global
  errors    JS errors reported by variant previews     --round ID
  open      open this project's gallery in the default browser
  build     write a self-contained gallery.html        --out FILE --round ID --team
  demo      add a demo round (product card)
  share     share this session outside your network (Cloudflare tunnel, guests can view and vote)   --stop
  export    one variant as files   export <round> <variant> --as single|split|shared --out DIR
  logo-export  logo set of a variant: SVG, PNG 16…1024, favicon.ico, apple-touch-icon, maskable   logo-export <round> <variant> --out DIR --bg #fff
  palette   OKLCH palette with contrast ratios   palette <#hex> --scheme analogous|complementary|triad|mono
  fonts     curated Google Fonts pairs + fonts installed here   --query TEXT
  image     raster image from the OpenAI Images API into the round   image "<prompt>" --size 1024x1024 --out FILE --round ID
  stop      close this project's session (the server exits when none is left)   --all lists every session; --all --confirm stops them all
`);
}

// show or change the generation settings (also editable in the gallery's Settings)
function settingsCmd() {
  const on = (v) => (v === true || /^(on|true|1|yes)$/i.test(String(v)) ? true : /^(off|false|0|no)$/i.test(String(v)) ? false : undefined);
  const patch = cleanSettings({
    mode: args.mode,
    subagents: args.subagents === undefined ? undefined : on(args.subagents),
    cc_subagent_model: args['cc-subagent-model'] ?? args.cc_subagent_model ?? args['cc-model'],
    cdx_subagent_model: args['cdx-subagent-model'] ?? args.cdx_subagent_model ?? args['cdx-model'],
  });
  const asked = [['mode'], ['subagents'], ['cc-subagent-model', 'cc_subagent_model', 'cc-model'], ['cdx-subagent-model', 'cdx_subagent_model', 'cdx-model']].filter((ks) => ks.some((k) => args[k] !== undefined));
  if (asked.length > Object.keys(patch).length) fail({ message: `invalid value. mode: ${MODES.join('|')}; subagents: on|off; cc model: auto|${Object.keys(SUB_MODELS.cc).join('|')}; codex model: auto|${Object.keys(SUB_MODELS.cdx).join('|')}` });
  if (Object.keys(patch).length) {
    if (args.global) saveUserConfig({ settings: { ...cleanSettings(userConfig().settings), ...patch } });
    else { ensureDirs(P); writeJSON(P.settings, { ...readJSON(P.settings, {}), ...patch }); }
  }
  print({ type: 'settings', scope: args.global ? 'user' : 'project', ...(Object.keys(patch).length ? { changed: patch } : {}), settings: settings(P), generation: generationBrief(P, { agent: args.agent }) });
}

// share this session outside the local network through a Cloudflare quick tunnel (--stop to close it)
async function share() {
  const s = await findSession(P).catch(() => null);
  if (!s) fail({ message: 'this project has no session: run `start` first (or `start --remote`)' });
  const base = `http://127.0.0.1:${s.port}/${s.pin}`;
  const call = async (body) => (await fetch(`${base}/api/remote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  if (args.stop) { await call({ on: false }); return print({ type: 'remote-stopped', note: 'Guest links no longer work: the guest PIN changed.' }); }
  let st = await call({ on: true });
  for (let i = 0; i < 100 && st.state === 'starting'; i++) { await sleep(500); st = (await (await fetch(`${base}/api/state`)).json()).remote; }
  if (st.state === 'on') return print({ type: 'remote-on', guest_url: st.guest_url, owner_url: st.owner_url, tell_user: 'Send guest_url to teammates outside the network: they can view and vote, not decide. owner_url is the user\'s own link (e.g. for their phone): never share it. Stop with `share --stop`.' });
  const why = { missing: 'cloudflared is not installed. Re-run the Variant Studio installer and enable remote sharing, or install cloudflared (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).', disabled: 'Remote sharing is turned off in ~/.variant-studio/config.json (remote.enabled). Re-run the installer to enable it.' }[st.state];
  fail({ state: st.state, message: why || st.error || 'the tunnel did not start' });
}

// ---------- design tools ----------
function variantArgs(cmd) {
  const [roundArg, vid] = [args._[1], args._[2]];
  const id = roundArg === 'latest' || !roundArg ? latestRoundId(P) : listRounds(P).find((x) => x === roundArg || parseInt(x, 10) === Number(roundArg));
  const r = id && loadRound(P, id);
  const v = r && r.variants.find((x) => x.id === vid);
  if (!v) fail({ message: `usage: ${cmd} <round> <variant> (round id, number or "latest"; variant id such as a)` });
  if (!v.ready || !v.file) fail({ message: `variant ${vid} of ${id} has no file yet` });
  return { r, v, file: path.join(P.rounds, id, v.file) };
}
function logoExport() {
  const { r, v, file } = variantArgs('logo-export');
  const { mark, icon } = extractSvgs(fs.readFileSync(file, 'utf8'));
  if (!mark) fail({ message: `no inline <svg> in ${file}: in logo rounds the mark must be the first <svg> of the variant` });
  const dir = path.resolve(args.out || path.join(P.home, 'exports', `logo-${r.id}-${v.id}`));
  const chrome = findChrome();
  const pngs = chrome ? rasterizeWithChrome(chrome, mark, icon, { bg: args.bg }) : null;
  const files = writeLogoSet(dir, { mark, icon, pngs: pngs || {} }).map((f) => path.basename(f));
  if (pngs) return print({ type: 'logo-export', round: r.id, variant: v.id, dir, rasterizer: path.basename(chrome), files });
  print({ type: 'logo-export', round: r.id, variant: v.id, dir, rasterizer: null, files, partial: true,
    tell_user: `Only the SVG was written: no Chrome, Chromium or Edge found to rasterize it. In the gallery, open the ⋯ menu of variant ${v.id.toUpperCase()} and click "Export logo set": the browser renders the PNGs and favicon.ico into ${dir}.` });
}
function paletteCmd() {
  try { print(palette(args._[1] || args.base, String(args.scheme || 'analogous'))); }
  catch (e) { fail({ message: `${e.message}. usage: palette <#hex> --scheme ${PALETTE_SCHEMES.join('|')}` }); }
}
async function imageCmd() {
  const prompt = args._.slice(1).join(' ') || args.prompt;
  if (!prompt) fail({ message: 'usage: image "<prompt>" [--size 1024x1024] [--out FILE] [--round ID]' });
  const id = args.round ? String(args.round) : latestRoundId(P);
  if (!args.out && !id) fail({ message: 'no round to save into: pass --round or --out' });
  try {
    const out = await generateImage({ prompt, size: String(args.size || '1024x1024'), out: args.out, dir: id && path.join(P.rounds, id) });
    print({ type: 'image', ...out, ...(id && !args.out ? { round: id, use_in_variant: path.relative(path.join(P.rounds, id), out.file).split(path.sep).join('/') } : {}) });
  } catch (e) { fail({ code: e.code || undefined, status: e.status || undefined, message: e.message }); }
}
async function exportCmd() {
  const { r, v } = variantArgs('export');
  const as = String(args.as || 'single');
  if (!EXPORT_AS.includes(as)) fail({ message: `--as must be ${EXPORT_AS.join('|')}` });
  const out = await exportVariant(P, r.id, v.id, as);
  const dir = path.resolve(args.out || path.join(P.home, 'exports', as === 'single' ? '' : out.name));
  fs.mkdirSync(dir, { recursive: true });
  const files = Object.entries(out.files).map(([name, body]) => { const f = path.join(dir, name); fs.writeFileSync(f, body); return f; });
  print({ type: 'export', round: r.id, variant: v.id, as, dir, files, note: as === 'single' ? 'One self-contained file: styles, brand, fonts and images inlined (remote ones kept as URLs when unreachable).' : undefined });
}

export async function run(argv) {
  args = parseArgs(argv);
  P = project(args.project || process.env.VARIANT_STUDIO_PROJECT || process.cwd());
  const commands = {
    share, start, stop, status, wait, present, decision, inbox, list, groups, build, demo, help, open,
    serve: () => serve({ ...serverOpts(), ...(args.project ? { project: P.root } : {}), foreground: !!args.foreground }),
    new: newRound,
    settings: settingsCmd,
    errors: () => print(recentErrors(P, args.round)),
    'logo-export': logoExport, palette: paletteCmd, fonts: () => print(fontsReport(args.query === true ? '' : args.query || args._[1])), image: imageCmd, export: exportCmd,
  };
  const cmd = args._[0] || 'help';
  if (!commands[cmd]) { help(); process.exit(1); }
  await commands[cmd]();
}
