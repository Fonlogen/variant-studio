# Previewing real framework components

HTML fragments are the fastest way to explore. When the user needs to see the *real* component (React, Vue, Svelte, Angular, Blade, Liquid…), use one of these approaches.

## 1. Compiled CSS + HTML (recommended for exploration)
Build or locate the project's compiled stylesheet and link it: `"head": ["/p/public/build/app.css"]`. Write the variants as plain HTML using the same class names the components output. Fast, no build step per variant, and close to the real result. Then implement the chosen variant as a real component.

## 2. Tailwind via CDN
```json
"head": [
  "<script src=\"https://cdn.tailwindcss.com\"></script>",
  "<script>tailwind.config = { darkMode: 'class', theme: { extend: { colors: { brand: '#1f4dd8' } } } }</script>"
]
```
Copy the `theme.extend` values from the project's `tailwind.config`. The gallery's dark toggle adds the `dark` class, so `dark:` utilities work.

## 3. Storybook
Write each variant as a story (e.g. `ProductCard.variants.stories.tsx` with `VariantA`, `VariantB`…), run Storybook, and point variants at the isolated iframe URLs:
```json
"variants": [
  { "id": "a", "label": "Editorial", "url": "http://localhost:6006/iframe.html?id=productcard-variants--variant-a&viewMode=story" },
  { "id": "b", "label": "Quick buy", "url": "http://localhost:6006/iframe.html?id=productcard-variants--variant-b&viewMode=story" }
]
```
To enable auto-height, element comments and error reporting, add to `.storybook/preview-head.html`:
```html
<script src="http://127.0.0.1:<studio port>/_ui/frame.js"></script>
```

## 4. Dev-server preview route
Add a temporary route (e.g. `/__variants/product-card?v=b`) that renders the variant components, and use URL variants pointing at it. Include `frame.js` in that route's layout as above. Remove the route after the decision.

Without `frame.js`, URL variants still render (fixed height, no element comments).

## Implementing the approved variant
- Map mockup styles to the project's tokens/utilities; do not hardcode values the design system already defines.
- Keep the component's existing API unless the design requires changing it.
- Reproduce every state shown in the variant (`.vs-states` figures).
- After implementing, you may render the real component in a new round (`kind` unchanged, one variant, `--parent`) and ask for a final approval.
