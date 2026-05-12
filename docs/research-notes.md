# evictl research notes

Date: 2026-05-12

## Working understanding

`evictl` is not a simple process switcher. It is an orchestrator for multiple independent evi instances.

Each evi can run as a separate session, agent, gateway profile, or harness instance. They work independently, then feed observations, feedback, and durable lessons into a shared knowledge layer. The goal is a network of clone-like agents that can diverge in context while gradually converging in learned memory.

Initial supported runtimes:

- OpenClaw
- Hermes Agent
- Claude Code Channels

## Sources read

- `~/ghq/github.com/openclaw/openclaw/README.md`
- `~/ghq/github.com/openclaw/openclaw/docs/concepts/session.md`
- `~/ghq/github.com/openclaw/openclaw/docs/concepts/multi-agent.md`
- `~/ghq/github.com/openclaw/openclaw/docs/concepts/session-tool.md`
- `~/ghq/github.com/openclaw/openclaw/docs/concepts/memory.md`
- `~/ghq/github.com/openclaw/openclaw/docs/concepts/active-memory.md`
- `~/ghq/github.com/openclaw/openclaw/docs/gateway/architecture.md`
- `~/ghq/github.com/openclaw/openclaw/docs/gateway/configuration.md`
- `~/ghq/github.com/openclaw/openclaw/docs/gateway/health.md`
- `~/ghq/github.com/openclaw/openclaw/docs/gateway/multiple-gateways.md`
- `~/ghq/github.com/openclaw/openclaw/docs/gateway/protocol.md`
- `~/ghq/github.com/openclaw/openclaw/docs/tools/subagents.md`
- `~/ghq/github.com/openclaw/openclaw/docs/tools/agent-send.md`
- `~/ghq/github.com/openclaw/openclaw/docs/tools/acp-agents.md`
- `~/ghq/github.com/NousResearch/hermes-agent/README.md`
- `~/ghq/github.com/NousResearch/hermes-agent/gateway/run.py`
- `~/ghq/github.com/NousResearch/hermes-agent/gateway/session.py`
- `~/ghq/github.com/NousResearch/hermes-agent/gateway/platform_registry.py`
- `~/ghq/github.com/NousResearch/hermes-agent/gateway/channel_directory.py`
- `~/ghq/github.com/NousResearch/hermes-agent/agent/memory_provider.py`
- `~/ghq/github.com/NousResearch/hermes-agent/agent/insights.py`
- `~/ghq/github.com/NousResearch/hermes-agent/skills/software-development/subagent-driven-development/SKILL.md`
- `https://code.claude.com/docs/en/channels-reference`

## OpenClaw findings

OpenClaw is already close to an evi host model:

- A Gateway is the control plane for messaging surfaces and local nodes.
- Multiple agents can run side by side in one Gateway.
- Each agent has its own workspace, `agentDir`, auth profiles, model registry, session store, and memory.
- Bindings route inbound channel/account/peer combinations to a target agent.
- Routing is deterministic, with specific peer/thread/account bindings winning over broad channel defaults.
- Multiple channel accounts are first-class, including Telegram bot accounts and WhatsApp numbers.
- Separate Gateways are recommended only when stronger isolation or rescue-bot redundancy is needed.
- Separate Gateways must not share config, state dir, workspace root, base port, browser ports, or credentials.
- Session tools let agents list sessions, read bounded session history, send inter-session messages, spawn subagents, yield for results, and inspect status.
- Inter-session messages are explicitly marked as inter-session data, not direct user-authored instructions.
- Subagents are isolated by default. Forking context is opt-in.
- Subagent completion should be treated as report/evidence, not as authority.
- ACP can run external harnesses such as Claude Code, Codex, Gemini CLI, OpenCode, and OpenClaw itself.
- ACP sessions have separate keys from native subagents and can be bound to chat conversations or threads.
- Memory is file-backed by default: `MEMORY.md`, daily `memory/YYYY-MM-DD.md`, optional `DREAMS.md`.
- Durable memory is meant to be curated and compact, while daily notes hold working context.
- Active Memory is a bounded pre-reply memory subagent that injects relevant recall into eligible sessions.
- Health checks distinguish stored session rows from live provider/channel connectivity.

