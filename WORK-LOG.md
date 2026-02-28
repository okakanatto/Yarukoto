# Work Log

## 最新の作業（2026-02-28 --:--）

- **フェーズ**: 実装
- **対象バージョン**: v1.2.0
- **対象枝番**: 2-3（IMP-3: フィルタ複数選択）
- **ステータス**: ✅ 完了
- **やったこと**:
  - IMP-3（フィルタの複数選択）を実装
  - ステータスフィルタを「完了・キャンセルを除く」トグルスイッチに変更
  - タグフィルタをチップ（ピル）ON/OFF切替方式に変更（複数選択対応）
  - 重要度・緊急度フィルタをチップ方式で新規追加
  - やるタスク画面・タスク一覧画面の両方に適用
  - globals.css にフィルタチップ・トグルの共通スタイルを追加
  - npm run lint 実行、エラーなし（既存警告のみ）
- **次にやるべきこと**:
  - 枝番 2-3 の検証ステップ実行（STEP A + STEP B + STEP R）
- **注意事項・申し送り**:
  - 【変更サマリー】
  - ■ 変更した機能：
    - ステータスフィルタを「完了・キャンセルを除く」トグルスイッチに変更（やるタスク画面・タスク一覧画面）
    - タグフィルタをチップ（ピル）ON/OFF切替方式に変更（複数選択対応）
    - 重要度フィルタをチップ方式で新規追加（やるタスク画面・タスク一覧画面）
    - 緊急度フィルタをチップ方式で新規追加（やるタスク画面・タスク一覧画面）
  - ■ 変更したファイル：
    - `app/globals.css` — フィルタトグル・フィルタチップ・チップ行・チップラベル・カラードットの共通CSS追加
    - `components/TaskList.js` — filterStatus/filterTag をexcludeDone/filterTags/filterImportance/filterUrgencyに置換、fetchTasksのSQL条件構築変更、ツールバーJSXをトグル+チップUIに変更、CSS追加
    - `app/today/page.js` — 同上。加えてimportance_master/urgency_masterの読み込みを追加、loadTasksのタスク/ルーティン両方のSQL条件構築を変更
  - ■ 変更の概要：
    - ステータスフィルタ: 単一select → boolean型の「完了・キャンセルを除く」トグル。ONでstatus_code NOT IN (3, 5)条件を付加。ルーティンはrc.completion_date IS NULLで対応。
    - タグフィルタ: 単一select → 配列state。tag_id IN (...)のIN句で複数タグのOR条件を実現。ルーティンも同様にroutine_tagsサブクエリで対応。
    - 重要度/緊急度フィルタ: 新規追加。importance_level IN (...) / urgency_level IN (...)で複数レベルのOR条件。ルーティンにも同じフィルタ適用。
    - UIはiOS風トグルスイッチ（ステータス）とチップ（ピル）ON/OFF切替（タグ・重要度・緊急度）。チップ選択時はマスターカラーを背景色に使用。
  - ■ 影響が想定される箇所：
    - `app/today/page.js`: loadTasks関数（タスクSQL・ルーティンSQL両方の条件構築が変更）、useEffect依存配列変更
    - `components/TaskList.js`: fetchTasks関数（SQL条件構築が変更）、useCallback依存配列変更
    - `app/tasks/page.js`: TaskListコンポーネントを使用（props変更なし、影響なし）
    - `components/TaskEditModal.js`: TaskListからの呼び出し（フィルタ無関係、影響なし）
    - `hooks/useMasterData.js`: TaskListから参照（変更なし、影響なし）

---

## 過去の作業（直近3件まで保持。4件目以降は削除すること）

### 2026-02-28 --:-- — v1.2.0 枝番2-2 STEP R リグレッションテスト + 完了処理
- ステータス: ✅ 完了
- やったこと: STEP R リグレッションテスト実施（静的分析、合計33件 全件OK）、ISSUES.md・ROADMAP.md・qa-report.md の完了処理
- 変更したファイル: `ISSUES.md`, `ROADMAP.md`, `qa-report.md`

### 2026-02-28 --:-- — v1.2.0 枝番2-2 STEP B 品質レビュー指摘修正
- ステータス: ✅ 完了
- やったこと: qa-report.md STEP B 品質レビューで検出された NG 指摘全11件を修正（エラートースト追加、文言統一、CSS統一、max属性、親候補フィルタ統一）
- 変更したファイル: `components/TaskList.js`, `components/TaskEditModal.js`, `components/TaskInput.js`, `app/today/page.js`

### 2026-02-26 --:-- — v1.2.0 枝番2-2 タスクUI改善3点
- ステータス: ✅ 完了
- やったこと: BUG-5（レイアウト統一）、IMP-12（着手中→未着手戻し）、ENH-6（完了日即時反映）
- 変更したファイル: `components/TaskInput.js`, `components/TaskEditModal.js`, `components/StatusCheckbox.js`, `components/TaskList.js`, `app/today/page.js`
