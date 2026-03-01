# CLAUDE.md - Yarukoto プロジェクトガイド

## プロジェクト概要

**Yarukoto** は個人用タスク管理Webアプリ。Next.js (App Router) + SQLite のローカル完結型。
Tauri v2 デスクトップアプリとして動作する。

**現在のバージョン**: v1.3.0 リリース済み（2026-03-01）
**次期バージョン**: v1.3.1 以降開発予定（詳細は `ROADMAP.md` 参照）

## 関連ドキュメント

| ファイル | 内容 |
|---|---|
| `CLAUDE.md` | 本ファイル。技術仕様・アーキテクチャガイド |
| `ISSUES.md` | バグ・機能改善・機能強化の課題一覧 |
| `ROADMAP.md` | v1.1〜v2.0の開発ロードマップ（リリース計画・プロンプト単位） |
| `WORK-LOG.md` | 作業ログ（枝番単位の実装記録・申し送り） |
| `qa-report.md` | QAレポート（検証STEP結果の蓄積、バージョンごとにリセット） |
| `RELEASE_NOTES.md` | リリースノート（バージョンごとに追記） |
| `AI_CHANGELOG.md` | AIエージェントによる変更履歴 |
| `archives/` | アーカイブフォルダ（リリース済みバージョンの qa-report・ROADMAP セクションを保存） |

## 技術スタック

- **フレームワーク**: Next.js 16.1.6 (App Router, `use client` ベース)
- **言語**: JavaScript (TypeScript未使用、jsconfig.json のみ)
- **UI**: React 19.2.3, styled-jsx によるコンポーネント内スタイリング
- **DB**: SQLite (`@tauri-apps/plugin-sql` 経由), ファイル: `tasks.db` (プロジェクトルート)
- **デスクトップ**: Tauri v2
- **その他**: date-fns
- **フォント**: Inter (本文), Outfit (見出し) - Google Fonts

## コマンド

```bash
npm run tauri dev     # Tauri 開発モード (Rust バックエンド + Next.js 同時起動) ★必須
npm run tauri build   # 本番用 Tauri インストーラー・バイナリ生成 (.msi, .exe)
npm run lint          # ESLint 実行
```

> **注意**: `npm run dev` だけでは動かない。ブラウザからは Tauri IPC にアクセスできないため、必ず `npm run tauri dev` で起動すること。
> **リリースとビルド成果物について（【重要】必ず守ること！）**: 
> ユーザーから「ビルドしてリリースして」等と言われた場合は、必ず以下の手順でインストーラーとポータブル版を生成・格納すること：
> 1. `package.json` と `tauri.conf.json` の `version` を新しいバージョンに更新する。
> 2. `npm run tauri build` を実行する。
> 3. コマンド完了後、生成された以下の2種類のファイルを対象とし、プロジェクトルートに `releases/vX.X.X/` ディレクトリを作成して一斉にコピーすること（ファイル名のバージョン部分はよしなに変更すること）。
>    - **インストーラー版（Setup.exe）**: `src-tauri/target/release/bundle/nsis/Yarukoto_X.X.X_x64-setup.exe`  → `releases/vX.X.X/` 配下へコピー
>    - **ポータブル版（単体EXE）**: `src-tauri/target/release/app.exe` → コピーして `releases/vX.X.X/Yarukoto_X.X.X-portable.exe` にリネームして配置

## アーキテクチャ構成（Tauri デスクトップ版・移行完了済）

- **デスクトップアプリ化**: Electron → `Tauri v2` 移行済。Rust 側で軽量な Webview を生成。
- **Static Export**: `next.config.mjs` で `output: 'export'` を指定した完全静的ビルド (SSG)。
- **IPC データレイヤー (No API Routes)**: `app/api/*` は全て削除済。React コンポーネント内で直接 `@tauri-apps/plugin-sql` 経由で SQLite に SQL を発行。
- **起動時の競合防止**: `lib/db.js` と `lib/holidayService.js` の両方に `globalThis` ベースのシングルトン Promise を導入。HMR によるモジュール再評価でも状態が維持され、DB 初期化と祝日キャッシュ更新がそれぞれアプリ起動ライフサイクル全体を通じて厳密に1回のみ実行される。
- **DBの紐づきとポータビリティ**: SQLiteデータベースの保存先は `tauri.conf.json` の `"identifier": "com.yarukoto.app"` に依存する。これによりプログラムのファイル名（例:`Yarukoto_Portable.exe` など）を変更しても、OSのAppData内にある同一の `tasks.db` ファイルに永続的に紐づくため、1OSユーザー＝1DB の安全な運用が実現されている。
- **devIndicators 無効**: `next.config.mjs` に `devIndicators: false` を設定済み（開発時の「N」ボタン非表示）。
- **【AIエージェント向け重要ルール】Gitコミットの全自動化**: このプロジェクトはGitでバージョン管理されている。AIエージェント（Antigravity、Claude Code等）は、機能実装やバグ修正が一段落して安定して動く状態になったタイミング（キリの良いタイミング）で、**必ず自律的・自発的に `git add .` と `git commit` を実行**し、履歴（スナップショット）を残すこと。ユーザーにわざわざコミットの許可を取る必要はない。

