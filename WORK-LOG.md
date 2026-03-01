# Work Log

## 最新の作業（2026-03-01 18:30）

- **フェーズ**: v1.3.1 リリース前検証 QA NG項目修正
- **対象バージョン**: v1.3.1
- **ステータス**: ✅ 完了
- **やったこと**:
  - qa-report.md の未修正 NG 項目 3件を修正
  - **NG-1**: `layout.js` サイドバー進捗SQLに `AND archived_at IS NULL` を追加（アーカイブ済みタスクが進捗カウントに含まれる不整合を修正）
  - **NG-2**: `hooks/useTodayTasks.js` タスク取得SQLに `AND t.status_code != 5` を追加（キャンセル済みタスクが今日やるタスクに表示される不整合を修正）
  - **NG-B-1**: `app/routines/_components/RoutineFormModal.js` に Escape キーリスナーを追加（TaskEditModal との一貫性を確保）
  - `npm run lint` でエラーなしを確認
- **変更したファイル**:
  - `app/layout.js` — `fetchTodayProgress` SQL に `AND archived_at IS NULL` 追加
  - `hooks/useTodayTasks.js` — `loadTasks` SQL に `AND t.status_code != 5` 追加
  - `app/routines/_components/RoutineFormModal.js` — `useEffect` import 追加 + Escape キーリスナー追加
  - `qa-report.md` — NG-1, NG-2, NG-B-1 に「✅ 修正済み」マーク追加
- **次にやるべきこと**:
  - ROADMAP.md の R-4 を完了マーク（検証＋修正が完了したため）
  - v1.3.1 リリース前ビルド確認（`npm run tauri build`）
- **注意事項・申し送り**:
  - NG-1/NG-2 は SQL WHERE 句への条件追加のみ。他のクエリや画面への影響なし。
  - NG-B-1 は `useEffect` の追加のみ。既存のフォーム機能やモーダル開閉ロジックへの影響なし。

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-03-01 17:30 — v1.3.1 R-4 Phase 3+4 settings タブ分割 + routines モーダル分離
- ステータス: ✅ 完了
- やったこと: `app/settings/page.js`（839行）を4つのタブパネルに分割（272行に縮小）。`app/routines/page.js`（691行）からフォームモーダルを分離（248行に縮小）
- 変更したファイル: `app/settings/page.js`, `app/settings/_components/TagsPanel.js`, `StatusPanel.js`, `OptionsPanel.js`, `DataPanel.js`, `app/routines/page.js`, `app/routines/_components/RoutineFormModal.js`

### 2026-03-01 16:30 — v1.3.1 R-3 Phase 2 today/page.js スリム化（検証）
- ステータス: ✅ 完了
- やったこと: STEP R リグレッションテスト（コードロジック抽出による影響範囲の検証）を実施し、全件OK（NG: 0件）を確認
- 変更したファイル: `ROADMAP.md`, `qa-report.md`, `WORK-LOG.md`
