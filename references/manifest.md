# round.json reference

Every round lives in `.variant-studio/rounds/<NNN-slug>/`. `STUDIO new` creates the folder and a starter `round.json`. Every field is optional: without a manifest, each `*.html` file in the folder is shown as a variant.

```json
{
  "group": "Catalog / Product card",
  "title": "Product card",
  "question": "Which card should we use in the category grid?",
  "context": "Same product, three directions. Grid is 4 columns on desktop, 2 on mobile.",
  "kind": "component",
  "viewports": ["auto", "mobile"],
  "knobs": [
    { "token": "--qb-radius", "label": "Corner radius", "type": "range", "min": 0, "max": 24, "unit": "px", "value": 12 },
    { "token": "--qb-accent", "label": "Accent", "type": "color", "value": "#3b5bdb" },
    { "attr": "density", "label": "Density", "type": "select", "options": ["compact", "regular", "airy"] }
  ],
  "states": ["default", "loading", "empty", "error"],
  "content": ["typical", "long names", "no image"],
  "checklist": ["Price visible without hovering", "Works with long product names"],
  "parent": "001-product-card",
  "head": [
    "/p/src/styles/tokens.css",
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap",
    "<script src=\"https://cdn.tailwindcss.com\"></script>"
  ],
  "variants": [
    { "id": "a", "label": "Editorial", "notes": "Photo first, quiet type." },
    { "id": "b", "label": "Quick buy", "notes": "Sizes + add to cart on the card." },
    { "id": "c", "label": "Storybook", "url": "http://localhost:6006/iframe.html?id=card--compact" }
  ]
}
```

| Field | Meaning |
|---|---|
| `group` | `"Group / Subgroup"` — where the round sits in the sidebar tree (product area / design subject). Inherited from `parent` by `STUDIO new`. A separate `"subgroup"` field is also accepted. |
| `title` | Short name of the design subject shown in the rounds list. |
| `question` | The decision the user is making. Shown as the page headline. |
| `context` | One line of extra context under the headline. |
| `kind` | `component` (centred, auto height), `section` (full width, auto height), `page` (fixed viewport, scrolls). Default `component`. |
| `viewports` | The design target, as preset keys; the first is the default view. `auto` (card width, components only), `mobile` (390×844), `tablet` (820×1180), `laptop` (1280×800), `desktop` (1440×900). Sections and pages without it are shown at `laptop`. Inherited from `parent`. The user's viewport choice is remembered per round and never changes this value. |
| `knobs` | Round-wide controls in the Tune panel. Each has `token` (a CSS custom property, set on `scope`, default `:root`) or `attr` (sets `data-<attr>` on `<html>`), a `label`, a `type` (`range` with `min`/`max`/`step`/`unit`, `color`, `select` with `options`, `toggle` with `on`/`off`, `text`) and a starting `value`. Values come back in the decision's `knobs`. |
| `states` | UI states the user can switch from the top bar. The first is the default; the others set `html[data-vs-state="<value>"]`. |
| `content` | Content scenarios (long text, empty, many items…). Same mechanism with `html[data-vs-content="<value>"]`. |
| `checklist` | Acceptance criteria. The user marks pass/fail per variant; results come back as `checklist.passed` / `checklist.failed`. |
| `parent` | Round this one iterates on. Shown as "from #N" and indented in the history. |
| `head` | Extra things injected into fragment variants: `.css` URLs become `<link>`, `.js`/`.mjs` become `<script>`, strings starting with `<` are inserted verbatim. `/p/<path>` serves a file from the project root. |
| `variants[].id` | File name without `.html`. Short ids (`a`, `b`) show as big letters; longer ids (`one-step`) are shown by number. |
| `variants[].label` | Name of the idea. |
| `variants[].notes` | One-sentence rationale or trade-off, shown behind the card's info toggle. |
| `variants[].url` | Render an external page (dev server, Storybook) instead of a file. |

## Automatic includes (fragments only)

1. `scripts/ui/base.css` — reset, canvas, kind layout, `.vs-states`, wireframe helpers.
2. `.variant-studio/brand.json`, when enabled — `--brand-<name>` colors and `--brand-font-heading` / `--brand-font-body` on `:root`. The user edits it in Settings.
3. `.variant-studio/global.css` — project-wide tokens you want in every round.
4. `<round>/_shared.css` — CSS shared by the variants of this round.
5. Everything in `head`.

Files that start with `_` are never treated as variants, so use them for shared assets (`_shared.css`, `_data.js`). Reference images uploaded by the user are stored in `<round>/_refs/`, screenshots sent with a decision in `<round>/_shots/`.

## Server routes (for linking assets)

| Route | Serves |
|---|---|
| `/r/<round>/<file>` | Files inside a round folder (the base URL of fragment variants, so relative paths just work). |
| `/p/<path>` | Files from the project root (`.env*`, `.git`, `.ssh`, `*.pem`, `*.key` are blocked). |
| `/_ui/frame.js` | The preview script (public, so external pages can include it). |
| `/v/<round>/<file>` | A rendered variant. Handy to open one variant alone. |
| `/x/<round>/<file>` | The same variant as a standalone, downloadable HTML file (CSS inlined, no preview script). |

## Other files in `.variant-studio/`

| Path | Content |
|---|---|
| `brand.json` | `{ "enabled": true, "colors": { "primary": "#3b5bdb" }, "fonts": { "heading": "Fraunces", "body": "Inter" } }` |
| `exports/` | Components you write for `export` decisions. |
| `state/inbox/` | The decision queue, one file per decision (`consumed: true` once you read it). |
| `state/votes.json` | Team votes per round and variant. |
| `state/agent.json` | Your presence, shown to the user ("listening", "working"). |
