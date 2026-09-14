# create-pr-video

検証動画付きで PR を作成または更新する。Playwright 録画・スクリーンショット結合は禁止。**PR 作成より先に検証メディアを必ず作る。**

## 依頼内容

- 今作業しているブランチの PR を**作成または更新**する（**本文込み + 検証動画添付**）。
- **検証用の録画またはスクリーンショットを PR 本文に添付**する（`create-pr` の動画版）。
- 検証動画は **ブラウザ操作 + 画面録画** で作る。Playwright / スクリーンショット結合は禁止（下記）。
- プッシュ済みなので、リモートの履歴から情報を取得する。
- 変更履歴や変更コードを確認し、下記のテンプレートを埋める。
- **最後に `gh pr create` または `gh pr edit --attach` を実行**する（対話プロンプトは禁止）。
- **既存 PR がある場合は新規作成せず、`gh pr edit --attach` で本文・動画を更新**する。
- 作成・更新できたら **PR の URL を出力**する（最終出力に必ず含める）。

## 本 PJ の前提（frontend-oki-v2 / 置きシミュレーション等）

以下は **ユーザーが事前に完了済み** とみなす。Agent は起動・ログイン作業に時間を使わない。

- `bash scripts/start-proxy.sh stg6`（または dev5/dev6）が **別ターミナルで稼働中**
- `npm run dev:stg6`（または対象 env）が **稼働中** → `http://localhost:3000`
- **Cursor 内部ブラウザ（browser MCP）でログイン済み**

上記未完了なら PR フェーズに進まず、不足を報告して中断する。

## Cloud / ローカルの録画モード選択

git 権限等で **Cursor Cloud Agent が使えない PJ** では、ローカル自動録画（LOCAL_AUTO）を使う。

| 条件 | 録画モード |
|------|------------|
| Cloud Agent + `RecordScreen` が使える | **A. Cloud** |
| Cloud 不可、またはローカル Agent（**frontend-oki-v2 等はこちらがデフォルト**） | **D. LOCAL_AUTO** |
| QuickTime 等を人間が手動で回す場合のみ | B. 手動 OS 録画 + browser MCP |

**frontend-oki-v2 等のローカル PJ では D. LOCAL_AUTO をデフォルトとする。** Cloud Agent で `RecordScreen` が使える場合は **A. Cloud** を優先する。A が使えない理由をユーザーに確認する必要はない。

## 前提・制約

- 依頼範囲外の実装や、UI/UX（レイアウト、色、フォント、間隔など）の変更はしない。
- `gh` 未ログインの場合は、権限なしで実行する。
- 「プッシュ済み」が前提。未 push（upstream 未設定）なら、push が必要と明示して終了する（勝手に push しない）。

## 実行順序（厳守）

**PR 作成・更新より先に、検証用メディアを必ず作る。** 順序を入れ替えない。

1. **Doctor:** proxy / dev / 内部ブラウザログイン済みを確認（本 PJ 前提）
2. **録画開始**（D. LOCAL_AUTO または A. Cloud）
3. **browser MCP で end-to-end 操作**（録画中。操作だけで完了扱いにしない）
4. **録画終了・検証** → `pr-artifacts/verification_<機能名>.mp4` に保存
5. `ffprobe` で duration / size 確認（10MB 超なら圧縮）
6. **`gh pr create` または `gh pr edit --attach` で PR 作成・更新**

`pr-artifacts/` に有効な録画が無い状態で PR を作らない。スクリーンショットの結合や代替手段で埋めない。

---

# テンプレート（この形でPR本文を生成）

---

## やったこと

- このプルリクで何をしたのか？

## やらないこと

- このプルリクでやらないことは何か？（あれば。無いなら「無し」で OK）（やらない場合は、いつやるのかを明記する。）

## 課題

- 悩んでいること
- とくにレビューしてほしいところ

## できるようになること（ユーザ目線）

