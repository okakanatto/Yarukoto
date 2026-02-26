# Work Log

## 最新の作業（2026-02-26 --:--）

- **フェーズ**: 実装
- **対象バージョン**: v1.2.0
- **対象枝番**: 2-1
- **ステータス**: ✅ 完了
- **やったこと**:
  - **BUG-4**: 親タスク削除時に子タスクも連鎖削除される問題を修正
    - `TaskList.js` の `handleDelete` で、`DELETE` 実行前に子タスクの `parent_id` を `NULL` に更新し、子タスクを独立したルートタスクとして保護する処理を追加
  - **BUG-6**: 子タスクを持つタスクに親タスクを設定できてしまう問題を修正
    - `TaskEditModal.js` で編集対象タスクの子タスク有無をチェックし、子を持つ場合は親タスク選択フィールドを無効化（`disabled` + テキスト「設定不可（子タスクあり）」表示）
    - `handleSave` 時にもDB問い合わせによるバリデーションを追加し、万一のバイパスを防止
    - 既存のDnDバリデーション（`handleDragEnd` 内の子タスクチェック、`parent_id IS NULL` 候補制限）は変更不要と判断
- **変更したファイル**:
  - `components/TaskList.js` — `handleDelete` に子タスクの `parent_id` NULL化処理を追加
  - `components/TaskEditModal.js` — `hasChildren` ステート追加、親タスク選択UI無効化、保存時バリデーション追加
- **次にやるべきこと**:
  - ROADMAP.md で指定された検証STEPの実行: STEP A（機能検証）+ STEP B（品質レビュー）+ STEP R（リグレッションテスト）
- **注意事項・申し送り**:
  - DB変更なし（ALTER TABLE不要）。既存データに影響なし
  - 親タスク削除→子タスク独立化のため、削除前にconfirmダイアログが表示される（変更なし）
  - DnDでのネスト制限は既存ロジック（`handleDragEnd` 195-199行目、`parentTask.parent_id` チェック193行目）で対応済み
  - `TaskInput.js` の親タスク候補クエリは既に `parent_id IS NULL` で絞り込んでいるため変更不要

---

## 過去の作業（直近3件まで保持。4件目以降は削除すること）

### 2026-02-25 --:-- — ガイドレビュー・改善
- ステータス: ✅ 完了
- やったこと: `dev-flow-guide.md` のレビュー結果に基づき、全15件の改善を適用
- 変更したファイル: `dev-flow-guide.md`

### 2026-02-25 --:-- — 初期セットアップ
- ステータス: ✅ 完了
- やったこと: `dev-flow-guide.md` を作成、`WORK-LOG.md` を新規作成
- 変更したファイル: `dev-flow-guide.md`, `WORK-LOG.md`
