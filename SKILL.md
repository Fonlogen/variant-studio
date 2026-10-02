---
name: variant-studio
description: Generate several design variants of any piece of UI — a single button, card, form, navbar, section, or full page — show them side by side in a live browser gallery, and let the user pick one, request changes, combine variants, or comment on specific elements, then continue from their structured decision. Use this whenever the user wants to explore, compare, or choose between design options or mockups ("show me a few versions", "give me some alternatives for this card", "fammi vedere delle varianti", "proposte di design", "quale layout è meglio", "redesign this component", "A/B options"), whenever a UI decision would be clearer seen than described, and whenever the user asks for a visual/browser companion or preview. Works in Claude Code, Codex, Gemini CLI, Cursor, Copilot CLI and any agent that can run Node.js.
---

# Variant Studio 2.0

A local gallery that turns "which design do you want?" into a visual, clickable decision. You write each variant as a small HTML file; the user sees them live in the browser (grid, side by side, one at a time, swipe-compare, or list), switches viewport and light/dark, zooms, selects, rates, stars variants into a cross-round shortlist, comments on specific elements, rewrites copy inline, tunes CSS tokens live, checks an accessibility audit, attaches reference images, and sends a decision. You read that decision as JSON and act on it.

The script is `scripts/studio.mjs` (Node ≥ 18, zero dependencies). Below, `STUDIO` means `node <this-skill-dir>/scripts/studio.mjs`. Always pass `--project <repo root>` so everything lives in `<repo>/.variant-studio/` (it is added to `.gitignore` automatically).

## When to use the browser, and when not

Use it when the answer is a visual preference: layout, hierarchy, spacing, color, typography, density, component styling, states, responsive behaviour. A question *about* UI is not automatically visual: "should the filter be a sidebar or a modal?" can be answered in text; "which of these filter panels feels right?" belongs in the browser.

If the user did not explicitly ask for a visual preview, offer it in one short sentence the first time a genuinely visual choice comes up, then proceed once they agree. If they asked for variants/mockups/options, just start.

## The loop

1. **Start (or reuse) the server**
   ```bash
   STUDIO start --project "$PWD" --open
   ```
   Returns JSON with `url` (includes `?k=` access key — always give the user the full URL), `rounds_dir`, `state_dir`. Calling `start` again is safe: it reuses the running server and prints `server-already-running`. After a restart the port and key are reused, so the user's open tab reconnects by itself. See `references/platforms.md` if your harness kills background processes (Codex, Gemini CLI, Windows).

2. **Create a round** — one round = one question with 2–4 variants. Always group it (see "Grouping rounds" below).
   ```bash
   STUDIO groups --project "$PWD"          # see the groups that already exist
   STUDIO new product-card --project "$PWD" --kind component \
     --group "Catalog / Product card" \
     --title "Product card" --question "Which card should we use in the category grid?" \
     --variants a,b,c
   ```
   Then edit `round.json` in the printed directory to give every variant a short `label` (name the idea: "Editorial", "Quick buy") and one-line `notes` (the rationale / trade-off). Full schema: `references/manifest.md`.

3. **Write each variant** to `<round dir>/<id>.html` with your normal file-writing tool (not heredocs). The gallery shows a "generating…" placeholder until each file exists and live-reloads when you save, so write them one by one. See "Writing variants" below.

4. **Hand over to the user.** Tell them the URL and, in one or two sentences, what they are comparing and what to do: select a variant (click its letter or press 1–9), optionally rate/comment/click an element to annotate, then press *Approve*, *Request changes*, *Combine*, or *Start over*.

5. **Wait for the decision**
   ```bash
   STUDIO wait --project "$PWD" --timeout 540
   ```
   Blocks until the user sends a decision for the latest round, then prints it (and marks it consumed). Set your shell tool's own timeout above the `--timeout` value (e.g. 600000 ms in Claude Code). Exit code 2 = timeout: end your turn, ask the user to decide in the browser or reply in chat, and on the next turn run `STUDIO decision --project "$PWD"` (non-blocking). If the user answers in chat instead, their chat message wins; merge it with any browser decision.

