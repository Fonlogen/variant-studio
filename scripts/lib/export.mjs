// Static, server-less gallery (fallback for sandboxes that can't keep a server alive, or to share with a team)
import fs from 'node:fs';
import path from 'node:path';
import { readJSON } from './util.mjs';
import { VERSION, UI } from './config.mjs';
import { listRounds, loadRound } from './rounds.mjs';
import { renderVariant } from './render.mjs';

export function buildGallery(P, { out, round, team } = {}) {
  const file = path.resolve(out || path.join(P.home, 'gallery.html'));
  const rounds = (round ? [round] : listRounds(P)).map((id) => loadRound(P, id)).filter(Boolean).map((r) => ({
    ...r,
    variants: r.variants.map((v) => ({ ...v, html: v.file && v.ready ? renderVariant(P, r.id, v.file, { inline: true }) : null })),
  }));
  const app = fs.readFileSync(path.join(UI, 'app.html'), 'utf8');
  const data = JSON.stringify({ version: VERSION, project: P.name, team: !!team, rounds, votes: readJSON(P.votes, {}), brand: readJSON(P.brand, null) }).replace(/</g, '\\u003c');
  // inline the studio's own CSS and scripts so the file works from file:// with no server
  const ui = (f) => fs.readFileSync(path.join(UI, f), 'utf8');
  const safeScript = (js) => js.replace(/<\/script/gi, '<\\/script');
  const html = app
    .replace(/<link rel="stylesheet" href="\/_ui\/([\w./-]+\.css)">/g, (m, f) => `<style>\n${ui(f)}\n</style>`)
    .replace(/<script src="\/_ui\/([\w./-]+\.js)"><\/script>/g, (m, f) => `<script>\n${safeScript(ui(f))}\n</script>`)
    .replace('<!--VS_STATIC-->', () => `<script>window.__VS_STATIC__=${data};</script>`);
  fs.writeFileSync(file, html);
  return file;
}
