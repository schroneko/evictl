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
evictl status
evictl doctor
evictl spawn
evictl stop
evictl route list
evictl route set
evictl send
evictl sync
evictl memory search
evictl memory promote
evictl feedback
evictl inspect
```

## Configuration

`evictl` keeps its own inventory of runtime adapters, evi identities, routes, and
memory sync state. Override defaults with:

```bash
~/.config/evictl/config.json
```

Example:

```json
{
  "runtimes": {
    "openclaw": {
      "profiles": ["default", "rescue"],
      "base_port": 18789
    }
  },
  "routes": {
    "telegram:main": {
      "channel": "telegram",
      "account_id": "main",
      "target_evi": "evi-main",
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
