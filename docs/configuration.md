# Configuration

`evictl` keeps its own inventory of AI agents, engine deployments, routes, and
memory sync state. The canonical default profile source is shipped with the repository:

```bash
profiles/default/config.json
```

Persona and other portable source files live below `profiles/default/` or the
selected `profiles/<name>/` source directory. Set `EVICTL_PROFILE` to select a
named profile, or set `EVICTL_PROFILE_ROOT` to use a different source checkout.
An explicit `XDG_CONFIG_HOME` or `--config` path takes precedence over the
profile config file.

Writable profile data defaults to `~/.local/share/evictl/profiles/<profile>`. Set
`EVICTL_DATA_ROOT` to replace the parent directory. `${EVICTL_PROFILE_DIR}` is
the source-directory token and `${EVICTL_DATA_DIR}` is the selected writable
profile-data token. The default event log is
`<data-dir>/memory/events.jsonl`, and promoted notes are under
`<data-dir>/memory/`.

Source profiles contain portable persona and configuration defaults only. They
must not contain credentials, tokens, provider sessions, logs, caches,
databases, or personal memory. Runtime state and generated files stay under the
writable data directory and are not symlinked into the source checkout or
installed package. `nukoevi` is an identity/persona inside the default profile,
not a separate named profile.

## Discovery And Adoption

`migration` adopts existing Hermes Agent, OpenClaw, and Claude Code Channels
instances into evictl without converting or deleting provider-native files. It
absorbs runtime differences by recording each instance as an evi, preserving its
native memory location, and mapping any running channel owner as a primary route.
It also preserves provider-owned sessions, logs, credentials, indexes, and
memory stores in place.

Stopped runtimes are kept as processor candidates through their evi entries, but
are not imported as routes. Processor switching keeps only the selected active
processor route, so old processors stay selectable without receiving channel
traffic.

Runtime conversion is not part of `migration`. `switch` changes which adopted
runtime answers for an AI agent. `memory sync` is the separate command that
writes evictl-managed shared memory sections into provider-visible memory sinks.

`import` uses the same discovery and config merge path as `migration`, but keeps
the older compact output for scripts.

## Routes And Interfaces

Manage routes:

```bash
evictl route list
evictl route set telegram:main --target evi-claude-code-channels-demo --account default --mode primary
```

`route set` refuses duplicate `primary` ownership for the same
channel/account/peer unless `--force` is passed.

Create an AI agent, bind interfaces to it, then switch the engine inside it:

```bash
evictl create demo
evictl interface bind telegram:main demo --kind telegram --address main
evictl interface bind discord:main demo --kind discord --address main
evictl interface bind mqtt:demo/inbox demo --kind mqtt --address demo/inbox
evictl engine list --agent demo
evictl engine list --agent demo --json
evictl switch --agent demo --engine hermes-agent
evictl send demo --text "Run from the active processor."
```

## Targets And Evis

Create another runtime target when a replica has its own launchd plist, tmux
session, or process pattern:

```bash
evictl target add hermes-agent-grok --provider hermes-agent --label ai.hermes.gateway-grok --plist ~/Library/LaunchAgents/ai.hermes.gateway-grok.plist --tmux hermes-agent-grok --process 'hermes_cli.main.*grok'
```

Create another engine deployment:

```bash
evictl evi add --provider claude-code-channels --id evi-claude-code-channels-research --profile research --workspace '${EVICTL_DATA_DIR}/claude-code-channels/research/workspace' --state-dir '${EVICTL_DATA_DIR}/claude-code-channels/research'
evictl evi add --provider hermes-agent --id evi-hermes-agent-research --profile research --state-dir '${EVICTL_DATA_DIR}/hermes/research'
evictl evi add --provider openclaw --id evi-openclaw-research --profile research --workspace '${EVICTL_DATA_DIR}/openclaw/research/workspace' --state-dir '${EVICTL_DATA_DIR}/openclaw/research'
```

Create Hermes Agent replicas with explicit inference providers:

```bash
evictl evi add --provider hermes-agent --runtime hermes-agent-grok --id evi-hermes-agent-grok --profile grok --state-dir '${EVICTL_DATA_DIR}/hermes/grok' --model-provider grok --model grok-4.3
evictl evi add --provider hermes-agent --id evi-hermes-agent-codex --profile codex --state-dir '${EVICTL_DATA_DIR}/hermes/codex' --model-provider codex
evictl evi add --provider hermes-agent --id evi-hermes-agent-llama --profile llama --state-dir '${EVICTL_DATA_DIR}/hermes/llama' --model-provider llama.cpp --model local-model --base-url http://127.0.0.1:8080/v1
```

For Hermes Agent, `--model-provider` records the process-level inference
provider. Aliases such as `grok`, `grok-oauth`, and `supergrok` normalize to
`xai-oauth`; `codex` normalizes to `openai-codex`; `llama.cpp` normalizes to
Hermes Agent's `custom` provider.

`inspect <evi>` prints the environment that a launchd plist, tmux wrapper, or
one-shot launcher can use:

```bash
evictl inspect evi-hermes-agent-grok
```

`evi clone` creates a new replica entry from an existing evi and records
`replica_of`.

Fresh runtime-native profile creation is still intentionally adapter-specific:
the inventory records the desired replica, provider, network, workspace, state
dir, agent id, session id, model provider, model, base URL, and runtime
environment, but does not invent provider-specific setup commands.

If OpenClaw has multiple workspaces under `~/.openclaw/agents/*/agent`,
`migration` adopts each workspace as its own OpenClaw evi. Each adopted evi gets
a memory provider policy in config that records native state as preserved and
evictl shared memory as a managed section written only by `memory sync`.

## Example

```json
{
  "targets": {
    "claude-code-channels": {
      "provider": "claude-code-channels",
      "label": "com.local.claude-code-channels",
      "plist": "~/Library/LaunchAgents/com.local.claude-code-channels.plist",
      "tmux_sessions": ["claude-code-channels"],
      "process_patterns": ["claude.*plugin:(telegram|discord)", "demo-(telegram|discord)", "claude-code-channels"],
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
      "workspace": "${EVICTL_DATA_DIR}/claude-code-channels/demo/workspace",
      "state_dir": "${EVICTL_DATA_DIR}/claude-code-channels/demo",
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
    "event_log": "${EVICTL_DATA_DIR}/memory/events.jsonl",
    "compiled_notes": "${EVICTL_DATA_DIR}/memory",
    "provider_policies": {
      "evi-claude-code-channels-demo": {
        "native_state": "preserve",
        "sync_strategy": "managed-section",
        "description": "Claude Code CLAUDE.md and appended prompt memory stay native",
        "sources": [
          "${EVICTL_DATA_DIR}/claude-code-channels/demo/workspace/CLAUDE.md",
          "${EVICTL_DATA_DIR}/claude-code-channels/demo/workspace/.claude/CLAUDE.md",
          "${EVICTL_DATA_DIR}/claude-code-channels/demo/workspace/CLAUDE.local.md",
          "${EVICTL_DATA_DIR}/claude-code-channels/demo/evictl-network-memory.md"
        ],
        "sinks": [
          "${EVICTL_DATA_DIR}/claude-code-channels/demo/evictl-network-memory.md"
        ]
      }
    }
  }
}
```