6. **Act on the decision** (see next section), and repeat from step 2 with `--parent <previous round id>` until they approve.

7. **Finish**: implement the approved variant in the real codebase, then optionally `STUDIO stop --project "$PWD"`. Rounds stay on disk for reference.

## Grouping rounds (always do this)

The gallery sidebar is a tree: **group → subgroup → rounds**. A flat list of rounds quickly becomes unreadable, so every round must carry `--group "Group / Subgroup"` (stored as `"group"` in `round.json`).

- **Group = the product area, screen or system** the design belongs to: `Checkout`, `Onboarding`, `Dashboard`, `Marketing site`, `Settings`, `Design system`, `Emails`.
- **Subgroup = the specific thing being designed** inside that area: `Payment form`, `Pay button`, `Plan picker`, `Hero`, `Pricing table`, `Buttons`, `Color palette`.
- Run `STUDIO groups` before creating a round and **reuse existing names exactly** (same spelling and case). Create a new group only for a genuinely new area. Never put the iteration number, the date or words like "v2", "revised", "options" in a group name.
- Iterations of the same question use `--parent <previous round id>`: they inherit the parent's group automatically and nest under it, so leave `--group` out unless the subject really moved.
- One subgroup = one design subject. If a round explores the whole page, use the page as subgroup (`Checkout / Full page`); if it then zooms into one element, start a new subgroup (`Checkout / Order summary`).
- Keep `title` short and about the subject ("Pay button"), not the iteration; put the question in `--question`.
- For design-system work use `Design system / <token or component family>` (`Design system / Typography scale`, `Design system / Buttons`).

## Reading the decision

```json
{
  "round": "001-product-card",
  "action": "revise",                 // choose | revise | remix | regenerate
  "selected": ["b"],
  "note": "Use B but with A's serif title",
  "variants": {
    "b": { "label": "Quick buy", "rating": "like", "comment": "Love the size chips",
           "annotations": [ { "selector": "div.qb > div.body > button.cta", "tag": "button",
                              "text": "Add to cart", "note": "Darker, less rounded" } ],
           "tokens": { "--radius": { "scope": ":root", "from": "12px", "to": "4px" } },
           "text_edits": [ { "selector": "button.cta", "before": "Add to cart", "after": "Add · €49" } ],
           "audit": [ { "kind": "contrast", "detail": "Contrast 2.5:1 (needs 4.5:1, 13px text)", "selector": "…", "text": "★★★★★ (128)" } ] },
    "c": { "label": "Compact", "rating": "dislike" }
  },
  "references": ["/abs/path/.variant-studio/rounds/001-product-card/_refs/x1-moodboard.png"],
  "viewed_at": { "viewport": "mobile", "theme": "dark", "layout": "grid" },
  "files": { "a": "/abs/path/a.html", "b": "/abs/path/b.html", "c": "/abs/path/c.html" },
  "next_step": "…a one-line reminder of what to do…",
  "render_errors": [ … ]              // only if a variant threw JS errors
}
```

