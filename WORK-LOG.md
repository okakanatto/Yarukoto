# Work Log

## 最新の作業（2026-03-01 19:30）

- **フェーズ**: v1.3.1 リリース前検証 STEP R（NG修正のリグレッションテスト）+ 完了処理
- **対象バージョン**: v1.3.1
- **ステータス**: ✅ 完了
- **やったこと**:
  - リリース前検証 QA NG修正3件のリグレッションテストを実施（全12項目 OK、NG: 0件）
  - 直接テスト3件: NG-1（layout.js サイドバー進捗SQL）/ NG-2（useTodayTasks.js キャンセル除外SQL）/ NG-B-1（RoutineFormModal.js Escape リスナー）
  - 影響範囲テスト9件: サイドバー・ダッシュボード一貫性 / today画面統計・表示・バナー / TaskList キャンセル表示維持 / Escape リスナー干渉・競合なし
  - 完了処理: ROADMAP.md の R-4 に ✅ 完了マーク / qa-report.md の OK 項目圧縮 / WORK-LOG.md 更新
- **変更したファイル**:
  - `ROADMAP.md` — R-4 に ✅ 完了マーク追加
  - `qa-report.md` — STEP R 結果追記 + リリース前検証 STEP B の OK テーブル圧縮
  - `WORK-LOG.md` — 本更新
- **次にやるべきこと**:
  - ビルド確認（`npm run tauri build`）の実施 → v1.3.1 リリース
- **注意事項・申し送り**:
  - v1.3.1 の全枝番（R-1〜R-4）が完了。リリース前検証（STEP A + STEP B + STEP R）も全件パス
  - 残りはビルド確認のみ。ビルド成功後、`releases/v1.3.1/` にインストーラー・ポータブル版を配置してリリース
  - ⚠️ 要実機確認: CSV エクスポートの Blob API ベースの Tauri 環境での動作（qa-report.md #22）

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-03-01 18:30 — v1.3.1 リリース前検証 QA NG項目修正
- ステータス: ✅ 完了
- やったこと: NG-1（layout.js サイドバー進捗 archived_at 除外）/ NG-2（useTodayTasks.js キャンセル除外）/ NG-B-1（RoutineFormModal.js Escape リスナー追加）の3件を修正
- 変更したファイル: `app/layout.js`, `hooks/useTodayTasks.js`, `app/routines/_components/RoutineFormModal.js`, `qa-report.md`

### 2026-03-01 17:30 — v1.3.1 R-4 Phase 3+4 settings タブ分割 + routines モーダル分離
- ステータス: ✅ 完了
- やったこと: `app/settings/page.js`（839行）を4つのタブパネルに分割（272行に縮小）。`app/routines/page.js`（691行）からフォームモーダルを分離（248行に縮小）
- 変更したファイル: `app/settings/page.js`, `app/settings/_components/TagsPanel.js`, `StatusPanel.js`, `OptionsPanel.js`, `DataPanel.js`, `app/routines/page.js`, `app/routines/_components/RoutineFormModal.js`
