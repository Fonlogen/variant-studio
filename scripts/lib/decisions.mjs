// Decisions: received from the gallery, queued, handed to the agent by `wait` with a next step.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJSON, writeJSON, now, sleep } from './util.mjs';
import { HOLD_MS, setAgent, takeNotice } from './project.mjs';
import { SAFE, loadRound, publicDecision, pendingEntries, inboxEntries, enqueue, markConsumed, recentErrors } from './rounds.mjs';

function filesFor(P, round, selected) {
  const files = {};
  for (const v of round.variants) if (v.file) files[v.id] = path.join(P.rounds, round.id, v.file);
  // cross-round picks (shortlist, before/after) use "round/variant" keys
  for (const key of selected || []) {
    const [rid, vid] = String(key).split('/');
    if (!vid || !SAFE.test(rid)) continue;
    const other = loadRound(P, rid);
    const v = other && other.variants.find((x) => x.id === vid);
    if (v && v.file) files[key] = path.join(P.rounds, rid, v.file);
  }
  return files;
}
const absIn = (P, id, list, dir) => (list || []).filter((r) => new RegExp(`^${dir}\\/[\\w.-]+$`).test(r)).map((r) => path.join(P.rounds, id, r));

export function receiveDecision(P, id, body) {
  const round = loadRound(P, id);
  const rf = path.join(P.rounds, id, 'decision.json');
  const prevRaw = readJSON(rf);
  const prevApproved = prevRaw && (prevRaw.approved || (prevRaw.action === 'choose' ? { variant: prevRaw.selected?.[0], at: prevRaw.at } : null));

  // Revoking an approval the agent has not read yet simply cancels it.
  if (body.action === 'unapprove') {
    const held = pendingEntries(P, id).find((e) => e.d.action === 'choose');
    if (held) return cancelDecision(P, held.d.id);
  }

  let approved;
  if (body.action === 'choose') approved = { variant: body.selected?.[0], at: now() };
  else if (body.action === 'unapprove') approved = undefined;
  else approved = prevApproved || undefined;

  const references = absIn(P, id, body.references, '_refs');
  const screenshots = {};
  for (const [k, rel] of Object.entries(body.screenshots || {})) { const a = absIn(P, id, [rel], '_shots')[0]; if (a) screenshots[k] = a; }
  const revoked = body.action === 'unapprove' ? { variant: prevApproved?.variant || body.selected?.[0] || null, at: now() } : undefined;
  const decision = {
    ...body,
    references: references.length ? references : undefined,
    screenshots: Object.keys(screenshots).length ? screenshots : undefined,
    ...(approved ? { approved } : {}),
    ...(revoked ? { revoked } : {}),
    id: crypto.randomBytes(6).toString('hex'),
    at: now(),
    consumed: false,
    ...(body.action === 'choose' && !body.no_hold ? { hold_until: new Date(Date.now() + HOLD_MS).toISOString() } : {}),
    files: filesFor(P, round, body.selected),
    round_dir: path.join(P.rounds, id),
  };
  delete decision.no_hold;
  writeJSON(rf, { ...decision, _prev: prevRaw ? publicDecision(prevRaw) : null });
  enqueue(P, decision);
  fs.appendFileSync(P.events, JSON.stringify({ type: 'decision', id: decision.id, round: id, action: body.action, selected: body.selected, at: decision.at }) + '\n');
  return { ok: true, id: decision.id, hold_until: decision.hold_until || null };
}

export function cancelDecision(P, did) {
  const e = inboxEntries(P).find((x) => x.d.id === did);
  if (!e) return { ok: false, error: 'not found' };
  if (e.d.consumed) return { ok: false, error: 'already received by the agent', round: e.d.round };
  e.d.cancelled = true; e.d.cancelled_at = now();
  writeJSON(e.file, e.d);
  const rf = path.join(P.rounds, e.d.round, 'decision.json');
  const rd = readJSON(rf);
  if (rd && rd.id === did) { if (rd._prev) writeJSON(rf, rd._prev); else fs.rmSync(rf, { force: true }); }
  fs.appendFileSync(P.events, JSON.stringify({ type: 'cancel', id: did, round: e.d.round, at: now() }) + '\n');
  return { ok: true, cancelled: did, round: e.d.round };
}

