# Operations

Use this page for runtime operations after evictl has adopted local engines.
For the complete command list, run `evictl --help`.

## Common Commands

```bash
evictl create
evictl switch
evictl engine list
evictl status
evictl send
```

## Setup Commands

```bash
evictl discover
evictl migration --dry-run
evictl migration
evictl import --dry-run
evictl import
evictl interface bind
evictl channel telegram setup
evictl openclaw setup --dry-run
evictl openclaw setup
```

`openclaw setup` installs or exposes the OpenClaw CLI, creates the baseline
workspace, sets the default model, syncs OpenClaw's OpenAI auth order to the
Codex CLI profile, starts the Gateway launch agent, and adopts the result as
the `evi-openclaw` engine candidate. It does not create Telegram or StackChan
routes. See the README for the option list.

When run from a terminal, `evictl migration` asks for confirmation before
writing config. If two runtimes already own the same channel surface, it asks
which discovered route should become primary. For automation, use `--yes` to
accept the non-destructive config write and `--primary-route <route-key>` to
select the primary route explicitly.

## Runtime Controls

```bash
evictl ps
evictl status
evictl doctor
evictl start claude-code-channels
evictl stop claude-code-channels
evictl restart claude-code-channels
evictl evi start evi-claude-code-channels-demo
evictl evi stop evi-claude-code-channels-demo
evictl evi restart evi-claude-code-channels-demo
evictl channel telegram restart demo
evictl tail claude-code-channels
evictl tail evi-claude-code-channels-demo --lines 120
```

`evi start`, `evi stop`, and `evi restart` operate the configured provider
target for an evi. Use `evictl channel telegram restart <agent>` for a
Claude Code Channels Telegram session restart by AI agent name.

`tail` reads recent tmux pane output for a configured target or evi.

## Engine Handoff

```bash
evictl engine list --agent demo
evictl switch --agent demo --engine hermes-agent
evictl switch --agent demo --engine openclaw
evictl switch --agent demo --engine claude-code-channels
evictl switch --agent demo --engine claude-code-channels --deployment telegram
```

Interfaces such as Telegram, MQTT, CLI, LINE, or Web bind to an AI agent. The
AI agent keeps the same external presence and memory scope while `switch`
changes the inner engine. Use `--deployment` only when the same AI agent has
multiple deployments for one engine.

For Claude Code Channels, `processor launch-plan` renders the channel plugins
from the AI agent's active interfaces:

```bash
evictl switch --agent demo --engine claude-code-channels
evictl processor launch-plan demo
evictl processor launch-plan demo --json
```

## Memory

Record feedback into the shared memory event log:

```bash
evictl feedback evi-claude-code-channels-demo --verdict remember --text "Prefer explicit route ownership."
```

Feedback is appended as JSONL with the target evi, source, verdict, confidence,
subject, and text.

Promote and sync memory:

```bash
evictl memory promote
evictl memory search ownership
evictl memory export
evictl memory sync
evictl sync
```

`memory promote` compiles feedback events from the JSONL event log into
`compiled_notes/feedback.md`.

`memory search` searches the JSONL event log and compiled memory notes. Use
`--json` for machine-readable results.

`memory export` prints the compiled network memory to stdout.

`memory sync` builds `compiled_notes/network.md` from provider memory sources and
writes a managed `evictl:network-memory` section back into provider-visible
sinks:

- Hermes Agent: `<state_dir>/memories/MEMORY.md` and `<state_dir>/memories/USER.md` are sources; `<state_dir>/memories/MEMORY.md` is the managed sink.
- OpenClaw: `<workspace>/MEMORY.md`, `<workspace>/USER.md`, `<workspace>/IDENTITY.md`, `<workspace>/SOUL.md`, `<workspace>/DREAMS.md`, `<workspace>/dreams.md`, and Markdown files under `<workspace>/memory/` are sources; `<workspace>/MEMORY.md` is the managed sink.
- Claude Code Channels: Claude Code reads `CLAUDE.md` files and the configured appended prompt. `evictl` writes `<state_dir>/evictl-network-memory.md` and also updates an existing generated prompt file when present.

`sync` runs both event promotion and network memory sync.

## Monitoring

```bash
evictl monitor --once
evictl monitor --interval 60
```

`monitor` checks all configured targets, starts stopped targets through their
launchd plist when possible, and runs network memory sync after each pass.

## Sending Tasks

```bash
evictl send evi-claude-code-channels-demo --text "Run the check suite." --queue-only
evictl send evi-claude-code-channels-demo --text "Run the check suite."
evictl send demo --text "Run through the active processor."
```

`send` records a task event before dispatch. For evi entries with a tmux
`session_id`, it sends the task into that tmux session. Non-queued sends require
a configured and running tmux session. Identity targets resolve to their active
processor evi before dispatch. `--queue-only` records the task without
delivering it.

## Tailscale Protection

```bash
evictl tailscale protect
```

`tailscale protect` disables known Homebrew autoupdate LaunchAgents and scans
`~/Library/LaunchAgents` for custom Homebrew upgrade agents. It moves matching
plist files into `~/Library/LaunchAgents.disabled`. This prevents background
`brew upgrade` runs from quitting, uninstalling, or replacing `tailscale-app`
while the machine is being used as a remote agent host.

## Safety Model

`evictl` prevents accidental duplicate ownership of the same human-facing
channel, account, peer, or session. Multiple engine deployments are allowed, but
fanout and mirror routes must be explicit.

Shared memory is compiled from provenance-rich events instead of blindly copying
raw transcripts between runtimes.
