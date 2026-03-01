# QA Report

## STEP A：機能検証（v1.3.1 枝番R-1）

**検証対象**: Phase 0 共通ユーティリティ抽出（リファクタリングのみ、機能変更なし）
**検証方法**: コードリーディングベースの静的分析
**変更ファイル**: 新規3件（`lib/utils.js`, `hooks/useFilterOptions.js`, `lib/taskSorter.js`）＋既存10件の import 変更

### 検証前確認：リファクタリング完全性チェック

✅ OK: 6件 全件パス

---

### 観点1：正常系テスト

#### 1-A. 新規ユーティリティ関数の検証

✅ OK: 14件 全件パス

#### 1-B. 各ファイルの import 移行検証

✅ OK: 13件 全件パス

---

### 観点2：異常系・境界値テスト

✅ OK: 15件 全件パス

---

### 観点3：状態遷移・データ件数テスト

✅ OK: 12件 全件パス

---

### 総合判定

**全項目 OK（NG: 0件）**

今回の v1.3.1 R-1 Phase 0 はリファクタリング（コード構造変更のみ）であり、ユーザー向けの機能変更はない。静的コード分析により以下を確認した：

1. **共通化の完全性**: `getDb` ボイラープレート（30箇所以上）、`parseTags`（3ファイル）、`formatMin`（3ファイル）、フィルタオプション生成（2ファイル）、ソートロジック（2ファイル）の全てが正しく共通ファイルに抽出され、元ファイルに重複定義は残存していない
2. **動作同等性**: 抽出された各関数は、元のインラインコードと同一のロジック・同一の入出力を持つ。引数の型・戻り値の型に変更なし
3. **import パスの正確性**: 全10ファイルで `@/lib/utils`、`@/hooks/useFilterOptions`、`@/lib/taskSorter` からの import が正しく設定されている
4. **既存機能への影響なし**: `settings/page.js` の `runAutoArchive` dynamic import、`today/page.js` の手動ソートモード、`layout.js` のサイドバー進捗表示など、共通化対象外の機能は変更されていない

---

## リリース前検証：バージョン変更分析（v1.3.1）

### 対象バージョンの枝番一覧

| 枝番 | 内容 | 状態 |
|---|---|---|
| R-1 | Phase 0 共通ユーティリティ抽出 | 実装済み・検証済み |
| R-2〜R-4 | 未着手（ROADMAP参照） | 未実装 |

※ v1.3.1 は現時点で R-1 のみ完了。リファクタリングのみで機能変更なし。

### R-1 による変更ファイル一覧

**新規ファイル（3件）:**
- `lib/utils.js` — `fetchDb()`, `parseTags()`, `formatMin()`, `todayStr()` を集約
- `hooks/useFilterOptions.js` — フィルタドロップダウン用の options 生成フック
- `lib/taskSorter.js` — `SORT_OPTIONS` 定数 + `taskComparator()` ソート関数

**変更ファイル（10件、全て import パス変更のみ）:**
- `app/layout.js` — `fetchDb` import 追加
- `app/today/page.js` — `fetchDb`, `parseTags`, `formatMin`, `taskComparator`, `useFilterOptions` import 変更
- `app/dashboard/page.js` — `fetchDb`, `formatMin` import 変更
- `app/routines/page.js` — `fetchDb`, `parseTags` import 変更
- `app/settings/page.js` — `fetchDb` import 変更
- `components/TaskList.js` — `fetchDb`, `parseTags`, `formatMin`, `SORT_OPTIONS`, `taskComparator`, `useFilterOptions` import 変更
- `components/TaskInput.js` — `fetchDb` import 変更
- `components/TaskEditModal.js` — `fetchDb` import 変更
- `hooks/useMasterData.js` — `fetchDb` import 変更

### 枝番間の干渉リスク分析

v1.3.1 は R-1 のみのため枝番間干渉はない。共通ユーティリティの横断リスクを以下に整理する。