## ディレクトリ構造

```
app/
  layout.js          # ルートレイアウト (サイドバーナビ + FABボタン, 'use client')
  page.js            # トップ: /today へリダイレクト
  globals.css        # グローバルCSS (CSS変数定義)
  today/page.js      # 今日やるタスク (進捗リング付き, 日付タブで未来日付も表示)
  tasks/page.js      # タスク一覧 (上部にTaskInput, フィルタ・ソート付き)
  routines/page.js   # ルーティン管理 (CRUD, 日次/週次/月次)
  dashboard/page.js  # ダッシュボード (完了率リング, 7日間チャート, ステータス分布)
  settings/page.js   # 設定 (タグ/ステータス/オプション/データ管理)
  (※ app/api/ フォルダは完全に削除済)

components/
  TaskInput.js       # タスク入力フォーム (展開式, 子タスク対応, 親タスク選択ドロップダウン付き)
  TaskList.js        # タスク一覧 + TaskItem (親子構造, フィルタ/ソート, DnD, タグ継承)
  TaskEditModal.js   # タスク編集モーダル
  StatusCheckbox.js  # 3ステートチェックボックス (未着手/着手中/完了, スパークルアニメ付き)
  CalendarPicker.js  # カスタムカレンダー日付選択
  ColorPalette.js    # カラーパレット (20色 + カスタム)
  TagSelect.js       # タグ複数選択ドロップダウン

hooks/
  useMasterData.js   # マスターデータ + タグ取得カスタムフック

lib/
  db.js              # SQLite接続管理, テーブル初期化, マイグレーション, app_settings シード (globalThis シングルトン)
  holidayService.js  # 祝日キャッシュ管理 (内閣府CSV取得・INSERT), 祝日/週末判定, ルーティン実施日計算 (globalThis シングルトン)

src-tauri/
  tauri.conf.json    # Tauri設定 (frontendDist: "../out")
  capabilities/
    default.json     # IPC権限 (sql:default + sql:allow-execute, http:default)
```

## DB スキーマ

### テーブル

- **tasks**: id, title, parent_id (自己参照FK, CASCADE定義あり。ただしアプリ側で削除前に子の parent_id を NULL 化して独立させるため、実質 CASCADE は発動しない), status_code, importance_level, urgency_level, start_date, due_date, estimated_hours (実際は分単位で保存), today_date, notes, created_at, updated_at, completed_at, archived_at, sort_order
- **importance_master**: level (PK), label, color
- **urgency_master**: level (PK), label, color
- **status_master**: code (PK), label, color, sort_order
- **tags**: id, name (UNIQUE), color, sort_order, archived
- **task_tags**: task_id, tag_id (複合PK, 両方CASCADE)
- **routines**: id, title, frequency (daily/weekly/monthly), days_of_week, day_of_month, monthly_type (date/end_of_month), weekdays_only, holiday_action (none/skip/forward/backward), importance_level, urgency_level, estimated_hours, notes, enabled, end_date, created_at, updated_at
- **routine_tags**: routine_id, tag_id (複合PK, 両方CASCADE)
- **routine_completions**: routine_id, completion_date (複合PK, CASCADE削除) — ルーティンの完了履歴
- **app_settings**: key (PK), value — アプリ設定の汎用KVストア
- **holidays**: date (PK), name — 内閣府CSVから取得した祝日キャッシュデータ

### app_settings の初期値

| key | value | 説明 |
|-----|-------|------|
| `inherit_parent_tags` | `'0'` | DnDで子タスク化した際、親のタグを自動付与するか |
| `show_overdue_in_today` | `'0'` | 期限切れの未完了タスクを「今日やるタスク」に表示するか |
| `auto_archive_days` | `'0'` | 完了からN日経過で自動アーカイブ（0=無効） |

### 注意点

- `estimated_hours` カラム名だが、実際の値は **分** 単位で保存されている（マイグレーションで時間→分に変換済み）
- status_code 1（未着手）・2（着手中）・3（完了）はシステム必須ステータス（削除・名前変更不可）。code=4（保留）・code=5（キャンセル）もシード済み
- `today_date` フィールドで「今日やるタスク」をマーク（YYYY-MM-DD文字列）
- マイグレーションは `lib/db.js` の `initDb()` 内で起動時に自動実行
- `app_settings` は `INSERT OR IGNORE` でシード済みのため、手動 INSERT 不要

## アーキテクチャ上の特徴