Design implication for `evictl`: OpenClaw should be treated as a multi-agent runtime adapter, not just a single process. `evictl` needs to manage agents, bindings, channel accounts, health, memory export/import, and optional Gateway profiles.

## Hermes Agent findings

Hermes Agent is a self-improving agent runtime with a strong learning loop:

- It has a built-in messaging Gateway for Telegram, Discord, Slack, WhatsApp, Signal, CLI, cron, and plugin platforms.
- Gateway sessions carry structured origin metadata: platform, chat id, chat type, user id, thread id, guild id, message id, and derived session key.
- The session context is injected into the system prompt so the agent knows which platform and conversation it is in.
- `gateway/run.py` caches agents and expires idle gateway sessions, so one Gateway can host multiple live conversation contexts.
- Platform adapters are registered through a `PlatformRegistry` with health checks, validation, allowed-user env vars, message limits, PII-safe metadata, delivery env vars, and standalone sender support.
- `channel_directory.json` is a cached map of reachable channels and session-discovered contacts.
- Memory providers have lifecycle hooks for initialize, prefetch, sync after turn, session end, session switch, pre-compression extraction, memory write mirroring, and parent-side observation of subagent work.
- Only one external memory provider is active at a time, preventing conflicting schemas and tool bloat.
- Subagent results can flow into the parent memory provider through `on_delegation`, while subagents can skip memory writes.
- The subagent workflow emphasizes fresh context per task and review before accepting the result.
- Insights are computed from stored sessions, messages, tools, skills, models, platforms, cost, and activity patterns.

Design implication for `evictl`: Hermes should be treated as a runtime with native memory hooks and platform adapters. Its memory-provider lifecycle is a good shape for `evictl` shared memory sinks.

## Claude Code Channels findings

Claude Code Channels are not a general multi-agent orchestrator by themselves:

- A channel is an MCP server spawned by Claude Code over stdio.
- The channel declares the `claude/channel` capability and pushes `notifications/claude/channel` events.
- Events arrive in the Claude Code session as `<channel ...>` tags.
- A two-way channel exposes a normal MCP reply tool.
- Inbound messages must be gated by sender identity, not only by room or chat id.
- Notifications are not acknowledged as processed; the send call only confirms writing to transport.
- If several notifications arrive while Claude is busy, they queue into the same session and are handled together on the next turn.
- The official docs say independent event streams should use separate sessions.
- Permission relay is optional and requires a trusted sender path.
- Permission replies carry a short request id and are applied only if the id matches an open prompt.
- Channel plugins can be packaged and enabled per session.

Design implication for `evictl`: Claude Code Channels should be an evi endpoint adapter. For parallel evi clones, `evictl` needs to start or bind multiple Claude Code sessions instead of pushing all Telegram traffic into one session.

## Core design constraints

### Identity

Every evi needs a stable id independent from the runtime's local ids.

Suggested internal identity fields:

- `evi_id`
- `runtime`: `openclaw`, `hermes`, or `claude-code-channels`
- `profile`
- `agent_id`
- `session_id`
- `channel`
- `account_id`
- `peer_id`
- `workspace`
- `state_dir`

### Isolation

Do not share runtime state directories casually.

OpenClaw warns against reusing `agentDir` across agents. Multiple Gateways require isolated state, ports, and credentials. Claude Code Channels process events inside one Claude Code session, so parallelism requires separate sessions. Hermes can cache multiple sessions, but memory writes still need scope and provenance.

### Routing

Routing should be explicit and inspectable.

`evictl` should model routes as:

- inbound surface: channel, account, peer, thread/topic
- target evi
- binding kind: primary, mirror, shadow, review, rescue
- exclusivity: one owner vs fanout

Default behavior should prevent two active owners from replying to the same human-facing channel unless fanout is explicitly configured.

### Memory

Shared memory should not be raw transcript sync.

Use an event pipeline:

1. capture observations from turns, subagents, feedback, health, and decisions
2. store with provenance, source evi, timestamp, confidence, and evidence link
3. compile into durable lessons
4. distribute compiled memory back to runtime-specific memory stores

Promotion levels:

