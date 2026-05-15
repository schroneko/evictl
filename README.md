# evictl

`evictl` is a local control plane for evi instances: independent agent sessions
that can run in parallel, receive work through messaging channels, and share
distilled memory over time.

An evi is the always-on AI agent identity. Providers are the execution substrate
that can host one or more evi replicas. When there is only one substrate, the
provider and the evi can look identical, but `evictl` keeps the concepts
separate so the network can clone and supervise replicas across substrates.

The initial providers are:

- OpenClaw
- Hermes Agent
- Claude Code Channels

The intended shape is a replicated evi control plane: create replicas,
route work to them, supervise their liveness, collect feedback and observations,
then distribute distilled memory back to the replicas with provenance.

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

## Commands

```bash
evictl ps
evictl discover
evictl import
evictl status
evictl doctor
evictl evi add
evictl evi clone
evictl spawn
evictl monitor
evictl stop
evictl route list
evictl route set
evictl memory status
evictl memory promote
evictl memory sync
evictl sync
evictl send
evictl feedback
evictl inspect
```

Planned next commands:

```bash
evictl memory search
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
evictl route set telegram:main --target evi-ccc-telegram --account default --mode primary
```

Create another evi identity:

```bash
evictl evi add --provider claude-code-channels --id evi-ccc-research --profile research --workspace /tmp/research --state-dir /tmp/research-state
evictl evi add --provider hermes-agent --id evi-hermes-research --profile research --state-dir ~/.hermes/profiles/research
evictl evi add --provider openclaw --id evi-openclaw-research --profile research --workspace ~/.openclaw/agents/research/agent
```

`spawn <provider>` remains as a compatibility alias for `evi add`. `evi clone`
creates a new replica entry from an existing evi and records `replica_of`.
Provider-specific runtime creation is still adapter work: the inventory now
knows the replica, provider, network, workspace, state dir, agent id, and
session id, but each provider still needs a concrete create/start adapter for
fresh profiles and sessions.

The importer reads launchd setup for Hermes Agent, Claude Code Channels, and
OpenClaw. Running runtimes are imported as `primary` routes; stopped runtimes are
imported as `standby` routes so duplicate Telegram ownership stays visible and
explicit.

`route set` refuses duplicate `primary` ownership for the same
channel/account/peer unless `--force` is passed.

Record feedback into the shared memory event log:

```bash
evictl feedback evi-ccc-telegram --verdict remember --text "Prefer explicit route ownership."
```

Feedback is appended as JSONL with the target evi, source, verdict, confidence,
subject, and text. This is the first shared-memory sink; later sync commands can
compile those events into runtime-native memory stores.

Promote and sync memory:

```bash
evictl memory promote
evictl memory sync
evictl sync
```

`memory promote` compiles feedback events from the JSONL event log into
`compiled_notes/feedback.md`.

`memory sync` builds `compiled_notes/network.md` from provider memory sources and
writes a managed `evictl:network-memory` section back into provider-visible
sinks:

- Hermes Agent: `<state_dir>/memories/MEMORY.md` and `<state_dir>/memories/USER.md` are sources; `<state_dir>/memories/MEMORY.md` is the managed sink.
- OpenClaw: `<workspace>/MEMORY.md`, `<workspace>/USER.md`, and `<workspace>/DREAMS.md` are sources; `<workspace>/MEMORY.md` is the managed sink.
- Claude Code Channels: Claude Code reads `CLAUDE.md` files and the configured appended prompt. `evictl` writes `<state_dir>/evictl-network-memory.md` and also updates an existing generated prompt file when present.

`sync` runs both event promotion and network memory sync.

Supervise configured providers:

```bash
evictl monitor --once
evictl monitor --interval 60
```

`monitor` checks all configured targets, starts stopped targets through their
launchd plist when possible, and runs network memory sync after each pass.

Send a task:

```bash
evictl send evi-ccc-telegram --text "Run the check suite." --queue-only
evictl send evi-ccc-telegram --text "Run the check suite."
```

`send` records a task event before dispatch. For evi entries with a tmux
`session_id`, it sends the task into that tmux session. `--queue-only` records
the task without delivering it.

Example:

```json
{
  "targets": {
    "ccc": {
      "label": "com.local.claude-telegram-channel",
      "plist": "~/Library/LaunchAgents/com.local.claude-telegram-channel.plist",
      "tmux_sessions": ["claude-telegram-channel"],
      "process_patterns": ["claude.*plugin:telegram", "nukoevi-telegram", "claude-telegram-channel"],
      "health_patterns": ["Listening for channel messages from:"]
    }
  },
  "evis": {
    "evi-ccc-telegram": {
      "runtime": "ccc",
      "profile": "telegram",
      "agent_id": "",
      "session_id": "",
      "workspace": "~/Documents/claude-code-channels",
      "state_dir": "~/.local/share/claude-telegram-channel"
    }
  },
  "routes": {
    "telegram:ccc:default": {
      "channel": "telegram",
      "account_id": "default",
      "peer_id": "",
      "target_evi": "evi-ccc-telegram",
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
