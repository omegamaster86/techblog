---
name: create-pr-video
description: "Create or update a PR with verification video attached via gh --attach. Use when the user runs /create-pr-video or asks for a PR with screen recording proof. Requires browser MCP + RecordScreen (Cloud) or LOCAL_AUTO ffmpeg (local)."
disable-model-invocation: true
---

# create-pr-video

この skill は `.cursor/commands/create-pr-video.md` と同一手順です。実行時は **必ずそのファイル全文を読んで従う**。

## クイックリマインダー

1. **PR より先に** `pr-artifacts/verification_<機能名>.mp4` を作る（録画必須。Playwright 禁止）
2. Cloud Agent → **A. RecordScreen** / ローカル PJ → **D. LOCAL_AUTO（ffmpeg）**
3. `ffprobe` で duration ≥ 15s を確認
4. 既存 PR → `gh pr edit --attach` / 新規 → `gh pr create --attach`
5. 最終出力に **PR URL** を含める

詳細手順・テンプレ・禁止事項は `.cursor/commands/create-pr-video.md` を参照。
