# Security Policy

## Supported Versions

Security fixes are handled on the latest `main` branch until the first stable
release line exists.

## Reporting a Vulnerability

Please report security issues privately before opening a public issue. If GitHub
private vulnerability reporting is enabled for the repository, use that flow.
Otherwise contact the maintainer through the private channel listed in the
project profile.

Include:

- affected version or commit
- reproduction steps
- expected impact
- whether credentials, local agent sessions, or messaging channels are involved

## Security Model

`evictl` is a local orchestration CLI. It reads local launchd plists, process
lists, tmux session names, and evi configuration. It does not intentionally
collect secrets. The checked-in profile source under `profiles/` is portable
and must not contain credentials, tokens, private prompts, provider sessions,
logs, or personal memory.

Runtime state, memory events, generated prompts, settings, environment files,
and logs belong under the writable per-profile data directory
`~/.local/share/evictl/profiles/<profile>`. Set `EVICTL_DATA_ROOT` to change its
parent. `${EVICTL_PROFILE_DIR}` identifies source files, while
`${EVICTL_DATA_DIR}` identifies writable data. Runtime preparation copies only
portable persona files and preserves existing user files; it never symlinks
runtime state into the source checkout or installed package.

Do not store API keys, Telegram tokens, or private prompts in the profile source
or in checked-in configuration.

Commands that can affect running agents are explicit:

- `start`, `stop`, `stop-all`, and `use` operate on configured local runtimes
- `send` records a task event before dispatch and only sends to a configured
  tmux session unless `--queue-only` is used
- `route set` rejects duplicate primary ownership unless `--force` is passed

Before publishing logs or bug reports, redact local usernames, chat ids, tokens,
and private workspace paths.
