# Work Log

## 最新の作業（2026-03-01 15:00）

- **フェーズ**: v1.3.1 R-2 Phase 1 TaskList.js 分割
- **対象バージョン**: v1.3.1
- **ステータス**: ✅ 完了
- **やったこと**:
  - `refactoring-plan.md` の Phase 1 に従い、`TaskList.js`（1030行）を分割
  - `components/TaskItem.js` 新規作成（TaskItemコンポーネント抽出）
  - `components/DndGaps.js` 新規作成（UnnestGap / ReorderGap 抽出）
  - `hooks/useTaskActions.js` 新規作成（DB操作ハンドラ5種を抽出）
  - `hooks/useTaskDnD.js` 新規作成（DnDロジック一式を抽出）
  - `TaskList.js` を 1030行 → 516行 に削減（うちCSS約260行、ロジック約256行）
  - `npm run lint` でエラーなしを確認
- **変更したファイル**:
  - `components/TaskList.js` — 分割元。インポート変更 + 抽出済みコードの削除
  - `components/TaskItem.js` — ★新規。TaskItemコンポーネント（170行）
  - `components/DndGaps.js` — ★新規。UnnestGap / ReorderGap（36行）
  - `hooks/useTaskActions.js` — ★新規。タスクCRUD操作フック（150行）
  - `hooks/useTaskDnD.js` — ★新規。DnDロジックフック（251行）
- **次にやるべきこと**:
  - STEP A + STEP R の検証を実施（ROADMAP.md で指定された検証ステップ）
- **注意事項・申し送り**:
  - 【変更サマリー】
  - ■ 変更した機能：リファクタリングのため機能変更なし。TaskList.js の責務を4ファイルに分離し、メインファイルはレイアウト+ツールバー+リスト描画に集中する構造へ変更。
  - ■ 変更したファイル：
    - `components/TaskList.js` — 分割元。useTaskActions / useTaskDnD フックの利用に切替。TaskItem / DndGaps を外部インポートに変更。不要なimport（useDraggable, useDroppable, CSS, StatusCheckbox, formatMin）を削除。
    - `components/TaskItem.js` ★新規 — TaskList.js L872-1027 のTaskItemコンポーネントを独立ファイルに抽出。DnD refs、dueMeta計算、子タスク展開/インライン入力を含む。
    - `components/DndGaps.js` ★新規 — TaskList.js L847-870 のUnnestGap / ReorderGapを独立ファイルに抽出。
    - `hooks/useTaskActions.js` ★新規 — TaskList.js L161-289 のDB操作ハンドラ（handleStatusChange / handleDelete / handleTodayToggle / handleArchive / handleRestore）をカスタムフックに抽出。
    - `hooks/useTaskDnD.js` ★新規 — TaskList.js L291-511 のDnDロジック（handleDragStart / handleDragEnd / handleReorder / persistSortOrder / activeId state）をカスタムフックに抽出。
  - ■ 変更の概要：TaskList.js（1030行）が肥大化していたため、refactoring-plan.md Phase 1 に従い責務ごとにファイルを分離した。UIコンポーネント（TaskItem, DndGaps）、DB操作ロジック（useTaskActions）、DnDロジック（useTaskDnD）の3軸で分割。styled-jsx CSSはプロジェクト方針に従いTaskList.js側に残置。
  - ■ 影響が想定される箇所：
    - `app/tasks/page.js` — TaskList をデフォルトインポートしているが、インターフェース変更なし（影響なし）
    - `app/today/page.js` — Phase 2（R-3）で useTaskActions フックの利用を検討予定。現時点では変更なし
    - styled-jsx global CSS — TaskList.js に残しているため、TaskItem.js 等の子コンポーネントから参照されるCSSクラス（tc-card, tc-body等）は引き続き正常に適用される

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-03-01 14:32 — v1.3.1 R-1 Phase 0 共通ユーティリティ抽出（検証）
- ステータス: ✅ 完了
- やったこと: STEP R リグレッションテスト（直接テスト9項目・影響範囲の検証）を実施し、全件OKを確認
- 変更したファイル: `ROADMAP.md`, `qa-report.md`, `WORK-LOG.md`

### 2026-03-01 24:00 — v1.3.1 R-1 Phase 0 共通ユーティリティ抽出（実装）
- ステータス: ✅ 完了
- やったこと: `lib/utils.js` 等新規作成、全ファイルの getDb ボイラープレート等共通化
- 変更したファイル: `lib/utils.js`, `hooks/useFilterOptions.js`, `lib/taskSorter.js`, `components/TaskList.js` など
