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
| `viewports` | Preset keys; the first is the default view. `auto`, `mobile` (390×844), `tablet` (820×1180), `laptop` (1280×800), `desktop` (1440×900). |
| `parent` | Round this one iterates on. Shown as "from #N" and indented in the history. |
| `head` | Extra things injected into fragment variants: `.css` URLs become `<link>`, `.js`/`.mjs` become `<script>`, strings starting with `<` are inserted verbatim. `/p/<path>` serves a file from the project root. |
| `variants[].id` | File name without `.html`. Short ids (`a`, `b`) show as big letters; longer ids (`one-step`) are shown by number. |
| `variants[].label` | Name of the idea. |
| `variants[].notes` | One-sentence rationale or trade-off, shown behind the card's info toggle. |
| `variants[].url` | Render an external page (dev server, Storybook) instead of a file. |

## Automatic includes (fragments only)

1. `scripts/ui/base.css` — reset, canvas, kind layout, `.vs-states`, wireframe helpers.
2. `.variant-studio/global.css` — project-wide tokens you want in every round.
3. `<round>/_shared.css` — CSS shared by the variants of this round.
4. Everything in `head`.

Files that start with `_` are never treated as variants, so use them for shared assets (`_shared.css`, `_data.js`). Reference images uploaded by the user are stored in `<round>/_refs/`.

## Server routes (for linking assets)

| Route | Serves |
|---|---|
| `/r/<round>/<file>` | Files inside a round folder (the base URL of fragment variants, so relative paths just work). |
| `/p/<path>` | Files from the project root (`.env*`, `.git`, `.ssh`, `*.pem`, `*.key` are blocked). |
| `/_ui/frame.js` | The preview script (public, so external pages can include it). |
| `/v/<round>/<file>` | A rendered variant. Handy to open one variant alone. |
| `/x/<round>/<file>` | The same variant as a standalone, downloadable HTML file (CSS inlined, no preview script). |
