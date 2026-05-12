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
collect secrets. Do not store API keys, Telegram tokens, or private prompts in
`~/.config/evictl/config.json`.

Commands that can affect running agents are explicit:

- `start`, `stop`, `stop-all`, and `use` operate on configured local runtimes
- `send` records a task event before dispatch and only sends to a configured
  tmux session unless `--queue-only` is used
- `route set` rejects duplicate primary ownership unless `--force` is passed

Before publishing logs or bug reports, redact local usernames, chat ids, tokens,
and private workspace paths.
