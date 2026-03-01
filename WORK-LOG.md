# Work Log

## 最新の作業（2026-03-01 14:00）

- **フェーズ**: v1.3.0 枝番3-3 IMP-4 実装
- **対象バージョン**: v1.3.0
- **対象枝番**: 3-3（IMP-4: ソートON/OFF切替 + DnDによる手動並び替え）
- **ステータス**: ✅ 完了
- **やったこと**:
  - IMP-4の全仕様を実装
    - 自動ソート/手動並び替えの切替トグルボタン（タスク一覧・やるタスク両画面）
    - 手動モード時のDnDによるタスク並び替え（タスク一覧: @dnd-kit ReorderGap方式、やるタスク: ネイティブHTML5 DnD方式）
    - タスク一覧: 親タスク単位・子タスク単位の独立した並び替え
    - やるタスク: ルーティン・ピック済みタスク・期限日タスクの統合並び替え
    - 新規タスク追加時のリスト先頭挿入（sort_order = MIN - 1）
    - DB: tasks.sort_order, tasks.today_sort_order, routines.today_sort_order カラム追加
    - app_settings: sort_mode_tasks, sort_mode_today 設定追加
  - DnD操作体系: ギャップドロップ→並び替え、タスク上ドロップ→ネスト、UnnestGapドロップ→アンネスト（共存）
  - 手動モード時は親タスク（子タスク持ち）もドラッグ可能に変更
  - `npm run lint` エラーなし
- **変更したファイル**:
  - `lib/db.js` — sort_order/today_sort_order カラム追加マイグレーション、インデックス作成、sort_mode設定シード
  - `components/TaskList.js` — sortMode状態管理、トグルUI、ReorderGapコンポーネント、handleReorder関数、manual時のsort_order依存ソート、isDraggable条件変更、子タスク間ReorderGap、CSS追加
  - `app/today/page.js` — sortMode状態管理、トグルUI、ネイティブHTML5 DnDハンドラ、today_sort_order保存・ソート、ルーティンのtoday_sort_orderマッピング追加、CSS追加
  - `components/TaskInput.js` — 新規タスクのsort_order計算（MIN(siblings) - 1で先頭挿入）
- **次にやるべきこと**:
  - ROADMAPの検証STEP（4-E リグレッションテスト）を実施する
- **注意事項・申し送り**:
  - 【変更サマリー】
  - ■ 変更した機能：
    - 自動ソート/手動並び替え切替（タスク一覧画面）
    - 自動ソート/手動並び替え切替（今日やるタスク画面）
    - タスク一覧でのDnD手動並び替え（親タスク間・子タスク間の独立した並び替え）
    - 今日やるタスクでのドラッグ手動並び替え（ルーティン含む）
    - 新規タスクのリスト先頭挿入
    - 手動モード時の親タスク（子あり）のドラッグ対応
  - ■ 変更したファイル：
    - `lib/db.js` — tasks.sort_order, tasks.today_sort_order, routines.today_sort_orderカラム追加。既存タスクの初期sort_order設定。sort_mode_tasks/sort_mode_today設定シード。idx_tasks_sort_orderインデックス追加
    - `components/TaskList.js` — sortMode状態+DB永続化、トグルUI、ReorderGapコンポーネント、handleReorder関数（ルート・子の並び替え+アンネスト対応）、manual時ソートロジック、isDraggable条件分岐、子タスク間gap描画、CSS
    - `app/today/page.js` — sortMode状態+DB永続化、トグルUI、ネイティブDnD（dragStart/dragEnd/dragOver/dragLeave/drop）、today_sort_order永続化（tasks+routines）、manual時ソートロジック、CSS
    - `components/TaskInput.js` — INSERT前にsort_order算出（MIN(同グループsort_order) - 1）、INSERTカラムにsort_order追加
  - ■ 変更の概要：
    - 自動ソートのON/OFF切替を実装。自動時は従来のドロップダウンでソートキーを選択、手動時はDnDで自由に並び替え可能。タスク一覧と今日やるタスクでそれぞれ独立したソートモードと並び順（sort_order/today_sort_order）を保持。DnD操作体系はギャップ→並び替え、タスク上→ネスト、UnnestGap→アンネストの3操作が共存する設計。手動モード時は子タスクを持つ親タスクもドラッグ可能にし、並び替えできるよう変更。新規タスクはMIN(sort_order)-1で常にリスト先頭に挿入される。
  - ■ 影響が想定される箇所：
    - `app/tasks/page.js` — TaskListコンポーネントを使用（新props不要、内部で自己完結）
    - `app/layout.js` — FABからTaskInputを呼び出し（sort_order計算は内部で完結）
    - `app/dashboard/page.js` — タスク統計表示（sort_orderは影響しない）
    - `app/routines/page.js` — ルーティン管理（today_sort_orderカラム追加だが参照箇所なし）
    - `components/TaskEditModal.js` — タスク編集（sort_orderは編集対象外）
    - `hooks/useMasterData.js` — マスターデータ取得（影響なし）
    - `lib/holidayService.js` — 祝日判定（影響なし）

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-03-01 11:00 — v1.3.0 枝番3-2 リグレッションテスト + 完了処理
- ステータス: ✅ 完了
- やったこと: STEP R リグレッションテスト実施（25件全OK）、ISSUES.md IMP-2 → 完了、ROADMAP.md 枝番3-2 → 完了
- 変更したファイル: `qa-report.md`, `ISSUES.md`, `ROADMAP.md`, `WORK-LOG.md`

### 2026-03-01 02:00 — v1.3.0 枝番3-2 QA指摘5件修正
- ステータス: ✅ 完了
- やったこと: handleArchive/handleRestoreのトランザクション化、runAutoArchiveの親子連動、CSVエクスポートのアーカイブ除外、復元トーストメッセージ改善
- 変更したファイル: `components/TaskList.js`, `lib/db.js`, `app/settings/page.js`, `qa-report.md`