- 何ができるようになるのか？（あれば。無いなら「無し」で OK）

## できなくなること（ユーザ目線）

- 何ができなくなるのか？（あれば。無いなら「無し」で OK）

## 動作確認

- どのような動作確認を行ったのか？　結果はどうか？

## 本番反映手順

- 本番反映時の手順を記載してください。（.env 追記、マイグレーション、デプロイ手順など）

## その他

- レビュワーへの参考情報（実装上の懸念点や注意点などあれば記載）

## 動作確認の録画・スクリーンショット

- （UI 変更がある場合は必須。動画またはスクリーンショットを添付する）
- 録画: `![](pr-artifacts/verification_<機能名>.mp4)` のように本文に参照を書き、`--attach` でアップロードする（下記手順）

---

# 検証用録画・スクリーンショットの作成（PR 作成前に行う）

PR 本文に載せる検証用メディアは、**PR 作成前に**動作確認の最中で用意する。`pr-artifacts/` に有効 MP4 が無い場合は、先に録画してから PR フェーズへ進む。

## 禁止事項（代替手段として使わない）

| 禁止 | 理由 |
|------|------|
| **Playwright / Puppeteer / Selenium の `recordVideo` 等** | コマンド外の独自手段。認証・ビューポート・セレクタ依存で壊れやすい |
| **スクリーンショットを ffmpeg で結合して動画化** | 操作の流れにならない。別画面・別アプリの画像が混入しやすい |
| **`pr-artifacts/frames/` 等の PNG をアルファベット順に結合** | 時系列が崩壊し、検証動画にならない |
| **browser MCP で操作しただけで録画を省略** | 操作確認と録画は別。操作できた ≠ 録画済み |
| **検証用 Playwright スクリプト（`record-*.mjs` 等）の新規作成** | 本コマンドのスコープ外 |
| **ステップ 1〜N の e2e 確認をスクリーンショット 1 枚で代替** | 操作フローが写らない |
| **外部 Chrome / `agent-browser` で検証** | ログインが繰り返し発生しやすい。**Cursor 内部ブラウザ**を使う |
| **既存 PR があるのに URL だけ出して終了** | 動画未添付のまま放置。必ず `gh pr edit --attach` で更新 |

スクリーンショット単体（1〜2 枚）で十分な場合のみ、動画の代わりに `browser_take_screenshot` 等で撮影してよい。

## 保存場所

リポジトリ直下の `pr-artifacts/`（**git にコミットしない**。`.gitignore` 登録済み）。`gh pr create/edit --attach` で GitHub にアップロードする。

```
pr-artifacts/
  verification_<機能名>.mp4   # 動作確認の録画
  .crop.env                   # crop 座標キャッシュ（LOCAL_AUTO 用、任意）
  before_login.png            # スクリーンショット（必要な場合）
```

ファイル名は `snake_case` で内容が分かる名前にする（例: `verification_placement_simulation_step6.mp4`）。

## 録画の作成方法

### UI 変更がある場合（必須: 画面録画）

#### A. Cursor Cloud Agent（Cloud 利用可の PJ / `RecordScreen` 利用可）

1. browser MCP / computer use で UI を操作
2. **`RecordScreen` `START_RECORDING`** → 操作 → **`SAVE_RECORDING`**
3. 保存録画を `pr-artifacts/verification_<機能名>.mp4` にコピー

#### B. 手動 OS 録画 + browser MCP（人間が QuickTime 等を操作する場合のみ）

1. QuickTime / OBS で録画開始
2. browser MCP で end-to-end 操作
3. 録画停止 → `pr-artifacts/verification_<機能名>.mp4`

#### D. LOCAL_AUTO（**ローカル PJ デフォルト / Cloud 不可 PJ**）

**ffmpeg 録画と browser MCP 操作を Agent が自動で行う。** 人間の手動録画は不要。

