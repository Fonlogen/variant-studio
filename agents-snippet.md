<!-- Paste into AGENTS.md / GEMINI.md / a Cursor rule to make non-Claude agents use Variant Studio -->
## Design variants (Variant Studio)

When the user asks for design options, alternatives or mockups of any UI element (from a single button or card to a full page), or when a UI choice would be clearer seen than described, follow `path/to/variant-studio/SKILL.md`:

1. `node path/to/variant-studio/scripts/studio.mjs groups --project .` then `node path/to/variant-studio/scripts/studio.mjs new <slug> --project . --group "Area / Subject" --kind component|section|page --viewports <target> --question "…" --variants a,b,c` (reuse existing group names; iterations use `--parent` and inherit group, kind and viewports).
2. Write each variant to the printed `<round dir>/<id>.html`, fill labels and notes in `round.json`.
3. `node path/to/variant-studio/scripts/studio.mjs present --project .` — give the user the printed URL; the command then waits for the decision.
4. Exit code 2 means "still waiting": run `node path/to/variant-studio/scripts/studio.mjs wait --project .` again right away, until a decision arrives. Do not end your turn while waiting.
5. Act on the decision (`choose` → implement, `revise`/`remix`/`more`/`regenerate` → new round with `--parent`, `unapprove` → stop implementing and ask, `export` → write the component to `.variant-studio/exports/`). Design for `design_target`, not for the width in `viewed_at`.