| 共通関数 | 使用ファイル数 | リスク評価 | 重点チェック項目 |
|---|---|---|---|
| `fetchDb()` | 全10ファイル | **高** | DB接続失敗時の全画面影響。ただし R-1 STEP A で globalThis シングルトン動作を検証済み |
| `parseTags()` | 3ファイル（TaskList, today, routines） | **中** | タグ表示の正確性。null/空文字ケースの処理 |
| `formatMin()` | 3ファイル（TaskList, today, dashboard） | **低** | 表示専用。null/0/大数の処理（検証済み） |
| `taskComparator()` | 2ファイル（TaskList, today） | **中** | ソート結果の正確性。statuses が空の初期ロードケース |
| `useFilterOptions()` | 2ファイル（TaskList, today） | **中** | フィルタ選択肢の生成。アーカイブ済みタグの除外 |

### リリース前検証での重点チェック項目

1. **全画面のDB接続**: `fetchDb()` 経由で全画面の DB アクセスが正常に動作するか
2. **タグ表示**: `parseTags()` を使う3画面でタグが正しく表示されるか
3. **ソート動作**: `taskComparator()` を使う2画面で全ソートキーが正しく機能するか
4. **フィルタ動作**: `useFilterOptions()` を使う2画面でフィルタ選択肢が正しく生成されるか
5. **既存機能の維持**: リファクタリング対象外の機能（DnD、アーカイブ、ルーティン完了、設定変更等）が壊れていないか

---

## リリース前検証 STEP A-1（v1.3.1）今日やるタスク画面

**検証対象**: `app/today/page.js` + 関連コンポーネント（StatusCheckbox, MultiSelectFilter, TaskEditModal）+ サイドバー進捗（`app/layout.js`）
**検証方法**: コードリーディングベースの静的分析

### 観点1：正常系テスト

✅ OK: 30件 全件パス

### 観点2：異常系・境界値テスト

✅ OK: 10件 全件パス

### 観点3：状態遷移・データ件数テスト

✅ OK: 8件 全件パス

### NG 項目

**NG-1: サイドバー進捗がアーカイブ済みタスクを含む** ✅ 修正済み

- **該当ファイル**: `app/layout.js:77-84`（`fetchTodayProgress` 関数内の SQL クエリ）
- **再現手順**: [今日やるタスク]画面で today_date を設定したタスクを完了→アーカイブ→サイドバーの進捗カウントを確認
- **期待される挙動**: アーカイブ済みタスクはサイドバーの進捗カウントから除外される（今日やるタスク画面と一致）
- **実際の挙動**: `layout.js:77` の SQL に `AND archived_at IS NULL` 条件がないため、アーカイブ済みタスクもカウントされる。一方、`today/page.js:221` は `WHERE t.archived_at IS NULL` で除外している。結果として、サイドバーの「今日 X/Y」とページ内の件数が不一致になる
- **原因の推定**: `layout.js:77-84` の `fetchTodayProgress` 関数の SQL クエリに `AND archived_at IS NULL` 条件が欠落
- **修正案**: `layout.js:79` の `WHERE status_code != 5 AND (` を `WHERE status_code != 5 AND archived_at IS NULL AND (` に変更
- **修正内容**: 修正案どおり `layout.js:79` に `AND archived_at IS NULL` を追加

**NG-2: 今日やるタスク画面がキャンセル済みタスクを除外していない** ✅ 修正済み

- **該当ファイル**: `hooks/useTodayTasks.js:184`（`loadTasks` 関数内のタスク SQL クエリ）
- **再現手順**: タスクを☀️ピックした状態でステータスを「キャンセル」に変更→[今日やるタスク]画面を確認
- **期待される挙動**: キャンセル済みタスクは今日やるタスクの一覧に表示されない（サイドバー `layout.js:79` やダッシュボード `dashboard/page.js:21` は `status_code != 5` で除外している）
- **実際の挙動**: SQL に `status_code != 5` のグローバル条件がないため、`today_date` や `due_date` でマッチしたキャンセル済みタスクも表示される。StatusCheckbox は操作不可（cursor: not-allowed）になるが、一覧には表示され続ける
- **原因の推定**: WHERE 句に `AND t.status_code != 5` が欠落。サイドバー（`layout.js:79`）やダッシュボード（`dashboard/page.js:21`）は除外しており一貫性がない
- **修正案**: `WHERE t.archived_at IS NULL` を `WHERE t.archived_at IS NULL AND t.status_code != 5` に変更
- **修正内容**: 修正案どおり `hooks/useTodayTasks.js:184` に `AND t.status_code != 5` を追加（R-3 のリファクタリングで today/page.js から useTodayTasks.js に移動済み）

