---
name: variant-studio
description: Generate several design variants of any piece of UI — a single button, card, form, navbar, section, or full page — show them side by side in a live browser gallery, and let the user pick one, request changes, combine variants, or comment on specific elements, then continue from their structured decision. Use this whenever the user wants to explore, compare, or choose between design options or mockups ("show me a few versions", "give me some alternatives for this card", "fammi vedere delle varianti", "proposte di design", "quale layout è meglio", "redesign this component", "A/B options"), whenever a UI decision would be clearer seen than described, and whenever the user asks for a visual/browser companion or preview. Works in Claude Code, Codex, Gemini CLI, Cursor, Copilot CLI and any agent that can run Node.js.
---

# Variant Studio 3.0

A local gallery that turns "which design do you want?" into a visual decision. You write each variant as a small HTML file. The user sees them live in the browser, compares them (grid, full screen, list, swipe, overlay, A-vs-B tournament, overview of every round), tunes them (controls you declare, fonts, CSS tokens, brand palette, copy), comments on or locks single elements, and sends a decision. You read that decision as JSON and act on it.

The script is `scripts/studio.mjs` (Node ≥ 18, zero dependencies). Below, `STUDIO` means `node <this-skill-dir>/scripts/studio.mjs`. Always pass `--project <repo root>` so everything lives in `<repo>/.variant-studio/` (added to `.gitignore` automatically).

## When to use the browser

Use it when the answer is a visual preference: layout, hierarchy, spacing, color, type, density, component styling, states, responsive behaviour. "Should the filter be a sidebar or a modal?" can be answered in text; "which of these filter panels feels right?" belongs in the browser.

If the user did not ask for a visual preview, offer it in one sentence the first time a visual choice comes up. If they asked for variants, mockups or options, just start.

## The loop

1. **Start (or reuse) the server**
   ```bash
   STUDIO start --project "$PWD" --open
   ```
   Prints `url` (with the `?k=` access key: always give the user the full URL). Calling it again reuses the running server. After a restart the port and key stay the same and the user's tab reconnects by itself. If your harness kills background processes, see `references/platforms.md`.

2. **Create a round**: one round = one question with 2–4 variants.
   ```bash
   STUDIO groups --project "$PWD"
   STUDIO new product-card --project "$PWD" --kind component \
     --group "Catalog / Product card" --title "Product card" \
     --question "Which card should we use in the category grid?" --variants a,b,c
   ```
   For sections and pages always pass `--viewports` (see "Target viewport"). Iterations use `--parent <round id>` and inherit group, kind and viewports. Then fill `label` and `notes` for each variant in the printed `round.json`; add `knobs`, `states`, `content` or `checklist` when they help (`references/manifest.md`).

3. **Write each variant** to `<round dir>/<id>.html` with your file-writing tool. The gallery shows a placeholder until the file exists and live-reloads on save.

4. **Present and wait** (one command does both):
   ```bash
   STUDIO present --project "$PWD"
   ```
   It checks every variant exists, starts the server if needed, prints `{"type":"presented","url":…}` and then **keeps waiting** for the decision. As soon as you see the `presented` line, tell the user the URL and in one or two sentences what they are comparing.

5. **Never stop waiting on your own.** `present` and `wait` return after about 110 s with exit code 2 and `{"type":"still-waiting"}`. That is not a failure: run `STUDIO wait --project "$PWD"` again immediately, and keep doing it until a decision arrives. Do not end your turn while waiting, and do not ask the user whether to keep waiting. Stop only if the user writes to you in chat (their chat message wins; merge it with any browser decision).
   - The gallery shows the user whether you are listening ("Agent listening" / "Agent working" / "Agent not listening"), so a stopped loop is visible to them.
   - Decisions are queued, never overwritten. If the user sends several (for example two "Request changes" in a row), `wait` returns them one by one in order and the first one lists the rest in `also_pending`: read them all before you start, a later one may refine an earlier one.
   - **Claude Code:** run the wait as a background Bash command so the harness notifies you when it completes, and give it a generous timeout:
     ```bash
     # run_in_background: true
     until node <skill>/scripts/studio.mjs wait --project "$PWD" --timeout 580; [ $? -ne 2 ]; do :; done
     ```
     Without `run_in_background`, set the Bash tool `timeout` above the `--timeout` value (e.g. 600000 ms with `--timeout 580`).
   - `STUDIO decision` prints the next queued decision without waiting; `STUDIO inbox` lists the queue.

