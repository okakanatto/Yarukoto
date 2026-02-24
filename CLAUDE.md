# CLAUDE.md - Yarukoto プロジェクトガイド

## プロジェクト概要

**TaskFlow** は個人用タスク管理Webアプリ。Next.js (App Router) + SQLite のローカル完結型。
Tauri v2 デスクトップアプリとして動作する。

**現在のバージョン**: v1.0.0 リリース済み（2026-02-23）
**次期バージョン**: v1.1.0 開発中（詳細は `ROADMAP.md` 参照）

## 関連ドキュメント

| ファイル | 内容 |
|---|---|
| `CLAUDE.md` | 本ファイル。技術仕様・アーキテクチャガイド |
| `ISSUES.md` | バグ・機能改善・機能強化の課題一覧 |
| `ROADMAP.md` | v1.1〜v2.0の開発ロードマップ（リリース計画・プロンプト単位） |
| `AI_CHANGELOG.md` | AIエージェントによる変更履歴 |

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
> **ビルド成果物とリリース運用について**: `npm run tauri build` を実行すると、インストーラ以外にも `src-tauri/target/release/app.exe` (ポータブル版単体exe) が生成される。今後はバージョン管理が煩雑になるのを防ぐため、新しいバージョンをビルドした際はプロジェクトルートに `releases/vX.X.X/` ディレクトリを作成し、そこにZIPや各種インストーラ(`-setup.exe`, `.msi`)等の公開用成果物を一元的に移動・格納する運用とする。

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

- **tasks**: id, title, parent_id (自己参照FK, CASCADE削除), status_code, importance_level, urgency_level, start_date, due_date, estimated_hours (実際は分単位で保存), today_date, notes, created_at, updated_at, completed_at
- **importance_master**: level (PK), label, color
- **urgency_master**: level (PK), label, color
- **status_master**: code (PK), label, color, sort_order
- **tags**: id, name (UNIQUE), color, sort_order
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

### 注意点

- `estimated_hours` カラム名だが、実際の値は **分** 単位で保存されている（マイグレーションで時間→分に変換済み）
- status_code 1〜3 はシステム必須ステータス（削除・名前変更不可）
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
  - 着手中(2): `▶` アイコン（アクセントカラー）→ クリックで完了(3)
  - 完了(3): `✓` チェックマーク → クリックで未着手(1)に戻る
  - ルーティンは着手中をUI表示のみ対応（DB操作なし、`routine_completions` は完了/未完了のみ）
- **親子タスクのDnD**: ドラッグ中に各タスク間へアンネスト用ギャップゾーン（`UnnestGap`）が出現、`unnest-gap-{id}` IDでアンネスト判定
- **タグ継承 (DnD)**: DnDでネストが成立した際、`app_settings.inherit_parent_tags = '1'` なら親のタグを `INSERT OR IGNORE INTO task_tags` で子に付与（`TaskList.js` の `handleDragEnd` 内）
- **親タスク選択ドロップダウン** (`TaskInput.js`): フォーム展開時、未完了のルートタスク一覧を取得して `<select>` で表示。`predefinedParentId` が渡されている場合（インライン子タスク作成）は非表示。
- **app_settings**: 設定ページの「オプション」タブで管理。`toggleSetting(key)` で楽観的更新 + DB保存（エラー時ロールバック）。
- **FABボタン**: layout.js に固定配置（右下）、クリックでTaskInputモーダルが開く。タスク追加後は `taskflow:taskAdded` カスタムイベントを dispatch してページに通知
- **レイアウト**: サイドバーナビ固定 (5項目: 今日/ルーティン/タスク一覧/ダッシュボード/設定) + メインコンテンツ領域

## 開発時の注意

- `tasks.db` はプロジェクトルート直下に自動生成される（git管理外にすべき）
- WALモード + foreign_keys ON + busy_timeout 5000 で動作。インデックスも付与済み。
- HTTP通信（CORS回避）はフロントエンドのfetchではなく `@tauri-apps/plugin-http` を利用。
- 日付は `'sv-SE'` ロケールで YYYY-MM-DD 形式を生成
- CSVエクスポート/インポートはBOM付きUTF-8 (Excel互換)
- `suppressHydrationWarning` が layout.js に多用されている（`'use client'` によるhydrationミスマッチ回避）
- **Tauri IPC の DB アクセスパターン**: 毎回 `const { getDb } = await import('@/lib/db'); const db = await getDb();` を呼ぶ（シングルトンなので問題なし）

## 実装済み機能一覧

| 機能 | ファイル | 内容 |
|------|---------|------|
| devIndicators 無効 | `next.config.mjs` | `devIndicators: false` |
| 親タスク選択 | `components/TaskInput.js` | フォーム展開時に親候補ドロップダウン表示 |
| app_settings テーブル | `lib/db.js` | KVストア + `inherit_parent_tags` 初期値 |
| オプションタブ | `app/settings/page.js` | iOS風トグルスイッチで設定変更 |
| タグ継承ロジック | `components/TaskList.js` | DnDネスト成功後に親タグを子へ INSERT OR IGNORE |
| 祝日キャッシュ機能 | `lib/holidayService.js` | 内閣府CSV取得・SQLiteキャッシュ・インメモリSet最適化 |
| ルーティン祝日除外 | `lib/holidayService.js` | `holiday_action` (none/skip/forward/backward) 対応 |
| 毎月末ルーティン | `app/routines/page.js`, `lib/holidayService.js` | `monthly_type: end_of_month` + うるう年対応 |
| 休日設定 全頻度対応 | `app/routines/page.js` | 日次・週次でも `holiday_action` を UI 設定可能に（daily は skip/none のみ）|

## バグ修正済み

- `app/today/page.js`: `fetch('/api/masters')` → Tauri SQL に修正済み
- `app/settings/page.js`: 全11箇所の fetch → Tauri SQL に修正済み
- `components/TaskEditModal.js`: UPDATE 時の `updated_at` セット漏れを修正済み
- **起動時 `database is locked (code: 5)` エラー（第1弾）**: `lib/db.js` + `lib/holidayService.js` に `globalThis` シングルトン Promise を導入し、HMR や React Strict Mode による `updateHolidayCache` の多重実行を根絶（2026-02-22）
- **起動時 `database is locked (code: 5)` エラー（第2弾）**: `holidayService.js` の `BEGIN TRANSACTION` がコネクションプール上でロックを長時間保持し、他コンポーネントの書き込みと競合していた。① テーブルにデータが既存なら CSV フェッチ自体をスキップ、② `BEGIN/COMMIT` を廃止し autocommit 個別 INSERT に変更して解消（v1.0前デバッグ）
- **`components/TaskList.js` `handleStatusChange` の `completed_at` 漏れ**: タスク一覧でステータスを完了(3)に変更しても `completed_at` がセットされず、ダッシュボードの7日間グラフ・「今日やるタスク」の完了フィルタが機能しなかった（v1.0前デバッグ）
- **`components/TaskEditModal.js` CSS 全壊**: `<style jsx>` 内のクラス名・プロパティ名に誤ったスペースが混入（`.te - backdrop`、`z- index` 等）してモーダルが完全に無スタイルだった（v1.0前デバッグ）
- **`app/dashboard/page.js` 「全体の完了率」の二重計上**: 今日のルーティン数を全体タスク数に加算していたため日付によって数値が変動していた（v1.0前デバッグ）
- **`app/routines/page.js` 休日設定 UI の欠落**: 月次ルーティンのみに表示されていた休日対応設定を全頻度で表示するよう修正（v1.0前デバッグ）
