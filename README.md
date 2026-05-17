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

## Headless operation

`--headless` is a global flag for non-interactive automation:

```bash
evictl --headless status
evictl status --headless
evictl --headless monitor --once
```

Headless mode does not imply JSON output or automatic confirmation. It only
removes interactive UI expectations and rejects commands that would wait
indefinitely without an explicit one-shot form. Use command-specific `--json`
flags where available.

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
evictl target add
evictl evi add
evictl evi clone
evictl evi start
evictl evi stop
evictl spawn
evictl monitor
evictl stop
evictl tail
evictl route list
evictl route set
evictl memory status
evictl memory promote
evictl memory search
evictl memory export
evictl memory import
evictl memory sync
evictl sync
evictl send
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
evictl route set telegram:main --target evi-ccc-telegram --account default --mode primary
```

Create another runtime target when a replica has its own launchd plist, tmux
session, or process pattern:

```bash
evictl target add hermes-grok --provider hermes-agent --label ai.hermes.gateway-grok --plist ~/Library/LaunchAgents/ai.hermes.gateway-grok.plist --tmux hermes-grok --process 'hermes_cli.main.*grok'
```

Create another evi identity:

```bash
evictl evi add --provider claude-code-channels --id evi-ccc-research --profile research --workspace /tmp/research --state-dir /tmp/research-state
evictl evi add --provider hermes-agent --id evi-hermes-research --profile research --state-dir ~/.hermes/profiles/research
evictl evi add --provider openclaw --id evi-openclaw-research --profile research --workspace ~/.openclaw/agents/research/agent
```

Create Hermes Agent replicas with explicit inference providers:

```bash
evictl evi add --provider hermes-agent --runtime hermes-grok --id evi-hermes-grok --profile grok --state-dir ~/.hermes/profiles/grok --model-provider grok --model grok-4.3
evictl evi add --provider hermes-agent --id evi-hermes-codex --profile codex --state-dir ~/.hermes/profiles/codex --model-provider codex
evictl evi add --provider hermes-agent --id evi-hermes-llama --profile llama --state-dir ~/.hermes/profiles/llama --model-provider llama.cpp --model local-model --base-url http://127.0.0.1:8080/v1
```

For Hermes Agent, `--model-provider` records the process-level inference
provider. Aliases such as `grok`, `grok-oauth`, and `supergrok` normalize to
`xai-oauth`; `codex` normalizes to `openai-codex`; `llama.cpp` normalizes to
Hermes' `custom` provider. `inspect <evi>` prints the environment that a launchd
plist, tmux wrapper, or one-shot launcher can use:

```bash
evictl inspect evi-hermes-grok
```

`spawn <provider>` remains as a compatibility alias for `evi add`. `evi clone`
creates a new replica entry from an existing evi and records `replica_of`.
`evi start` and `evi stop` operate the configured provider target for an evi.
Fresh runtime-native profile creation is still intentionally adapter-specific:
the inventory records the desired replica, provider, network, workspace,
state dir, agent id, session id, model provider, model, base URL, and runtime
environment, but does not invent provider-specific setup commands.

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
evictl memory search ownership
evictl memory export
evictl memory import
evictl memory sync
evictl sync
```

`memory promote` compiles feedback events from the JSONL event log into
`compiled_notes/feedback.md`.

`memory search` searches the JSONL event log and compiled memory notes. Use
`--json` for machine-readable results.

`memory export` prints the compiled network memory to stdout. `memory import`
is an alias for `memory sync`.

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
evictl tail ccc
evictl tail evi-ccc-telegram --lines 120
```

`tail` reads recent tmux pane output for a configured target or evi.

Send a task:

```bash
evictl send evi-ccc-telegram --text "Run the check suite." --queue-only
evictl send evi-ccc-telegram --text "Run the check suite."
evictl send evi-hermes-nukoevi --toolsets browser,web --max-turns 8 --env BROWSER_CDP_URL=ws://127.0.0.1:9222/devtools/browser/... --text "Search X and summarize whether results are visible."
```

`send` records a task event before dispatch. For evi entries with a tmux
`session_id`, it sends the task into that tmux session. Hermes Agent evis
without a tmux session are delivered with `hermes --profile <profile> chat -q`.
Use `send --env KEY=VALUE` for one-off Hermes CLI environment overrides.
`--queue-only` records the task without delivering it.

Example:

```json
{
  "targets": {
    "ccc": {
      "provider": "claude-code-channels",
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
      "provider": "claude-code-channels",
      "profile": "telegram",
      "agent_id": "",
      "session_id": "",
      "workspace": "~/Documents/claude-code-channels",
      "state_dir": "~/.local/share/claude-telegram-channel",
      "model_provider": "",
      "model": "",
      "base_url": "",
      "env": {}
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
