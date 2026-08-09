# Profile-separated character bots

Use this when the user wants multiple Hermes characters with separate memories and separate Telegram/Discord/etc. bots.

## Recommended design

- Use a separate Hermes profile per character.
- Use `/personality` or profile-level personality settings only for voice/style inside that profile.
- Each profile gets separate config, memory, sessions, logs, and gateway token.

Example:

```text
root/current profile -> ebi character
imouto profile       -> sister character
```

## Commands

```bash
# Inspect current/root environment
whoami
echo "$HOME"
which hermes
hermes config path
hermes config env-path
hermes profile list

# Create separate character profile from current/root config
hermes profile create imouto --clone
# Or, if the user explicitly wants a fuller duplicate and the CLI supports it:
hermes profile create imouto --clone-all

# Confirm profile paths
hermes profile show imouto
hermes --profile imouto config path
hermes --profile imouto config env-path

# Edit profile-specific env and replace the gateway token with the NEW bot token
nano "$(hermes --profile imouto config env-path)"
grep -i telegram "$(hermes --profile imouto config env-path)"

# Foreground test
hermes --profile imouto gateway run

# If the bot returns a pairing code, approve it from another shell
hermes --profile imouto pairing approve telegram <PAIRING_CODE>

# Service mode after foreground test passes
hermes --profile imouto gateway install
hermes --profile imouto gateway start
hermes --profile imouto gateway status
```

## Manual fallback

Only if `hermes profile create --clone` fails:

```bash
cp -a ~/.hermes ~/.hermes.backup.$(date +%Y%m%d-%H%M%S)
mkdir -p ~/.hermes/profiles/imouto
cp -a ~/.hermes/config.yaml ~/.hermes/profiles/imouto/config.yaml
cp -a ~/.hermes/.env ~/.hermes/profiles/imouto/.env
cp -a ~/.hermes/skills ~/.hermes/profiles/imouto/skills
mkdir -p ~/.hermes/profiles/imouto/sessions ~/.hermes/profiles/imouto/logs
nano ~/.hermes/profiles/imouto/.env
hermes --profile imouto doctor
```

Do not copy root `sessions/` or memory data if the new character should start with clean memory. If `.env` is copied, it will initially contain the old bot token; replace it before starting the new gateway or two profiles may connect to the same bot.

## Pitfalls

- If the agent tool environment cannot find `hermes`, do not assume Hermes is absent from the user's host. Ask the user to run commands on the machine running the gateway or provide PATH/HOME context.
- For multiple bots, each profile needs its own gateway process/service.
- Always verify the profile-specific env path with `hermes --profile <name> config env-path` before editing tokens.