##### D-0. Doctor（必須）

```bash
# proxy / dev が応答するか（例: stg6）
curl -sf -o /dev/null -w '%{http_code}' http://localhost:3000 || echo 'dev NG'
curl -sf -o /dev/null -w '%{http_code}' http://localhost:8080/health 2>/dev/null || echo 'proxy check (path は環境依存)'
```

- 内部ブラウザで `http://localhost:3000` を開き、ログイン済みであること
- `ffmpeg` / `ffprobe` が実行可能（lean-ctx でブロックされる場合は `required_permissions: ['all']` で Shell 実行）
- `mkdir -p pr-artifacts`

##### D-1. crop 座標（内部ブラウザ領域のみ録画）

画面全体録画は IDE が写り PR 検証動画として不適切。

1. `pr-artifacts/.crop.env` があれば `CROP_W`, `CROP_H`, `CROP_X`, `CROP_Y` を読み込む
2. 無い、または前回からウィンドウ配置が変わった疑いがある場合:
   - `browser_take_screenshot` でアプリのみ確認
   - `screencapture -x /tmp/fullscreen.png` でデスクトップ全体取得
   - 位置合わせで `w:h:x:y` を求め、`pr-artifacts/.crop.env` に保存
3. 成功例（**環境依存。毎回再検証**）: `crop=1758:1052:424:296`

##### D-2. 録画開始（専用シェル・前面実行）

```bash
RECORD_SEC=90   # 置きシミュレーション等の長いフローは 90〜120
OUTPUT="pr-artifacts/verification_<機能名>.mp4"
CROP="1758:1052:424:296"   # .crop.env から読み込む

ffmpeg -y -f avfoundation -framerate 15 -capture_cursor 1 \
  -i "Capture screen 0" -t "$RECORD_SEC" \
  -vf "crop=${CROP},scale=1280:-2,format=yuv420p" \
  -c:v libx264 -preset ultrafast -crf 28 -movflags +faststart \
  "$OUTPUT"
```

**起動ルール（厳守）:**

- Agent Shell で **`block_until_ms: 0`（または RECORD_SEC + 15 秒以上）** の専用シェルで起動
- **`-t` で自然終了**させる。`ffmpeg ... &` の末尾背景起動は **禁止**（親シェル終了で kill → `moov atom not found`）
- 停止が必要なときは **`kill -INT` のみ**（`kill -9` 禁止）

##### D-3. browser MCP で操作（録画中）

ffmpeg 起動後 **2 秒待ってから** browser MCP で end-to-end 操作を開始する。

**本 PJ（置きシミュレーション / stg6）の標準フロー:**

1. 置きシミュレーション画面を開く
2. 日付・時間帯を選択
3. 対抗番組に単発を当てる
4. 裏番組検索
5. 過去放送日を選択
6. 推奨パターンを選択
7. **ステップ 6 グリッド表示**まで到達（最終結果が写ること）

`.cursor/skills/verify-<app>/` がある場合はその Drive 節に従う。

##### D-4. 録画完了・検証

1. ffmpeg の自然終了を待つ
2. 検証:

```bash
ffprobe -v error -show_entries format=duration,size \
  -of default=noprint_wrappers=1 "pr-artifacts/verification_<機能名>.mp4"
```

3. `duration` / `size` が取れない（`moov atom not found`）→ **再録画。PR に進まない**
4. 10MB 超（GitHub Free 上限）→ 圧縮してから attach:

```bash
ffmpeg -y -i pr-artifacts/verification_<機能名>.mp4 \
  -vf "scale=960:-2" -c:v libx264 -crf 32 -movflags +faststart \
  pr-artifacts/verification_<機能名>_compressed.mp4
# attach には圧縮版を使う（本文参照も合わせる）
```

5. フレーム抽出で **IDE が写っていないこと** を確認:

