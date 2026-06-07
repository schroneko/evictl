# evictl

英語: [README.md](README.md)

`evictl` は、常駐する AI キャラクターのためのローカル制御プレーンです。
キャラクターは同じ外部プレゼンス、チャンネル、メモリを保ちながら、内側
のエンジンを独立した agent session の間で切り替えられます。

エンジンは、1 つ以上の deployment をキャラクターに提供できる実行基盤で
す。初期エンジンは OpenClaw、Hermes Agent、Claude Code Channels です。

目指している形は、複製されたキャラクター制御プレーンです。engine
deployment を作成し、作業を route し、生存状態を監視し、feedback と観測
を集め、それを provenance 付きで蒸留した memory として deployment に配布
します。

## インストール

`evictl` は現在 macOS を対象にしており、公開 CLI entry が Bun shebang を
使うため Bun が必要です。

公開パッケージをインストールします:

```bash
bun install -g evictl
```

最新の local checkout をインストールします:

```bash
mkdir -p ~/.local/bin
ln -sfn /Users/username/ghq/github.com/schroneko/evictl/bin/evictl ~/.local/bin/evictl
evictl --help
```

local checkout の更新に `bun install -g /path/to/evictl` を繰り返すのは避け
てください。Bun が同じ file path の global dependency entry を重複させる
ことがあります。`~/.local/bin` を `PATH` に入れておいてください。

## クイックスタート

`demo` は制御したいキャラクター名に置き換えてください。

```bash
evictl create demo
evictl migration --dry-run
evictl migration
evictl engine list --character demo
evictl switch --character demo --engine claude-code-channels
evictl status
```

キャラクター名は外側の人格です。エンジンはその人格として応答する内側で
す。

`migration` は既存の Hermes Agent、OpenClaw、Claude Code Channels instance
を `~/.config/evictl/config.json` に採用します。provider-native な file、
credential、session、log、memory store を変換、削除、移動しません。

## 日常利用

セットアップ後、ほとんどのユーザーが使うのは次のコマンドだけです:

```bash
evictl engine list --character demo
evictl switch --character demo --engine claude-code-channels
evictl switch --character demo --engine hermes-agent
evictl status
```

キャラクターの背後にある現在のエンジンへ task を送ります:

```bash
evictl send demo --text "Run the check suite."
```

キャラクターの Claude Code Channels Telegram を再起動します:

```bash
evictl channel telegram restart nukoevi
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

生成される `start.sh` は launchd watchdog です。tmux session がすでに存在す
る場合、通常はそのままにします。ただし、live process がある stale channel
polling session を避けるため、`CLAUDE_CODE_CHANNELS_MAX_SESSION_SECONDS` 秒
後に Claude Code Channels を再起動します。既定値は `21600` 秒です。
時間による再起動を無効にするには、`--env
CLAUDE_CODE_CHANNELS_MAX_SESSION_SECONDS=0` で `0` に設定します。

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
