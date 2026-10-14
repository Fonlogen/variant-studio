<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-on-dark.svg">
    <img src="assets/brand/wordmark-on-light.svg" alt="Variant Studio" width="360">
  </picture>
</p>

<p align="center">Design variants you can see, compare and send back to your coding agent.</p>

Variant Studio is a skill for AI coding agents. Ask for a few versions of a button, a card, a form or a whole page: the agent writes them, they open side by side in your browser, and you choose. You can comment on a single element, rewrite a headline, drag a slider, attach a screenshot you like. The agent gets all of it as JSON and builds the next round, or implements the one you approved.

It works with Claude Code, Codex, Kilo Code, Antigravity, Gemini CLI, Cline, GitHub Copilot, Grok Build, Z Code, OpenCode and any agent that can run Node.js. The skill is called `variant-studio` (`/variant-studio` in Claude Code).

## Install

**Linux / macOS**

```bash
curl -fsSL https://raw.githubusercontent.com/Fonlogen/variant-studio/main/install.sh | bash
```

**Windows** (PowerShell)

```powershell
irm https://raw.githubusercontent.com/Fonlogen/variant-studio/main/install.ps1 | iex
```

Choose your agents from the menu (the ones on your machine are already ticked). Node.js 18 or newer is the only requirement. More options under [Installation](#installation).

To install an older release, add the version (see [Releases](https://github.com/Fonlogen/variant-studio/releases)):

```bash
curl -fsSL https://raw.githubusercontent.com/Fonlogen/variant-studio/main/install.sh | bash -s -- --version 2.0
```
```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Fonlogen/variant-studio/main/install.ps1))) -Version 2.0
```

## How it goes

1. You ask: *"Three versions of the pricing table"*, *"Alternatives for the checkout on mobile"*, *"Show me the empty state of the inbox two ways"*.
2. The agent creates a round, writes the variants and gives you a link.
3. You compare them, select one or more, and leave feedback.
4. You press **Approve**, **Request changes**, **Combine**, **More like this** or **Start over**.
5. The agent reads your decision and continues. It keeps listening while you look, and the studio shows whether it is.

Every round is kept, grouped by product area and subject, with iterations nested under the round they came from.

## What's new in 3.0

**Fixes**
- Requests are queued. Pressing "Request changes" twice in a row no longer loses the first one, and decisions sent while the agent is busy wait for it.
- The agent no longer stops waiting after a few minutes. `present` hands the round over and keeps listening; the studio shows *Agent listening*, *Agent working* or *Agent not listening*.
- Sections and pages no longer show their mobile layout on a desktop round (or the reverse). The viewport is remembered per round, and the agent designs for the round's target width.

**Undo**
- An approval can be undone for 15 seconds: the agent receives it only after that. Other requests can be withdrawn until the agent picks them up.
- An approval can be revoked later. The agent is told, and asks before reverting code it already changed.

**Look**
- A new identity: the split‑V mark, a calm graphite theme with a light alternative, rounded and roomy so the previews get the space.
- English and Italian interface.
- Tooltips on every control, placed wherever there is room.

**Tuning**
- Controls declared by the agent for each round (radius, density, accent…) as sliders, pickers and selects.
- Font picker for headings and body text, applied to every variant.
- Brand palette: your colors and fonts injected into every variant.
- Switches for UI states (loading, empty, error) and content scenarios (long names, no image).
- Lock an element so the next round keeps it as is.
- Acceptance checklist with pass/fail per variant.

**Comparing**
- Grid with a toolbar on each card, and a full-screen view with a filmstrip and arrow keys.
- Overview of every round in a group, or the whole project, as live thumbnails.
- Swipe and overlay compare with a difference blend, and before/after against the previous round.
- A vs B tournament that ranks the variants for you.
- Device frames, synced scrolling, version tree.

**Feedback and sharing**
- Screenshots of what you saw go to the agent with the decision.
- Reference images: paste, drop or attach.
- Voice notes by dictation, saved prompts, quick chips.
- A notification and a sound when new variants are ready.
- Export a variant as PNG, JPG, standalone HTML with your changes applied, or the original HTML. Ask the agent for a React, Vue, Svelte or Tailwind version.
- Team review: teammates on your network open a link and vote, or you send them an offline gallery and import their votes.

## Features

| | |
|---|---|
| Scope | Components, sections and full pages, each with its own preview layout |
| Views | Grid · Full screen · List · Compare (swipe, overlay, tournament, before/after) · Overview · Version tree |
| Viewport | Fit, mobile, tablet, laptop, desktop or custom width, per round; device frames; zoom per card or for all |
| Feedback | Selection, 👍/👎, notes per variant, comments on single elements, locked elements, inline copy edits, token overrides, checklist, reference images, screenshots |
| Tuning | Round controls, fonts, CSS tokens, brand palette, states and content scenarios, light/dark |
| Decisions | Approve · Request changes · Combine · More like this · Start over · Revoke · Ask for a component |
| Agent link | Queued decisions, undo window, presence indicator, `present` / `wait` that never give up on their own |
| Quality | JS errors and an accessibility audit (contrast, touch targets, alt text, labels, overflow) for you and the agent |
| Real stacks | Project CSS via `/p/…`, Tailwind, URL variants from Storybook or your dev server |
| Team | LAN review link with names and votes, or an offline voting gallery |
| Offline | `build` writes a single HTML file; decisions are copied to the clipboard |
| Platforms | One dependency-free Node file on macOS, Linux and Windows |

## Installation

The installer copies (or links) the skill into the agents you choose. Use the one-liners above, or from a clone run `./install.sh`, `.\install.ps1`, or double-click `install.cmd`.

### Supported agents

| Id | Agent | Global folder | Project folder |
|---|---|---|---|
| `claude` | Claude Code | `~/.claude/skills/` | `.claude/skills/` |
| `codex` | Codex | `~/.agents/skills/` | `.agents/skills/` |
| `kilo` | Kilo Code | `~/.kilo/skills/` | `.kilo/skills/` |
| `antigravity` | Google Antigravity | `~/.gemini/antigravity/skills/` | `.agent/skills/` |
| `gemini` | Gemini CLI | `~/.gemini/skills/` | `.gemini/skills/` |
| `cline` | Cline | `~/.cline/skills/` | `.cline/skills/` |
| `copilot` | GitHub Copilot | `~/.copilot/skills/` | `.github/skills/` |
| `grok` | Grok Build | `~/.grok/skills/` | `.grok/skills/` |
| `zcode` | Z Code | `~/.zcode/skills/` | `.zcode/skills/` |
| `opencode` | OpenCode | `~/.config/opencode/skills/` | `.opencode/skills/` |

On Windows `~` is your user folder (`C:\Users\<you>`).

### Installer options

| Bash | PowerShell | |
|---|---|---|
| `--agents claude,codex` | `-Agents claude,codex` | Install for these agents, no menu |
| `--all` | `-All` | Every supported agent |
| `--project [DIR]` | `-Project DIR` | Install into a project (committable) instead of your user profile |
| `--link` | `-Link` | Symlink / junction to your clone, so `git pull` updates every agent |
| `--uninstall` | `-Uninstall` | Remove the skill from the chosen agents |
| `--list` | `-List` | Show agents, paths and what was found |
| `--yes` | `-Yes` | Don't ask for confirmation |
| `--version 2.0` | `-Version 2.0` | Install that release instead of the latest |

With the one-liners:

```bash
curl -fsSL https://raw.githubusercontent.com/Fonlogen/variant-studio/main/install.sh | bash -s -- --agents claude,codex --yes
```
```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Fonlogen/variant-studio/main/install.ps1))) -Agents claude,codex -Yes
```

The installer never overwrites a folder that isn't Variant Studio, and running it again updates an existing install. For agents without skill support, paste `agents-snippet.md` into their instructions file (`AGENTS.md`, `GEMINI.md`, a Cursor rule…) and fix the path.

To try it from any project folder:

```bash
node ~/.claude/skills/variant-studio/scripts/studio.mjs start --project . --open
node ~/.claude/skills/variant-studio/scripts/studio.mjs demo --project .
```

## In the studio

Click a card's letter or press `1`–`9` to select it. Press `C` and click an element to comment on it or lock it, `E` to rewrite text, `I` to open the inspector. Write a note in the bar at the bottom and send with the buttons or `Ctrl/⌘ Enter`. Everything else is in the command palette (`Ctrl/⌘ K`).

| Key | Action |
|---|---|
| `G` `F` `L` `X` | Grid · Full screen · List · Compare |
| `O` · `T` | Overview · Version tree |
| `←` `→` | Previous / next variant; pick a side in the tournament |
| `Z` / `Esc` | Full screen on the active variant / back |
| `+` `−` `0` | Zoom in, out, fit |
| `1`–`9` | Select a variant |
| `C` · `E` · `I` | Comment or lock · Edit text · Inspector |
| `N` · `D` · `U` | All descriptions · Variant light/dark · Studio theme |
| `/` · `R` | Write a note · Rounds panel |
| `Ctrl/⌘ K` | Command palette |
| `Ctrl/⌘ Enter` | Send |

## Team review

- **Same network:** ask the agent to start the studio with `start --team`. The Team panel shows a link; teammates open it, enter their name, vote and comment. Their votes go to the agent with your decision, and your choice still wins.
- **Anywhere:** ask for `build --team` and send the HTML file. Teammates vote offline and download a votes file, which you import from the Team panel.

## Files in your project

Everything lives in `.variant-studio/`, added to `.gitignore` automatically:

```
.variant-studio/
  global.css              optional design-system tokens for every round
  brand.json              your brand palette and fonts (Settings)
  rounds/001-product-card/
    round.json            group, question, kind, viewports, controls, labels and notes
    a.html b.html c.html
    _refs/  _shots/       reference images and screenshots sent with decisions
    decision.json         the latest decision for this round
  exports/                components the agent wrote for you
  state/                  server info, decision queue, votes, logs
```

## Skill layout

```
variant-studio/
  SKILL.md                   instructions for the agent
  agents-snippet.md          the same, short, for AGENTS.md / GEMINI.md
  install.sh  install.ps1  install.cmd
  scripts/studio.mjs         CLI and server, no dependencies
  scripts/ui/                the studio: app.html, app.css, js/, frame.js (runs inside previews), base.css
  references/                round.json schema, platforms, frameworks
  assets/brand/              logo, mark and app icon (SVG)
  assets/demo-round/         sample round
```

Inspired by the Visual Companion in [superpowers](https://github.com/obra/superpowers), written from scratch.
