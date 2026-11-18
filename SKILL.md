---
name: variant-studio
description: Generate several design variants of any piece of UI — a single button, card, form, navbar, section, or full page — show them side by side in a live browser gallery, and let the user pick one, request changes, combine variants, or comment on specific elements, then continue from their structured decision. Use this whenever the user wants to explore, compare, or choose between design options or mockups ("show me a few versions", "give me some alternatives for this card", "fammi vedere delle varianti", "proposte di design", "quale layout è meglio", "redesign this component", "A/B options"), whenever a UI decision would be clearer seen than described, and whenever the user asks for a visual/browser companion or preview. Works in Claude Code, Codex, Gemini CLI, Cursor, Copilot CLI and any agent that can run Node.js.
---

# Variant Studio 4.0

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
   One server (port 8065, or the next free one) serves every project on the machine; `start` opens a session for this project. It prints `url` (`http://variant-studio.localhost:8065/<PIN>`, always give the user the full URL), `lan_url` (same session for a phone or another computer on the network), `pin` and `guest_pin`. The PIN is 5 characters and stays the same for the project across restarts, so the user's tab reconnects by itself. Calling `start` again reuses the server and the session. If your harness kills background processes, see `references/platforms.md`.

2. **Create a round**: one round = one question with 2–4 variants.
   ```bash
   STUDIO groups --project "$PWD"
   STUDIO new product-card --project "$PWD" --kind component \
     --group "Catalog / Product card" --title "Product card" \
     --question "Which card should we use in the category grid?" --variants a,b,c
   ```
   For sections and pages always pass `--viewports` (see "Target viewport"). For terminal UIs, phone apps, desktop apps and logos pass `--design tui|app|desktop|logo` (see "Design modes"). Iterations use `--parent <round id>` and inherit group, kind and viewports. Then fill `label` and `notes` for each variant in the printed `round.json`; add `knobs`, `states`, `content` or `checklist` when they help (`references/manifest.md`).

3. **Write each variant** to `<round dir>/<id>.html` with your file-writing tool, following the `generation` block that `new` printed (see "Generation settings"). The gallery shows a placeholder until the file exists and live-reloads on save.

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

7. **Finish**: implement the approved variant in the real codebase. Keep listening for a while if you can: the user may revoke the approval (see `unapprove`). `STUDIO stop` when done: it closes only this project's session (other agents' projects keep running; the server exits with the last one). Rounds stay on disk.
   - If `wait` returns `{"type":"server-stopping","by":…}`, someone else stopped the studio (another agent ran `stop --all`, or the server was terminated). Tell the user; run `start` again only if they want to continue.

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
  "viewed_at": { "viewport": "laptop", "width": 1280, "theme": "dark", "background": "light", "layout": "grid", "state": "loading" },
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

## Generation settings (mockup mode, subagents)

`new` prints a `generation` block. Follow it every time; the user changes it in Settings → Generation, so read it again for each round.

- **`mode: "mockup"` (default).** Every variant is a static visual mockup, not a working app. One HTML fragment per variant plus an optional `_shared.css`. No JavaScript (no inline `<script>`, no `on*` attributes, no `.js` files), no routing, fetch, form logic or fake data generators, no extra pages, components, `package.json` or folders. Buttons and inputs are inert. Show other states through `states` / `content` and CSS. `present` rejects a round that breaks this and lists the `violations`: remove them and present again. Putting the effort into the look instead of the behaviour is the point.
- **`mode: "prototype"`.** Only when the user turned it on. Variants may be interactive (scripts, working tabs, validation, fake data), still one self-contained file each inside the round folder. Never scaffold a project or touch the app code for a variant.
- **`subagents.enabled: false` (default).** Write the variants yourself, one after another.
- **`subagents.enabled: true`.** You orchestrate: decide one idea per variant, fill `round.json`, write `_shared.css`, then spawn one subagent per variant **in parallel**, each owning the file in `assignments`. Brief each with its file path, the question, kind, viewports, its idea, the shared tokens and `mode_rules` verbatim, and tell it to write only that file and not run the studio. When all are done, run `errors` and then `present` yourself.
  - Model: `subagents.model` says what to use. **Claude Code:** the Agent tool's `model` parameter (`haiku`, `sonnet`, `opus`, `fable`, which always resolve to the newest of that family); `auto` means you choose per variant. **Codex:** your subagent tool, on the newest GPT model of the chosen tier (`luna`, `terra`, `sol`, `astra`); `auto` means you choose. Exact model ids can be pinned in `~/.variant-studio/config.json` as `"models": { "cc": { "sonnet": "…" }, "cdx": { "sol": "…" } }`.
  - If your harness has no subagent tool, write the variants yourself and say so in one line.

