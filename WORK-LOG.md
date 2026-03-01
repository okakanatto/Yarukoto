# Work Log

## 最新の作業（2026-03-01 20:00）

- **フェーズ**: v1.3.1 ビルド・リリース
- **対象バージョン**: v1.3.1
- **ステータス**: ✅ 完了
- **やったこと**:
  - `package.json` および `src-tauri/tauri.conf.json` のバージョンを `1.3.0` → `1.3.1` に更新
  - `npm run tauri build` を実行（成功。Next.js ビルド + Rust コンパイル + NSIS/WiX パッケージ生成）
  - `releases/v1.3.1/` ディレクトリを作成し、インストーラー版・ポータブル版を配置
  - `RELEASE_NOTES.md` に v1.3.1 リリースノートを追記
  - `AI_CHANGELOG.md` に v1.3.1 変更ログを追記
  - `CLAUDE.md` のバージョン・ディレクトリ構造を更新（新規ファイル群を反映）
  - `WORK-LOG.md` 更新（本エントリ）
- **変更したファイル**:
  - `package.json`, `src-tauri/tauri.conf.json` — バージョン更新
  - `releases/v1.3.1/Yarukoto_1.3.1_x64-setup.exe` — インストーラー版
  - `releases/v1.3.1/Yarukoto_1.3.1-portable.exe` — ポータブル版
  - `RELEASE_NOTES.md`, `AI_CHANGELOG.md`, `CLAUDE.md`, `WORK-LOG.md` — ドキュメント更新
- **次にやるべきこと**:
  - フェーズ8：最終確認とGitHubリリース
- **注意事項・申し送り**:
  - ⚠️ 要実機確認: CSV エクスポートの Blob API ベースの Tauri 環境での動作（qa-report.md #22）
  - v1.4.0 に向けて ROADMAP.md の 4-1〜4-4 を参照して実装を開始する

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-03-01 19:30 — v1.3.1 リリース前検証 STEP R（NG修正のリグレッションテスト）+ 完了処理
- ステータス: ✅ 完了
- やったこと: リリース前検証 QA NG修正3件のリグレッションテストを実施（全12項目 OK、NG: 0件）。ROADMAP.md の R-4 に ✅ 完了マーク、qa-report.md 圧縮。
- 変更したファイル: `ROADMAP.md`, `qa-report.md`, `WORK-LOG.md`

### 2026-03-01 18:30 — v1.3.1 リリース前検証 QA NG項目修正
- ステータス: ✅ 完了
- やったこと: NG-1（layout.js サイドバー進捗 archived_at 除外）/ NG-2（useTodayTasks.js キャンセル除外）/ NG-B-1（RoutineFormModal.js Escape リスナー追加）の3件を修正
- 変更したファイル: `app/layout.js`, `hooks/useTodayTasks.js`, `app/routines/_components/RoutineFormModal.js`, `qa-report.md`
