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
  - 変更したファイル: `app/today/page.js`, `components/TaskList.js`, `components/DndGaps.js`, `qa-report.md`
  - 影響範囲: 今日やるタスク画面の CSS（gap, ステータスセレクト, ドラッグハンドル）、タスク一覧の CSS（ドラッグハンドル）、DndGaps のグローバルスタイル
  - 機能ロジック変更は `handleRemove` のエラートースト追加のみ（既存動作は維持）

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
