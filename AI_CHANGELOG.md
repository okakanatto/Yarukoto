# AI Change Log

This file tracks changes made by AI agents (Antigravity, Claude Code, etc.) to coordinate development and maintain context across sessions.

## Format
- **Date**: YYYY-MM-DD
- **Agent**: Name of the agent
- **Task**: Brief description of the task
- **Details**: Summary of changes
- **Files**: List of modified files

---

## Log

### 2026-02-23
- **Agent**: Antigravity
- **Task**: v1.0 Release Build & Documentation Setup
- **Details**:
    - **Release**: Tauriを用いたポータブルアプリ版への本番ビルド(`npm run tauri build`)を正常に完了.
    - **Feature**: `app.exe` を `Yarukoto_Portable.exe` へリネームし、ユーザー向けの詳細マニュアル (`Readme.txt`) を作成して配布用ZIPパッケージ (`Yarukoto_Portable_v1.0.0.zip`) を構築.
    - **Docs**: `10_Projects/0_Personal/AI_Development_Profile.md` を作成し、今後の別プロジェクトへのAIエージェント引き継ぎ用に「バイブコーディングスタイル」「プログラミングに詳しくない前提での専門用語解説ルール」「過去の実績（YarukotoやDigi-Pet）」などを定義.
    - **Docs**: v1.1移行に向け、`AI_CHANGELOG.md`, `CLAUDE.md`, `ISSUES.md` に今回の経緯やTauriのDB紐づき仕様（identifierによるSQLite一元化）などを反映して整理.
- **Files**:
    - `Yarukoto_Portable.exe`, `Readme.txt` (Created)
    - `../0_Personal/AI_Development_Profile.md` (Created)
    - `AI_CHANGELOG.md`, `CLAUDE.md`, `ISSUES.md` (Modified: ドキュメント整理)

### 2026-02-22
- **Agent**: Claude Code (claude-opus-4-6)
- **Task**: Database Locked バグ修正 + 全体デバッグ + ドキュメント整備
- **Details**:
    - **Fix (Critical)**: 起動時の `database is locked (code: 5)` エラーを根絶。
      - `lib/holidayService.js`: `updateHolidayCache` を `globalThis[HOLIDAY_UPDATE_KEY]` ベースのシングルトン Promise でガード。React Strict Mode の二重 mount や HMR によるモジュール再評価でも同一 Promise が再利用され、`BEGIN TRANSACTION` の衝突が解消される。
      - `lib/db.js`: `dbPromise` をモジュールローカル変数から `globalThis[DB_PROMISE_KEY]` に移行し、HMR 耐性を付与（二重 DB 初期化の防止）。
    - **Debug**: `getDb()` を呼び出す全9ファイル（`today`, `routines`, `dashboard`, `settings`, `layout`, `TaskInput`, `TaskEditModal`, `TaskList`, `useMasterData`）を精査。全箇所が正しいパターンを使用していることを確認。他に DB 競合の懸念なし。
    - **Docs**: `CLAUDE.md` に `holidayService.js` のディレクトリ記載・globalThis パターンの解説・バグ修正記録を追記。`handoff_to_claude.md` を v1.0 ビルド待機状態に書き換え。`ISSUES.md` の Database Locked を「解決済み」に更新。
    - **Note**: `components/TaskEditModal.js` の styled-jsx CSS にセレクタ書式の乱れを発見（`.te - backdrop` など）。動作への影響は未確認だが、ビルド前に目視確認推奨。
- **Files**:
    - `lib/holidayService.js` (Modified: globalThis シングルトンガード追加)
    - `lib/db.js` (Modified: dbPromise を globalThis に移行)
    - `CLAUDE.md` (Modified: ドキュメント更新)
    - `ISSUES.md` (Modified: Database Locked を解決済みに変更)
    - `handoff_to_claude.md` (Modified: v1.0 ビルド引継ぎ内容に書き換え)
    - `AI_CHANGELOG.md` (Modified: このエントリ追加)

