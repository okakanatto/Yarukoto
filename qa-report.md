# QA Report

## STEP A：静的コード分析（v1.4.0 枝番4-5）

**対象**: BUG-7（残存）アーカイブ／復元トランザクション管理の根本修正

**変更ファイル**:
- `lib/utils.js` — `safeTransaction` ヘルパー関数を新設
- `hooks/useTaskActions.js` — `handleArchive` / `handleRestore` を `safeTransaction` に置換

✅ 全31件パス（条件分岐12件、データフロー10件、影響範囲2件（参照元7箇所確認）、UIロジック7件）

⚠️ 要実機確認：タスク一覧で完了済みタスクの📦アーカイブボタンを押す→「アーカイブしました」のトースト通知が表示されてタスクが一覧から消える。アーカイブ済みタブに切り替えて📤復元ボタンを押す→「復元しました」のトースト通知が表示されてタスクが元に戻る。（テスト環境は better-sqlite3 を使用しており Tauri SQL プラグインの自動ロールバック挙動の再現が不完全なため、実機での動作確認が必要）

### 観点3：影響範囲（参照元一覧）

NG はないが、リリース前検証 STEP A 用に洗い出した参照元を記録する。

| # | 変更元 | 影響先 | 接続方法 | テストカバー |
|---|--------|--------|----------|-------------|
| 1 | `lib/utils.js:safeTransaction` | `hooks/useTaskActions.js:handleArchive` (142行) | 直接呼び出し | `tests/lib/utils.test.js` (3件) + `tests/db/archive.test.js` (2件) |
| 2 | `lib/utils.js:safeTransaction` | `hooks/useTaskActions.js:handleRestore` (180行) | 直接呼び出し | `tests/lib/utils.test.js` (3件) + `tests/db/archive.test.js` (2件) |
| 3 | `hooks/useTaskActions.js:handleArchive` | `components/TaskList.js` (290行) | props `onArchive={handleArchive}` | なし（UIコンポーネント） |
| 4 | `hooks/useTaskActions.js:handleArchive` | `components/TaskItem.js` (134行) | `onArchive(task.id)` 呼び出し | なし（UIコンポーネント） |
| 5 | `hooks/useTaskActions.js:handleRestore` | `components/TaskList.js` (290行) | props `onRestore={handleRestore}` | なし（UIコンポーネント） |
| 6 | `hooks/useTaskActions.js:handleRestore` | `components/TaskItem.js` (116行) | `onRestore(task.id)` 呼び出し | なし（UIコンポーネント） |
| 7 | `hooks/useTaskActions.js` (フック自体) | `app/today/page.js` (149行) | `useTaskActions()` 呼び出し（handleArchive/handleRestore は未使用） | なし |

**備考**: 全ての影響先で関数シグネチャ・props インターフェースに変更なし。返り値オブジェクト構造も変更なし。非テスト対象の影響先（#3〜#7）はいずれも呼び出しインターフェースが不変のため、静的分析で整合性を確認済み。

---

## STEP B：品質レビュー（v1.4.0 枝番4-5）

**対象**: BUG-7（残存）アーカイブ／復元トランザクション管理の根本修正

**変更ファイル**:
- `lib/utils.js` — `safeTransaction` ヘルパー関数を新設
- `hooks/useTaskActions.js` — `handleArchive` / `handleRestore` を `safeTransaction` に置換

✅ OK: 観点1 エラーハンドリング 10件パス（safeTransaction の BEGIN 失敗、operations 内 SQL 失敗、COMMIT 失敗、ROLLBACK 二重実行耐性、handleArchive 未完了子タスクバリデーション、handleArchive 楽観的更新後エラー回復、handleRestore 楽観的更新後エラー回復、processingIds ガードと finally 保証、fetchDb 失敗伝播、handleArchive 早期 return 時の finally 実行保証）

### 観点2：一貫性レビュー

✅ OK: 7件パス（トースト文言パターン「〜しました/〜に失敗しました」統一、エラー時 fetchTasks 回復パターン統一、ボタン title 属性「アーカイブ/復元」統一、SQL 日時関数 `datetime('now','localtime')` 統一、日付フォーマット `'sv-SE'` ロケール統一、processingIds によるボタン disabled 制御統一、復元トーストの親子コンテキスト別メッセージ分岐）

| # | 観点 | 箇所A | 箇所B | 不整合の内容 | ファイル名:行番号 |
|---|------|------|------|------------|----------------|
| 1 | アーカイブのトランザクション管理 | `handleArchive` / `handleRestore` | `runAutoArchive` | 手動アーカイブは `safeTransaction` でトランザクション保護されているが、自動アーカイブは保護なし | `hooks/useTaskActions.js:142,180` / `lib/db.js:266-292` | ✅ 修正済み |

