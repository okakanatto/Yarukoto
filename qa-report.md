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

**#1 詳細**:
- **問題**: `hooks/useTaskActions.js` の `handleArchive`（142行）と `handleRestore`（180行）は 4-5 で `safeTransaction` を使うよう修正され、親タスク＋子タスクのアーカイブ/復元が all-or-nothing で実行されるようになった。一方、`lib/db.js` の `runAutoArchive`（266-292行）は同じく「親の完了タスクをアーカイブ → その子をまとめてアーカイブ」という2段階 UPDATE を実行するが、トランザクション保護なしで2つの `db.execute()` を逐次実行している。
- **リスク**: `runAutoArchive` で1本目の UPDATE（親タスクアーカイブ、273行）が成功し、2本目の UPDATE（子タスクアーカイブ、284行）が失敗した場合、親だけアーカイブされて子が取り残される不整合状態が発生しうる。
- **推奨**: `runAutoArchive` 内の2段階 UPDATE を `safeTransaction` でラップし、手動アーカイブと同じトランザクション保護を適用する。`lib/db.js` は `lib/utils.js` をインポートしていないため、`safeTransaction` のインポート追加が必要。または `runAutoArchive` を `lib/utils.js` に移動するか、`lib/db.js` 内にローカルなトランザクションラップを記述する。
- **緊急度**: 低（起動時バッチ処理であり、2本目の UPDATE が失敗する可能性は極めて低い。また失敗しても子タスクはアクティブ一覧に残るためデータ喪失はない）