6. **Act on the decision** (next section) and repeat from step 2 with `--parent` until the user approves.

7. **Finish**: implement the approved variant in the real codebase. Keep listening for a while if you can: the user may revoke the approval (see `unapprove`). `STUDIO stop` when done; rounds stay on disk.

## Reading the decision

```json
{
  "type": "decision",
  "id": "4f1c2a9e0b7d",
  "round": "002-product-card",
  "action": "revise",
  "selected": ["b"],
  "note": "Use B but with A's serif title",
  "variants": {
    "b": {
      "label": "Quick buy", "rating": "like", "comment": "Love the size chips",
      "annotations": [{ "selector": "div.qb > button.cta", "tag": "button", "text": "Add to cart", "note": "Darker, less rounded" }],
      "locked": [{ "selector": "div.qb > img", "tag": "img", "text": "" }],
      "tokens": { "--radius": { "scope": ":root", "from": "12px", "to": "4px" } },
      "text_edits": [{ "selector": "button.cta", "before": "Add to cart", "after": "Add · €49" }],
      "checklist": { "passed": ["Price visible"], "failed": ["Works with long product names"] },
      "audit": [{ "kind": "contrast", "detail": "Contrast 2.5:1 (needs 4.5:1, 13px text)", "selector": "…", "text": "★★★★★ (128)" }]
    },
    "c": { "label": "Compact", "rating": "dislike" }
  },
  "knobs": { "--qb-radius": { "label": "Corner radius", "value": "6px" } },
  "fonts": { "heading": "Fraunces", "body": "Inter" },
  "ranking": ["b", "a", "c"],
  "team_votes": { "b": { "Giulia": { "vote": "up", "comment": "Clearer" } } },
  "references": ["/abs/.variant-studio/rounds/002-product-card/_refs/x1-moodboard.png"],
  "screenshots": { "b": "/abs/.variant-studio/rounds/002-product-card/_shots/x2-b.png" },
  "viewed_at": { "viewport": "laptop", "width": 1280, "theme": "dark", "layout": "grid", "state": "loading" },
  "design_target": { "kind": "component", "viewports": ["auto"] },
  "files": { "b": "/abs/.variant-studio/rounds/002-product-card/b.html" },
  "also_pending": [],
  "next_step": "…what to do, in one paragraph…"
}
```

Actions:
- **choose**: the user approved `selected[0]`. Read `files[selected[0]]`, apply its comments, annotations, tokens, knobs, fonts and text edits as final tweaks, and implement it in the project's real stack (its components, tokens, CSS framework). Do not paste the mockup verbatim. The studio holds an approval for 15 seconds so the user can undo it; you receive it after that.
- **revise**: new round with `--parent`, 2–3 refined versions of the selection. Every note and annotation must be visibly addressed; the versions should differ in *how* they address the feedback. Say in each variant's `notes` which feedback it answers. With `approved_variant` set, the user wants changes to the design they already approved.
- **remix**: new round with `--parent` that blends the selected variants; per-variant comments say what to keep from each.
- **more**: new round with `--parent` with 2–3 new variants that keep the selected idea and push it in different ways.
- **regenerate**: the direction is wrong. Explore clearly different directions; do not tweak the rejected ones.
- **unapprove**: the user revoked an approval (`revoked.variant`). Stop implementing it. If you already changed the codebase, tell the user what you changed and ask whether to revert. The round is open again: keep waiting.
- **export**: the user wants `selected[0]` as a component in `framework` (React, Vue, Svelte, Tailwind HTML). Convert it following the project's conventions, write it to `.variant-studio/exports/`, and tell the user the path. Do not touch the app unless asked.

Fields:
- `annotations` point to exact elements: `selector` resolves inside that variant's file; `text` is the visible text.
- `locked` elements must stay exactly as they are in the next version.
- `tokens` (per variant) and `knobs` (round-wide) are values the user tuned live: apply them exactly.
- `fonts` are families the user picked for headings and body text: use them.
- `text_edits`: use the `after` copy verbatim.
- `checklist.failed`: acceptance criteria the variant does not meet yet. Fix them.
- `audit`: accessibility issues (contrast, touch targets, alt text, labels, overflow). Fix them even if the user did not mention them.
- `references`: images the user attached. Open them with your image-reading tool and treat them as the visual direction.
- `screenshots`: the selected variants exactly as the user saw them (theme, viewport, controls applied).
- `ranking`: the user's order from the A-vs-B tournament, best first.
- `team_votes`: teammates' votes and comments. Weigh them; the user's own choice wins.
- `reuse: true`: the user brought back variants discarded when the round was approved. Build a new round from them; leave the approved implementation alone.
- `shortlist: true`: starred variants from several rounds; `selected` entries look like `"002-product-card/c"`.
- `render_errors`: a variant threw JS errors while the user looked at it. Fix it and consider whether that biased the choice.
- `wait` returns decisions from **any** round (the user may reopen an older one): always read `round` first.

