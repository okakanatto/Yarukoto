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
  - 【変更サマリー】
  - ■ 変更した機能：
    - 子タスク自動完了（ENH-5）：キャンセル済みの親タスクを自動完了の対象外に修正
    - 今日やるタスク画面：操作中タスクのボタン無効化（processingIds反映）をタスク一覧と統一
    - ルーティン画面：トグルスイッチのON色を設定画面と統一（緑→アプリプライマリカラー）
    - 設定画面（オプション）：トグル設定のON判定ロジックを全項目で統一
  - ■ 変更したファイル：
    - `hooks/useTaskActions.js`: L57 に `&& parentRows[0].status_code !== 5` 条件追加（キャンセル済み親タスクを自動完了から除外）
    - `app/today/page.js`: TodayCardItem に `isProcessing` prop 追加、StatusCheckbox・ステータスselect・✕ボタンに `disabled={isProcessing}` 追加
    - `app/routines/page.js`: L231 `.rt-switch.on` の背景色を `#34c759` → `var(--color-primary)` に変更
    - `app/routines/_components/RoutineFormModal.js`: L441 `.rt-switch-lg.on` の背景色を `#34c759` → `var(--color-primary)` に変更
    - `app/settings/_components/OptionsPanel.js`: L60,63 `show_overdue_in_today` の ON 判定を `!== '0'` → `=== '1'` に変更
    - `hooks/useTodayTasks.js`: L54 `show_overdue_in_today` の ON 判定を `!== '0'` → `=== '1'` に変更
  - ■ 変更の概要：
    - A-2 NG-1（重要度：中）: `useTaskActions.js` の `handleStatusChange` 内 ENH-5 自動完了ロジックで、親タスクのステータスが3（完了）の場合のみスキップしていたが、5（キャンセル）の場合もスキップするよう条件を追加。ユーザーが意図的にキャンセルした親タスクが子タスク操作で勝手に完了に変わる問題を修正。
    - A-3 NG-1（重要度：低）: `app/today/page.js` の `TodayCardItem` コンポーネントに `isProcessing` prop を新設し、`actions.processingIds.has(task.id)` で渡すようにした。StatusCheckbox、ステータスselect、✕ボタンに `disabled={isProcessing}` を追加。タスク一覧画面（TaskItem.js）と同じ操作中保護を今日やるタスク画面にも適用。
    - B NG-2（重要度：低）: `app/routines/page.js` の `.rt-switch.on` と `app/routines/_components/RoutineFormModal.js` の `.rt-switch-lg.on` の背景色をハードコーディングの `#34c759`（iOS緑）から `var(--color-primary)`（アプリのプライマリカラー）に変更。設定画面の `.opt-toggle.on` と色を統一。
    - B NG-1（重要度：極低）: `app/settings/_components/OptionsPanel.js` の `show_overdue_in_today` トグルの ON 判定を `!== '0'` から `=== '1'` に変更（L60 className, L63 aria-checked）。同時に `hooks/useTodayTasks.js` L54 の設定読み込み判定も `!== '0'` → `=== '1'` に変更。他の2つのトグル（`inherit_parent_tags`, `auto_complete_parent`）と同じ判定ロジックに統一。db.js で初期値 '1' がシード済みのため動作に実質的差異なし。
  - ■ 影響が想定される箇所：
    - `hooks/useTaskActions.js` の `handleStatusChange` → `components/TaskList.js`（TaskItem経由）と `app/today/page.js`（TodayCardItem経由）の両画面から呼ばれる。自動完了のスキップ条件拡張はキャンセル済み親タスクのケースのみ影響。
    - `app/today/page.js` の `TodayCardItem` → 同ファイル内でのみ使用。`actions.processingIds` は `useTaskActions` から取得済み。新規 prop 追加のみで既存ロジック変更なし。
    - `app/routines/page.js` の `.rt-switch.on` → ルーティン一覧カード内のクイック有効/停止トグルの見た目のみ変更。CSS変数参照のため `globals.css` の `--color-primary` 定義に依存。
    - `app/routines/_components/RoutineFormModal.js` の `.rt-switch-lg.on` → ルーティン編集モーダル内の有効/停止トグルの見た目のみ変更。同上。
    - `app/settings/_components/OptionsPanel.js` → `app/settings/page.js` から import。appSettings の値は `toggleSetting` で `'0'`/`'1'` のみ書き込まれるため、判定変更による動作差異なし。
    - `hooks/useTodayTasks.js` → `app/today/page.js` から import。`setShowOverdue` の判定変更は、db.js L177 で `show_overdue_in_today` が `'1'` でシード済みのため、通常パスで差異なし。

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