- observation: raw or near-raw event
- note: useful but local/temporary
- lesson: reusable learned behavior
- policy: durable rule that affects future actions

### Feedback

Human feedback and evi-to-evi feedback should be first-class events.

Each feedback event needs:

- target evi
- subject event or output
- source: user, peer evi, runtime health monitor, or reviewer
- verdict: accept, reject, correct, improve, remember
- confidence
- optional proposed memory patch

### Health

Alive does not mean healthy.

Runtime adapters need separate checks for:

- process running
- gateway reachable
- channel account connected
- inbound path working
- outbound reply path working
- permission relay available
- memory sync latest timestamp
- session backlog

### Concurrency

Independent work should run in independent sessions.

OpenClaw subagents and Claude Channels both point to the same invariant: one shared session serializes unrelated work. `evictl` should spawn or bind distinct sessions for parallel evi work, then merge only distilled results.

## Adapter shape

Each runtime adapter should expose:

- `discover`: find configured profiles, agents, sessions, channels
- `status`: process and channel health
- `start`: start runtime or evi binding
- `stop`: stop runtime or binding
- `spawn`: create a new evi/session/agent where supported
- `route`: bind channel/account/peer to evi
- `send`: inject a message/task into an evi
- `tail`: read recent events/logs
- `export_memory`: extract memory/events with provenance
- `import_memory`: write compiled memory into runtime-native storage
- `doctor`: explain misconfiguration and collisions

## Local setup discovery notes

The first `evictl discover` implementation reads macOS launchd plists, then
enriches the proposal with safe local state files:

- Hermes Agent: launchd plist, profile `HERMES_HOME`, `channel_directory.json`,
  `gateway_state.json`, and `sessions/sessions.json`
- Claude Code Channels: launchd plist plus the local `start.sh` wrapper, including
  tmux session name and Claude `--name`
- OpenClaw: launchd plist or `~/.openclaw` when present

Imported routes are intentionally broad at the Telegram account level at first.
That is conservative: it prevents two evi runtimes from silently becoming
primary owners of the same human-facing surface before peer-level routing is
implemented.

When discovery sees two active primary candidates for the same Telegram account,
it demotes the whole conflicting group to `standby` and emits a warning. A human
or later `route set` command must choose the owner explicitly.

## Shared memory event notes

The first memory implementation records human feedback as JSONL events. This is
the lowest-risk shared memory layer because it keeps provenance and avoids raw
transcript copying. Each event stores a stable id, timestamp, source, target evi,
subject, verdict, confidence, and text. Later compilers can promote those events
into notes, lessons, or policy files.

`memory promote` and `sync` currently compile those JSONL feedback events into
`feedback.md` under the configured compiled notes directory. This proves the
event-to-notes path before adding runtime-native writers for Hermes, OpenClaw, or
Claude Code Channels.

## Evi inventory spawn notes

`spawn` currently creates a new evi identity in `evictl` config with runtime,
profile, agent id, session id, workspace, and state dir. It does not yet create a
runtime-native process or agent session. That keeps identity and routing safe
before adapter-specific creation is added.

## Task send notes

`send` records task requests as memory events before dispatch. If the target evi
has a `session_id`, `evictl` treats it as a tmux session and sends the task with
`tmux send-keys`. `--queue-only` stores the task without runtime dispatch, which
is useful for testing and for evi entries that are not live yet.

## Candidate command surface

- `evictl ps`
- `evictl discover`
- `evictl import`
- `evictl status`
- `evictl doctor`
- `evictl spawn`
- `evictl stop`
- `evictl route list`
- `evictl route set`
- `evictl send`
- `evictl sync`
- `evictl memory search`
- `evictl memory promote`
- `evictl feedback`
- `evictl inspect`

## Immediate product direction

The first useful `evictl` should be a local control plane that can:

1. inventory OpenClaw, Hermes Agent, and Claude Code Channels instances
2. show which Telegram or chat surfaces are owned by which evi
3. prevent accidental duplicate ownership of the same channel/account/session
4. spawn isolated evi sessions where the runtime supports it
5. send tasks to one or more evi instances
6. collect outputs and feedback into a shared event log
7. compile event logs into curated memory notes
8. push curated notes back into runtime-native memory stores
