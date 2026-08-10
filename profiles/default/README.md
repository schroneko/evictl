# Default evictl profile

This directory is the canonical default profile bundle for evictl.

The bundle keeps the evictl inventory together with portable provider persona
source files. The provider directories are organized by runtime and provider
profile:

- `hermes/nukoevi/`
- `openclaw/default/`
- `claude-code-channels/nukoevi/`

The inventory uses `${EVICTL_DATA_DIR}` for writable runtime paths and
`${EVICTL_PROFILE_DIR}` only for source paths. evictl reads this directory by
default when no explicit config path or profile selection is supplied. The
writable data directory is `~/.local/share/evictl/profiles/default`; set
`EVICTL_DATA_ROOT` to change its parent.

Persona source files may be copied into a writable provider runtime directory
when an evi starts, but existing runtime files are never overwritten. Memory,
`USER.md`, credentials, tokens, environment files, sessions, logs, databases,
caches, and locks do not belong in this source profile or in generated setup
input.

`nukoevi` is the Nukoevi identity/persona inside this default profile. It is not
a separate named profile selected with `EVICTL_PROFILE`.
