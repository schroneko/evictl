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
evictl stop
evictl route list
evictl memory status
evictl inspect
```

Planned next commands:

```bash
evictl spawn
evictl route set
evictl send
evictl sync
evictl memory search
evictl memory promote
evictl feedback
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

The importer reads launchd setup for Hermes Agent, Claude Code Channels, and
OpenClaw. Running runtimes are imported as `primary` routes; stopped runtimes are
imported as `standby` routes so duplicate Telegram ownership stays visible and
explicit.

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
