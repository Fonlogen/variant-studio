# Decisions (date · decision · why)
- 2026-11-18 · TUI prompts show the real user/host only to the owner on this network (server injects `who` into the shell config); guests, tunnel viewers and exports get user/host · the name must not leak outside the machine
2026-11-18 · 4.0: one shared server on 8065 (+1 if busy), one session per project, each with its own stable 5-char PIN (owner) + guest PIN; /PIN and ?pin= both work; no rate limit (user choice) · multiple agents/projects at once
2026-11-18 · Phone via QR: LAN IP by default (bind 0.0.0.0), toggle to cloudflared tunnel; modal lets you pick owner or guest · 127.0.0.1 unreachable from phone
2026-11-18 · Name: http://variant-studio.localhost:8065 (no hosts/sudo/certs). No PIN → PIN screen; from localhost also list active sessions
2026-11-18 · stop = detach own session; server exits when none left. stop --all lists sessions and needs --confirm after asking the user; others notified in gallery + wait
2026-11-18 · Design mode per round: ui | component | tui | logo; shown in top bar. TUI shell JS is ours (typing allowed), variants stay static
2026-11-18 · TUI fonts: CDN Nerd Fonts + local PC fonts. Wallpaper: project .variant-studio/wallpaper.* else bundled default (generated once, committed)
2026-11-18 · Logo mode: export SVG/PNG/ICO sets, usage previews, palette/font helpers, OpenAI gpt-image raster
2026-11-18 · Export: single html (all inlined) | split index.html/style.css/script.js | shared style separate
2026-11-18 · UI: real Fullscreen API, page variants 100vh, user-resizable grid cards, variant background picker (light/dark/gray/…), reorganized sidebar+toolbar; split studio.mjs into modules
2026-11-18 · Design mode "app" (android|ios): template with CSS phone frame (bezel, notch/island/punch-hole, status bar, home indicator), skin picker in top bar: iPhone 8, iPhone X, iPhone 18; Pixel + Samsung Galaxy lines. Frames drawn in CSS, no vendor images. iPhone 18 specs post-cutoff: verify online before drawing
2026-11-18 · Android skins: Pixel 3, Pixel 6, Pixel 8, Pixel 10 Pro, Galaxy S25, Galaxy S25 Ultra
2026-11-18 · Design picks: PIN screen = 004/b (PIN + sessions list; fix 3.88:1 contrast on path/last-activity). TUI shell = 005/a acrylic default, b/c selectable per variant AND globally for comparison; terminal slightly larger, chrome smaller. Phone frames = 006/a realistic default, b/c selectable (fix sample-app contrast)
2026-11-18 · QR = 003/c popover anchored to the QR button (fix: arrow barely visible on dark top bar)
2026-11-18 · Layout direction = 007/c "Prompt integrato" (slim in-layout prompt). Studio default theme DARK. Prompt must be hideable. Try orange default accent (round 010)
2026-11-18 · Design mode "desktop": CSS OS window frames, skins Win XP, Win 7, Win 8/10, Win 11, Ubuntu GNOME, KDE Plasma, macOS; window size presets; optional "mostra desktop" (taskbar/dock/panel). No vendor logos
2026-11-18 · macOS desktop skins: current + Aqua (10.0–10.4), Leopard (10.5–10.9), Yosemite (10.10–10.15)
2026-11-18 · 010/a pill + #ff8a3d. Grid cards keep natural height (as 3.5), only fullscreen takes full height. Sidebar rows not rounded. Pill shows current dock actions by default; "Scrivi all agente" expands it
2026-11-18 · Logo = 001/a "V divisa" (approved; 009 V+S not chosen). Open: logo accent lilac #8b9cff vs new orange UI accent
2026-11-18 · Layout APPROVED = 011/a: dark default, accent #ff8a3d (dark ink on it), 007/c structure, prompt pill bottom-right with current dock actions, "Scrivi all agente" expands a panel upward; grid cards natural height; flat sidebar rows with left accent bar
2026-11-18 · TUI shells add: plain (opaque black), Ubuntu default, CMD, PowerShell, Windows Terminal. Mode controls (shell/skin/frame/OS/size) must be grouped in ONE expandable control (grouped popover), not a row of selects