### 観察事項（NG ではないが認識すべき差異）

- **サイドバー進捗の簡略化**: `layout.js` のルーティンカウントは `isRoutineActiveOnDate()` を使わず簡易SQL判定のため、祝日スキップ・月末ルーティン・前倒し/後ろ倒し等が反映されない。today/page.js とルーティン件数が異なる場合がある。パフォーマンス優先の設計判断として認識
- **サイドバーの `show_overdue_in_today` 未参照**: `layout.js:82` の期限切れ条件は設定値を参照しない。設定をオフにしてもサイドバーは期限切れタスクをカウントする

---

## リリース前検証 STEP A-2（v1.3.1）タスク一覧画面

**検証対象**: `app/tasks/page.js`（→ `components/TaskList.js`）+ `components/TaskInput.js` + `components/TaskEditModal.js` + `components/StatusCheckbox.js`
**検証方法**: コードリーディングベースの静的分析

### 観点1：正常系テスト

✅ OK: 26件 全件パス

### 観点2：異常系・境界値テスト

✅ OK: 13件 全件パス

### 観点3：状態遷移・データ件数テスト

✅ OK: 10件 全件パス

### NG 項目

タスク一覧画面に NG 項目なし。

### 観察事項（NG ではないが認識すべき点）

- **FAB 追加後の一覧反映**: `layout.js` の FAB から `yarukoto:taskAdded` イベントが dispatch されるが、`TaskList.js` はこのイベントを直接リスンしていない（`today/page.js:270-272` はリスンしている）。ただし `tasks/page.js` が `TaskList` をレンダリングしており、`TaskList` 内の `TaskInput.onTaskAdded` が `refreshKey` をインクリメントするため、ページ内の TaskInput 経由の追加は正しく反映される。FAB 経由の場合、ページ遷移やリロードまでは一覧に反映されない可能性がある
- **アーカイブタブでの DnD**: `showArchived` 時はソート切替ボタンが非表示になるが、`sortMode` が `manual` のまま残っている場合、アーカイブタブでも DnD ハンドルが表示される可能性がある。ただし `:608,628,632,636` の条件で `!showArchived` ガードが入っているため、DnD ギャップは表示されない。TaskItem の `isDraggable` prop も `:621` で `!showArchived` 条件あり

---

### 未検証画面

以下の画面は次回チャットで検証予定：

1. **ルーティン管理画面** (`app/routines/page.js`) — ルーティン CRUD、有効/停止タブ、頻度設定、祝日対応
2. **ダッシュボード画面** (`app/dashboard/page.js`) — 完了率リング、7日間チャート、ステータス分布、期限切れ警告
3. **設定画面** (`app/settings/page.js`) — タグ管理、ステータス管理、オプション設定、データ管理（CSV エクスポート/インポート）
4. **レイアウト/FAB** (`app/layout.js`) — サイドバーナビ、FAB ボタン、トースト通知、DB エラーハンドリング

---

## STEP R：リグレッションテスト（v1.3.1 枝番R-1 2026-03-01）

### 1. 影響範囲の特定
**【変更サマリーからの特定】**
- **変更内容**: 共通処理（`fetchDb`, `parseTags`, `formatMin`, `useFilterOptions`, `taskComparator`）を別ファイルに抽出し、各ファイルの import 先をこれらに変更した。
- **直接の変更箇所**: `lib/utils.js`, `hooks/useFilterOptions.js`, `lib/taskSorter.js` の新設。各種ページの import 命令。
- **影響が想定される箇所**:
  - `fetchDb()` を使用する全DB操作（10ファイル：TaskList, today/page, dashboard/page, routines/page, settings/page, layout, TaskInput, TaskEditModal, useMasterData）
  - `parseTags()` を使用するタグ表示箇所（TaskList, today/page, routines/page）
  - `formatMin()` を使用する時間表示箇所（TaskList, today/page, dashboard/page）
  - `useFilterOptions()` と `taskComparator()` を使用する一覧のソート・フィルタ（TaskList, today/page）
  - 【注意事項】に記載されている「`today/page.js` の手動ソート」や「`settings/page.js` の `runAutoArchive`」への波及がないかの確認

### 2. リグレッションテスト結果

✅ OK: 9件 全件パス

---