- **choose** → the user approved `selected[0]`. Read `files[selected[0]]`, apply any comments/annotations as final tweaks, and implement it in the project's real stack (components, tokens, CSS framework). Do not paste the mockup verbatim if the project has its own components.
- **revise** → new round with `--parent`, 2–3 refined versions of the selected variant. Every note and annotation must be visibly addressed; the variants should differ in *how* they address the feedback, not be three copies. Mention in each variant's `notes` which feedback it answers.
- **remix** → new round with `--parent` that blends the selected variants. Use per-variant comments to know what to take from each; if unclear, ask one short question first.
- **regenerate** → the direction is wrong. Read `note` and dislikes, then explore clearly different directions — do not tweak the rejected ones.
- **annotations** point to exact elements: `selector` resolves inside that variant's file; `text` is the element's visible text. `viewed_at` tells you which viewport/theme the user was looking at — if they commented while on mobile, fix the mobile layout.
- **tokens** are CSS custom properties the user tuned live in the Inspector: apply every `from → to` exactly (in the next round or in the implementation). This is why variants should express color, radius, spacing and type through `--tokens` (see "Writing variants").
- **text_edits** are copy the user rewrote directly in the preview: use the `after` text verbatim.
- **audit** lists accessibility issues found in the selected variants (contrast, touch targets on mobile/tablet, missing alt/labels, horizontal overflow). Fix them in the next version even if the user did not mention them.
- **references** are images the user attached (pasted, dropped or uploaded). Open them with your image-reading tool and treat them as the visual direction.
- **reuse: true** means the round was already approved and the user picked some *discarded* variants to bring back (`approved_variant` stays approved). Create a new round with `--parent` built from the selected discarded variants; do not touch the approved implementation unless the note says so.
- **shortlist: true** means the user starred variants across several rounds and sent them together: `selected` entries look like `"002-product-card/c"` and `files` has a path for each. Treat it like `revise`/`remix` on those files.
- `wait` without `--round` returns a decision from **any** round (the user may reopen an older round), so always read `round` before acting.
- **render_errors** mean a variant was broken while the user looked at it. Fix it in the new round and consider whether that biased their choice.

## Writing variants

**Fragment vs document.** A file that does not start with `<!doctype` or `<html>` is a *fragment*: the server wraps it in a page with a light reset (`scripts/ui/base.css`), the round's shared CSS, and the preview script. Prefer fragments — they are faster to write and render consistently. Write a full document only when you need total control of `<head>`/`<body>`; the preview script is still injected.

**Pick the right `kind`.**
- `component` — buttons, inputs, cards, badges, modals, menus, tables. Rendered centred on a neutral canvas; the preview grows to fit its content. Give the component a realistic width (e.g. `width: 280px` for a grid card) instead of letting it stretch.
- `section` — hero, header, footer, pricing block, FAQ. Full width, auto height, previewed at laptop width by default.
- `page` — whole screens and flows. Rendered in a fixed viewport (scrollable) so the fold is honest. Use `"viewports": ["laptop", "mobile"]` to set the defaults the user sees.

Viewport presets: `auto` (card width), `mobile` 390, `tablet` 820, `laptop` 1280, `desktop` 1440. The user can also type a custom width.

**Use the project's real look.** Variants that ignore the project's design system are hard to judge and hard to implement. In order of preference:
1. Put shared tokens/fonts in `.variant-studio/global.css` (applies to every round) or `<round>/_shared.css` (this round only). Copy CSS variables from the project.
2. Link real project files through `head` in `round.json`: any path under the project is served at `/p/<relative path>`, e.g. `"head": ["/p/dist/assets/app.css"]` (secrets like `.env`, `.git`, keys are blocked).
3. Tailwind projects: `"head": ["<script src=\"https://cdn.tailwindcss.com\"></script>"]` plus a `tailwind.config` script block with the project's theme, or link the compiled CSS.
4. React/Vue/Svelte components you want rendered *for real*: use URL variants pointing at the running dev server or Storybook (`{"id":"b","url":"http://localhost:6006/iframe.html?id=card--quick-buy"}`). Add `<script src="<studio url origin>/_ui/frame.js"></script>` to that page to get auto-height, element comments and error reporting. Details: `references/frameworks.md`.

Assets placed in the round folder can be referenced relatively (`<img src="hero.jpg">`).

**Show states when they matter.** For interactive components, show them side by side instead of relying on hover:
```html
<div class="vs-states">
  <figure data-state="Default">…</figure>
  <figure data-state="Hover">…</figure>
  <figure data-state="Disabled">…</figure>
  <figure data-state="Error">…</figure>
</div>
```

**Dark mode.** The gallery's light/dark toggle sets `data-theme="dark"`, the `dark` class, and `color-scheme` on `<html>`. Support it with `html[data-theme=dark] …` rules, `.dark` Tailwind classes, or `prefers-color-scheme`-free CSS variables.

