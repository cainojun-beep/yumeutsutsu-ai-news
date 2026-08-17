# AI FRONTIER

Cloudflare Pages向けの日本語AIニュースメディアです。Astroで静的生成し、GitHub Actionsが毎日RSSを収集、OpenAI APIで日本語ダイジェストを作成します。

## Cloudflare Pages設定

- Framework preset: `Astro`
- Build command: `npm run build`
- Build output directory: `dist`
- Production branch: `main`

独自ドメインは初期公開・動作確認後に設定します。既存ドメインのネームサーバーやDNSレコードは変更しません。

## 自動更新

GitHubリポジトリの Actions secrets に `OPENAI_API_KEY` を登録してください。毎朝7:00（日本時間）に直近24時間を収集します。手動実行にも対応しています。

## ローカル確認

```sh
npm install
npm run dev
npm run build
```