## STEP A：機能検証（v1.3.1 枝番R-2）

**検証対象**: Phase 1 TaskList.js 分割 リファクタリング
**検証方法**: コードリーディングベースの静的分析

今回の枝番は純粋なコード構造のリファクタリング（タスクリストコンポーネントの責務分割）であるため、リファクタリング前と同一の動作が維持されていることを検証の主眼とする。

### 観点1：正常系テスト

✅ OK: 13件 全件パス

### 観点2：異常系・境界値テスト

✅ OK: 5件 全件パス

### 観点3：状態遷移・データ件数テスト

✅ OK: 3件 全件パス

### 総合判定

**全項目 OK（NG: 0件）**

今回の v1.3.1 R-2（Phase 1）で行われた、TaskList.js からの UIコンポーネント (TaskItem, DndGaps) および ロジック制御フック (useTaskActions, useTaskDnD) の切り出しについて、ロジック自体は全く元の状態を保っていることが確認できた。

1. **参照透過性**: `useTaskDnD` 等のカスタムフックにコールバックが移されたが、`fetchTasks`、`refreshKey`、`getSortedParentTasks` による参照手法が適切に設定されており、元の`TaskList`内包時と完全に等価の働きをする。
2. **DnD機能不備なし**: ReorderGap と UnnestGap のコンポーネントは、React Nodeとして全く元の構成・id を再現しており、`activeDragParentId` 等を用いた動的な Gap の表示制御も元のロジック通り再現されている。手動ソート時の「子タスクをルートタスクの間にアンネスト挿入する」高度な機能も想定通り維持されている。
3. **状態管理異常なし**: `useTaskActions.js` 内のオプティミスティックアップデート（`setTasks`で即時反映）とDB書き込みは完全に等価。

---

## STEP R：リグレッションテスト（v1.3.1 枝番R-2 2026-03-01）

### 1. 影響範囲の特定
**【変更サマリーからの特定】**
- **変更内容**: TaskList.js（1030行）を4ファイル（`TaskItem.js`, `DndGaps.js`, `useTaskActions.js`, `useTaskDnD.js`）へ分割し、UIとロジックを分離。機能変更はなし。
- **影響が想定される箇所**:
  - `app/tasks/page.js`: TaskListのインポート元インターフェース・描画影響
  - `app/today/page.js`: Phase 2 でuseTaskActionsを利用予定。現行のロジックへの影響
  - `TaskItem.js` 等の子コンポーネント: TaskList.js内の `styled-jsx global` CSSクラスの適用漏れの有無
- **特定結果**: 上記箇所について、現状の参照・インポートおよび `styled-jsx` 適用順は適切であり、影響がないことを確認した。

### 2. リグレッションテスト結果

✅ OK: 3件 全件パス

---

## STEP A：機能検証（v1.3.1 枝番R-3）

**検証対象**: Phase 2 `today/page.js` スリム化（リファクタリング）
**検証方法**: コードリーディングベースの静的分析
**スコープ**: `hooks/useTodayTasks.js`, `hooks/useDragReorder.js`, `hooks/useTaskActions.js`, `app/today/page.js`, `app/settings/page.js`

今回の枝番は純粋なコード構造のリファクタリング（タスクやマスターデータ取得ロジック・DnDロジックのフック化）であるため、リファクタリング前と同一の動作が維持されていることを検証の主眼とする。

### 観点1：正常系テスト

✅ OK: 14件 全件パス

### 観点2：異常系・境界値テスト

✅ OK: 6件 全件パス

### 観点3：状態遷移・データ件数テスト

✅ OK: 5件 全件パス

### 総合判定

**全項目 OK（NG: 0件）**

今回の v1.3.1 R-3（Phase 2）で行われた、`today/page.js` からのロジック抽出と汎用DnDフックの作成・反映について、変更前後で完全に等価の働きをすることが静的分析で確認できた。既存の仕様や例外処理が損なわれることなく、適切に `hooks/` 配下にカプセル化されている。

---

## STEP R：リグレッションテスト（v1.3.1 枝番R-3 2026-03-01）

