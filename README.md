# evictl

Japanese: [README.ja.md](README.ja.md)

`evictl` is a local control plane for always-on AI characters. A character keeps
the same external presence, channels, and memory while its inner engine can be
switched between independent agent sessions.

Engines are the execution substrate that can host one or more deployments for a
character. The initial engines are OpenClaw, Hermes Agent, and Claude Code
Channels.

The intended shape is a replicated character control plane: create engine
deployments, route work to them, supervise their liveness, collect feedback and
observations, then distribute distilled memory back to the deployments with
provenance.

## Installation

`evictl` currently targets macOS and requires Bun because the published CLI entry
uses a Bun shebang.

Install the published package:

```bash
bun install -g evictl
```

Install the latest local checkout:

```bash
mkdir -p ~/.local/bin
ln -sfn /Users/username/ghq/github.com/schroneko/evictl/bin/evictl ~/.local/bin/evictl
evictl --help
```

Avoid repeated `bun install -g /path/to/evictl` for local checkout updates
because Bun can duplicate global dependency entries for the same file path. Keep
`~/.local/bin` on `PATH`.

## Quick Start

Replace `demo` with the character name you want to control.

```bash
evictl create demo
evictl migration --dry-run
evictl migration
evictl engine list --character demo
evictl switch --character demo --engine claude-code-channels
evictl status
```

The character name is the outside personality. The engine is the inside that
answers for it.

`migration` adopts existing Hermes Agent, OpenClaw, and Claude Code Channels
instances into `~/.config/evictl/config.json`. It does not convert, delete, or
move provider-native files, credentials, sessions, logs, or memory stores.

## Daily Use

After setup, most users only need these commands:

```bash
evictl engine list --character demo
evictl switch --character demo --engine claude-code-channels
evictl switch --character demo --engine hermes-agent
evictl status
```

Send a task to the current engine behind the character:

```bash
evictl send demo --text "Run the check suite."
```

Restart Claude Code Channels Telegram for a character:

```bash
evictl channel telegram restart nukoevi
```

Generic runtime controls are also available:

```bash
evictl evi restart evi-claude-code-channels-nukoevi
evictl restart claude-code-channels
```

For the complete command list, run:

```bash
evictl --help
```

## Claude Code Channels

Claude Code Channels can be generated from evictl without storing Telegram
tokens, chat IDs, or local memory in the repository.

Inspect the generated runtime first:

```bash
evictl channel telegram setup nukoevi \
  --channel telegram \
  --channel stackchan \
  --plugin-dir ~/ghq/github.com/schroneko/stackchan-nukoevi/channels/stackchan \
  --nukoevi-routing \
  --dry-run \
  --json
```

Apply an existing launchd label and managed runtime paths:

```bash
evictl channel telegram setup nukoevi \
  --channel telegram \
  --channel stackchan \
  --plugin-dir ~/ghq/github.com/schroneko/stackchan-nukoevi/channels/stackchan \
  --nukoevi-routing \
  --state-dir ~/.local/share/claude-telegram-channel \
  --label com.local.claude-telegram-channel \
  --plist-path ~/Library/LaunchAgents/com.local.claude-telegram-channel.plist
```

The generated `start.sh` is a launchd watchdog. When the tmux session already
exists, it normally leaves it alone, but it restarts Claude Code Channels after
`CLAUDE_CODE_CHANNELS_MAX_SESSION_SECONDS` seconds to avoid stale channel
polling sessions that still have a live process. The default is `21600` seconds.
Set it to `0` with `--env CLAUDE_CODE_CHANNELS_MAX_SESSION_SECONDS=0` to disable
the timed restart.

## Documentation

- [docs/operations.md](docs/operations.md): runtime operations, automation,
  memory sync, and safety model
- [docs/configuration.md](docs/configuration.md): inventory model and example
  config
- [docs/research-notes.md](docs/research-notes.md): research notes
- [README.ja.md](README.ja.md): Japanese operational guide

The Japanese guide is intentionally not a line-by-line translation. Keep it as a
short operational guide and treat `evictl --help` plus the English docs as the
command reference.

## Development

```bash
bun install
bun test
bun run check
bun run build
```

Run the CLI directly during development:

```bash
bun run src/cli.ts ps
```

`--headless` is a global flag for automation:

```bash
evictl --headless status
evictl status --headless
evictl --headless monitor --once
```

Headless mode does not imply JSON output or automatic confirmation. It rejects
commands that would wait indefinitely without an explicit one-shot form. Use
command-specific `--json` flags where available.

The repository includes an Agent Skill at `skills/evictl`.
