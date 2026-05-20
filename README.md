# evictl

`evictl` is a local control plane for always-on AI characters. A character keeps
the same external presence, channels, and memory while its inner engine can be
switched between independent agent sessions.

Engines are the execution substrate that can host one or more deployments for a
character. When there is only one engine, the character and the engine can look
identical, but `evictl` keeps the concepts separate so the character can move
between engines without changing its channels or memory.

The initial engines are:

- OpenClaw
- Hermes Agent
- Claude Code Channels

The intended shape is a replicated character control plane: create engine
deployments, route work to them, supervise their liveness, collect feedback and
observations, then distribute distilled memory back to the deployments with
provenance.

Research notes: [docs/research-notes.md](docs/research-notes.md)

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

## Automation

`--headless` is a global flag for automation:

```bash
evictl --headless status
evictl status --headless
evictl --headless monitor --once
```

Headless mode does not imply JSON output or automatic confirmation. It rejects
commands that would wait indefinitely without an explicit one-shot form. Use
command-specific `--json` flags where available.

## Installation

`evictl` currently targets macOS and requires Bun because the published CLI entry
uses a Bun shebang.

```bash
bunx evictl --help
bun install -g evictl
```

For local development:

```bash
bun link
evictl --help
```

## Agent Skill

The repository includes an Agent Skill at `skills/evictl`.

Install or vendor it with your agent skill manager, then invoke it when managing
local evi instances, routes, runtime handoff, or shared memory with `evictl`.

## Quick Start

These are the commands a first-time user should copy and adjust:

```bash
evictl create demo
evictl import --dry-run
evictl import
evictl engine list --character demo
evictl switch --character demo --engine claude-code-channels
evictl status
```

The character name is the outside personality. The engine is the inside that
answers for it.

```bash
evictl switch --character demo --engine hermes-agent
evictl switch --character demo --engine openclaw
evictl switch --character demo --engine claude-code-channels
```

If one engine has multiple deployments for the same character, choose one:

```bash
evictl switch --character demo --engine claude-code-channels --deployment telegram
```

Every setup step is explicit and repeatable. Commands never stop to ask questions.

## Commands

Common commands:

```bash
evictl create
evictl switch
evictl engine list
evictl status
evictl send
```

Setup commands:

```bash
evictl discover
evictl import
evictl interface bind
```

Advanced commands:

```bash
evictl ps
evictl doctor
evictl target add
evictl evi add
evictl evi clone
evictl evi start
evictl evi stop
evictl identity list
evictl identity show
evictl identity add
evictl identity bind
evictl interface list
evictl processor list
evictl processor switch
evictl processor launch-plan
evictl monitor
evictl stop
evictl tail
evictl route list
evictl route set
evictl memory status
evictl memory promote
evictl memory search
evictl memory export
evictl memory sync
evictl sync
evictl feedback
evictl inspect
```

## Configuration

`evictl` keeps its own inventory of runtime adapters, evi identities, routes, and
memory sync state. Override defaults with:

```bash
~/.config/evictl/config.json
```

Import the current local setup:

```bash
evictl discover
evictl import --dry-run
evictl import
```

Manage routes:

```bash
evictl route list
evictl route set telegram:main --target evi-claude-code-channels-demo --account default --mode primary
```

Create a character, bind interfaces to it, then switch the engine inside it:

```bash
evictl create demo
evictl interface bind telegram:main demo --kind telegram --address main
evictl interface bind discord:main demo --kind discord --address main
evictl interface bind mqtt:demo/inbox demo --kind mqtt --address demo/inbox
evictl engine list --character demo
evictl engine list --character demo --json
evictl switch --character demo --engine hermes-agent
evictl send demo --text "Run from the active processor."
```

Interfaces such as Telegram, MQTT, CLI, LINE, or Web bind to a character. The
character keeps the same external presence and memory scope while `switch`
changes the inner engine. Use `--deployment` only when the same character has
multiple deployments for one engine.

For Claude Code Channels, `processor launch-plan` renders the channel plugins
from the character's active interfaces:

```bash
evictl switch --character demo --engine claude-code-channels
evictl processor launch-plan demo
evictl processor launch-plan demo --json
```

Create another runtime target when a replica has its own launchd plist, tmux
session, or process pattern:

```bash
evictl target add hermes-agent-grok --provider hermes-agent --label ai.hermes.gateway-grok --plist ~/Library/LaunchAgents/ai.hermes.gateway-grok.plist --tmux hermes-agent-grok --process 'hermes_cli.main.*grok'
```

Create another engine deployment:

```bash
evictl evi add --provider claude-code-channels --id evi-claude-code-channels-research --profile research --workspace /tmp/research --state-dir /tmp/research-state
evictl evi add --provider hermes-agent --id evi-hermes-agent-research --profile research --state-dir ~/.hermes/profiles/research
evictl evi add --provider openclaw --id evi-openclaw-research --profile research --workspace ~/.openclaw/agents/research/agent
```

Create Hermes Agent replicas with explicit inference providers:

