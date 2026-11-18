# Running the server on different agents

To install the skill itself into one or more agents, use `install.sh` (Linux/macOS) or `install.ps1` / `install.cmd` (Windows) in the skill root; run with `--list` / `-List` to see every supported agent and folder.

The server must stay alive across turns. `STUDIO start` normally detaches it and returns immediately, which works in most harnesses. If your harness kills detached processes when a command ends, run it in the foreground **through the harness's own background mechanism**.

## One server, one session per project
- A single server serves every project on the machine: port 8065 by default, 8066, 8067… if another program holds it. A Variant Studio server already running is reused. `--port N` changes where the search starts.
- `start --project X` opens a session for X. Each session has a 5-character owner PIN and a separate guest PIN (letters and digits without 0, O, 1, I), saved in `<project>/.variant-studio/state/session.json`, so they survive restarts.
- Gallery URL: `http://variant-studio.localhost:<port>/<PIN>`; `http://<host>:<port>/?pin=<PIN>` works too. The root without a PIN shows a PIN form; opened on this computer it also lists the active sessions (project, path, PIN, agent listening, last activity).
- Every gallery route lives under `/<PIN>/` (`/<PIN>/api/state`, `/<PIN>/v/…`). Absolute paths used by the gallery and by variants (`/api/…`, `/p/…`) are routed by the page's `Referer` (and the `vs_pin` cookie as a fallback), so tabs of different projects never mix. A variant opens directly with `/<PIN>?round=<id>&v=<variant>&focus=1`.
- The server listens on all interfaces (`0.0.0.0`) so phones on the same network can use `lan_url`; the PIN is always required. `--host 127.0.0.1` keeps it local.
- `stop` closes the current project's session only; the server exits when none is left (each session also closes after `--idle` minutes, default 240, without activity). `stop --all` lists the sessions and refuses without `--confirm`: ask the user first. The other sessions' galleries show who stopped them and their `wait` returns `{"type":"server-stopping","by":…}`.

## Claude Code
```bash
node <skill>/scripts/studio.mjs start --project "$PWD" --open
```
Default mode works. Run the wait in the background so you are notified when the decision arrives, and loop on exit code 2:
```bash
# Bash tool with run_in_background: true
until node <skill>/scripts/studio.mjs wait --project "$PWD" --timeout 580; [ $? -ne 2 ]; do :; done
```
In the foreground, set the Bash tool `timeout` to 600000 and use `--timeout 580`; on exit 2 run it again straight away.
With subagents enabled, spawn one Agent per variant in a single message; pass `model` from `generation.subagents.model` (`cc_subagent_model`), or omit it on `auto`.
Install the skill in `~/.claude/skills/variant-studio/` (personal) or `.claude/skills/variant-studio/` (project).

## Codex (CLI / IDE)
Install in `.agents/skills/variant-studio/` (per repository) or `~/.agents/skills/variant-studio/` (per user) — the open Agent Skills locations Codex scans. As a fallback, reference it from `AGENTS.md` (see `agents-snippet.md` in the skill root).
Try the default `start` first and check with `status`. If the server is gone on the next command, use:
```bash
node <skill>/scripts/studio.mjs start --project "$PWD" --foreground
```
launched as a background/long-running process of the harness. In sandboxed runs without network or port access, use `build` and ask the user to open `gallery.html`.
Mockup mode is on by default and enforced by `present`: write static HTML designs, not working apps. With subagents enabled, spawn one Codex subagent per variant on the tier in `generation.subagents.model` (`cdx_subagent_model`). If the brief does not detect Codex, pass `--agent codex` to `new`.

## Gemini CLI
```bash
node <skill>/scripts/studio.mjs start --project "$PWD" --open --foreground
```
with `is_background: true` on the shell tool call. If the shared server is already running, `--foreground` only opens the session and exits. Read `.variant-studio/state/server.json` for the URL. Install in `~/.gemini/skills/variant-studio/` or `.gemini/skills/variant-studio/`.

