---
name: evictl
description: Use when managing evictl, a Bun CLI for orchestrating local evi agent runtimes, routes, Telegram-facing handoff, and shared memory across OpenClaw, Hermes Agent, and Claude Code Channels.
---

# evictl

Use this skill when the user asks to inspect, install, publish, debug, or operate
`evictl`.

## Core workflow

1. Work from the repository root.
2. Use Bun for all project commands.
3. Prefer read-only inspection commands before changing runtime state.
4. Run validation after code or packaging changes.

## Commands

Development checks:

```bash
bun install
bun test
bun run check
bun run build
```

Packaging checks:

```bash
npm pack --json
npm publish --dry-run --access public
npx --yes publint ./evictl-0.1.0.tgz
```

Published install smoke test:

```bash
bunx evictl --help
```

Local runtime inspection:

```bash
evictl ps
evictl discover --json
evictl import --dry-run --json
evictl status
evictl doctor
evictl route list
evictl memory status
```

## Safety rules

- Treat `start`, `stop`, `stop-all`, `use`, `route set --force`, and non-queued
  `send` as runtime-affecting commands.
- Use `--dry-run`, `--json`, or `--queue-only` when validating behavior without
  changing active agent sessions.
- Do not store API keys, Telegram bot tokens, private prompts, or chat ids in
  `~/.config/evictl/config.json`.
- Before publishing, run dependency audit and secret scans.

## Public release checklist

1. Confirm `bun test`, `bun run check`, and `bun run build` pass.
2. Confirm `npm publish --dry-run --access public` has no package correction
   warnings.
3. Confirm a tarball install exposes the `evictl` bin.
4. Confirm `bun audit`, `detect-secrets`, and explicit token regex scans are
   clean.
5. Publish with `npm publish --access public`.
6. Verify `bunx evictl --help` works against the published package.