```bash
evictl evi add --provider hermes-agent --runtime hermes-agent-grok --id evi-hermes-agent-grok --profile grok --state-dir ~/.hermes/profiles/grok --model-provider grok --model grok-4.3
evictl evi add --provider hermes-agent --id evi-hermes-agent-codex --profile codex --state-dir ~/.hermes/profiles/codex --model-provider codex
evictl evi add --provider hermes-agent --id evi-hermes-agent-llama --profile llama --state-dir ~/.hermes/profiles/llama --model-provider llama.cpp --model local-model --base-url http://127.0.0.1:8080/v1
```

For Hermes Agent, `--model-provider` records the process-level inference
provider. Aliases such as `grok`, `grok-oauth`, and `supergrok` normalize to
`xai-oauth`; `codex` normalizes to `openai-codex`; `llama.cpp` normalizes to
Hermes Agent's `custom` provider. `inspect <evi>` prints the environment that a launchd
plist, tmux wrapper, or one-shot launcher can use:

```bash
evictl inspect evi-hermes-agent-grok
```

`evi clone` creates a new replica entry from an existing evi and records
`replica_of`.
`evi start` and `evi stop` operate the configured provider target for an evi.
Fresh runtime-native profile creation is still intentionally adapter-specific:
the inventory records the desired replica, provider, network, workspace,
state dir, agent id, session id, model provider, model, base URL, and runtime
environment, but does not invent provider-specific setup commands.

The importer reads launchd setup for Hermes Agent, Claude Code Channels, and
OpenClaw. Running runtimes are imported as `primary` routes. Stopped runtimes are
kept as processor candidates through their evi entries, but are not imported as
routes. Processor switching keeps only the selected active processor route, so
old processors stay selectable without receiving channel traffic.

`route set` refuses duplicate `primary` ownership for the same
channel/account/peer unless `--force` is passed.

Record feedback into the shared memory event log:

```bash
evictl feedback evi-claude-code-channels-demo --verdict remember --text "Prefer explicit route ownership."
```

Feedback is appended as JSONL with the target evi, source, verdict, confidence,
subject, and text. This is the first shared-memory sink; later sync commands can
compile those events into runtime-native memory stores.

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

Supervise configured providers:

```bash
evictl monitor --once
evictl monitor --interval 60
```

`monitor` checks all configured targets, starts stopped targets through their
launchd plist when possible, and runs network memory sync after each pass.

Read recent runtime output:

```bash
evictl tail claude-code-channels
evictl tail evi-claude-code-channels-demo --lines 120
```

`tail` reads recent tmux pane output for a configured target or evi.

Protect Tailscale from background Homebrew cask upgrades:

```bash
evictl tailscale protect
```

`tailscale protect` disables the known Homebrew autoupdate LaunchAgents and
moves their plist files into `~/Library/LaunchAgents.disabled`. This prevents
background `brew upgrade` runs from uninstalling or replacing `tailscale-app`
while the machine is being used as a remote agent host.

Send a task:

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

Example:

```json
{
  "targets": {
    "claude-code-channels": {
      "provider": "claude-code-channels",
      "label": "com.local.claude-code-channels",
      "plist": "~/Library/LaunchAgents/com.local.claude-code-channels.plist",
      "tmux_sessions": ["claude-code-channels"],
      "process_patterns": ["claude.*plugin:(telegram|discord|fakechat)", "demo-(telegram|discord)", "claude-code-channels"],
      "health_patterns": ["Listening for channel messages from:"]
    }
  },
  "evis": {
    "evi-claude-code-channels-demo": {
      "runtime": "claude-code-channels",
      "provider": "claude-code-channels",
      "profile": "demo",
      "agent_id": "",
      "session_id": "",
      "workspace": "~/Documents/claude-code-channels",
      "state_dir": "~/.local/share/claude-code-channels",
      "model_provider": "",
      "model": "",
      "base_url": "",
      "env": {}
    }
  },
  "identities": {
    "demo": {
      "profile": "demo",
      "memory_scope": "demo",
      "active_evi": "evi-claude-code-channels-demo",
      "description": ""
    }
  },
  "interfaces": {
    "telegram:main": {
      "kind": "telegram",
      "address": "main",
      "identity_id": "demo",
      "mode": "primary"
    },
    "discord:main": {
      "kind": "discord",
      "address": "main",
      "identity_id": "demo",
      "mode": "primary"
    }
  },
  "routes": {
    "telegram:claude-code-channels:demo": {
      "channel": "telegram",
      "account_id": "default",
      "peer_id": "",
      "target_evi": "evi-claude-code-channels-demo",
      "mode": "primary"
    },
    "discord:claude-code-channels:demo": {
      "channel": "discord",
      "account_id": "default",
      "peer_id": "",
      "target_evi": "evi-claude-code-channels-demo",
      "mode": "primary"
    }
  },
  "memory": {
    "event_log": "~/.local/share/evictl/events.jsonl",
    "compiled_notes": "~/.local/share/evictl/memory"
  }
}
```

## Safety Model

`evictl` prevents accidental duplicate ownership of the same human-facing
channel, account, peer, or session. Multiple evi instances are allowed, but
fanout and mirror routes must be explicit.

Shared memory is compiled from provenance-rich events instead of blindly copying
raw transcripts between runtimes.