### 1. 影響範囲の特定
**【変更サマリーからの特定】**
- **変更内容**: `today/page.js` のデータ取得・DnDロジックを抽出。`settings/page.js` のDnDフックを抽出・汎用化。`useTaskActions.js` に `handleRoutineStatusChange` を追加。
- **影響が想定される箇所**:
  - `app/today/page.js`: リファクタリングによる基本操作（表示、ソート、フィルタ、DnD）への影響。
  - `app/settings/page.js`: 汎用化したDnDフック（`hooks/useDragReorder.js`）への移行によるドラッグ＆ドロップ並び替えの動作維持。
  - `components/TaskList.js` および `app/tasks/page.js`: `useTaskActions.js` へのエクスポート関数追加による副作用の有無。
- **特定結果**: 上記箇所について、エクスポートやimportの変更内容を静的分析し、既存コンポーネントにおける意図しない干渉や動作破綻がないことを確認した。

### 2. リグレッションテスト結果

✅ OK: 3件 全件パス

---

## STEP A：機能検証（v1.3.1 枝番R-4）

**検証対象**: Phase 3 (settings 分割) と Phase 4 (routines モーダル分離) のリファクタリング
**検証方法**: コードリーディングベースの静的分析
**スコープ**: 
- `app/settings/page.js` および `app/settings/_components/` 配下の各パネル
- `app/routines/page.js` および `app/routines/_components/RoutineFormModal.js`

今回の枝番は純粋なコード構造のリファクタリング（コンポーネントの分割・分離）であるため、リファクタリング前と同一の動作が維持されていることを検証の主眼とする。

### 観点1：正常系テスト

✅ OK: 25件 全件パス

- 設定画面：タブの切り替え、タグ・ステータスの追加/編集/削除/アーカイブ/並び替え、オプションのトグルと保存、CSVエクスポート/インポートなど
- ルーティン画面：一覧表示、状態トグル（有効/停止）、新規作成・編集モーダルの開閉、休日アクションや曜日の更新、保存処理など

### 観点2：異常系・境界値テスト

✅ OK: 10件 全件パス

- タグ名、ステータス名、ルーティンタイトル等の空文字保存ガード（UIおよびロジックのブロック）
- 使用中のステータス削除ブロック（依存関係エラー処理）
- CSV形式不正時の適切なエラー表示とリセット処理

### 観点3：状態遷移・データ件数テスト

✅ OK: 8件 全件パス

- データ配列や状態が変わった際の React および DB への即時反映ロジック（`data`, `setData` や `flash` を経由した親コンポーネントの更新）
- ドラッグ＆ドロップによる複数アイテム順序変更時の配列シャッフルとデータ整合

### 総合判定

**全項目 OK（NG: 0件）**

今回の v1.3.1 R-4 で行われた `settings/page.js` のタブパネル分割、および `routines/page.js` のフォームモーダル分離について、変更前後で完全に等価の働きをすることが静的分析で確認できた。各コンポーネントは props 経由で適切に状態と更新関数を受け取ってカプセル化されており、既存の仕様や例外処理が全く損なわれていない。

---

## STEP B：品質レビュー（v1.3.1 リリース前検証 — アプリ全体）

**実施日**: 2026-03-01
**対象バージョン**: v1.3.1
**検証スコープ**: アプリ全体（リリース前検証）
**検証方法**: コードリーディングベースの静的分析

### ■ 観点1：エラーハンドリング確認

#### 1-1. DBファイルが存在しない・破損している場合

| # | 確認内容 | ファイル / 行番号 | 結果 |
|---|---------|------------------|------|
| 1 | `getDb()` で DB 接続失敗時に `yarukoto:dberror` イベントが発行される | `lib/db.js` L42-52 | ✅ OK |
| 2 | `layout.js` で `yarukoto:dberror` をリッスンし、エラー状態に遷移する | `app/layout.js` L52-59 | ✅ OK |
| 3 | `app/error.js` がグローバルエラーページを表示し「再読み込み」ボタンで復帰を試みる | `app/error.js` L1-35 | ✅ OK |
| 4 | `initDb()` 内の `try-catch` が SQL 実行エラー（corrupt DB 含む）を捕捉する | `lib/db.js` L35-51 | ✅ OK |
| 5 | WAL モード / busy_timeout / foreign_keys の PRAGMA がロック競合を軽減する | `lib/db.js` L11-13 | ✅ OK |

#### 1-2. 設定ファイルが存在しない・不正な内容の場合

