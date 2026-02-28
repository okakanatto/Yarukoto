# Work Log

## 最新の作業（2026-02-28 --:--）

- **フェーズ**: 実装
- **対象バージョン**: v1.2.0
- **対象枝番**: 2-4（IMP-7: タグのアーカイブ（非表示化））
- **ステータス**: ✅ 完了
- **やったこと**:
  - tags テーブルに `archived INTEGER DEFAULT 0` カラムを追加するマイグレーション実装
  - 設定画面のタグ管理にアーカイブ/解除ボタン（📦/📤）を追加
  - タグ一覧をアクティブ/アーカイブ済みセクションに分離表示
  - ドラッグ並べ替えをアクティブタグのみに制限（useDragReorder の対象を分離）
  - TagSelect ドロップダウンからアーカイブ済みタグを非表示化（既選択はピル表示維持、半透明インジケータ）
  - タスク一覧・今日やるタスク画面のタグフィルタからアーカイブ済みタグを除外
- **変更したファイル**:
  - `lib/db.js` — tags テーブルに `archived INTEGER DEFAULT 0` カラム追加マイグレーション
  - `app/settings/page.js` — アーカイブ/解除UI追加、active/archived セクション分離、ドラッグ対象分離、saveTags 改修
  - `components/TagSelect.js` — ドロップダウン候補から archived フィルタ、既選択アーカイブタグの半透明ピル表示
  - `components/TaskList.js` — tagOptions 生成時に archived タグ除外
  - `app/today/page.js` — tagOptions 生成時に archived タグ除外
- **次にやるべきこと**:
  - 枝番2-4の検証（STEP A + STEP B + STEP R）（バージョン最終枝番）
- **注意事項・申し送り**:
  - 【変更サマリー】
  - ■ 変更した機能：
    - タグのアーカイブ（非表示化）機能を新規追加
    - 設定画面のタグ管理にアーカイブ/アーカイブ解除ボタンを追加
    - タスク追加・編集画面のタグ選択ドロップダウンからアーカイブ済みタグを非表示化
    - タスク一覧・今日やるタスク画面のタグフィルタからアーカイブ済みタグを除外
  - ■ 変更したファイル：
    - `lib/db.js` — tags テーブルに `archived INTEGER DEFAULT 0` カラムを追加するマイグレーション追加
    - `app/settings/page.js` — タグ管理UIにアーカイブ/解除ボタン追加、アクティブ/アーカイブ済みセクション分離、ドラッグ並べ替えをアクティブタグのみに制限、saveTags を active/archived 分離対応に改修
    - `components/TagSelect.js` — ドロップダウン候補からアーカイブ済みタグを除外（archived フィルタ追加）、既選択のアーカイブ済みタグはピルで半透明表示
    - `components/TaskList.js` — tagOptions の生成時にアーカイブ済みタグを除外
    - `app/today/page.js` — tagOptions の生成時にアーカイブ済みタグを除外
  - ■ 変更の概要：
    - IMP-7「タグのアーカイブ（非表示化）」を実装。不要になったタグを完了済みタスクのデータ（task_tags）に影響を与えずに各種選択肢から非表示にできるようにした。
    - DB: `tags` テーブルに `archived` カラム（INTEGER DEFAULT 0）を ALTER TABLE で追加。既存タグは全て archived=0（アクティブ）のまま後方互換。
    - 設定画面: アクティブタグ一覧に📦アーカイブボタンを表示（ホバーで出現）。アーカイブ済みタグは下部に「📦 アーカイブ済み」セクションとして分離表示し、📤解除ボタンと🗑削除ボタンを配置。ドラッグ並べ替えはアクティブタグのみ対象とし、useDragReorder に渡すリストを active/archived で分離管理。
    - TagSelect: ドロップダウンの選択肢で `!t.archived` フィルタを適用。既にタスクに付与されているアーカイブ済みタグは allTags 経由でピル表示を維持（半透明のビジュアルインジケータ付き）。
    - フィルタ: TaskList と TodayPage の tagOptions 生成時に `!t.archived` フィルタを適用し、フィルタドロップダウンにアーカイブ済みタグを表示しない。
  - ■ 影響が想定される箇所：
    - `components/TaskInput.js` — TagSelect に allTags（useMasterData 経由）を渡している。useMasterData は全タグを返すが、TagSelect 内部でアーカイブ済みをフィルタするため外部IF変更なし。
    - `components/TaskEditModal.js` — 同上。既存タスクにアーカイブ済みタグが付与されている場合、TagSelect のピルに半透明で表示される。
    - `app/routines/page.js` — TagSelect に tags（useMasterData 経由）を渡している。TagSelect 内部でフィルタされるため外部IF変更なし。
    - `hooks/useMasterData.js` — SELECT * FROM tags で全カラム取得のため、archived フィールドが自動的に含まれる。変更不要。
    - `app/dashboard/page.js` — タグ表示に影響なし（task_tags は保持されるため）。

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-02-28 --:-- — v1.2.0 枝番2-3 IMP-3 フィルタ複数選択（Excelライクドロップダウン）
- ステータス: ✅ 完了
- やったこと: フィルタUIをExcelライクなマルチセレクトドロップダウンに全面変更、MultiSelectFilter 新規作成、4フィルタ統一UI実装
- 変更したファイル: `components/MultiSelectFilter.js`（新規）, `components/TaskList.js`, `app/today/page.js`, `app/globals.css`

### 2026-02-28 --:-- — v1.2.0 枝番2-3 IMP-3 STEP R リグレッションテスト + 完了処理
- ステータス: ✅ 完了
- やったこと: 枝番2-3の STEP R リグレッションテスト実施（静的分析、合計7件 全件OK）、ISSUES.md・ROADMAP.md・qa-report.md の完了処理
- 変更したファイル: `ISSUES.md`, `ROADMAP.md`, `qa-report.md`
