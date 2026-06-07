# evictl 日本語ガイド

`evictl` は、常駐する AI キャラクターのためのローカル制御ツールです。
Telegram など外側の窓口、共有メモリ、どのエンジンが返答するかを分けて
扱います。

この日本語ドキュメントは全文翻訳ではありません。日常運用に必要な安定し
た手順だけを書き、完全なコマンド仕様は `evictl --help` と英語ドキュメン
トを正とします。こうしておくと、細かいオプション追加のたびに日本語全文
翻訳を更新しなくて済みます。

## インストール

公開パッケージを使う場合:

```bash
bun install -g evictl
```

ローカル checkout を開発用に使う場合:

```bash
mkdir -p ~/.local/bin
ln -sfn /Users/username/ghq/github.com/schroneko/evictl/bin/evictl ~/.local/bin/evictl
evictl --help
```

ローカル checkout の更新に `bun install -g /path/to/evictl` を繰り返さないで
ください。Bun の global dependency に同じ file path が重複して warning が
出ることがあります。開発中は `~/.local/bin/evictl` から checkout の
`bin/evictl` へ symlink する運用にします。

## 最初のセットアップ

`demo` はキャラクター名に置き換えます。

```bash
evictl create demo
evictl migration --dry-run
evictl migration
evictl engine list --character demo
evictl switch --character demo --engine claude-code-channels
evictl status
```

`migration` は既存の Hermes Agent、OpenClaw、Claude Code Channels を evictl
の設定へ採用します。provider 側のファイル、credential、session、log、
memory store は削除、移動、変換しません。

## 日常運用

よく使う確認:

```bash
evictl status
evictl ps
evictl engine list --character demo
```

返答するエンジンを切り替える:

```bash
evictl switch --character demo --engine claude-code-channels
evictl switch --character demo --engine hermes-agent
evictl switch --character demo --engine openclaw
```

現在のエンジンへタスクを送る:

```bash
evictl send demo --text "Run the check suite."
```

## Telegram の再起動

Claude Code Channels の Telegram セッションをキャラクター名で再起動します。

```bash
evictl channel telegram restart nukoevi
```

汎用的な再起動もできます。

```bash
evictl evi restart evi-claude-code-channels-nukoevi
evictl restart claude-code-channels
```

## Claude Code Channels の生成

生成内容を先に確認します。

```bash
evictl channel telegram setup nukoevi \
  --channel telegram \
  --channel stackchan \
  --plugin-dir ~/ghq/github.com/schroneko/stackchan-nukoevi/channels/stackchan \
  --nukoevi-routing \
  --dry-run \
  --json
```

既存の launchd label と runtime path を使って適用します。

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

生成される `start.sh` は launchd watchdog として動きます。tmux session が
残っている場合は通常そのままにしますが、古い polling session が生き残る
事故を避けるため、既定では `CLAUDE_CODE_CHANNELS_MAX_SESSION_SECONDS` 秒後
に再起動します。既定値は `21600` 秒です。`0` にすると時間による再起動を
無効化できます。

## 詳細

- 英語 README: [../../README.md](../../README.md)
- 運用詳細: [../operations.md](../operations.md)
- 設定詳細: [../configuration.md](../configuration.md)
- 研究メモ: [../research-notes.md](../research-notes.md)

日本語ドキュメントは、日常運用が変わったときだけ更新します。新しい
オプションや実験的な項目を全部翻訳対象にせず、必要なときは英語 docs と
`evictl --help` へリンクします。
