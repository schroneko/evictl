# evictl

`evictl` is a local control plane for evi instances: independent agent sessions
that can run in parallel, receive work through messaging channels, and share
distilled memory over time.

The initial runtime adapters are:

- OpenClaw
- Hermes Agent
- Claude Code Channels

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

## Commands

```bash
evictl ps
evictl discover
evictl import
evictl status
evictl doctor
evictl spawn
evictl stop
evictl route list
evictl route set
evictl memory status
evictl memory promote
evictl sync
evictl feedback
evictl inspect
```

Planned next commands:

```bash
evictl send
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
evictl spawn ccc --id evi-ccc-research --profile research --workspace /tmp/research --state-dir /tmp/research-state
```

`spawn` currently creates the isolated evi inventory entry. Runtime-specific
process creation is still planned.

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
evictl sync
```

Both commands compile feedback events from the JSONL event log into
`compiled_notes/feedback.md`. Runtime-native memory writers are still planned,
but the event-to-notes pipeline is available now.

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
      "workspace": "~/Documents/Codex/claude-code-channels",
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
