# evictl

英語: [README.md](README.md)

`evictl` は、常駐する AI エージェントのためのローカル制御ツールです。
AI エージェントは同じ外部プレゼンス、チャンネル、メモリを保ちながら、
内側のエンジンを独立した agent session の間で切り替えられます。

エンジンは、1 つ以上の deployment を AI エージェントに提供できる実行基盤です。
初期エンジンは OpenClaw、Hermes Agent、Claude Code Channels です。

目指している形は、複製された AI エージェント制御ツールです。
engine deployment を作成し、作業を route し、生存状態を監視し、feedback と観測を集め、それを provenance 付きで蒸留した memory として deployment に配布します。

## インストール

`evictl` は現在 macOS を対象にしており、公開 CLI entry が Bun shebang を
使うため Bun が必要です。

公開パッケージをインストールします。これが通常のインストール方法です:

```bash
bun install -g evictl
```

この repository checkout からローカル開発する場合は、checkout の bin を
直接公開します:

```bash
mkdir -p ~/.local/bin
ln -sfn /Users/username/ghq/github.com/schroneko/evictl/bin/evictl ~/.local/bin/evictl
evictl --help
```

local checkout の更新に `bun install -g /path/to/evictl` を繰り返さないでください。
Bun が同じ file path の global dependency entry を重複させることがあります。
これは通常の `bun install -g evictl` による公開パッケージのインストールには影響しません。

## クイックスタート

`demo` は制御したい AI エージェント名に置き換えてください。

```bash
evictl create demo
evictl migration --dry-run
evictl migration
evictl engine list --agent demo
evictl switch --agent demo --engine claude-code-channels
evictl status
```

AI エージェント名は外側の identity です。エンジンはその identity として
応答する内側の runtime です。

`migration` は既存の Hermes Agent、OpenClaw、Claude Code Channels instance
を既定プロファイルの `profiles/default/config.json` に採用します。provider-native な file、
credential、session、log、memory store を変換、削除、移動しません。

## プロファイル

プロファイルの正本はこの repository の `profiles/` です。プロファイルを
指定しない場合は `profiles/default/` の `config.json` を読み込みます。
名前付きプロファイルは `profiles/<name>/` に置き、`EVICTL_PROFILE` で選択します。

```bash
EVICTL_PROFILE=nukoevi evictl status
```

プロファイルの保存場所を別の checkout へ切り替える場合は
`EVICTL_PROFILE_ROOT` を使います。`XDG_CONFIG_HOME` と `--config` は明示的な
設定ファイル指定として、既定プロファイルより優先されます。

プロファイルには persona、memory、routing、workspace の定義を保存できます。
provider credential、token、session、log、database、cache は保存しません。

## 日常利用

セットアップ後、ほとんどのユーザーが使うのは次のコマンドだけです:

```bash
evictl engine list --agent demo
evictl switch --agent demo --engine claude-code-channels
evictl switch --agent demo --engine hermes-agent
evictl status
```

AI エージェントの背後にある現在のエンジンへ task を送ります:

```bash
evictl send demo --text "Run the check suite."
```

AI エージェントの Claude Code Channels Telegram を再起動します:

```bash
evictl channel telegram restart nukoevi
```

## OpenClaw

OpenClaw setup は、`openclaw` binary を手動で link せずに `evictl` から実行できます:

```bash
evictl openclaw setup
```

この command は OpenClaw CLI を install または `~/.local/bin/openclaw` に expose し、
baseline workspace を作成し、default model を `openai/gpt-5.5` に設定し、
OpenClaw の OpenAI auth order を Codex CLI profile `openai:default` に同期し、
Gateway launch agent を起動し、OpenClaw を `evi-openclaw` engine candidate として採用します。
Telegram や StackChan route は作成しないため、AI エージェントを OpenClaw へ switch するまで、
既存の Claude Code Channels route が ownership を保ちます。

Codex auth sync は default で有効です。skip する場合は `--no-sync-codex-auth`、
別の OpenClaw auth profile を使う場合は `--auth-profile <id>` を指定します。

変更せずに setup 内容を確認します:

```bash
evictl openclaw setup --dry-run --json
```

汎用的な runtime control も利用できます:

```bash
evictl evi restart evi-claude-code-channels-nukoevi
evictl restart claude-code-channels
```

完全なコマンド一覧を見るには次を実行します:

```bash
evictl --help
```

## Claude Code Channels

Claude Code Channels は、Telegram token、chat ID、local memory を repository
に保存せずに evictl から生成できます。

まず生成される runtime を確認します:

```bash
evictl channel telegram setup nukoevi \
  --channel telegram \
  --channel stackchan \
  --plugin-dir ~/ghq/github.com/schroneko/stackchan-nukoevi/channels/stackchan \
  --nukoevi-routing \
  --dry-run \
  --json
```

既存の launchd label と管理対象 runtime path を適用します:

```bash
evictl channel telegram setup nukoevi \
  --channel telegram \
  --channel stackchan \
  --plugin-dir ~/ghq/github.com/schroneko/stackchan-nukoevi/channels/stackchan \
  --nukoevi-routing \
  --state-dir ~/.local/share/claude-telegram-channel \
  --label com.local.claude-telegram-channel \
  --plist-path ~/Library/LaunchAgents/com.local.claude-telegram-channel.plist
```

生成される `start.sh` は launchd watchdog です。
tmux session がすでに存在する場合、通常はそのままにします。
ただし、live process がある stale channel polling session を避けるため、`CLAUDE_CODE_CHANNELS_MAX_SESSION_SECONDS` 秒後に Claude Code Channels を再起動します。
既定値は `21600` 秒です。
時間による再起動を無効にするには、`--env CLAUDE_CODE_CHANNELS_MAX_SESSION_SECONDS=0` で `0` に設定します。

## ドキュメント

- [docs/operations.md](docs/operations.md): runtime operation、automation、
  memory sync、安全モデル
- [docs/configuration.md](docs/configuration.md): inventory model と設定例
- [docs/research-notes.md](docs/research-notes.md): research note
- [README.ja.md](README.ja.md): 日本語版 README

`README.md` が正本です。`README.md` を変更するときは、同じ変更を
`README.ja.md` にも反映してください。

## 開発

```bash
bun install
bun test
bun run check
bun run build
```

開発中に CLI を直接実行します:

```bash
bun run src/cli.ts ps
```

`--headless` は automation 用の global flag です:

```bash
evictl --headless status
evictl status --headless
evictl --headless monitor --once
```

Headless mode は JSON output や自動 confirmation を意味しません。明示的な
one-shot form がないまま無期限に待機する command を拒否します。利用可能
な場合は command 固有の `--json` flag を使ってください。

この repository には `skills/evictl` に Agent Skill が含まれています。