When the user asks in chat to change these ("make them clickable", "prototype mode", "use subagents", "subagents on Sonnet", "go back to mockups"), run `settings` with the matching flag before creating the next round. Never switch to prototype mode on your own.

## Target viewport (read this before every section or page)

`viewed_at` is only where the user happened to look. The design target is `design_target.viewports`, set from `--viewports` when you created the round. Design for the target. Never turn a desktop design into a mobile one (or the reverse) because the user glanced at another width, unless the note asks for it. The same goes for `viewed_at.background`: it is the canvas the user previewed on (light, gray, dark, black, checker or a hex colour), not a request to change the design's background.

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

## Design modes

`new … --design <mode>` sets what the round is designing; iterations inherit it from `--parent`. The top bar shows it as a badge, and `new` prints the mode's rules in `generation.design_rules`: follow them.

| Mode | The variant is | The studio adds around it |
|---|---|---|
| `ui` (default) | A component, section or page (`--kind`). | Nothing. |
| `component` | Same as `ui --kind component`. | Nothing. |
| `tui` | One terminal screen of a text UI, drawn in HTML: monospace (`var(--vs-mono)`, a Nerd Font), transparent background, light text, no window or prompt. | A terminal window it owns: acrylic (default), tabs or tmux style, or an OS default (plain black, Ubuntu GNOME Terminal, CMD, PowerShell, Windows Terminal) with that shell's prompt and the user's own user and host names; font (JetBrainsMono, FiraCode, Hack, CaskaydiaCove Nerd, or a local font), size, opacity, blur, wallpaper, and a prompt line the user can type into. |
| `app` | One phone screen at the device's width. Pad the top with `var(--vs-safe-top)` and the bottom with `var(--vs-safe-bottom)`; `html[data-vs-platform=ios\|android]` tells the platform. No status bar, notch or home indicator. | A CSS phone: iPhone 8 / X / 18, Pixel 3 / 6 / 8 / 10 Pro, Galaxy S25 / S25 Ultra, in realistic (default), flat or clay frames, with status bar, cut-out and home indicator. |
| `desktop` | The client area of one desktop app window (fills `100vh`). `html[data-vs-os=mac\|windows\|linux]` tells the OS. No title bar or traffic lights. | A window frame: macOS, OS X Yosemite, Mac OS X Leopard, Mac OS X Aqua, Windows 11, 8/10, 7, XP, Ubuntu GNOME, KDE Plasma; window size 1024×768, 1280×800 (default), 1440×900, 1920×1080; optional desktop with taskbar or dock. |
| `logo` | The mark as inline `<svg>` (the first one), optionally a wordmark, and an optional full-bleed app icon `<svg data-vs-icon>`. | Usage previews: browser tab favicon at real 16/32 px, iOS and Android icons, sizes 16–128 on light and dark, monochrome. |

The user picks the terminal style, phone or window skin for the whole round from the top bar button (a popover of grouped options) and per variant from the card's ⋯ menu (**Shell style…**); the choice for each variant comes back in the decision's `viewed_at.shell`. The shells never change your file: the variant stays static.

Wallpaper for `tui` and `desktop`: `.variant-studio/wallpaper.(png|jpg|webp|svg)` in the project, else the bundled one.

