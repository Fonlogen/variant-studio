<!-- Paste into AGENTS.md / GEMINI.md / a Cursor rule to make non-Claude agents use Variant Studio -->
## Design variants (Variant Studio)

When the user asks for design options, alternatives, mockups or "varianti" of any UI element (from a single button or card to a full page), or when a UI choice would be clearer seen than described, follow `path/to/variant-studio/SKILL.md`:

1. `node path/to/variant-studio/scripts/studio.mjs start --project . --open`
2. `node path/to/variant-studio/scripts/studio.mjs new <slug> --project . --kind component|section|page --question "…" --variants a,b,c`
3. Write each variant to the printed `<round dir>/<id>.html`, fill labels/notes in `round.json`.
4. Give the user the full URL, then `node path/to/variant-studio/scripts/studio.mjs wait --project . --timeout 540`.
5. Act on the decision (`choose` → implement, `revise`/`remix`/`regenerate` → new round with `--parent`).