```bash
ffmpeg -y -ss 30 -i pr-artifacts/verification_<機能名>.mp4 \
  -frames:v 1 /tmp/verify_frame.png
```

##### D-5. 完了条件（PR フェーズへ進める条件）

- [ ] `pr-artifacts/verification_<機能名>.mp4`（または `_compressed.mp4`）が存在
- [ ] `ffprobe` で `duration` ≥ 15 秒（短すぎる早期 kill を検出）
- [ ] 操作フローが時系列で写っている（静止画スライドショーではない）
- [ ] 最終フレームに期待結果（例: ステップ 6 グリッド）が見える

#### 録画失敗の典型パターンと対処（LOCAL_AUTO）

| 症状 | 原因 | 対処 |
|------|------|------|
| `moov atom not found` | ffmpeg が kill された | 専用シェル + `-t` 完走。`kill -INT` のみ |
| MP4 が数秒で終わる | 早期 kill | 再録画 + `ffprobe` |
| 操作成功だが PR に動画なし | 録画省略 | LOCAL_AUTO を最初からやり直す |
| PR に静止画のみ | スクリーンショット代替 | 動画を録り直す |
| IDE / チャットが写る | crop 未設定 | `.crop.env` 再計算 |
| `--attach` 失敗 | 10MB 超 | 圧縮版を attach |
| `ffprobe` が Agent で動かない | lean-ctx allowlist | `required_permissions: ['all']` で Shell |

### UI 変更がない場合

- ログ・テスト結果を「動作確認」にテキスト記載（録画不要）

## 録画の内容（良い例 / 悪い例）

**良い録画:** 変更機能が end-to-end で動くところだけ（30 秒〜2 分）。結果がはっきり見える。

**悪い録画:** テスト失敗、ログイン待ちの長前置き、スライドショー、無関係画面、Playwright 自動生成のみ。

## 技術要件

- `gh` **v2.99.0 以上**（`--attach` 必須）
- 対応形式: PNG, JPEG, GIF, WebP, SVG, MP4, MOV, WebM
- サイズ上限: 画像 10MB、動画 Free 10MB / 有料 100MB

---

# 実行要件（必ず満たす）

## フェーズ 1: 検証メディア（PR より先）

1. Doctor（本 PJ 前提の確認）
2. **D. LOCAL_AUTO**（ローカル PJ）または **A. Cloud**（`RecordScreen`）で録画 + browser 操作
3. `pr-artifacts/verification_<機能名>.mp4` が存在し `ffprobe` OK
4. 未完了なら **PR フェーズに進まない**

## フェーズ 2: PR 作成・更新

5. `git branch --show-current`
6. upstream 確認: `git rev-parse --abbrev-ref --symbolic-full-name @{u}`
7. `gh --version`（v2.99.0+）、`gh auth status`
8. 既存 PR: `gh pr list --head <branch> --state open --json number,url`
9. `pr-artifacts/` 直下のメディアを列挙（UI 変更時は録画 1 件以上必須）
10. **既存 PR → `gh pr edit` / 無し → `gh pr create`**
11. PR URL を出力

# PR 作成・更新（非対話で完走）

## base ブランチ

- 原則 `develop`
- `origin/develop` が無い場合は `origin` の HEAD branch

## title

- 新規 PR: 原則「現在ブランチ名」
- **既存 PR 更新時: タイトルは変更しない**（`gh pr edit` に `--title` を付けない）

## body

- `git log origin/<base>..HEAD` / `git diff origin/<base>...HEAD` を根拠にテンプレを埋める
- UI 変更時「動作確認の録画・スクリーンショット」に `![](pr-artifacts/xxx.mp4)` を書く

### メディアの本文への埋め込み

```markdown
![](pr-artifacts/verification_<機能名>.mp4)
```

## attach

- `pr-artifacts/` **直下**のみ `--attach`
- 本文参照と同じファイルを attach
- 複数は `--attach` を繰り返す