### 2026-02-22
- **Agent**: Antigravity
- **Task**: Holiday Exclusions, Monthly Routines & Deep Architectural Audits
- **Details**:
    - **Feature**: 祝日の自動判定および除外・振替機能（前倒し・後ろ倒し）を実装.
    - **Feature**: 毎月指定日（月末やうるう年対応含む）に発火する高度なルーティン機能を実装.
    - **Feature**: 内閣府公開の祝日CSVデータをTauriの `@tauri-apps/plugin-http` 経由で取得し、SQLiteにオンプレミスキャッシュする `updateHolidayCache` 機構を構築（CORS回避対応）.
    - **Fix (Security/Data)**: タスク削除時に紐付くタグや履歴が消えない「データ肥大化バグ」を修正（SQLite接続時に `PRAGMA foreign_keys = ON;` を追加）.
    - **Fix (Performance)**: ルーティン計算時に発生していたN+1問題をインメモリSetキャッシュにより解消し、数千回のDB通信によるフリーズを防止.
    - **Fix (Performance)**: `tasks.db` に5つのインデックス（`status_code`, `due_date` 等）を追加し、将来的な何千件ものタスクに対するフルテーブルスキャンとアプリの激重化を未然に防止.
    - **Fix (React/UI)**: `TodayPage` のタブを高速で切り替えるとデータが矛盾する非同期Race Conditionを `activeRequestId` トークンで修正.
    - **Fix (React/UI)**: `TodayPage` のフィルター（ステータス・タグ等）変更時にリストのUIが自動更新されないバグを修正.
    - **Fix (Critical)**: `holidayService.js` でのCSV一括インサート時に500件の個別INSERTがTauri SQLiteプールを枯渇させていた問題を、単一の **Bulk INSERT** に変更し、さらに **30日間のキャッシュ有効期限更新機能** を付与して再発防止と最新化の両立を実現。
- **Files**:
    - `lib/holidayService.js` (Created/Modified: 高高度な日付計算、Bulk Insert、キャッシュ期限)
    - `lib/db.js` (Modified: schema 更新, PRAGMAs追加, SQLiteインデックス追加)
    - `app/today/page.js` (Modified: 祝日評価ロジック連動, Race Condition解消)
    - `src-tauri/capabilities/default.json` (Modified: HTTP Pluginのパーミッション追加)
    - `ISSUES.md` (Updated: Database Locked を解消済みに変更)

### 2026-02-22
- **Agent**: Antigravity
- **Task**: Advanced Filtering, Sorting & Parent Task Selection Fixes
- **Details**:
    - **Feature**: フィルタリングで親タスクが除外された場合でも、子タスクが条件に合致すれば「孤立した子タスク」として一覧のトップレベルに表示するロジックを実装 (親名を示すバッジ付き).
    - **Feature**: 「ステータス順」と「タグ順（最初のタグ名）」でのリスト並べ替え機能を追加.
    - **Feature**: 「今日やるタスク」ページにもタスク一覧と同等のフィルタ＆ソートバーを追加し、SQL経由で状態を連動.
    - **Fix**: タスクの編集モーダル (`TaskEditModal`) に「親タスク」の選択項目が欠落していた問題を修正.
    - **Fix**: タスク追加 (`TaskInput`) および編集時、選択可能な親タスクが存在しない場合にドロップダウンをまるごと隠すのではなく、無効化(disabled)状態でUIに残すよう改善.
    - **Fix**: 日課(Routine)タスクに対して日課が持ち得ないステータスフィルタ（進行中など）を掛けた際に、除外されずすべて表示されてしまうSQL条件の不具合を修正.
- **Files**:
    - `components/TaskList.js` (Modified: 子タスクのフィルタ考慮, ステータス/タグソート追加)
    - `app/today/page.js` (Modified: フィルタバー追加, フィルタ・ソート連動SQL修正)
    - `components/TaskInput.js` (Modified: 親タスクUI改善)
    - `components/TaskEditModal.js` (Modified: 親タスク選択機能の追加およびバグ修正)