## Logo tools

| Command | Output |
|---|---|
| `logo-export <round> <variant> [--out DIR] [--bg #fff]` | `logo.svg`, `icon.svg`, PNG 16…1024, `favicon.ico` (16/32/48), `apple-touch-icon.png`, `maskable-512.png`, `site.webmanifest`, `head-snippet.html`. Default folder `.variant-studio/exports/logo-<round>-<variant>/`. Rasterizes with Chrome, Edge or Chromium in headless mode (`chrome` in `~/.variant-studio/config.json` or `CHROME_PATH` to choose). Without a browser it writes the SVGs and answers `partial: true` with `tell_user`: the user clicks **Export logo set** in the card's ⋯ menu and the gallery uploads the PNGs. |
| `palette <#hex> [--scheme analogous\|complementary\|triad\|mono]` | OKLCH scales 50…950 per colour plus a neutral, contrast ratios on white and black, WCAG-checked text pairs, and ready `css` tokens. |
| `fonts [--query TEXT]` | Curated Google Fonts pairs (with the CSS URL for `head`) and the fonts installed on this machine. |
| `image "<prompt>" [--size 1024x1024] [--out FILE] [--round ID]` | A raster image from the OpenAI Images API (`gpt-image-1`; `openai.image_model` in the config to change it), saved in `<round>/_images/`. Key from `OPENAI_API_KEY` or `openai.api_key` in the config; never print it. Use it for illustrations and textures, not for the logo itself (logos stay SVG). |

## Export

Each card's ⋯ menu and `export <round> <variant> --as single|split|shared [--out DIR]` write one variant as standalone files (default folder `.variant-studio/exports/<round>-<variant>-<as>/`):

- `single`: one `.html` with everything inlined (styles, brand, local images and fonts as data URIs, remote fonts when reachable).
- `split`: `index.html` + `style.css` + `script.js`.
- `shared`: `index.html` + `style.css` (this variant) + `shared.css` (base, brand, `global.css`, `_shared.css`), for several pages that share one stylesheet.

In the gallery `single` downloads one file; `split` and `shared` download a `.zip`. The exported page is the variant alone, without the terminal, phone or window around it.

## Commands