| # | 確認内容 | ファイル / 行番号 | 結果 |
|---|---------|------------------|------|
| 6 | `app_settings` テーブルに設定キーが存在しない場合、各画面でデフォルト値にフォールバック | `hooks/useTodayTasks.js` L52-55, `app/settings/_components/OptionsPanel.js` L8, L60, L84 | ✅ OK |
| 7 | `show_overdue_in_today` が存在しない場合 `true`（表示する）がデフォルト | `hooks/useTodayTasks.js` L53-55 | ✅ OK |
| 8 | `auto_archive_days` に NaN が入力された場合 `parseInt || 0` で 0 にフォールバック | `app/settings/_components/OptionsPanel.js` L89 | ✅ OK |
| 9 | `sort_mode_tasks` / `sort_mode_today` が存在しない場合 `'auto'` がデフォルト | `components/TaskList.js` L24, `hooks/useTodayTasks.js` L31 | ✅ OK |
| 10 | `holiday_last_fetch_date` が存在しない場合、即座にフェッチが実行される | `lib/holidayService.js` L20-21 | ✅ OK |

#### 1-3. ディスク書き込み権限がない場合

| # | 確認内容 | ファイル / 行番号 | 結果 |
|---|---------|------------------|------|
| 11 | 全 DB 書き込み系の操作が `try-catch` で囲まれ、エラー時にユーザーへトースト通知 | 全コンポーネント | ✅ OK |
| 12 | タグ保存失敗時にトーストが表示される | `app/settings/_components/TagsPanel.js` L47 | ✅ OK |
| 13 | ステータス保存失敗時にトーストが表示される | `app/settings/_components/StatusPanel.js` L35 | ✅ OK |
| 14 | オプション設定の `toggleSetting` 失敗時にオプティミスティック更新がロールバックされる | `app/settings/_components/OptionsPanel.js` L17-21 | ✅ OK |
| 15 | 自動アーカイブ日数保存失敗時にトーストが表示される | `app/settings/_components/OptionsPanel.js` L104-106 | ✅ OK |
| 16 | CSV エクスポート/インポート失敗時にトーストが表示される | `app/settings/_components/DataPanel.js` L34, L64 | ✅ OK |
| 17 | 全データ削除失敗時にトーストが表示される | `app/settings/_components/DataPanel.js` L79 | ✅ OK |
| 18 | ルーティン保存/削除失敗時にトーストが表示される | `app/routines/_components/RoutineFormModal.js` L125, L137 | ✅ OK |
| 19 | ルーティン有効/無効トグル失敗時にオプティミスティック更新がロールバックされる | `app/routines/page.js` L99-109 | ✅ OK |
| 20 | タスクのステータス変更失敗時に `fetchTasks()` で DB から再取得してロールバック | `hooks/useTaskActions.js` L31-35 | ✅ OK |
| 21 | アーカイブ/復元処理がトランザクション (`BEGIN` / `COMMIT` / `ROLLBACK`) を使用 | `hooks/useTaskActions.js` L86-96, L113-126 | ✅ OK |
| 22 | CSV エクスポートでブラウザの Blob API を使用するため、Tauri ファイルシステム権限とは独立 | `app/settings/_components/DataPanel.js` L26-32 | ⚠️ 要実機確認 |

#### 1-4. 想定外のデータ型がDBに入っている場合

| # | 確認内容 | ファイル / 行番号 | 結果 |
|---|---------|------------------|------|
| 23 | `parseTags()` が `json_group_array` の null 結果（`[null]`）をフィルタリングする | `lib/utils.js` L27-40 | ✅ OK |
| 24 | `maxSort` の結果が `null` の場合 `(maxSort[0]?.ms \|\| 0) + 1` でフォールバック | `app/settings/_components/TagsPanel.js` L57, `StatusPanel.js` L44 | ✅ OK |
| 25 | `StatusCheckbox` で `statusCode` を `parseInt()` で数値化してから比較 | `components/StatusCheckbox.js` L7 | ✅ OK |
| 26 | タスク追加時の `importance` / `urgency` が空文字の場合 `null` に変換される | `components/TaskInput.js` L83-84 | ✅ OK |
| 27 | ルーティンの `importance_level` / `urgency_level` が空文字の場合 `null` に変換される | `app/routines/_components/RoutineFormModal.js` L69-70 | ✅ OK |
| 28 | `estimated_hours` が空の場合 `null` に変換、数値の場合 `Number()` で変換 | `app/routines/_components/RoutineFormModal.js` L71 | ✅ OK |
| 29 | `today_sort_order` が未設定（null/undefined）の場合 `\|\| 0` でフォールバック | `hooks/useTodayTasks.js` L169, L206 | ✅ OK |
| 30 | ダッシュボードでの割り算時にゼロ除算を回避: `total > 0` ガード | `app/dashboard/page.js` L216, L242, L259 | ✅ OK |