## Target viewport (read this before every section or page)

`viewed_at` is only where the user happened to look. The design target is `design_target.viewports`, set from `--viewports` when you created the round. Design for the target. Never turn a desktop design into a mobile one (or the reverse) because the user glanced at another width, unless the note asks for it.

- Pick the target from the user's request and the project: an admin dashboard is `laptop`; a mobile app screen is `mobile`; a responsive marketing page is `laptop,mobile` (the first is the default view).
- Pass it every time: `--kind page --viewports laptop,mobile`. Iterations inherit it from `--parent`.
- Pages and sections must be responsive at every listed width. Components get a realistic fixed width.

## Grouping rounds

The sidebar is a tree: **group → subgroup → rounds**. Every round carries `--group "Group / Subgroup"`.

- Group = product area or screen (`Checkout`, `Dashboard`, `Marketing site`, `Design system`). Subgroup = the thing being designed (`Payment form`, `Hero`, `Buttons`).
- Run `STUDIO groups` first and reuse existing names exactly. No iteration numbers, dates or "v2" in names.
- Iterations use `--parent` and inherit the group. A new design subject gets a new subgroup.
- Keep `title` about the subject ("Pay button"); put the question in `--question`.

## Writing variants

**Fragments.** A file that does not start with `<!doctype` or `<html>` is a fragment: the server wraps it with a light reset (`scripts/ui/base.css`), the shared CSS, the brand palette and the preview script. Prefer fragments.

**Kinds.** `component` (centred on a neutral canvas, grows to fit; give it a realistic width), `section` (full width, auto height), `page` (fixed viewport, scrolls). Viewport presets: `auto` (card width, components only), `mobile` 390, `tablet` 820, `laptop` 1280, `desktop` 1440.

**Use the project's real look.** In order of preference:
1. Shared tokens and fonts in `.variant-studio/global.css` (every round) or `<round>/_shared.css` (this round).
2. Real project files through `head` in `round.json`: any project path is served at `/p/<path>`.
3. Tailwind: the CDN script plus the project's theme, or the compiled CSS.
4. Real React/Vue/Svelte components: URL variants pointing at the dev server or Storybook (`references/frameworks.md`).

**Brand palette.** If `.variant-studio/brand.json` exists (the user edits it in Settings), every variant gets `--brand-<name>` color variables and `--brand-font-heading` / `--brand-font-body`. Use them for color and type so the user judges structure with their real brand: `background: var(--brand-primary, #3b5bdb)`.

**Express decisions as CSS custom properties.** Colors, radii, spacing, type sizes, shadows as `--tokens` on `:root` or the variant root, used through `var(--…)`. The Inspector lists them with pickers, so the user tunes instead of asking for another round.

**Declare knobs** in `round.json` for the axes worth tuning across all variants (radius, density, accent, type scale). They become sliders, color pickers and selects in the Tune panel and come back in `knobs`:
```json
"knobs": [
  { "token": "--radius", "label": "Corner radius", "type": "range", "min": 0, "max": 28, "unit": "px", "value": 12 },
  { "token": "--accent", "label": "Accent", "type": "color", "value": "#5566e8" },
  { "attr": "density", "label": "Density", "type": "select", "options": ["compact", "regular", "airy"] }
]
```
An `attr` knob sets `data-<attr>` on `<html>`: style it with `html[data-density=compact] …`.

**States and content.** Declare `"states": ["default", "loading", "empty", "error"]` and/or `"content": ["typical", "long text", "no image"]`. The user switches them from the top bar; the preview gets `html[data-vs-state="loading"]` and `html[data-vs-content="long text"]` (the first value of each list is the default, with no attribute). Write each variant so those selectors change what is shown. For side-by-side states inside one variant you can still use:
```html
<div class="vs-states"><figure data-state="Default">…</figure><figure data-state="Disabled">…</figure></div>
```

**Checklist.** `"checklist": ["Main action visible without scrolling", "Works with long names"]` gives the user pass/fail toggles per variant; failures come back in `checklist.failed`.