| Command | Use |
|---|---|
| `start [--remote]` | Start or reuse the shared server and open this project's session. Prints `url`, `lan_url`, `pin`, `guest_pin` and `team_url` (the guest link on the local network: view and vote only). `--remote` also opens a public link (see `share`). |
| `share [--stop]` | Open a temporary public link (Cloudflare tunnel) for this session and print `guest_url` for teammates outside the network (and `owner_url`, the user's own link); `--stop` closes it and changes the guest PIN, so every guest link stops working. Needs cloudflared, which the installer offers. |
| `new <slug>` | Create a round (`--group`, `--title`, `--question`, `--design`, `--kind`, `--viewports`, `--variants`, `--parent`). |
| `export`, `logo-export`, `palette`, `fonts`, `image` | See "Export" and "Logo tools". |
| `present` | Check the latest round, print the URL, wait for the decision. |
| `wait` | Wait for the next decision. Exit 2 = still waiting: run it again. |
| `decision` / `inbox` | Next queued decision without waiting / the whole queue. |
| `settings` | Show or change generation settings: `--mode mockup\|prototype`, `--subagents on\|off`, `--cc-subagent-model auto\|haiku\|sonnet\|opus\|fable`, `--cdx-subagent-model auto\|luna\|terra\|sol\|astra`; `--global` saves them as the user's default for every project. |
| `status`, `list`, `groups` | Server state, round history, existing group names. |
| `errors` | JS and asset errors raised by previews. Check after writing variants. |
| `build [--team]` | Self-contained `gallery.html` that works without a server. Decisions are copied to the clipboard. `--team` makes a voting gallery to send to teammates; they return a votes file the user imports. |
| `open`, `demo` | Reopen the gallery (starts the session if needed), add a sample round. |
| `stop [--all]` | Close this project's session; the server exits when no session is left (a session also closes after 4 h idle). `stop --all` lists every session and refuses: show the list to the user, ask, and only then run `stop --all --confirm`. The other sessions are told who stopped them. |

## What the user can do (to point them to it)

- Views: grid `G`, full screen `F`/`Z` with filmstrip and ←/→, list `L`, compare `X` (swipe, overlay with difference blend, A-vs-B tournament, before/after against the parent round), overview `O` of every round, version tree `T`, variants map `M` (the chosen variant of each round as a thumbnail, with its branches).
- Viewport per round, device frames, zoom (`+ − 0`), synced scrolling, variant theme `D`.
- Select with `1–9`, rate, star into the shortlist, comment on or lock an element `C`, rewrite copy `E`, Inspector `I` (tune, fonts, tokens, checklist, accessibility audit, text edits).
- Prompt bar: note `/`, quick chips and saved prompts, reference images (paste, drop, attach), dictation, `Ctrl/⌘ Enter` to send. Undo for 15 seconds after sending; revoke an approval later.
- Each card's ⋯ menu: more like this, export as PNG, JPG, HTML with the user's changes or the original HTML, single HTML / HTML + CSS + JS / HTML + shared CSS, the logo set (logo rounds), the terminal style, phone or window for that variant, ask you for a React/Vue/Svelte/Tailwind component.
- `Ctrl/⌘ K` command palette, Settings (language: English, Italian, Spanish, French, Russian; studio theme; Generation: mockup or prototype mode, subagents and their models; notifications, what is sent to you, brand palette), Team panel.

## Troubleshooting

- **PIN page instead of the gallery** → the URL lacks the PIN or the session was stopped. Give the full `url` again (`…/<PIN>`), or run `start` if the page says there is no session with that PIN. On this computer the PIN page at `http://variant-studio.localhost:8065/` lists every active session. Guest links (`team_url`, `guest_url`, guest PIN) only view and vote: decisions, uploads and project sources answer 403 to them by design.
- **`variant-studio.localhost` does not open** (some browsers or proxies do not resolve `*.localhost`) → use `http://127.0.0.1:<port>/<PIN>` (also printed by `status` as `loopback_url`).
- **Port 8065 is taken** by another program → the server uses 8066, 8067…; always use the printed `url`.
- **`stop --all` answered `confirm-required`** → by design: other projects (maybe other agents) are listed in `sessions`. Ask the user before adding `--confirm`.
- **`share` fails** → `state: missing` means cloudflared is not installed, `disabled` means the user turned remote sharing off in `~/.variant-studio/config.json`. Tell them to re-run the installer with `--remote`; otherwise use `build --team`.
- **"The studio server stopped"** → `STUDIO start` again; same PIN, the tab reconnects (if the port changed, give the new `url`).
- **Phone or other computer cannot connect** → use `lan_url` on the same Wi-Fi; check the computer's firewall allows the port. Outside the network use `share`. For remote machines and containers: `start --url-host <host>` or forward the port; otherwise `build`.
- **`present` says "Mockup mode" with `violations`** → the variants contain scripts, event handlers or project files. Remove them; do not switch mode unless the user asked for working prototypes.
- **Blank variant** → `STUDIO errors`; look for an unclosed tag or an asset path that should be `/p/…`.
- **`logo-export` answered `partial: true`** → no Chrome/Edge found. Relay `tell_user`: ⋯ → Export logo set in the gallery writes the PNGs and favicon into the same folder.
- **`image` fails** → `no-key`: ask the user to set `OPENAI_API_KEY`; `invalid_api_key` / 401: the key is wrong. Never echo the key.
- **Wrong preview height in a full document** → avoid `height: 100vh` on `body` in component and section rounds.
- **The user sees mobile layouts on desktop (or the reverse)** → the round has no `viewports` or the wrong ones. Set `"viewports"` in `round.json` to the real target.