### 2026-02-21
- **Agent**: Antigravity
- **Task**: Tauri Migration, API Refactoring & SQL IPC Authorization
- **Details**:
    - **Feature**: Next.js アプリを Electron から Tauri v2 に完全移行.
    - **Config**: `next.config.mjs` を `output: 'export'` に変更し静的サイト化.
    - **Backend**: `src-tauri` フォルダを生成し、Rust環境を構築.
    - **Database**: `better-sqlite3` を廃止し `@tauri-apps/plugin-sql` へ移行.
    - **Security**: `capabilities/default.json` で `sql:allow-execute`, `sql:allow-select` を許可.
    - **Refactor**: すべての `fetch('/api/...')` 呼び出しを、フロントエンドからの直接的な `db.select()` / `db.execute()` に置換.
    - **Refactor**: `app/api` ディレクトリ全体を削除.
    - **Fix**: `lib/db.js` の `initDb()` で発生する非同期のレースコンディションをPromise Singletonロックで修正.
- **Files**:
    - `next.config.mjs`, `package.json`, `src-tauri/*`
    - `lib/db.js`, `app/layout.js`, `app/dashboard/page.js`, `app/routines/page.js`, `app/today/page.js`, `app/tasks/page.js`
    - `components/TaskInput.js`, `components/TaskList.js`, `components/TaskEditModal.js`
    - `hooks/useMasterData.js`

### 2026-02-21
- **Agent**: Antigravity
- **Task**: Electron Packaging Architecture Fix (Standalone Server)
- **Details**:
    - **Fix**: 起動時にプロセスが無限増殖するフォークボムバグを修正 (`main.js` の `ELECTRON_RUN_AS_NODE: '1'` 追加).
    - **Feature**: Next.jsのStandaloneビルドモード (`output: 'standalone'`) を採用し、`npm`へのグローバル依存を廃止.
    - **Feature**: `scripts/postbuild.js` を作成し、パッケージング前に静的アセットを自動で集約するビルドパイプラインを構築.
    - **Feature**: 出力先を `release-build` フォルダに変更し、確実に単独起動するPortableアプリを生成.
- **Files**:
    - `next.config.mjs` (Modified: `output: 'standalone'` 追加)
    - `main.js` (Modified: Standalone `server.js` を直接呼び出すアーキテクチャに変更)
    - `package.json` (Modified: `postbuild` & `electron-pack` スクリプト修正)
    - `scripts/postbuild.js` (Created: 静的アセットコピースクリプト)
    - `CLAUDE.md` (Modified: デスクトップアプリ用アーキテクチャの解説追記)

### 2026-02-20
- **Agent**: Antigravity
- **Task**: Desktop Conversion (Electron Portable App) & UI Polish
- **Details**:
    - **Feature**: `electron-packager` を用いて Next.js を Windows 用のデスクトップアプリ (`.exe` 含むポータブルフォルダ形式) に変換.
    - **Feature**: DBの保存先を `%APPDATA%/TaskalDay/tasks.db` に変更し、ポータブル版でもデータが揮発しないよう対応 (`IS_ELECTRON` 環境変数で切り替え).
    - **Fix**: カレンダー日付ピッカーが画面外にはみ出して右スクロールが発生する挙動を修正.
    - **Fix**: 子タスクを「親タスク自身」にドラッグドロップした際に意図せずUnnest(親子関係解除)されてしまう不具合を修正.
    - **UI**: タスク追加後もフォーカスを維持し、連続入力をしやすくするよう `TaskInput.js` を改善.
- **Files**:
    - `lib/db.js` (Modified: SQLiteの永続化パスをAppDataに変更)
    - `main.js` (Created: Electron エントリポイント)
    - `package.json` (Modified: Electron 依存関係追加)
    - `app/layout.js`, `components/TaskInput.js`, `components/TaskList.js` (Modified: UI/UX改善)

### 2026-02-19
- **Agent**: Antigravity
- **Task**: Routine System Overhaul & Bug Fixes
- **Details**:
    - **Feature**: ルーティンシステムの刷新（タスク生成廃止→今日ページでの動的マージへ変更）
    - **Feature**: ルーティンに「終了日」設定を追加
    - **UI**: ルーティン有効/無効のiOS風トグルスイッチ追加
    - **Fix**: 子タスクのUn-nest（親から外す）動作の修正（衝突判定ロジック改善）
    - **Fix**: 設定の「全削除」でルーティンも削除されるよう修正
- **Files**:
    - `app/api/tasks/today/route.js` (Modified: 動的マージロジック)
    - `app/api/routines/generate/route.js` (Modified: 無効化)
    - `app/api/routines/complete/route.js` (Created)
    - `app/routines/page.js` (Modified: UI刷新)
    - `components/TaskList.js` (Modified: DnDロジック)
    - `lib/db.js` (Modified: schema update)


