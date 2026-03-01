# Work Log

## 最新の作業（2026-03-01）

- **フェーズ**: v1.4.0 QA NG項目修正
- **対象バージョン**: v1.4.0
- **対象課題**: STEP A・STEP B で検出された NG 項目4件の修正
- **ステータス**: ✅ 完了
- **やったこと**:
  - A-2 NG-1（重要度：中）: `auto_complete_parent` がキャンセル済み(5)の親タスクにも自動完了を発動する問題を修正
    - `hooks/useTaskActions.js:57`: 親ステータス判定に `!== 5` 条件を追加
  - A-3 NG-1（重要度：低）: `processingIds` が今日やるタスク画面の UI に反映されない問題を修正
    - `app/today/page.js`: TodayCardItem に `isProcessing` prop を追加し、StatusCheckbox・ステータスselect・✕ボタンを disabled 化
  - B NG-2（重要度：低）: ルーティン画面と設定画面のトグルON色不統一を修正
    - `app/routines/page.js:231` と `app/routines/_components/RoutineFormModal.js:441`: `#34c759` → `var(--color-primary)` に統一
  - B NG-1（重要度：極低）: トグル設定の ON 判定ロジック不統一を修正
    - `app/settings/_components/OptionsPanel.js:60,63`: `show_overdue_in_today !== '0'` → `=== '1'` に統一
    - `hooks/useTodayTasks.js:54`: 同上
  - `npm run lint` パス確認済み
  - `qa-report.md` に全4件の修正済みマーク追加
- **次にやるべきこと**:
  - v1.4.0 リリース前検証 STEP R を実施（NG修正による影響確認）
  - 要実機確認項目16件の実機テスト（qa-report.md 参照）
- **注意事項・申し送り**:
  - ■ 変更したファイル：
    - `hooks/useTaskActions.js`: L57 に `&& parentRows[0].status_code !== 5` 条件追加
    - `app/today/page.js`: TodayCardItem に isProcessing prop 追加、StatusCheckbox/select/button に disabled 追加
    - `app/routines/page.js`: `.rt-switch.on` 背景色を `var(--color-primary)` に変更
    - `app/routines/_components/RoutineFormModal.js`: `.rt-switch-lg.on` 背景色を `var(--color-primary)` に変更
    - `app/settings/_components/OptionsPanel.js`: `show_overdue_in_today` の ON 判定を `=== '1'` に統一
    - `hooks/useTodayTasks.js`: `show_overdue_in_today` の ON 判定を `=== '1'` に統一
  - ■ 影響が想定される箇所：
    - `useTaskActions.js` の handleStatusChange: ENH-5 自動完了のスキップ条件が拡張（キャンセル済み親タスクも除外）
    - `app/today/page.js` TodayCardItem: 操作中のボタン無効化が追加（タスク一覧と同じ保護）
    - ルーティン画面: トグルON色の見た目のみ変更（緑→青/紫）。機能変更なし
    - 設定画面: ON判定ロジック変更は実質影響なし（db.js で初期値 '1' がシード済み）

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-03-01 — v1.4.0 枝番 4-3 実装（ENH-1 + ENH-5）
- ステータス: ✅ 完了
- やったこと: ダッシュボード「今日完了したタスク」セクション新設、子タスク全完了→親自動完了オプション実装
- 変更したファイル: `app/dashboard/page.js`, `app/settings/_components/OptionsPanel.js`, `hooks/useTaskActions.js`, `lib/db.js`

### 2026-03-01 — v1.4.0 枝番 4-2 STEP R リグレッションテスト + 完了処理
- ステータス: ✅ 完了
- やったこと: STEP R リグレッションテスト実施（全24件OK、NG 0件）、ISSUES.md・ROADMAP.md・qa-report.md 更新
- 変更したファイル: `ISSUES.md`, `ROADMAP.md`, `qa-report.md`, `WORK-LOG.md`
