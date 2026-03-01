# Work Log

## 最新の作業（2026-03-01）

- **フェーズ**: v1.4.0 枝番 4-2 QA NG 項目修正
- **対象バージョン**: v1.4.0
- **対象課題**: IMP-13 STEP B NG 項目 6 件の修正
- **ステータス**: ✅ 完了
- **やったこと**:
  - NG-1: `handleRemove` の catch にエラートースト追加（他ハンドラとの一貫性統一）
  - NG-C1: ReorderGap グローバルスタイルを `DndGaps.js` に一元化（`today/page.js` と `TaskList.js` の重複定義削除）
  - NG-C2: ドラッグハンドルのホバー挙動統一（カード全体ホバーでハンドル表示）
  - NG-C3: ステータスセレクトの font-size/padding をタスク一覧に統一（0.78rem / 0.3rem 0.5rem）
  - NG-C4: カードリスト gap を 0.6rem に統一
  - NG-C5: ドラッグハンドルスタイル統一（height/align-self/font-size/user-select を双方に追加）
  - `npm run lint` エラーなし
- **次にやるべきこと**:
  - 検証 STEP R（リグレッションテスト）の実行
  - 枝番 4-3 の実装（ENH-1 + ENH-5）
- **注意事項・申し送り**:
  - 【変更サマリー】
  - ■ 変更した機能：
    - 「今日やるタスク」画面で「今日やるから外す」（✕ボタン）操作が失敗した場合にエラートーストを表示するようにした
    - 「今日やるタスク」画面と「タスク一覧」画面のDnDドラッグハンドルのホバー挙動を統一した（カード全体にホバーでハンドルが濃く表示されるように）
    - 「今日やるタスク」画面のステータスセレクト・カード間隔・ドラッグハンドルのスタイルを「タスク一覧」画面と統一した
    - ReorderGap（並び替え用ギャップゾーン）のCSSスタイルをDndGaps.jsコンポーネントに一元化した
  - ■ 変更したファイル：
    - `app/today/page.js` — handleRemoveにエラートースト追加、ReorderGapグローバルスタイル重複削除、ドラッグハンドルにカードホバー時opacity:1追加・height:100%/align-self:stretch追加、ステータスセレクトのfont-size/padding変更（0.78rem/0.3rem 0.5rem）、カードリストgapを0.6remに変更
    - `components/TaskList.js` — ReorderGapグローバルスタイル重複削除、ドラッグハンドル（.tc-handle）にfont-size:.85rem/user-select:none追加
    - `components/DndGaps.js` — ReorderGapコンポーネント内に<style jsx global>でtl-reorder-gap系スタイルを一元定義
  - ■ 変更の概要：
    - NG-1: `handleRemove` のcatchにエラートースト追加。`persistTodaySortOrder` や `useTaskActions.js` 内の全ハンドラと同じパターンに統一
    - NG-C1: `today/page.js` と `TaskList.js` の重複CSS定義を削除し、`DndGaps.js` の `ReorderGap` 内に一元化
    - NG-C2: `.today-card:hover .today-drag-handle { opacity:1 }` を追加。カードホバーでハンドル表示
    - NG-C3: `.today-status` のfont-size `0.75rem→0.78rem`、padding `0.25rem 0.4rem→0.3rem 0.5rem`
    - NG-C4: `.today-list` のgap `0.5rem→0.6rem`
    - NG-C5: `.today-drag-handle` に `height:100%; align-self:stretch` 追加、`.tc-handle` に `font-size:.85rem; user-select:none` 追加
  - ■ 影響が想定される箇所：
    - `app/today/page.js` — 直接変更。handleRemoveのエラーハンドリング変更、CSS変更
    - `components/TaskList.js` — 直接変更。CSS変更。タスク一覧画面（`app/tasks/page.js`から利用）に影響
    - `components/DndGaps.js` — 直接変更。`today/page.js` と `TaskList.js` の両方からimport
    - `app/layout.js` — handleRemoveの新エラートーストは `yarukoto:toast` イベント経由でグローバルトーストリスナーが受信（変更なし、受信側として影響確認対象）
    - `components/TaskItem.js` — .tc-handleクラスを使用（CSS変更の影響確認対象）
    - `hooks/useTodayTasks.js`, `hooks/useTaskActions.js`, `hooks/useTaskDnD.js` — 変更なし（影響なし）
    - `app/routines/page.js`, `app/dashboard/page.js`, `app/settings/page.js` — 変更なし（影響なし）

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-03-01 — v1.4.0 枝番 4-2 実装
- ステータス: ✅ 完了
- やったこと: HTML5 DnD → @dnd-kit + ReorderGap 方式に置換。TodayCardItem 新設、DragOverlay 追加、ルーティン＋通常タスク混在の並び替え対応
- 変更したファイル: `app/today/page.js`
- 注意: useDragReorder.js は設定画面でも使用されているため廃止せず維持

### 2026-03-01 19:00 — v1.4.0 枝番 4-1 完了処理
- ステータス: ✅ 完了
- やったこと: STEP R リグレッションテスト実施（全26件OK、NG 0件）。完了処理：ISSUES.md BUG-7 → 🟢 完了、ROADMAP.md 4-1 → ✅ 完了、qa-report.md 圧縮
- 注意: 要実機確認項目3件あり（タグバッジ統一・メタ情報統一・トーストカラー統一の目視確認）
