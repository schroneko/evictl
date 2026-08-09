# Default evictl profile

This directory is the canonical default profile bundle for evictl.

The bundle keeps the evictl inventory together with provider-native persona and
memory files. The provider directories are organized by runtime and provider
profile:

- `hermes/nukoevi/`
- `openclaw/default/`
- `claude-code-channels/nukoevi/`
- `memory/`

The inventory uses `${EVICTL_PROFILE_DIR}` so it remains portable across local
checkouts. evictl reads this directory by default when no explicit config path
or profile selection is supplied.

Credentials, tokens, environment files, sessions, logs, databases, caches, and
locks do not belong in this profile.