## Copilot CLI / Cursor / Windsurf / others
Use the default `start`. If the harness reaps it, use `--foreground` with the harness's background execution. Cursor reads `.agents/skills/` and `~/.cursor/skills/`; Copilot CLI reads `~/.copilot/skills/`. For agents without skill support, paste `agents-snippet.md` into their instructions file.

## Windows
No bash needed: run the same `node …studio.mjs …` commands from PowerShell or cmd. Detached mode works; the browser opens with `start`.

## Waiting on any agent
`present` and `wait` return after `--timeout` seconds (default 110, safe under most shell limits) with exit code 2 and `{"type":"still-waiting"}`. Run `wait` again immediately and keep going until a decision arrives; never end the turn because of exit 2. The studio shows the user whether you are listening.

## Team review
- Same network: `start` prints `team_url`, the guest link on the LAN (`http://<lan-ip>:<port>/<guest PIN>`). Teammates open it, enter their name, vote and comment; votes go into the decision as `team_votes`.
- Outside the network: `share` (or `start --remote`) opens a Cloudflare quick tunnel and prints `guest_url`, a temporary `https://….trycloudflare.com/<guest PIN>` link. No Cloudflare account is needed. One tunnel serves the whole server, but only sessions that turned sharing on answer through it. `share --stop` closes it for this session; the guest PIN changes, so old links stop working. The user can do the same from the Team panel.
- `GET /<PIN>/api/share` (owner only) returns `{ pin, guest_pin, urls: { local, lan, tunnel }, guest_urls: { local, lan, tunnel }, variant_url_template: "{url}?round={round}&v={variant}&focus=1", remote }` for the QR dialog; `GET /api/qr?text=…` returns the QR code as SVG.
- Anywhere, offline: `build --team` writes a voting gallery. Teammates download a votes file and the user imports it from the Team panel.
- Guests (both `team_url` and `guest_url` carry the guest PIN, never the owner PIN) can view rounds, vote, comment and export images. They cannot send decisions, upload references, change settings or read project files through `/p/` (only CSS, fonts and images).

## User configuration
`~/.variant-studio/config.json` (written by the installer) holds settings for every project:
```json
{
  "remote": { "enabled": true, "cloudflared": "/opt/homebrew/bin/cloudflared" },
  "settings": { "mode": "mockup", "subagents": false, "cc_subagent_model": "auto", "cdx_subagent_model": "auto" },
  "models": { "cdx": { "sol": "<exact model id>" } }
}
```
`settings` are the defaults (`settings --global`); `.variant-studio/settings.json` in a project (Settings → Generation, or `settings`) overrides them. `models` optionally pins exact model ids per tier.
`remote.enabled: false` turns `share` off. `cloudflared` is optional: without it the studio looks in PATH, `~/.variant-studio/bin`, Homebrew and Program Files. A `config.json` inside the skill folder is read too and survives updates.

## Remote machines, containers, WSL
- The server already binds all interfaces; print a reachable host with `start --url-host <hostname-or-ip>`.
- Or forward the port (`ssh -L 8065:127.0.0.1:8065 host`) and open `http://127.0.0.1:8065/<PIN>`.
- If nothing is reachable, `build` writes a static `gallery.html`; decisions are copied to the clipboard as a JSON block that the user pastes into chat.

## Where things are
- `~/.variant-studio/server.json` — the shared server: pid, port, control token (owner-only file), active sessions. `~/.variant-studio/server.log` — server output when detached.
- `.variant-studio/state/session.json` — this project's PIN and guest PIN.
- `.variant-studio/state/server.json` — url, lan_url, port, pin, guest_pin, pid, `team_url`, `remote_url`.
- `.variant-studio/state/notice.json` — set when someone else stopped this session; `wait` returns it once.
- `.variant-studio/state/events.jsonl` — every decision ever sent.
- `.variant-studio/state/inbox/` — the decision queue.
- `.variant-studio/state/errors.jsonl` — preview errors.