**Dark mode.** The variant theme toggle sets `data-theme="dark"`, the `dark` class and `color-scheme` on `<html>`. Support it with `html[data-theme=dark] …` or `.dark` rules.

**Make variants worth comparing.**
- 2–4 per round; 3 is the sweet spot. Each embodies a distinct idea (hierarchy, density, emphasis, interaction), not a colour swap, unless the round is about colour. When iterating, vary one axis at a time.
- Match fidelity to the question: wireframe helpers (`.wf-box`, `.wf-line`, `.wf-img`) for layout; real copy, names and prices for look and feel.
- Write `question` as the real decision ("Which checkout layout feels fastest on mobile?").
- Keep variants self-contained and scope class names (`.qb-…`).
- `label` is 1–3 words naming the idea; `notes` is one sentence on the trade-off.
- Write `title`, `question`, `context`, `label` and `notes` in the studio language: `new`, `present` and `status` print it as `studio_language` (the user picks it in Settings; it starts from their browser). The text inside the designs follows the product's own language.

## Commands

| Command | Use |
|---|---|
| `start [--team] [--remote]` | Start or reuse the server. `--team` also serves it on the local network and prints `team_url`; `--remote` also opens a public link (see `share`). |
| `share [--stop]` | Open a temporary public link (Cloudflare tunnel) and print `guest_url` for teammates outside the network; `--stop` closes it and invalidates every guest link. Needs cloudflared, which the installer offers. |
| `new <slug>` | Create a round (`--group`, `--title`, `--question`, `--kind`, `--viewports`, `--variants`, `--parent`). |
| `present` | Check the latest round, print the URL, wait for the decision. |
| `wait` | Wait for the next decision. Exit 2 = still waiting: run it again. |
| `decision` / `inbox` | Next queued decision without waiting / the whole queue. |
| `status`, `list`, `groups` | Server state, round history, existing group names. |
| `errors` | JS and asset errors raised by previews. Check after writing variants. |
| `build [--team]` | Self-contained `gallery.html` that works without a server. Decisions are copied to the clipboard. `--team` makes a voting gallery to send to teammates; they return a votes file the user imports. |
| `open`, `demo`, `stop` | Reopen the gallery, add a sample round, stop the server (it also stops after 4 h idle). |

## What the user can do (to point them to it)

- Views: grid `G`, full screen `F`/`Z` with filmstrip and ←/→, list `L`, compare `X` (swipe, overlay with difference blend, A-vs-B tournament, before/after against the parent round), overview `O` of every round, version tree `T`, variants map `M` (the chosen variant of each round as a thumbnail, with its branches).
- Viewport per round, device frames, zoom (`+ − 0`), synced scrolling, variant theme `D`.
- Select with `1–9`, rate, star into the shortlist, comment on or lock an element `C`, rewrite copy `E`, Inspector `I` (tune, fonts, tokens, checklist, accessibility audit, text edits).
- Prompt bar: note `/`, quick chips and saved prompts, reference images (paste, drop, attach), dictation, `Ctrl/⌘ Enter` to send. Undo for 15 seconds after sending; revoke an approval later.
- Each card's ⋯ menu: more like this, export as PNG, JPG, HTML with the user's changes or the original HTML, ask you for a React/Vue/Svelte/Tailwind component.
- `Ctrl/⌘ K` command palette, Settings (language: English, Italian, Spanish, French, Russian; studio theme, notifications, what is sent to you, brand palette), Team panel.

## Troubleshooting

- **403** → the URL was opened without `?k=…`. Give the full `url` again. Guest links (`team_url`, `guest_url`) only view and vote: decisions, uploads and project sources answer 403 to them by design.
- **`share` fails** → `state: missing` means cloudflared is not installed, `disabled` means the user turned remote sharing off in `~/.variant-studio/config.json`. Tell them to re-run the installer with `--remote`; otherwise use `build --team`.
- **"The studio server stopped"** → `STUDIO start` again; same port and key, the tab reconnects.
- **Unreachable URL (remote, container)** → `start --host 0.0.0.0 --url-host <host>` or forward the port; otherwise `build`.
- **Blank variant** → `STUDIO errors`; look for an unclosed tag or an asset path that should be `/p/…`.
- **Wrong preview height in a full document** → avoid `height: 100vh` on `body` in component and section rounds.
- **The user sees mobile layouts on desktop (or the reverse)** → the round has no `viewports` or the wrong ones. Set `"viewports"` in `round.json` to the real target.
