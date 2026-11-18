// Generation settings: how the agent builds variants (mockup or prototype, subagents and their models).
// Project file .variant-studio/settings.json, over user defaults (config.json "settings"), over these.
import fs from 'node:fs';
import path from 'node:path';
import { readJSON } from './util.mjs';
import { userConfig } from './config.mjs';

export const MODES = ['mockup', 'prototype'];
export const SUB_MODELS = {
  cc: { haiku: 'Claude Haiku 5.5', sonnet: 'Claude Sonnet 5.5', opus: 'Claude Opus 5.5', fable: 'Claude Fable 5.1' },
  cdx: { luna: 'GPT-6 Luna', terra: 'GPT Terra', sol: 'GPT-6.1 Sol', astra: 'GPT Astra' },
};
const SETTING_DEFAULTS = { mode: 'mockup', subagents: false, cc_subagent_model: 'auto', cdx_subagent_model: 'auto' };
export function cleanSettings(o = {}) {
  const out = {};
  if (MODES.includes(o.mode)) out.mode = o.mode;
  if (typeof o.subagents === 'boolean') out.subagents = o.subagents;
  for (const [k, list] of [['cc_subagent_model', SUB_MODELS.cc], ['cdx_subagent_model', SUB_MODELS.cdx]]) {
    const v = String(o[k] ?? '').toLowerCase();
    if (v === 'auto' || list[v]) out[k] = v;
  }
  return out;
}
export const settings = (P) => ({ ...SETTING_DEFAULTS, ...cleanSettings(userConfig().settings), ...cleanSettings(readJSON(P.settings, {})) });
// the harness running this command, so the brief names the right subagent model
function harness(agent) {
  const a = String(agent || '').toLowerCase();
  if (a === 'claude' || a === 'claude-code' || a === 'cc') return 'claude_code';
  if (a === 'codex' || a === 'cdx') return 'codex';
  if (process.env.CLAUDECODE) return 'claude_code';
  if (Object.keys(process.env).some((k) => k.startsWith('CODEX_'))) return 'codex';
  return 'other';
}
const MODE_RULES = {
  mockup: 'MOCKUP MODE (default). Each variant is a static visual mockup, not a working app. Write exactly one HTML fragment per variant (<id>.html), plus an optional _shared.css. No JavaScript at all: no inline <script>, no on* attributes, no .js files, no state logic, routing, fetch, form handling, storage or data generators. No extra pages, components, package.json, build setup or folders. Buttons, links and inputs are inert visuals. Show other states with the round\'s `states`/`content` lists and CSS (html[data-vs-state="loading"] …), never with code. Spend the effort on visual quality, not behaviour. `present` refuses a round that breaks these rules. Only if the user explicitly asks for working prototypes, run `settings --mode prototype` first.',
  prototype: 'PROTOTYPE MODE (the user turned it on). Variants may be interactive: inline scripts, working tabs, menus, forms with validation, fake data. Keep each variant one self-contained file in the round folder (shared helpers go in _*.js / _*.css). Do not scaffold a project, add dependencies or touch the app code.',
};
// how to write a variant in each design mode (round.json `design`); printed by `new`
// shared by every mode whose frame the studio draws: agents kept drawing phones, windows and boards themselves
const OWN_FRAME = ' WHAT THE FILE IS: only the content that goes INSIDE the frame, as if it were the real screen. Never a mockup of the device or window, never several screens side by side, never a presentation board with captions, labels, swatches or notes around the design (labels and notes belong in round.json). The studio picks the frame size: ignore `viewports` and do not add page margins around the screen.';
export const DESIGN_RULES = {
  ui: 'UI MODE. A piece of interface: component, section or page, following `kind` and `viewports`.',
  component: 'COMPONENT MODE. One component centred on a neutral canvas; give it a realistic fixed width (it grows to fit in height). Show variants of states side by side with .vs-states when useful.',
  tui: 'TUI MODE. Each variant is ONE terminal screen of a text UI (an htop / lazygit / k9s style app), drawn with HTML. The studio wraps it in a terminal window it owns (title bar, font, opacity, blur, wallpaper and a typable prompt line under your screen): do NOT draw a window, title bar, tabs, wallpaper or shell prompt yourself. Fill the width (the screen is ~100 columns wide); use `font-family: var(--vs-mono)` (Nerd Font, so Nerd icon glyphs such as &#xf07b; &#xe725; work) and size text in `em` (the shell sets the base size). Use a transparent background (the user tunes opacity/blur) and set text colours explicitly (light on dark). Box-drawing characters, `white-space: pre`, borders and a 16-colour palette as CSS tokens (--tui-fg, --tui-accent…). No scripts: the shell provides the typing.' + OWN_FRAME,
  app: 'APP MODE. Each variant is ONE phone app screen. The studio renders it inside a phone frame it owns (iPhone 8 / X / 18, Pixel 3 / 6 / 8 / 10 Pro, Galaxy S25 / S25 Ultra; the user switches skin and frame style), at the device\'s logical size (e.g. 402×874). Do NOT draw a device frame, status bar, notch or home indicator. Make the root fill the screen (`min-height: 100vh`), pad the top by `var(--vs-safe-top)` and the bottom by `var(--vs-safe-bottom)` (status bar and home indicator / gesture bar are drawn over those areas), and lay out fluidly from 360 to 412 px wide. `html[data-vs-platform="ios"|"android"]` lets you adapt controls per platform. Body text ≥ 15px, contrast ≥ 4.5:1, touch targets ≥ 44px.' + OWN_FRAME,
  desktop: 'DESKTOP MODE. Each variant is the client area of ONE desktop application window (an editor, a settings app, a file manager…). The studio draws the window frame it owns (title bar and caption buttons of Windows XP / 7 / 10 / 11, Ubuntu GNOME, KDE Plasma or macOS; the user switches skin, window size 1024×768 to 1920×1080, default 1280×800, and can show the matching desktop, taskbar or dock). Do NOT draw a title bar, window buttons, taskbar or wallpaper. Fill the area (`min-height: 100vh`, no page scroll unless the app scrolls a pane), lay out for 1024–1920 px, and use `html[data-vs-os="windows"|"linux"|"mac"]` if you want platform-native controls. A toolbar, sidebar and status bar inside the window are yours.' + OWN_FRAME,
  logo: 'LOGO MODE. Each variant is a logo: put the mark as the FIRST inline <svg> in the file (self-contained: viewBox, fills/strokes as attributes or an inner <style>, no external CSS classes, no <image>, no text that needs a web font: convert lettering to paths or use generic font stacks). Optionally add the wordmark lock-up after it, and a second <svg data-vs-icon> that is the full-bleed square app icon (its own background). The studio shows usage previews around it: favicon in a browser tab at 16/32 px, iOS and Android icons with their masks, light/dark, small/large and monochrome, so the mark must survive 16 px and one colour. Tools: `logo-export` (SVG, PNG 16…1024, favicon.ico, apple-touch-icon, maskable), `palette <color>`, `fonts`, `image "<prompt>"` for raster references. The file is the logo itself, not a brand board: the studio builds the board (sizes, backgrounds, favicon, icons) from your <svg>.',
};
function modelBrief(s, h) {
  const cc = s.cc_subagent_model, cdx = s.cdx_subagent_model;
  const ccText = cc === 'auto'
    ? 'Agent tool: choose the model per variant yourself (e.g. haiku for a small component, sonnet for a section, opus for a full page), or omit `model` to inherit yours.'
    : `Agent tool with model: "${cc}" (${userConfig().models?.cc?.[cc] || SUB_MODELS.cc[cc]}, the newest of that family).`;
  const cdxModel = userConfig().models?.cdx?.[cdx];
  const cdxText = cdx === 'auto'
    ? 'Choose the model per variant yourself (a lighter tier such as Luna for small components, Sol or Astra for full pages), or keep yours.'
    : `Spawn every subagent on ${cdxModel ? `"${cdxModel}"` : `the newest GPT ${cdx[0].toUpperCase() + cdx.slice(1)} model available (${SUB_MODELS.cdx[cdx]} or later)`}.`;
  if (h === 'claude_code') return { claude_code: ccText };
  if (h === 'codex') return { codex: cdxText };
  return { claude_code: ccText, codex: cdxText, other: 'Use your harness\'s subagent tool; pick the model yourself.' };
}
// what `new` (and `settings`) tell the agent about how to build the round
export function generationBrief(P, { dir, ids, agent, design } = {}) {
  const s = settings(P);
  const out = { mode: s.mode, mode_rules: MODE_RULES[s.mode], ...(design ? { design, design_rules: DESIGN_RULES[design] } : {}) };
  if (!s.subagents) { out.subagents = { enabled: false, rule: 'Write the variants yourself, one after another. Do not spawn subagents for them.' }; return out; }
  const h = harness(agent);
  out.subagents = {
    enabled: true,
    harness: h,
    model: modelBrief(s, h),
    steps: [
      'You orchestrate. First decide one distinct idea per variant, fill label and notes in round.json, and write _shared.css (tokens, fonts) if the variants share a look.',
      'Spawn one subagent per variant, all in parallel (several spawn calls in the same turn). Each one owns exactly one file.',
      'Brief each subagent with: its absolute file path, the round question, kind, viewports and design_rules verbatim, the idea for its variant, the shared tokens/brand variables to use, the mode_rules text verbatim, and: "Write only this file. Do not create other files, do not run studio.mjs, do not present."',
      'When every subagent is done, check the files exist, run `errors`, fix what broke, then run `present` yourself.',
    ],
    ...(dir && ids ? { assignments: ids.map((v) => ({ variant: v, file: path.join(dir, `${v}.html`) })) } : {}),
  };
  return out;
}
// mockup mode is enforced: logic, scripts and project scaffolding in a round are rejected before the user sees it
export function mockupViolations(P, roundId, r) {
  const dir = path.join(P.rounds, roundId);
  const out = [];
  const own = new Set(r.variants.map((v) => v.file).filter(Boolean));
  for (const v of r.variants) {
    if (!v.file) continue;
    let src = ''; try { src = fs.readFileSync(path.join(dir, v.file), 'utf8'); } catch { continue; }
    const inline = [...src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter((m) => !/\bsrc\s*=/i.test(m[1]) && !/type\s*=\s*["']?(application\/(ld\+)?json|text\/template)/i.test(m[1]) && m[2].trim());
    if (inline.length) out.push(`${v.id}: ${inline.length} inline <script> block${inline.length > 1 ? 's' : ''}`);
    const handlers = [...new Set([...src.matchAll(/<[a-z][^>]*?\s(on[a-z]+)\s*=/gi)].map((m) => m[1].toLowerCase()))];
    if (handlers.length) out.push(`${v.id}: event handler attributes (${handlers.slice(0, 5).join(', ')})`);
    if (/\bjavascript:/i.test(src)) out.push(`${v.id}: javascript: URLs`);
  }
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['round.json', 'decision.json'].includes(e.name) || own.has(e.name)) continue;
    if (e.isDirectory() && !e.name.startsWith('_')) out.push(`folder ${e.name}/ (a mockup round holds only variant files)`);
    else if (/\.(m?js|cjs|jsx|tsx?|vue|svelte)$/i.test(e.name) || /^(package(-lock)?\.json|vite\.config\..*|tsconfig\.json)$/i.test(e.name)) out.push(`file ${e.name} (no scripts or project files in mockup mode)`);
  }
  return out;
}