**Use CSS custom properties for the design decisions.** Declare colors, radii, spacing, font sizes and shadows as `--tokens` (on `:root` or the variant's root class) and use `var(--…)` in the rules. The Inspector lists them with color pickers and number nudgers, so the user can tune a variant live instead of asking for another round, and you receive exact values back. Prefix-scope them per variant if variants share a page (`.qb { --qb-accent: … }`).

**Keep `label` and `notes` short.** `label` is 1–3 words naming the idea; `notes` is one sentence (the trade-off). Notes are hidden behind an info toggle on each card, so put the important difference in the design itself, not in the description.

**Make variants worth comparing.**
- 2–4 variants per round; 3 is the sweet spot. More than 4 dilutes attention.
- Each variant should embody a distinct idea (hierarchy, density, emphasis, interaction), not just a colour swap — unless the round is explicitly about colour. When iterating, vary one axis at a time so the user's choice is informative.
- Match fidelity to the question: wireframe helpers (`.wf-box`, `.wf-line`, `.wf-img`) for layout questions; polished, real copy and real prices/names for look-and-feel questions. Placeholder text hides design problems.
- Write the round's `question` as the actual decision ("Which checkout layout feels fastest on mobile?"), not "Pick one".
- Keep each variant self-contained; don't rely on other variants' CSS. Scope class names (e.g. `.qb-…`) so shared CSS doesn't collide.

## Other commands

| Command | Use |
|---|---|
| `status` | Is the server running? Latest round, missing variants, decision state. Run it before referencing the URL if some time has passed. |
| `list` | All rounds with group, decision and approved variant (history). |
| `groups` | Existing groups/subgroups — run before `new` and reuse the names. |
| `decision [--round ID]` | Print a decision without waiting. |
| `errors [--round ID]` | JS/asset errors raised by previews. Check after writing variants. |
| `open` | Re-open the gallery in the browser. |
| `build [--out FILE]` | Self-contained `gallery.html` that works without a server (file://). Decisions are copied to the clipboard for the user to paste into chat. Use it when a server cannot run (remote sandbox, no port access). |
| `demo` | Adds a sample round to check the setup. |
| `stop` | Stops the server. It also stops by itself after 4 h idle (`--idle MIN`). |

## What the user can do in the gallery (so you can point them to it)

- Layouts: Grid `G`, Side by side `S`, One at a time `F`, Compare/swipe `X`, List `L` (thumbnails on the left, detail on the right). `Z` expands the active card in-app; `Esc` goes back.
- Zoom: `+` / `−` / `0` for all cards, or the per-card zoom control on hover.
- Approved rounds open on the approved design; "Show discarded" reveals the other variants to reuse them in a new prompt.
- Shortlist (★ on any card): collects variants from any round to compare and send together.
- `C` comment on an element, `E` rewrite text inline, `I` Inspector (tokens, audit, text edits), `N` show all descriptions.
- Prompt bar: `/` to open, `P` to pin, quick chips ("More minimal", "Bigger type"…), paste/drop images as references, `Ctrl/⌘ Enter` to send.
- `Ctrl/⌘ K` command palette lists every tool and round; `H` hides the top bar, `R` the sidebar, `U` switches the studio between OLED dark and light.
- Each card's ⋯ menu exports the variant as standalone HTML or PNG.

## Troubleshooting

- **User sees 403** → they opened the URL without `?k=…`. Give the full `url` again.
- **Page says the server stopped** → `STUDIO start --project "$PWD"` again; same port and key, the tab reconnects.
- **URL unreachable (remote/container)** → `start --host 0.0.0.0 --url-host <reachable host>` or forward the port; otherwise use `build`.
- **Variant blank** → run `STUDIO errors`; check for a missing closing tag or an asset path that should be `/p/...`.
- **Preview height wrong in a full document** → avoid `height: 100vh` on `body` in component/section rounds; the preview measures content height.