### 2026-02-18
- **Agent**: Antigravity
- **Task**: Drag & Drop Nesting
- **Details**:
    - Implemented "Drag onto task to nest" functionality using `@dnd-kit`.
    - Added handle icon (`⋮⋮`) to tasks.
    - Added `Draggable` and `Droppable` logic to `TaskItem`.
    - Implemented API update (parent_id) in `onDragEnd`.
- **Files**:
    - `components/TaskList.js` (Modified)
    - `package.json` (Added `@dnd-kit/core`, `@dnd-kit/utilities`)

- **Agent**: Claude Code
- **Task**: ルーティン機能追加 + タスク入力UI改善 + デバッグ
- **Details**:
    - **Feature**: ルーティンタスク管理機能追加 (`/routines` ページ, CRUD)
    - **Feature**: `today/page.js` に日付タブ追加（今日〜7日先のタスクを表示）
    - **Feature**: FABボタン追加（全ページ右下固定、クリックでTaskInputモーダル）
    - **Refactor**: `/input` ページ削除、`/tasks` 上部にTaskInputを統合
    - **Fix**: TagSelect のpropsミスマッチ修正 (`tags`/`selectedIds` → `allTags`/`selectedTagIds`)
    - **Fix**: weekly ルーティンの空 `days_of_week` によるNaNバグ修正
    - **Fix**: `weekdays_only` が weekly/monthly にも誤適用されていたバグ修正
    - **Fix**: ルーティン作成をトランザクション化
    - **Fix**: `.gitignore` に SQLite ファイル (`*.db`, `*.db-shm`, `*.db-wal`) を追加
- **Files**:
    - `lib/db.js` (Modified: routines, routine_tags テーブル追加)
    - `app/routines/page.js` (Created)
    - `app/api/routines/route.js` (Created)
    - `app/api/routines/[id]/route.js` (Created)
    - `app/api/routines/generate/route.js` (Created)
    - `app/api/tasks/today/route.js` (Modified: ?date= クエリパラメータ対応)
    - `app/today/page.js` (Modified: 日付タブ追加)
    - `app/tasks/page.js` (Modified: TaskInput追加)
    - `app/layout.js` (Modified: FABボタン追加, /input ナビ削除)
    - `app/input/page.js` (Deleted)
    - `.gitignore` (Modified)
    - `CLAUDE.md` (Modified)

---

### 2026-02-17
- **Agent**: Claude Code
- **Task**: UI/UX Improvements & Navigation Update
- **Details**:
    - **C1**: Changed default route to `/today` (redirect from `/`). Moved task input to `/input`.
    - **B4**: Updated subtitle to "頭の中のタスクを全部ここに出しましょう".
    - **B3**: Improved empty state in TaskList (Seedling icon `🌱` and encouraging copy).
    - **A4**: Added progressive achievement messages (1 task, 50%, 100%).
    - **A1**: Checkbox animation (pop + spread + particles).
    - **B1**: Enhanced registration animation (bounce).
    - **A2**: Added sidebar progress bar.
- **Files**:
    - `app/page.js` (Modified: Redirect logic)
    - `app/input/page.js` (Created)
    - `app/layout.js`, `app/today/page.js`, `app/globals.css` (Modified)
    - `components/TaskInput.js`, `components/TaskList.js` (Modified)

- **Agent**: Antigravity
- **Task**: Project Setup & Refactoring
- **Details**:
    - Reconstructed project files from user input.
    - Setup Next.js environment with SQLite.
    - Implemented API routes and Frontend components.
    - **Refactoring**: Centralized master data fetching (Importance, Urgency, Status, Tags) into a custom hook `useMasterData`.
- **Files**:
    - `hooks/useMasterData.js` (Created)
    - `components/TaskInput.js` (Modified: Uses `useMasterData`)
    - `components/TaskEditModal.js` (Modified: Uses `useMasterData`)
    - `components/TaskList.js` (Modified: Uses `useMasterData`)
    - `app/*`, `lib/db.js`, `package.json` (Created initial set)
