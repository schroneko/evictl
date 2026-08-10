# evictl

Japanese: [README.ja.md](README.ja.md)

`evictl` is a local control tool for always-on AI agents. An AI agent keeps the
same external presence, channels, and memory while its inner engine can be
switched between independent agent sessions.

Engines are the execution substrate that can host one or more deployments for an
AI agent. The initial engines are OpenClaw, Hermes Agent, and Claude Code
Channels.

The intended shape is a replicated AI agent control tool: create engine
deployments, route work to them, supervise their liveness, collect feedback and
observations, then distribute distilled memory back to the deployments with
provenance.

## Installation

`evictl` currently targets macOS and requires Bun because the published CLI entry
uses a Bun shebang.

Install the published package. This is the normal installation path:

```bash
bun install -g evictl
```

For local development from this repository checkout, expose the checkout's bin
directly:

```bash
mkdir -p ~/.local/bin
ln -sfn "$(pwd)/bin/evictl" ~/.local/bin/evictl
evictl --help
```

Do not use repeated `bun install -g /path/to/evictl` for local checkout updates.
Bun can duplicate global dependency entries for the same file path. This does
not affect the normal `bun install -g evictl` published-package install.

## Quick Start

Replace `demo` with the AI agent name you want to control.

```bash
evictl create demo
evictl migration --dry-run
evictl migration
evictl engine list --agent demo
evictl switch --agent demo --engine claude-code-channels
evictl status
```

The AI agent name is the outside identity. The engine is the inside runtime that
answers for it.

`migration` adopts existing Hermes Agent, OpenClaw, and Claude Code Channels
instances into the default profile at `profiles/default/config.json`. It does not convert, delete, or
move provider-native files, credentials, sessions, logs, or memory stores.

## Profiles

Profiles are canonical repository data under `profiles/`. The default profile is
`profiles/default/config.json`, and its portable source files live below
`profiles/default/`. Named profile sources use `profiles/<name>/` and can be
selected with `EVICTL_PROFILE`. Set `EVICTL_PROFILE_ROOT` to use another source
checkout. An explicit `XDG_CONFIG_HOME` or `--config` path takes precedence over
the profile config file.

The writable data directory for each profile is
`~/.local/share/evictl/profiles/<profile>`. Set `EVICTL_DATA_ROOT` to replace
`~/.local/share/evictl/profiles`; `${EVICTL_DATA_DIR}` expands to the selected
profile's directory and `${EVICTL_PROFILE_DIR}` expands to its read-only source
directory. Memory events are stored in
`<data-dir>/memory/events.jsonl`, and promoted notes are stored in
`<data-dir>/memory/`.

Profile source files are portable persona and configuration defaults. They must
never contain credentials, tokens, provider sessions, logs, caches, or personal
memory. Runtime state and generated files stay under the writable data directory
and are never symlinked back into the checkout or installed package.

`nukoevi` is the Nukoevi identity/persona inside the default profile. It is not a
separate `EVICTL_PROFILE` named profile.

## Daily Use

After setup, most users only need these commands:

```bash
evictl engine list --agent demo
evictl switch --agent demo --engine claude-code-channels
evictl switch --agent demo --engine hermes-agent
evictl status
```

Send a task to the current engine behind the AI agent:

```bash
evictl send demo --text "Run the check suite."
```

Restart Claude Code Channels Telegram for an AI agent:

```bash
evictl channel telegram restart nukoevi
```

## OpenClaw

OpenClaw setup can be driven from `evictl` without manually linking the
`openclaw` binary:

```bash
evictl openclaw setup
```

The command installs or exposes the OpenClaw CLI at `~/.local/bin/openclaw`,
creates the baseline OpenClaw workspace, sets the default model to
`openai/gpt-5.5`, syncs OpenClaw's OpenAI auth order to the Codex CLI profile
`openai:default`, starts the Gateway launch agent, and adopts the configured
`evi-openclaw-default` engine candidate using its local prefix and workspace. It
does not create Telegram or StackChan
routes, so existing Claude Code Channels routes keep ownership until you switch
an AI agent to OpenClaw.

Codex auth sync is enabled by default. Pass `--no-sync-codex-auth` to skip it,
or `--auth-profile <id>` to choose another OpenClaw auth profile.

Preview the setup without changing files:

```bash
evictl openclaw setup --dry-run --json
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
  --nukoevi-routing
```

For the default config, generated prompts, settings, environment files, and
logs are written below
`~/.local/share/evictl/profiles/default/claude-code-channels/nukoevi`. The
portable persona source is read from
`profiles/default/claude-code-channels/nukoevi/channels-system-prompt.md`.

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
- [README.ja.md](README.ja.md): Japanese translation of this README

`README.md` is the source of truth. When changing `README.md`, update
`README.ja.md` in the same change.

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