**NG-1**: runAutoArchive にトランザクション保護なし → safeTransaction を適用（`lib/db.js:274`）✅ 修正済み

---

## STEP R：リグレッションテスト（v1.4.0 枝番4-5 2026-03-04）

**対象**: BUG-7（残存）アーカイブ／復元トランザクション管理の根本修正

**変更サマリー**:
- `lib/utils.js` — `safeTransaction` ヘルパー関数を追加
- `hooks/useTaskActions.js` — `handleArchive`/`handleRestore` のトランザクション管理を `safeTransaction` に置換
- `lib/db.js` — `runAutoArchive` に `safeTransaction` を適用 + インポート追加

### ユニットテスト

`npm test` 結果: **81/81 全件パス**（10ファイル、705ms）

### 第1段階：変更箇所の直接テスト

✅ 全6件パス（直接テスト6件）

確認項目:
1. `safeTransaction` 関数の実装（BEGIN/COMMIT/ROLLBACK フロー、エラー時 ROLLBACK 後 re-throw、ROLLBACK 二重実行耐性）— `lib/utils.js:24-33`
2. `handleArchive` が `safeTransaction` でラップされ、親+子の all-or-nothing アーカイブが動作 — `hooks/useTaskActions.js:142-147`
3. `handleRestore` が `safeTransaction` でラップされ、親+子の all-or-nothing 復元が動作 — `hooks/useTaskActions.js:180-188`
4. `runAutoArchive` が `safeTransaction` でラップされ、自動アーカイブ+子連動が動作 — `lib/db.js:274-293`
5. `safeTransaction` ユニットテスト3件（正常COMMIT・エラーROLLBACK・ROLLBACK二重耐性）— `tests/lib/utils.test.js:67-121`
6. アーカイブ関連ユニットテスト9件（safeTransaction経由アーカイブ/復元4件 + runAutoArchive5件）— `tests/db/archive.test.js:89-277`

### 第2段階：影響範囲の特定とテスト

**影響範囲の洗い出し結果**:

| # | 確認対象ファイル・関数 | 接続経路 | 確認内容 |
|---|----------------------|----------|----------|
| 1 | `components/TaskItem.js:134` `onArchive(task.id)` | props経由で `handleArchive` を呼出 | 関数シグネチャ不変（`taskId`→void）、`disabled={isProcessing}` 制御も不変 |
| 2 | `components/TaskItem.js:116` `onRestore(task.id)` | props経由で `handleRestore` を呼出 | 関数シグネチャ不変（`taskId`→void）|
| 3 | `components/TaskList.js:201,290` | `useTaskActions()` の返り値を TaskItem に props 伝播 | 返り値オブジェクト構造（handleArchive, handleRestore, processingIds 等）不変 |
| 4 | `app/today/page.js:149-154` | `useTaskActions()` を呼出（handleArchive/handleRestore は未使用）| フック内部の状態変更が他ハンドラ（handleStatusChange 等）に影響しないことを確認 |
| 5 | `app/settings/_components/OptionsPanel.js:118-119` | `runAutoArchive(db)` を動的インポートで呼出 | 関数シグネチャ不変（`db`→void）、export 維持（`lib/db.js:299`）|
| 6 | `lib/db.js:255` `initDb()` → `runAutoArchive(db)` | 起動時に呼出 | エラーは外側の try-catch（257行）で捕捉、起動フローに影響なし |
| 7 | `lib/db.js:3` ↔ `lib/utils.js:12` 循環依存チェック | `db.js` が `utils.js` を static import、`utils.js` が `db.js` を dynamic import | dynamic import のため循環依存なし |
| 8 | `hooks/useTaskActions.js` の他ハンドラ | handleStatusChange, handleDelete, handleTodayToggle, handleRoutineStatusChange | 4-5 で変更なし、safeTransaction 未使用 |

✅ 全8件パス（影響範囲テスト8件）

### 総合結果

✅ 全14件パス（直接テスト6件、影響範囲テスト8件）

⚠️ 要実機確認: タスク一覧画面で完了済みタスクの📦ボタンを押す → 「アーカイブしました」と表示されタスクが消える → 「アーカイブ済み」タブで📤ボタンを押す → 「復元しました」と表示されタスクが戻る（Tauri SQL プラグイン固有の自動ロールバック挙動はテスト環境で再現不可のため）