- **全ページ `'use client'`**: SSG で Static Export されたクライアントサイドレンダリングフロントエンド。
- **Tauri Plugin SQL**: `app/api/*` が存在せず、React コンポーネント内で直接 `getDb().execute()` / `getDb().select()` を使用。
- **globalThis シングルトンパターン**: `lib/db.js` の `dbPromise` と `lib/holidayService.js` の `updateHolidayCache` Promise を両方 `globalThis[KEY]` で管理。React Strict Mode の二重 mount や HMR によるモジュール再評価でも同一の Promise インスタンスが返り、DB 初期化と祝日 INSERT トランザクションの衝突（`database is locked`）が完全に防止される。
- **SQL パラメータ**: `$1, $2, $3...` の positional 記法（`?` は使用不可）。
- **スタイリング**: styled-jsx (`<style jsx>`) をコンポーネント内にインライン記述、一部 `global` 指定
- **状態管理**: ローカルState + useEffect による fetch パターン、グローバル状態管理なし
- **親子タスク**: 1階層の親子関係 (parent_id)、子タスクの子は作れない
- **「今日やるタスク」機能**: 以下の3種がマージされて表示される
  1. ルーティン（該当日の頻度設定に合致するもの、`routine_completions` で完了管理）
  2. ☀️ピック済みタスク（`today_date` フィールドに日付がセットされたもの）
  3. 期限日自動表示（`due_date` が指定日付と一致するタスク、`is_due_date_auto: true` フラグ付き）
     - 期限日タスクはカード左に黄色ボーダー＋📅バッジ、✕ボタン非表示
     - `today_date` で既にピック済みのタスクは重複表示しない
- **3ステートチェックボックス** (`components/StatusCheckbox.js`):
  - 未着手(1): 空の円。ホバーで右に `▶` ボタン出現 → クリックで着手中(2)。円クリックで完了(3)
  - 着手中(2): `▶` アイコン（アクセントカラー）ホバーで左に `↺` ボタン出現 → クリックで完了(3)または未着手(1)
  - 完了(3): `✓` チェックマーク → クリックで未着手(1)に戻る
  - ルーティンは着手中をUI表示のみ対応（DB操作なし、`routine_completions` は完了/未完了のみ）
- **親子タスクのDnD**: ドラッグ中に各タスク間へアンネスト用ギャップゾーン（`UnnestGap`）が出現、`unnest-gap-{id}` IDでアンネスト判定
- **タグ継承 (DnD)**: DnDでネストが成立した際、`app_settings.inherit_parent_tags = '1'` なら親のタグを `INSERT OR IGNORE INTO task_tags` で子に付与（`TaskList.js` の `handleDragEnd` 内）
- **親タスク選択ドロップダウン** (`TaskInput.js`): フォーム展開時、未完了のルートタスク一覧を取得して `<select>` で表示。`predefinedParentId` が渡されている場合（インライン子タスク作成）は非表示。
- **app_settings**: 設定ページの「オプション」タブで管理。`toggleSetting(key)` で楽観的更新 + DB保存（エラー時ロールバック）。
- **FABボタン**: layout.js に固定配置（右下）、クリックでTaskInputモーダルが開く。タスク追加後は `yarukoto:taskAdded` カスタムイベントを dispatch してページに通知
- **アーカイブ機能**: 完了・キャンセル済みタスクを手動アーカイブ可能。自動アーカイブ（`app_settings.auto_archive_days`）にも対応。親アーカイブ時は子もまとめてアーカイブ。タスク一覧に「アーカイブ済み」タブで閲覧・復元可能。`tasks.archived_at` カラムで管理。
- **ソートON/OFF + 手動並び替え**: タスク一覧・今日やるタスクで自動ソートのON/OFFを切替可能。OFF時はDnDで手動並び替え。`tasks.sort_order` カラムで並び順を永続化。親タスク単位・子タスク単位で独立した並び順を保持。
- **ステータス並び順変更**: 設定画面でステータスの `sort_order` をDnDまたは上下ボタンで自由に変更可能（デフォルトステータスの間にもユーザー定義ステータスを配置可能）。
- **レイアウト**: サイドバーナビ固定 (5項目: 今日/ルーティン/タスク一覧/ダッシュボード/設定) + メインコンテンツ領域

## 開発時の注意

- `tasks.db` はプロジェクトルート直下に自動生成される（git管理外にすべき）
- WALモード + foreign_keys ON + busy_timeout 5000 で動作。インデックスも付与済み。
- HTTP通信（CORS回避）はフロントエンドのfetchではなく `@tauri-apps/plugin-http` を利用。
- 日付は `'sv-SE'` ロケールで YYYY-MM-DD 形式を生成
- CSVエクスポート/インポートはBOM付きUTF-8 (Excel互換)
- `suppressHydrationWarning` が layout.js に多用されている（`'use client'` によるhydrationミスマッチ回避）
- **Tauri IPC の DB アクセスパターン**: 毎回 `const { getDb } = await import('@/lib/db'); const db = await getDb();` を呼ぶ（シングルトンなので問題なし）