## 実行例（この形で実行する）

```bash
# 1) base 判定
BASE_BRANCH="develop"
if ! git show-ref --verify --quiet "refs/remotes/origin/${BASE_BRANCH}"; then
  BASE_BRANCH="$(git remote show origin | sed -n 's/.*HEAD branch: //p')"
fi

CURRENT_BRANCH="$(git branch --show-current)"

# 2) 検証用メディア収集（pr-artifacts/ 直下）
ATTACH_ARGS=()
if [ -d pr-artifacts ]; then
  while IFS= read -r -d '' f; do
    case "$f" in
      */.crop.env|*/.record.log) continue ;;
    esac
    ATTACH_ARGS+=(--attach "$f")
  done < <(find pr-artifacts -maxdepth 1 -type f \( \
    -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o \
    -iname '*.gif' -o -iname '*.webp' -o -iname '*.svg' -o \
    -iname '*.mp4' -o -iname '*.mov' -o -iname '*.webm' \
  \) -print0 | sort -z)
fi

# 3) テンプレ本文（Agent が差分に基づき生成）
BODY="$(cat <<'EOF'
（ここにテンプレ本文）
EOF
)"

# 4) 既存 OPEN PR を確認
PR_JSON="$(gh pr list --head "$CURRENT_BRANCH" --state open \
  --json number,url --jq '.[0]' 2>/dev/null || true)"

if [ -n "$PR_JSON" ] && [ "$PR_JSON" != "null" ]; then
  PR_NUM="$(printf '%s' "$PR_JSON" | jq -r '.number')"
  # UI 変更があるのに attach 対象が無い → 中断（フェーズ1未完了）
  if [ "${#ATTACH_ARGS[@]}" -eq 0 ]; then
    echo "ERROR: pr-artifacts に検証メディアがありません。LOCAL_AUTO で録画してから再実行してください。" >&2
    exit 1
  fi
  BODY_FILE="$(mktemp)"
  printf '%s' "$BODY" > "$BODY_FILE"
  gh pr edit "$PR_NUM" --body-file "$BODY_FILE" "${ATTACH_ARGS[@]}"
  rm -f "$BODY_FILE"
  gh pr view "$PR_NUM" --json url --jq '.url'
  exit 0
fi

# 5) 新規 PR 作成
TITLE="${CURRENT_BRANCH}"
if [ "${#ATTACH_ARGS[@]}" -gt 0 ]; then
  printf "%s" "$BODY" | gh pr create \
    --base "$BASE_BRANCH" \
    --head "$CURRENT_BRANCH" \
    --title "$TITLE" \
    --body-file - \
    "${ATTACH_ARGS[@]}"
else
  printf "%s" "$BODY" | gh pr create \
    --base "$BASE_BRANCH" \
    --head "$CURRENT_BRANCH" \
    --title "$TITLE" \
    --body-file -
fi

gh pr view --head "$CURRENT_BRANCH" --json url --jq '.url'
```

## 注意

- 対話プロンプト禁止: `--title` / `--body-file` を必ず指定
- **`pr-artifacts/` は `.gitignore` 対象**（コミットしない）
- UI 変更 + メディア無し → PR 作成・更新しない（LOCAL_AUTO を先に実行）
- **既存 PR がある場合も `exit 0` で URL だけ返さない。** 必ず `gh pr edit --attach` で更新
- Playwright / スクリーンショット結合 / `record-*.mjs` 新規作成は禁止
- browser MCP 操作だけでは完了扱いにしない（録画ファイル必須）
- LOCAL_AUTO: ffmpeg は専用シェル + `-t` 完走 + `ffprobe` 確認後に PR 更新
- 検証ブラウザは **Cursor 内部ブラウザ** を使う
- Cloud Agent では `RecordScreen`（A）を優先。ローカル PJ でも LOCAL_AUTO + `gh --attach` で PR 検証動画運用は同等に可能