#### 観点1 小計

- **OK**: 29件
- **NG**: 0件
- **⚠️ 要実機確認**: 1件（#22）

---

### ■ 観点2：一貫性確認

#### 2-1. トースト通知の一貫性

| # | 確認内容 | ファイル / 行番号 | 結果 |
|---|---------|------------------|------|
| 31 | 成功トーストの形式が統一されている（`type: 'success'`） | 全コンポーネント | ✅ OK |
| 32 | エラートーストの形式が統一されている（`type: 'error'`） | 全コンポーネント | ✅ OK |
| 33 | settings パネル系はグローバルイベントの代わりにコールバック `flash()` を使用し、上位の `Settings` コンポーネントが `yarukoto:toast` に変換 | `app/settings/page.js` L20-27 | ✅ OK |
| 34 | routines ページもコールバック `flash()` を使用してトーストを発行 | `app/routines/page.js` L41-48 | ✅ OK |
| 35 | `flash()` と `yarukoto:toast` 直接発行の2パターンがある点を確認。パターンはコンポーネントのスコープに応じて分離されており整合が取れている | 全体 | ✅ OK |

#### 2-2. ボタン・ラベルの一貫性

| # | 確認内容 | ファイル / 行番号 | 結果 |
|---|---------|------------------|------|
| 36 | 「保存」「キャンセル」「削除」ボタンのラベルが全画面で統一されている | `TaskEditModal.js`, `RoutineFormModal.js`, `TagsPanel.js`, `StatusPanel.js` | ✅ OK |
| 37 | 削除確認ダイアログ (`confirm()`) が全画面で統一的に使用されている | 各 `del*` / `handleDelete*` 関数 | ✅ OK |
| 38 | ✕ ボタン（モーダル閉じる）のスタイルと挙動が `TaskEditModal.js` と `RoutineFormModal.js` で統一されている | 各 L136, L146 | ✅ OK |
| 39 | `disabled` 属性がタイトル未入力時に `保存` / `追加` ボタンへ一貫して適用されている | `TaskInput.js` L302, `TaskEditModal.js` L258, `RoutineFormModal.js` L330, `TagsPanel.js` L138 | ✅ OK |
| 40 | 全データ削除ボタンに2段階確認（`confirm` × 2）がある | `DataPanel.js` L69-70 | ✅ OK |

#### 2-3. 空状態表示の一貫性

| # | 確認内容 | ファイル / 行番号 | 結果 |
|---|---------|------------------|------|
| 41 | タスク一覧：空状態で励ましメッセージとアイコンが表示される | `TaskList.js` L262-267 | ✅ OK |
| 42 | アーカイブ一覧：空状態で適切なメッセージが表示される | `TaskList.js` L269-274 | ✅ OK |
| 43 | 今日のタスク：タスク0件時に空状態メッセージが表示される | `app/today/page.js` L190-197 | ✅ OK |
| 44 | タグ管理：タグ0件時に「タグがまだありません」メッセージが表示される | `TagsPanel.js` L143-144 | ✅ OK |
| 45 | ルーティン一覧：ルーティン0件時にガイダンスメッセージが表示される | `app/routines/page.js` L130-141 | ✅ OK |

#### 2-4. CSS変数・デザイントークンの一貫性

