# Running the server on different agents

The server must stay alive across turns. `STUDIO start` normally detaches it and returns immediately, which works in most harnesses. If your harness kills detached processes when a command ends, run it in the foreground **through the harness's own background mechanism**.

## Claude Code
```bash
node <skill>/scripts/studio.mjs start --project "$PWD" --open
```
Default mode works. For `wait`, set the Bash tool `timeout` to 600000 and use `--timeout 540`.
Install the skill in `~/.claude/skills/variant-studio/` (personal) or `.claude/skills/variant-studio/` (project).

## Codex (CLI / IDE)
Install in `.agents/skills/variant-studio/` (per repository) or `~/.agents/skills/variant-studio/` (per user) — the open Agent Skills locations Codex scans. As a fallback, reference it from `AGENTS.md` (see `agents-snippet.md` in the skill root).
Try the default `start` first and check with `status`. If the server is gone on the next command, use:
```bash
node <skill>/scripts/studio.mjs start --project "$PWD" --foreground
```
launched as a background/long-running process of the harness. In sandboxed runs without network or port access, use `build` and ask the user to open `gallery.html`.

## Gemini CLI
```bash
node <skill>/scripts/studio.mjs start --project "$PWD" --open --foreground
```
with `is_background: true` on the shell tool call. Read `.variant-studio/state/server.json` for the URL. Install in `~/.gemini/skills/variant-studio/` or `.gemini/skills/variant-studio/`.

## Copilot CLI / Cursor / Windsurf / others
Use the default `start`. If the harness reaps it, use `--foreground` with the harness's background execution. Cursor reads `.agents/skills/` and `~/.cursor/skills/`; Copilot CLI reads `~/.copilot/skills/`. For agents without skill support, paste `agents-snippet.md` into their instructions file.

## Windows
No bash needed: run the same `node …studio.mjs …` commands from PowerShell or cmd. Detached mode works; the browser opens with `start`.

## Remote machines, containers, WSL
- Bind to all interfaces and print a reachable host: `start --host 0.0.0.0 --url-host <hostname-or-ip>`.
- Or forward the port (`ssh -L <port>:127.0.0.1:<port> host`) and keep the default host.
- If nothing is reachable, `build` writes a static `gallery.html`; decisions are copied to the clipboard as a JSON block that the user pastes into chat.

## Where things are
- `.variant-studio/state/server.json` — url, port, key, pid.
- `.variant-studio/state/server.log` — server output when detached.
- `.variant-studio/state/events.jsonl` — every decision ever sent.
- `.variant-studio/state/errors.jsonl` — preview errors.
