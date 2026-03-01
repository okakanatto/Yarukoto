# Work Log

## 最新の作業（2026-03-01）

- **フェーズ**: v1.4.0 枝番 4-2 実装
- **対象バージョン**: v1.4.0
- **対象課題**: IMP-13（今日やるタスクのDnDギャップ方式統一）
- **ステータス**: ✅ 完了
- **やったこと**:
  - HTML5 DnD（`useDragReorder`）→ @dnd-kit + `ReorderGap` 方式に置換
  - `TodayCardItem` コンポーネント新設（`useDraggable` 対応）
  - ルーティン＋通常タスク混在の並び替え `handleDragEnd` ハンドラ実装
  - `DragOverlay` でドラッグ中プレビュー表示
  - タスク一覧と同じ「ギャップにドロップ」操作に統一
  - `useDragReorder.js` は設定画面（StatusPanel, TagsPanel）でも使用されているため廃止せず維持
  - `npm run lint` エラーなし
- **次にやるべきこと**:
  - 検証 STEP A + STEP B + STEP R の実行（ROADMAP 4-2 の検証ステップ）
- **注意事項・申し送り**:
  - 【変更サマリー】
  - ■ 変更した機能：
    - 「今日やるタスク」画面の手動並び替え DnD をギャップ方式に変更（タスク間の線にドロップする方式に統一）
    - ドラッグ中にドラッグ対象のプレビュー（DragOverlay）を表示
  - ■ 変更したファイル：
    - `app/today/page.js` — HTML5 DnD → @dnd-kit 化。TodayCardItem コンポーネント新設、DndContext/DragOverlay/ReorderGap 導入、handleDragStart/handleDragEnd 実装。CSS に touch-action: none 追加、旧 drag-over スタイル削除、ReorderGap 用グローバルスタイル追加
  - ■ 変更の概要：
    - 「今日やるタスク」の手動並び替え DnD を、ネイティブ HTML5 DnD（useDragReorder フック、カードに重ねてドロップする方式）から @dnd-kit ライブラリベースの ReorderGap 方式（タスク間のギャップゾーンにドロップする方式）に置換した
    - タスク一覧画面と同じ操作体験に統一し、UX の一貫性を確保
    - TodayCardItem コンポーネントを新設し、各カードに useDraggable フックを適用。PointerSensor（distance: 8px）で誤操作防止
    - handleDragEnd で ReorderGap の ID（reorder-today-{index}）をパースして並び替えを実行。ルーティンと通常タスクが混在する配列を一括処理
    - persistTodaySortOrder は既存ロジックをそのまま流用（routines.today_sort_order / tasks.today_sort_order を更新）
    - useDragReorder.js は設定画面（StatusPanel, TagsPanel）でも使用されているため削除せず維持（ROADMAP の「廃止」記述は設定画面の利用が考慮されていなかった）
  - ■ 影響が想定される箇所：
    - `app/today/page.js` — 直接変更。手動並び替え時の操作方法が変わる（カード重ね → ギャップドロップ）
    - `components/DndGaps.js` — ReorderGap コンポーネントを今日やるタスク画面でも使用開始
    - `hooks/useTodayTasks.js` — today_sort_order の読み込みロジックは変更なし（影響なし）
    - `hooks/useDragReorder.js` — today/page.js からのインポートが削除されたが、settings 画面（StatusPanel, TagsPanel）では引き続き使用
    - `hooks/useTaskActions.js` — handleStatusChange / handleRoutineStatusChange は TodayCardItem 経由で呼ばれるが、引数・動作に変更なし

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-03-01 19:00 — v1.4.0 枝番 4-1 完了処理
- ステータス: ✅ 完了
- やったこと: STEP R リグレッションテスト実施（全26件OK、NG 0件）。完了処理：ISSUES.md BUG-7 → 🟢 完了、ROADMAP.md 4-1 → ✅ 完了、qa-report.md 圧縮
- 注意: 要実機確認項目3件あり（タグバッジ統一・メタ情報統一・トーストカラー統一の目視確認）

### 2026-03-01 18:25 — v1.4.0 枝番 4-1 QA NG 項目修正
- ステータス: ✅ 完了
- やったこと: NG-1(handleRestore ガード)、NG-2(processingIds 子タスク伝播)、NG-B1〜B5(エラートースト・disabled CSS・タグバッジ統一・メタ情報統一・トーストカラー統一)の7件修正
- 変更したファイル: `hooks/useTaskActions.js`, `components/TaskItem.js`, `components/TaskList.js`, `app/today/page.js`, `app/routines/page.js`