| # | 確認内容 | ファイル / 行番号 | 結果 |
|---|---------|------------------|------|
| 46 | 全コンポーネントが `globals.css` のデザイントークン（`--color-*`, `--border-*`, `--radius-*`, `--shadow-*`）を使用 | 全 `.js` ファイルの `<style jsx>` | ✅ OK |
| 47 | モーダルのバックドロップに統一的な `rgba(0,0,0,0.5)` + `backdrop-filter: blur(2px)` が使用されている | `TaskEditModal.js` L266-267, `RoutineFormModal.js` L339 | ✅ OK |
| 48 | モーダルの入出アニメーション (`modalIn`) が全モーダルで統一 | `TaskEditModal.js` L277, `RoutineFormModal.js` L349 | ✅ OK |
| 49 | ハードコードされた色が最小限に抑えられている（`#34c759`, `#e5e5ea` は iOS スイッチ用の意図的なハードコード） | `RoutineFormModal.js` L434-435, `app/routines/page.js` L218-221 | ✅ OK |

#### 2-5. Escape キーによるモーダル閉じの一貫性

| # | 確認内容 | ファイル / 行番号 | 結果 |
|---|---------|------------------|------|
| 50 | `TaskEditModal` で Escape キーリスナーが実装されている | `TaskEditModal.js` L55-58 | ✅ OK |
| 51 | `RoutineFormModal` には Escape キーリスナーが実装されていない | `RoutineFormModal.js` | ✅ 修正済み |

> **NG-B-1**: ~~`RoutineFormModal.js` に Escape キーによるモーダル閉じのリスナーが不足している。~~ ✅ 修正済み — `TaskEditModal.js` と同様の `useEffect` + `keydown` リスナーを `RoutineFormModal.js` に追加。

#### 2-6. ローディング表示の一貫性

| # | 確認内容 | ファイル / 行番号 | 結果 |
|---|---------|------------------|------|
| 52 | タスク一覧のローディングスピナーが表示される | `TaskList.js` L259-261 | ✅ OK |
| 53 | 今日のタスクのローディングスピナーが表示される | `app/today/page.js` L182-186 | ✅ OK |
| 54 | ダッシュボードのローディングスピナーが表示される | `app/dashboard/page.js` L131-141 | ✅ OK |
| 55 | ルーティン一覧のローディングスピナーが表示される | `app/routines/page.js` L122-128 | ✅ OK |
| 56 | 設定画面のローディングスピナーが表示される | `app/settings/page.js` L62-66 | ✅ OK |

#### 2-7. オプティミスティック更新とロールバックの一貫性

| # | 確認内容 | ファイル / 行番号 | 結果 |
|---|---------|------------------|------|
| 57 | `OptionsPanel.toggleSetting` — 失敗時に前の値に戻す | `OptionsPanel.js` L17-21 | ✅ OK |
| 58 | `useTodayTasks.toggleSortMode` — 失敗時に前のモードに戻す | `useTodayTasks.js` L248-252 | ✅ OK |
| 59 | `TaskList.toggleSortMode` — 失敗時に前のモードに戻す | `TaskList.js` L155-159 | ✅ OK |
| 60 | `TagsPanel.toggleArchiveTag` — 失敗時に前のアーカイブ状態に戻す | `TagsPanel.js` L105-109 | ✅ OK |
| 61 | `routines/page.js handleQuickToggle` — 失敗時に前の enabled 状態に戻す | `routines/page.js` L99-109 | ✅ OK |
| 62 | `useTaskActions.handleStatusChange` — 失敗時に `fetchTasks()` で DB から再取得 | `useTaskActions.js` L31-35 | ✅ OK |
| 63 | `TagsPanel.commitTag` — 失敗時にトーストもロールバックもないが、`saveTags` で一括保存されるため問題なし | `TagsPanel.js` L83 | ✅ OK |

#### 観点2 小計

- **OK**: 32件
- **NG**: 1件（#51 NG-B-1）

---

### STEP B 総合判定

| 区分 | OK | NG | 要実機確認 |
|------|----|----|-----------|
| 観点1: エラーハンドリング | 29 | 0 | 1 |
| 観点2: 一貫性 | 33 | 0 | 0 |
| **合計** | **62** | **0** | **1** |

#### NG 一覧

| ID | 内容 | 重要度 |
|----|------|--------|
| NG-B-1 | ~~`RoutineFormModal.js` に Escape キーによるモーダル閉じ未実装（`TaskEditModal.js` との不整合）~~ ✅ 修正済み | 低 |

#### ⚠️ 要実機確認 一覧

| ID | 内容 |
|----|------|
| #22 | CSV エクスポートが Blob API ベースのため Tauri 環境でのダウンロード動作を実機で確認すること |
