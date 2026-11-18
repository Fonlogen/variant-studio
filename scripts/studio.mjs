#!/usr/bin/env node
// Variant Studio — zero-dependency design-variant previewer for coding agents (version: lib/config.mjs).
// Node >= 18. Works on macOS, Linux, Windows. No bash required. One shared server (port 8065) serves every project.
//
//   node studio.mjs start    [--project DIR] [--open] [--remote] [--foreground] [--port N] [--host H] [--url-host H] [--idle MIN]
//   node studio.mjs new      <slug> [--group "Area/Sub"] [--title T] [--question Q] [--kind component|section|page] [--variants a,b,c] [--viewports mobile,desktop] [--parent ID]
//   node studio.mjs present  [--round ID] [--timeout SEC]     hand the round to the user, then wait for the decision
//   node studio.mjs wait     [--round ID] [--timeout SEC]     wait for the next decision (exit 2 = still waiting, run again)
//   node studio.mjs decision [--round ID]
//   node studio.mjs settings [--mode mockup|prototype] [--subagents on|off] [--cc-subagent-model M] [--cdx-subagent-model M] [--global]
//   node studio.mjs stop     [--all [--confirm]]
//   node studio.mjs status | list | groups | inbox | open | errors | share [--stop] | build [--out FILE] [--team] | demo
//
// Modules (lib/): cli (commands), client (registry + control calls), server (shared HTTP server, sessions, PIN routing),
// project (paths, PINs, agent heartbeat), rounds, decisions, render, generation, tunnel, qr, pinpage, export, config, util.

import { run } from './lib/cli.mjs';

await run(process.argv.slice(2));
