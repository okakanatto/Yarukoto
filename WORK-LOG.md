# Work Log

## 最新の作業（2026-03-01 01:00）

- **フェーズ**: v1.3.0 枝番3-2 アーカイブ機能実装
- **対象バージョン**: v1.3.0
- **対象枝番**: 3-2（IMP-2: アーカイブ機能の実装）
- **ステータス**: ✅ 完了
- **やったこと**:
  - IMP-2: アーカイブ機能の全仕様を実装
    - DB変更: tasks テーブルに archived_at TEXT カラム追加、インデックス追加、app_settings に auto_archive_days シード
    - 手動アーカイブ: 完了/キャンセル済みタスクに📦ボタン表示、クリックでアーカイブ
    - 自動アーカイブ: completed_at + N日経過で自動アーカイブ（設定画面で日数指定、起動時＋設定変更時に実行）
    - 親子連動: 親アーカイブ時は子もまとめて、復元時も連動
    - アーカイブ済みタブ: タスク一覧に「📦 アーカイブ済み」タブ追加（閲覧・復元可能）
    - 除外処理: 今日やるタスク・ダッシュボード・タスク入力/編集の親タスク候補からアーカイブ済みを除外
  - npm run lint 実行 → エラー0件
- **変更したファイル**:
  - `lib/db.js` — archived_at カラム追加マイグレーション、インデックス、auto_archive_days シード、runAutoArchive() 関数追加・export
  - `components/TaskList.js` — showArchived ステート、タブ切替UI、archived_at フィルタ、handleArchive/handleRestore、📦/📤ボタン、CSS追加
  - `components/TaskInput.js` — 親タスク候補クエリに archived_at IS NULL 追加
  - `components/TaskEditModal.js` — 親タスク候補クエリに archived_at IS NULL 追加
  - `app/today/page.js` — タスク取得クエリに archived_at IS NULL 追加
  - `app/dashboard/page.js` — 全6クエリに archived_at IS NULL 追加
  - `app/settings/page.js` — オプションタブに自動アーカイブ日数設定カード追加、CSS追加
- **次にやるべきこと**:
  - 枝番3-2 の検証を実施（STEP A + STEP B + STEP R）
- **注意事項・申し送り**:
  - 【変更サマリー】
  - ■ 変更した機能：
    - タスクのアーカイブ機能（手動アーカイブ）：完了・キャンセル済みタスクに📦アーカイブボタンを追加
    - タスクの自動アーカイブ機能：完了日からN日経過で自動アーカイブ（設定画面で日数指定）
    - アーカイブ済みタスクの閲覧・復元タブ：タスク一覧に「📦 アーカイブ済み」タブを追加
    - 親子タスクの連動アーカイブ：親アーカイブ時は子もまとめて、復元時も連動
    - 今日やるタスク画面からアーカイブ済みタスクを除外
    - ダッシュボードからアーカイブ済みタスクを除外
    - タスク入力・編集時の親タスク候補からアーカイブ済みタスクを除外
    - 設定画面に自動アーカイブ日数オプションを追加
  - ■ 変更したファイル：
    - `lib/db.js` — tasks テーブルに archived_at カラム追加（ALTER TABLE マイグレーション）、archived_at インデックス追加、app_settings に auto_archive_days シード、runAutoArchive() 関数の追加・export
    - `components/TaskList.js` — showArchived ステート追加、アーカイブ済み/通常のタブ切替UI、fetchTasks に archived_at フィルタ追加、handleArchive/handleRestore ハンドラ追加、TaskItem に📦アーカイブ/📤復元ボタン追加、アーカイブ済みビュー専用の空メッセージ、CSS追加
    - `components/TaskInput.js` — 親タスク候補取得クエリに AND archived_at IS NULL 追加
    - `components/TaskEditModal.js` — 親タスク候補取得クエリに archived_at IS NULL 追加
    - `app/today/page.js` — タスク取得クエリに WHERE t.archived_at IS NULL 追加
    - `app/dashboard/page.js` — 全体完了率・今日の進捗・直近3営業日・7日間完了数・ステータス分布・期限切れの全6クエリに AND archived_at IS NULL 追加
    - `app/settings/page.js` — オプションタブに「完了タスクの自動アーカイブ」カード追加（数値入力 + onBlur でDB保存＋即時実行）、opt-number-group / opt-number-input / opt-number-unit CSS追加
  - ■ 変更の概要：
    - IMP-2（アーカイブ機能）の全仕様を実装。DB に archived_at TEXT カラムを追加し、NULL = 未アーカイブ、値あり = アーカイブ済みとする。手動アーカイブは完了(code=3)またはキャンセル(code=5)のタスクのみ可能で、親タスクは子がすべて完了/キャンセルでないとアーカイブ不可。親アーカイブ時は子もまとめてアーカイブし、復元時も子（または親）を連動復元する。自動アーカイブは completed_at + N日経過のタスクに適用（キャンセルタスクは completed_at を持たないため対象外）。設定変更時には runAutoArchive() を即時実行し、既存タスクも遡って対象とする。アプリ起動時にも initDb() 内で自動実行。
  - ■ 影響が想定される箇所：
    - `app/tasks/page.js` — TaskList を使用。showArchived ステートの追加による再レンダリング
    - `app/today/page.js` — タスク取得クエリ変更。アーカイブ済みタスクが表示から除外される
    - `app/dashboard/page.js` — 6箇所のクエリ変更。統計値からアーカイブ済みが除外される
    - `app/settings/page.js` — オプションタブに新カード追加
    - `components/TaskList.js` — TaskItem の props 変更（onArchive, onRestore, isArchived 追加）
    - `components/TaskInput.js` — 親タスク候補の変更
    - `components/TaskEditModal.js` — 親タスク候補の変更
    - `hooks/useMasterData.js` — 変更なし（影響なし）
    - `lib/db.js` — initDb() に runAutoArchive 追加。runAutoArchive が export される

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-02-28 24:30 — v1.3.0 枝番3-1 リグレッションテスト + 完了処理
- ステータス: ✅ 完了
- やったこと: STEP R リグレッションテスト実施（18件全OK、NG=0件）、完了処理（ISSUES.md BUG-3 → 🟢 完了、ROADMAP.md 枝番3-1 → ✅ 完了）
- 変更したファイル: `qa-report.md`, `ISSUES.md`, `ROADMAP.md`, `WORK-LOG.md`

### 2026-02-28 23:55 — v1.3.0 QA指摘2件修正
- ステータス: ✅ 完了
- やったこと: qa-report.md STEP B 一貫性レビューの未修正2件を修正（タグ一覧に▲▼ボタン追加 + saveMaster/saveTagsにconsole.error追加）
- 変更したファイル: `app/settings/page.js`, `qa-report.md`