export function nextStep(P, d) {
  const sel = (d.selected || []).join(', ');
  const extras = [];
  const vs = Object.values(d.variants || {});
  if (vs.some((v) => v.tokens)) extras.push('Apply every `tokens` override (CSS custom property from -> to) — the user tuned them live.');
  if (d.knobs && Object.keys(d.knobs).length) extras.push('Apply the `knobs` values (round-wide token settings the user chose).');
  if (d.fonts) extras.push('Use the `fonts` the user picked for headings/body.');
  if (vs.some((v) => v.text_edits)) extras.push('Use the user\'s `text_edits` copy verbatim.');
  if (vs.some((v) => v.locked)) extras.push('Elements in `locked` must stay exactly as they are in the next version.');
  if (vs.some((v) => v.checklist && v.checklist.failed && v.checklist.failed.length)) extras.push('Fix every `checklist.failed` criterion.');
  if (vs.some((v) => v.audit)) extras.push('Fix the `audit` issues (contrast, touch targets, labels, overflow) in the next version.');
  if (d.references?.length) extras.push('Look at the reference images in `references` (read them as images) and match their direction.');
  if (d.screenshots) extras.push('`screenshots` show the variants exactly as the user saw them; open them if you need to check the rendering.');
  if (d.team_votes) extras.push('`team_votes` holds teammates\' votes and comments: weigh them, the user\'s own choice still wins.');
  if (d.ranking?.length) extras.push(`The user ranked the variants (best first): ${d.ranking.join(' > ')}.`);
  if ((d.selected || []).some((k) => k.includes('/'))) extras.push('Some selected variants come from other rounds: their paths are in `files`.');
  if (d.reuse) extras.push('The user reused variants that were discarded when this round was approved; keep the approved design untouched.');
  return base(P, d, sel) + (extras.length ? ' ' + extras.join(' ') : '');
}
function base(P, d, sel) {
  switch (d.action) {
    case 'choose': return `User approved variant ${sel}. Implement it in the real codebase (source: files.${d.selected?.[0]}). Apply any comments/annotations as final tweaks.`;
    case 'revise': return `User wants changes to ${sel}. Create a new round (--parent ${d.round}) with 2-3 refined versions of ${sel} that address every note and annotation.`;
    case 'remix': return `User wants to combine ${sel}. Read the per-variant comments to see what to keep from each, then create a new round (--parent ${d.round}) with 2-3 blends.`;
    case 'regenerate': return `User rejected all variants. Read the note and ratings, then create a new round (--parent ${d.round}) exploring clearly different directions.`;
    case 'more': return `User wants more variants in the direction of ${sel}. Create a new round (--parent ${d.round}) with 2-3 new variants that keep ${sel}'s idea and push it in different ways.`;
    case 'fix_a11y': return `User asked you to fix the accessibility issues of ${sel}, listed in variants.<id>.audit (selector, text, detail). Edit files.<id> IN PLACE: no new round, no redesign. Fix every issue with the smallest visual change (shift a colour just enough to reach the stated contrast ratio, enlarge touch targets, add alt text, labels or accessible names, stop the overflow) and keep layout, palette feel and copy. Then run \`errors\` and wait again: the gallery reloads the variants and audits them again.`;
    case 'unapprove': return `User REVOKED the approval of ${d.revoked?.variant || sel} in round ${d.round}. Stop implementing it; if you already changed the codebase for it, tell the user what you changed and ask whether to revert. The round is open again: wait for the next decision.`;
    case 'export': return `User wants variant ${sel} as a ${d.framework || d.export?.framework || 'component'} component. Convert files.${d.selected?.[0]} using the project's conventions and write it to ${path.join(P.home, 'exports')}/ (create the folder), then tell the user the path. Do not touch the app code unless asked.`;
    default: return 'Read the note and act on it.';
  }
}

export function formatDecision(P, e, rest) {
  const d = publicDecision(e.d);
  const errs = recentErrors(P, d.round);
  const out = { type: 'decision', ...d, next_step: nextStep(P, d), ...(errs.length ? { render_errors: errs } : {}) };
  const m = readJSON(path.join(P.rounds, String(d.round || '').split('/')[0], 'round.json'), {}) || {};
  out.design_target = { kind: m.kind || 'component', design: m.design || 'ui', viewports: m.viewports || (m.kind && m.kind !== 'component' ? ['laptop'] : ['auto']) };
  const seen = d.viewed_at?.viewport;
  if (seen && seen !== 'auto' && !out.design_target.viewports.includes(seen)) out.next_step += ` Note: the user looked at the variants at "${seen}" width, but the design target is ${out.design_target.viewports.join(', ')}. Keep designing for the target; only treat ${seen} as a responsive check unless the note asks to change the target.`;
  delete out.consumed; delete out.hold_until;
  if (rest.length) {
    out.also_pending = rest.map((x) => ({ id: x.d.id, round: x.d.round, action: x.d.action, selected: x.d.selected, note: x.d.note || '' }));
    out.next_step += ` ${rest.length} more decision${rest.length > 1 ? 's are' : ' is'} queued (see also_pending): read them before you start, a later one may refine this one, then run \`wait\` again to receive them in order.`;
  }
  return out;
}

// the server stopped this session while the agent was away or listening
function stoppedNotice(n) {
  const who = n.by ? `by the agent of ${n.by}${n.by_project ? ` (${n.by_project})` : ''}` : n.reason === 'signal' ? 'because the server process was terminated' : `(${n.reason || 'unknown reason'})`;
  return { ...n, type: 'server-stopping', next_step: `The Variant Studio server was stopped ${who}; this project's gallery is offline. Tell the user. If they want to keep going, run \`start\` (same --project): the PIN stays the same and their tab reconnects.` };
}

export async function waitLoop(P, { round, timeoutMs }) {
  const t0 = Date.now();
  const since = now();
  setAgent(P, 'waiting', { since, round: round || null });
  const beat = setInterval(() => setAgent(P, 'waiting', { since, round: round || null }), 2000);
  try {
    while (Date.now() - t0 < timeoutMs) {
      const pend = pendingEntries(P, round);
      const ready = pend.filter((e) => !e.d.hold_until || Date.parse(e.d.hold_until) <= Date.now());
      if (ready.length) {
        const e = ready[0];
        markConsumed(P, e);
        clearInterval(beat);
        setAgent(P, 'working', { round: e.d.round, decision: e.d.id });
        return formatDecision(P, e, ready.slice(1));
      }
      const n = !pend.length && takeNotice(P);
      if (n) { clearInterval(beat); setAgent(P, 'away'); return stoppedNotice(n); }
      await sleep(600);
    }
  } finally { clearInterval(beat); }
  setAgent(P, 'waiting', { since, round: round || null, ended: now() });
  return null;
}
