# Work Log

## 最新の作業（2026-02-26 --:--）

- **フェーズ**: 実装
- **対象バージョン**: v1.2.0
- **対象枝番**: 2-2
- **ステータス**: ✅ 完了
- **やったこと**:
  - **BUG-5**: タスクの編集と追加でレイアウトが異なる問題を修正
    - `TaskInput.js` と `TaskEditModal.js` の入力項目の並び順を ISSUES.md の仕様に統一
    - 統一順: タスク名→終了期限→備考→タグ→親タスク→開始日・想定工数→重要度・緊急度→完了日（編集のみ）
    - TaskEditModal.js はステータスをタスク名直下に独立配置、3カラムrowを1〜2カラム構成に整理
  - **IMP-12**: ステータスチェックボックスの着手中→未着手戻し対応
    - `StatusCheckbox.js` に着手中(2)ホバー時の「↩」戻しボタンを追加
    - `handleRevertClick` / `showRevert` / `.status-cb-revert` CSS を新規追加
    - 着手中の本体クリック（→完了）は従来通り維持
  - **ENH-6**: 完了日（`completed_at`）の即時UI反映
    - `TaskList.js` と `today/page.js` の `handleStatusChange` で楽観的更新時に `completed_at` も同時更新
    - 完了(3)への変更時は現在日時をセット、非完了への変更時は null をセット
- **変更したファイル**:
  - `components/TaskInput.js` — 詳細パネルの項目順を仕様に統一
  - `components/TaskEditModal.js` — te-body内の項目順を仕様に統一、レイアウト整理
  - `components/StatusCheckbox.js` — 着手中→未着手戻しボタン追加
  - `components/TaskList.js` — handleStatusChange の楽観的更新で completed_at も更新
  - `app/today/page.js` — handleStatusChange の楽観的更新で completed_at も更新
- **次にやるべきこと**:
  - ROADMAP.md で指定された検証STEPの実行: STEP A（機能検証）+ STEP B（品質レビュー）+ STEP R（リグレッションテスト）
- **注意事項・申し送り**:
  - DB変更なし（ALTER TABLE不要）。既存データに影響なし
  - BUG-5: TaskEditModal のステータスドロップダウンは仕様の8項目に含まれないが、編集画面に必要なためタスク名直下に独立配置
  - IMP-12: `twoStateOnly` モード（ルーティン用）ではrevertボタンは表示されない
  - ENH-6: 楽観的更新はUI表示用のみ。DB側は従来通り `datetime('now', 'localtime')` で正確な値を保存
  - ENH-6: 日時フォーマットは `sv-SE` ロケール（`YYYY-MM-DD HH:mm:ss`）で既存の `completed_at.split(' ')[0]` と互換性あり
  - 影響箇所: TaskList.js のTaskItemコンポーネント、today/page.js のタスクカード、dashboard/page.js（DB値依存のため影響なし）、StatusCheckbox を使用する全画面、TaskEditModal/TaskInput を呼び出す全画面

---

## 過去の作業（直近3件まで保持。4件目以降は削除すること）

### 2026-02-26 --:-- — v1.2.0 枝番2-1 親子タスクのデータ整合性修正
- ステータス: ✅ 完了
- やったこと: BUG-4（親タスク削除時の子タスク連鎖削除防止）、BUG-6（2階層制限バリデーション追加）
- 変更したファイル: `components/TaskList.js`, `components/TaskEditModal.js`

### 2026-02-25 --:-- — ガイドレビュー・改善
- ステータス: ✅ 完了
- やったこと: `dev-flow-guide.md` のレビュー結果に基づき、全15件の改善を適用
- 変更したファイル: `dev-flow-guide.md`

### 2026-02-25 --:-- — 初期セットアップ
- ステータス: ✅ 完了
- やったこと: `dev-flow-guide.md` を作成、`WORK-LOG.md` を新規作成
- 変更したファイル: `dev-flow-guide.md`, `WORK-LOG.md`
