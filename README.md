# Variant Studio 2.0

A skill for AI coding agents (Claude Code, Codex, Gemini CLI, Cursor, Copilot CLI…) that generates **design variants of any UI element** — a button, a card, a form, a section or a whole page — shows them in a live browser gallery, and lets you pick, comment, tune and combine them. The agent receives your decision as structured JSON and continues from there.

The skill is installed and invoked as **`variant-studio`** (e.g. `/variant-studio` in Claude Code).

## What's new in 2.0

- **New look**: OLED-black studio (with an optional neutral light theme), squared components, orange accent, English-only UI.
- **Less noise**: compact top bar you can hide (`H`), a centered prompt bar that auto-hides and can be pinned (`P`), descriptions behind an info toggle, every tool reachable from the **command palette** (`Ctrl/⌘ K`).
- **Grouped history**: rounds are organised as *group → subgroup → iterations* (`--group "Checkout / Pay button"`), with filtering and collapsible groups.
- **Approved rounds** open on the approved design; *Show discarded* reveals the other variants so you can reuse them in a new prompt.
- **List layout**: small live thumbnails on the left, the selected variant in detail on the right.
- **In-app expand**: focus one variant full-size inside the studio and go back with `Esc` — no new tabs or windows.
- **Zoom** for all cards (`+` `−` `0`) or for a single card.
- **Live token tweaking**: the Inspector lists the variant's CSS custom properties with color pickers and nudgers; overrides are sent to the agent.
- **Accessibility audit** per variant: contrast, touch targets (mobile/tablet), missing alt text and labels, horizontal overflow.
- **Inline text editing**: rewrite copy directly in the preview; the agent receives the exact text.
- **Reference images**: paste, drop or attach images to the prompt as visual direction.
- **Cross-round shortlist**: star variants from any round, compare them together and send them as a base.
- **Quick chips** for common requests ("More minimal", "Bigger type", "More contrast"…).
- **Export** any variant as standalone HTML or PNG.

## Features

| | |
|---|---|
| Granularity | Components, sections and pages, each with its own preview layout |
| History | Numbered rounds grouped by area and subject; iterations nest under their parent; nothing is overwritten |
| Layouts | Grid · Side by side · One at a time · Swipe compare · List · In-app expand |
| Viewport | Fit / mobile / tablet / laptop / desktop / custom width, global and per-card zoom |
| Theme | Light/dark for the variants + canvas (grey, white, dark, transparent); OLED or light studio |
| Feedback | Multi-select, 👍/👎, per-variant notes, **comments on a single element** (with CSS selector), inline text edits, token overrides, reference images, general note |
| Actions | Approve · Request changes · Combine · Start over · Reuse discarded · Send shortlist |
| Waiting | `wait` blocks until you decide (or read later with `decision`) |
| Live | Only the changed variant reloads; placeholders while the agent writes |
| Quality | JS errors and accessibility issues reported to you and to the agent |
| Real stacks | Project CSS via `/p/…`, Tailwind, URL variants (Storybook / dev server) |
| Platforms | One dependency-free Node file: macOS, Linux, Windows |
| No server | `build` writes a static gallery; decisions are copied to the clipboard |

## Installation

Requires Node.js 18 or newer. Copy the `variant-studio` folder to:

- **Claude Code**: `~/.claude/skills/variant-studio/` (all projects) or `.claude/skills/variant-studio/` (one project).
- **Codex / Cursor**: `.agents/skills/variant-studio/` in the repository or `~/.agents/skills/variant-studio/`.
- **Gemini CLI**: `~/.gemini/skills/variant-studio/`.
- **Other agents**: paste `agents-snippet.md` into `AGENTS.md` (or the agent's instructions file) and fix the path.

Quick check from a project folder:

```bash
node ~/.claude/skills/variant-studio/scripts/studio.mjs start --project . --open
node ~/.claude/skills/variant-studio/scripts/studio.mjs demo --project .
```

## Usage

Ask your agent, for example:

- "Give me 3 variants of the product card for the category page"
- "Show me alternatives for the 'Add to cart' button, with hover and disabled states"
- "Two checkout layouts, on mobile"

In the browser: click a card's letter (or press 1–9) to select it, use 👍/👎, ★ and notes, press **C** and click an element to comment on it, **E** to rewrite text, **I** to tune tokens or read the audit, then send with the prompt bar (or `Ctrl/⌘ Enter`).

### Shortcuts

| Key | Action |
|---|---|
| `G` `S` `F` `X` `L` | Grid · Side by side · One at a time · Compare · List |
| `Z` / `Esc` | Expand the active card / go back |
| `←` `→` | Previous / next variant (one at a time, list, expanded) |
| `+` `−` `0` | Zoom all cards in / out / fit |
| `1`–`9` | Select a variant |
| `C` · `E` · `I` | Comment on element · Edit text · Inspector |
| `N` · `D` | Show all descriptions · Variant light/dark |
| `/` · `P` | Open the prompt · Pin the prompt bar |
| `H` · `R` · `U` | Hide top bar · Toggle sidebar · Studio light/OLED |
| `Ctrl/⌘ K` | Command palette |
| `Ctrl/⌘ Enter` | Send the decision |

## Files created in your project

Everything goes into `.variant-studio/` (added to `.gitignore` automatically when the project is a git repository):

```
.variant-studio/
  global.css            # (optional) your design-system tokens for every round
  rounds/001-product-card/
    round.json          # group, question, kind, variant labels and notes
    a.html b.html c.html
    _refs/              # reference images you attached
    decision.json       # your decision
  state/                # server.json, logs, decision history, errors
```

## Skill layout

```
variant-studio/
  SKILL.md                 instructions for the agent
  agents-snippet.md        text for AGENTS.md / GEMINI.md
  scripts/studio.mjs       CLI + server (zero dependencies)
  scripts/ui/app.html      the studio
  scripts/ui/frame.js      script injected into previews (comments, edits, tokens, audit, export)
  scripts/ui/base.css      base styles for fragments
  references/              round.json schema, platforms, frameworks
  assets/demo-round/       sample round
```

Inspired by the Visual Companion in [superpowers](https://github.com/obra/superpowers), rewritten from scratch.
