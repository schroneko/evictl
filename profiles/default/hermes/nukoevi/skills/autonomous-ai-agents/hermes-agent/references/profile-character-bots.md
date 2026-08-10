# Profile-separated character bots

Use this when multiple characters need separate identities, provider state, and
channel routes. `evictl` owns the runtime lifecycle; do not create or start a
standalone Hermes gateway.

## Recommended design

- Keep portable persona source in the selected evictl profile under `profiles/`.
- Keep writable provider state under `${EVICTL_DATA_DIR}`.
- Give each character its own evictl identity, evi, and route ownership.
- Keep credentials, sessions, logs, caches, and memory in the writable data
  directory only.

Example:

```text
default profile -> nukoevi identity
named profile   -> another character identity
```

## Commands

```bash
evictl identity list
evictl processor list nukoevi
evictl engine list --agent nukoevi
evictl switch --agent nukoevi --engine hermes-agent
evictl inspect evi-hermes-agent-nukoevi
```

Create a separate named evictl profile only when the character needs an
independent source bundle and memory scope. Keep the selected profile's
writable state outside the repository:

```text
source: profiles/<profile>/
data:   ~/.local/share/evictl/profiles/<profile>/
```

The profile source may contain persona and routing defaults. It must not contain
provider tokens, environment files, sessions, logs, caches, or personal
memory. `evictl evi start` seeds only portable persona files into the writable
runtime directory and preserves existing files.

For a new character, add the source persona files and configure its evi and
identity in the profile config. Use `evictl channel telegram setup` or the
provider-specific evictl command to generate runtime files under the writable
data directory. Do not edit generated files in the source checkout.
