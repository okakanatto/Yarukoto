# Work Log

## 最新の作業（2026-03-01）

- **フェーズ**: v1.4.0 枝番 4-3 実装
- **対象バージョン**: v1.4.0
- **対象課題**: ENH-1（ダッシュボード: 今日完了したタスクの可視化）+ ENH-5（子タスク全完了で親タスクも完了にするオプション）
- **ステータス**: ✅ 完了
- **やったこと**:
  - ENH-1: ダッシュボードに「今日完了したタスク」セクションを新設
    - tasks テーブルから当日完了タスクを取得、ルーティン完了分とマージして一覧表示
    - タスク名・完了時刻・ルーティンバッジ付き、最大10件表示
    - 緑系ボーダーのカードデザイン（期限切れカードの赤系と対称）
  - ENH-5: 子タスク全完了→親タスク自動完了オプションを実装
    - `app_settings` に `auto_complete_parent` キーをシード（デフォルト無効）
    - 設定画面のオプションタブにトグルUI追加
    - `handleStatusChange` に自動完了ロジック追加（楽観的UI更新 + トースト通知）
  - `npm run lint` パス確認済み
- **次にやるべきこと**:
  - 枝番 4-3 の検証 STEP A + STEP B + STEP R を実施（バージョン最終枝番、DB変更 + UI変更あり）
- **注意事項・申し送り**:
  - 【変更サマリー】
  - ■ 変更した機能：
    - ダッシュボード：「今日完了したタスク」セクションを新設（タスク名・完了時刻・ルーティン区分を一覧表示）
    - 設定（オプション）：「子タスク全完了で親タスクも完了にする」トグル設定を追加
    - タスクステータス変更：上記オプションON時、子タスクが全て完了になると親タスクも自動的に完了に変更
  - ■ 変更したファイル：
    - `app/dashboard/page.js`: 今日完了したタスク・ルーティンの一覧取得クエリ追加、UIカード表示、CSS追加
    - `app/settings/_components/OptionsPanel.js`: auto_complete_parent トグルカードを追加
    - `hooks/useTaskActions.js`: handleStatusChange に子タスク全完了→親自動完了ロジックを追加
    - `lib/db.js`: app_settings に auto_complete_parent (デフォルト'0') のシードINSERTを追加
  - ■ 変更の概要：
    - ENH-1: ダッシュボードに「今日完了したタスク」カードを追加。tasks テーブルから date(completed_at) = 今日 の完了タスクを取得し、ルーティンの当日完了分とマージして一覧表示。最大10件表示、完了時刻とルーティンバッジ付き。件数がない場合はセクション非表示。
    - ENH-5: app_settings に auto_complete_parent キーを INSERT OR IGNORE でシード（デフォルト無効）。設定画面のオプションタブにトグルUIを追加。useTaskActions.js の handleStatusChange で、子タスクが完了(status_code=3)に変更された際に当該設定がONなら、同じ parent_id を持つ全兄弟タスクの完了状態を確認し、全員完了なら親タスクも自動で完了に更新。楽観的UIとトースト通知も同時に発行。
  - ■ 影響が想定される箇所：
    - `app/dashboard/page.js`: 既存のダッシュボードデータ構造に todayDone フィールドを追加（既存フィールドは変更なし）
    - `hooks/useTaskActions.js` の handleStatusChange: TaskList.js・today/page.js から呼ばれるため、両画面でステータス変更時に自動完了ロジックが発動する可能性あり
    - `lib/db.js` の initDb: 起動時に新設定のシードが走るが INSERT OR IGNORE のため既存DBに影響なし
    - `app/settings/page.js`: OptionsPanel に新props不要（既存の appSettings/setAppSettings/flash をそのまま使用）
  - 枝番 4-2 の要実機確認項目（STEP B で検出）は qa-report.md に残存。実機での目視確認推奨
  - 枝番 4-1 の要実機確認項目3件も未実施

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-03-01 — v1.4.0 枝番 4-2 STEP R リグレッションテスト + 完了処理
- ステータス: ✅ 完了
- やったこと: STEP R リグレッションテスト実施（全24件OK、NG 0件）、ISSUES.md・ROADMAP.md・qa-report.md 更新
- 変更したファイル: `ISSUES.md`, `ROADMAP.md`, `qa-report.md`, `WORK-LOG.md`

### 2026-03-01 — v1.4.0 枝番 4-2 QA NG 項目修正
- ステータス: ✅ 完了
- やったこと: STEP B NG項目6件修正（handleRemoveエラートースト、ReorderGap CSS一元化、ドラッグハンドルホバー統一、ステータスセレクト統一、gap統一、ハンドルスタイル統一）
- 変更したファイル: `app/today/page.js`, `components/TaskList.js`, `components/DndGaps.js`
