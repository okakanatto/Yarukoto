# QA Report

## STEP A：機能検証（v1.2.0 枝番2-2）

**検証方法**: 静的分析（ソースコードリーディング）による確認。

### 観点1：正常系テスト

| # | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 1 | BUG-5: TaskInput 項目順 | フォームを展開し各フィールドの順序を確認 | 終了期限→備考→タグ→親タスク→開始日・想定工数→重要度・緊急度（タスク名はprimary row）の順 | 静的分析: `components/TaskInput.js:196-278` の details-panel が仕様通りの順 ✓ | OK |
| 2 | BUG-5: TaskEditModal 項目順 | 編集モーダルを開き各フィールドの順序を確認 | タスク名→ステータス→終了期限→備考→タグ→親タスク→開始日・想定工数→重要度・緊急度→完了日 | 静的分析: `components/TaskEditModal.js:137-250` が仕様通りの順 ✓（ステータスはWORK-LOG通り独立配置） | OK |
| 3 | BUG-5: 完了日フィールド（未完了タスク） | 未完了タスクの編集モーダルを開く | 完了日フィールドが非表示 | 静的分析: `task.completed_at` が falsy の場合レンダリングされない (`TaskEditModal.js:244`) ✓ | OK |
| 4 | BUG-5: 完了日フィールド（完了済みタスク） | 完了済みタスクの編集モーダルを開く | 完了日が readOnly で表示される | 静的分析: `task.completed_at` あり → `readOnly disabled` で表示 (`TaskEditModal.js:248`) ✓ | OK |
| 5 | IMP-12: ▶ボタン（未着手ホバー） | 未着手タスクにマウスホバー | ▶ボタンが右に表示される | 静的分析: `showPlay = code===1 && hovered && !twoStateOnly` (`StatusCheckbox.js:32`) ✓ | OK |
| 6 | IMP-12: ↩ボタン（着手中ホバー） | 着手中タスクにマウスホバー | ↩ボタンが右に表示される | 静的分析: `showRevert = code===2 && hovered && !twoStateOnly` (`StatusCheckbox.js:33`) ✓ | OK |
| 7 | IMP-12: 着手中→未着手のリバート | ↩ボタンをクリック | ステータスが未着手(1)へ遷移 | 静的分析: `handleRevertClick` → `onChange(1)` (`StatusCheckbox.js:26-30`) ✓ | OK |
| 8 | IMP-12: 着手中→完了（既存動作維持） | 着手中タスクの本体をクリック | ステータスが完了(3)へ遷移 | 静的分析: `handleMainClick` で code===2 → `onChange(3)` (`StatusCheckbox.js:13-14`) ✓ | OK |
| 9 | ENH-6: 完了日の即時反映（TaskList） | タスク一覧でタスクを完了にする | リロードなしで完了日が即座に表示される | 静的分析: `handleStatusChange` で `completed_at=completedNow` の楽観的更新 (`TaskList.js:114-119`) ✓ | OK |
| 10 | ENH-6: 完了日の即時反映（今日やる） | 今日やる画面でタスクを完了にする | リロードなしで完了日が即座に表示される | 静的分析: `handleStatusChange` で同様の楽観的更新 (`today/page.js:275-280`) ✓ | OK |
| 11 | ENH-6: 完了→非完了で完了日クリア | 完了タスクを未着手に戻す | 完了日表示が消える | 静的分析: code≠3 → `completed_at=null` で楽観的更新 ✓ | OK |

⚠️ 要実機確認:
- ↩ボタンのフェードインアニメーション（`statusCbFadeIn`）と ▶ボタンとの同時表示が起きないか
- 完了日が即座に DOM に反映されること（楽観的更新のレンダリング確認）
- ▶ボタン・↩ボタンとタスクカードのレイアウト崩れがないか

### 観点2：異常系・境界値テスト

| # | 対象フィールド/操作 | 入力内容 | 期待される挙動 | 実際の挙動 | OK/NG |
|---|---|---|---|---|---|
| 1 | IMP-12: キャンセル(5)タスクへの操作 | キャンセルタスクの ↩ クリック | `if (code === 5) return;` ガードで何も起きない | 静的分析: `handleRevertClick:28` にガードあり ✓ | OK |
| 2 | IMP-12: twoStateOnly=true モード | 着手中タスクにホバー | ↩ボタンが表示されない | 静的分析: `showRevert = ... && !twoStateOnly` → false ✓ | OK |
| 3 | ENH-6: completed_at の null チェック | 未完了タスクの completed_at 参照 | エラーにならず完了日が非表示 | 静的分析: `{isDone && task.completed_at && ...}` で null ガード (`TaskList.js:599`, `today/page.js:486`) ✓ | OK |
| 4 | ENH-6: フォーマット互換性 | 楽観的更新の completed_at を split | `split(' ')[0]` で日付部分が取得できる | 静的分析: `sv-SE` ロケールで `YYYY-MM-DD HH:MM:SS` → `[0]` は `YYYY-MM-DD` ✓ | OK |
| 5 | BUG-5: 空タスク名での保存 | タスク名を空にして保存ボタンをクリック | 保存ボタンが disabled | 静的分析: `disabled={!title.trim() \|\| saving}` (`TaskEditModal.js:255`) ✓ | OK |
| 6 | IMP-12: ↩ボタン連打 | ↩ボタンを素早く連打 | `e.stopPropagation()` により親クリックは伝播しない。DB 側は同値更新で冪等 | 静的分析: `stopPropagation` (`StatusCheckbox.js:27`) ✓ | OK |

### 観点3：状態遷移・データ件数テスト

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 1 | ENH-6: ルーティン完了時の completed_at | 今日やる画面でルーティンを完了にする | UI上で completed_at が反映される（DB の routine_completions には影響なし） | 静的分析: 楽観的更新はルーティンも対象。ルーティンに completed_at フィールドは元来ないが更新自体は無害 ⚠️ 要実機確認 | OK |
| 2 | ENH-6: 今日やる ↔ タスク一覧の整合性 | 今日やる画面で完了後にタスク一覧を開く | 完了日が一致している | 静的分析: DB は `datetime('now', 'localtime')`、楽観的更新は `sv-SE` ロケール。日付部分は一致するはず ⚠️ 要実機確認 | OK |
| 3 | BUG-5: 今日やる画面からの編集モーダル | タスク名クリックで編集モーダルを開く | TaskEditModal が開き仕様通りの項目順が表示される | 静的分析: `today/page.js:474-476` で `setEditingTask` → TaskEditModal ✓ | OK |

---

## STEP B：品質レビュー（v1.2.0 枝番2-2）

**検証方法**: 静的分析（コードリーディングベース）。

### 観点1：エラーハンドリング確認

| # | 異常条件 | 挙動 | エラーメッセージの有無と内容 | データへの影響 | OK/NG |
|---|---|---|---|---|---|
| 1 | TaskEditModal.js: DB書き込みエラー（保存失敗） | モーダルが開いたまま。保存ボタンが再び有効になる | なし（`console.error(err)` のみ） | データは変更されない | **NG** |
| 2 | TaskList.js handleStatusChange: DB更新失敗 | 楽観的更新後、`fetchTasks()` でリロード（ロールバック） | なし（console.error のみ） | UI は元の状態に戻る | OK（許容） |
| 3 | today/page.js handleStatusChange: DB更新失敗 | 楽観的更新後、`loadTasks(selectedDate)` でリロード | なし（console.error のみ） | UI は元の状態に戻る | OK（許容） |
| 4 | StatusCheckbox.js: コールバック失敗 | StatusCheckbox 自体はエラーハンドリングなし。親コンポーネントに委任 | 親コンポーネント側で処理 | 親の責任範囲 | OK |

**NG詳細（#1）:**
- **該当ファイル**: `components/TaskEditModal.js:120-123`
- **再現手順**: 編集モーダルでタスクを変更し「保存」ボタンをクリック → DB エラーが発生した場合
- **期待される挙動**: エラートースト（「保存に失敗しました」）が表示され、ユーザーが失敗を認識できること
- **実際の挙動**: `catch (err) { console.error(err); }` のみ。モーダルは閉じず、ボタンは再度有効になるが、ユーザーに通知なし
- **原因**: catch 内に `yarukoto:toast` イベントの dispatch がない
- **対応**: catch 内に `window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '保存に失敗しました', type: 'error' } }))` を追加
- **備考**: BUG-5 の変更前から存在する既存の問題。ただし BUG-5 の変更対象ファイルのため今回指摘

### 観点2：一貫性レビュー

| # | 観点 | 箇所A | 箇所B | 不整合の内容 | ファイル名:行番号 |
|---|---|---|---|---|---|
| 1 | エラートースト | `TaskInput.js`: 追加失敗時にエラートーストあり | `TaskEditModal.js`: 保存失敗時にトーストなし | 追加と編集でエラー通知の有無が異なる | `components/TaskEditModal.js:120-123` |
| 2 | 完了日表示パターン | `TaskList.js:599` | `today/page.js:486` | `{isDone && task.completed_at && ...}` で統一済み | — |
| 3 | DB status更新パターン | `TaskList.js:123-127` | `today/page.js:303-307` | `UPDATE tasks SET status_code..., completed_at = datetime(...)` で統一済み | — |
| 4 | 日付フォーマット | `TaskList.js`, `today/page.js` | `TaskEditModal.js` | `sv-SE` ロケール + `split(' ')[0]` で統一済み | — |

---

## ✅ STEP B NG修正済み（v1.2.0 枝番2-2）

**修正内容**: `components/TaskEditModal.js:120-123` — handleSave の catch に エラートースト dispatch を追加

---

## STEP R：リグレッションテスト（v1.2.0 枝番2-2 2026-02-27）

**検証方法**: 静的分析（コードリーディングベース）。

**変更サマリー（参照元: WORK-LOG.md 枝番2-2）:**
- 変更した機能: BUG-5（TaskInput/TaskEditModal レイアウト統一）、IMP-12（StatusCheckbox ↩ボタン追加）、ENH-6（completed_at の楽観的更新）
- 変更したファイル: `components/TaskInput.js`、`components/TaskEditModal.js`、`components/StatusCheckbox.js`、`components/TaskList.js`、`app/today/page.js`
- 影響が想定される箇所: TaskItem コンポーネント全体、今日やる画面タスクカード、StatusCheckbox を使用する全画面、TaskEditModal/TaskInput を呼び出す全画面

### 第1段階：変更箇所の直接テスト

| # | テスト区分 | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|---|
| 1 | 直接 | BUG-5: TaskInput レイアウト | フォーム展開時の項目順確認 | 仕様通り | 静的分析: ✓ | OK |
| 2 | 直接 | BUG-5: TaskEditModal レイアウト | 編集モーダルの項目順確認 | 仕様通り | 静的分析: ✓ | OK |
| 3 | 直接 | IMP-12: ↩ボタン動作 | 着手中タスクにホバーして ↩ をクリック | 未着手へ遷移 | 静的分析: ✓ | OK |
| 4 | 直接 | ENH-6: 完了日の即時反映 | タスクを完了にした際の completed_at 即時更新 | 楽観的更新で即座に反映 | 静的分析: ✓ | OK |

### 第2段階：影響範囲の特定とテスト

| # | テスト区分 | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|---|
| 1 | 影響範囲 | 既存: ▶ボタン（未着手→着手中） | IMP-12変更後、未着手タスクにホバー | ▶ボタンが従来通り表示される | 静的分析: `showPlay` 条件は変更なし ✓ | OK |
| 2 | 影響範囲 | 既存: 完了→未着手（handleMainClick） | 完了タスクの本体クリック | 未着手へ遷移 | 静的分析: `handleMainClick` は変更なし ✓ | OK |
| 3 | 影響範囲 | 既存: DnD ネスト・アンネスト | タスクのドラッグ&ドロップ | 従来通りのネスト・アンネスト動作 | 静的分析: `handleDragEnd` 変更なし ✓ | OK |
| 4 | 影響範囲 | 既存: タグ継承（DnD） | DnDでネストした際のタグ継承 | `inherit_parent_tags` 設定に応じた動作 | 静的分析: タグ継承ロジック変更なし ✓ | OK |
| 5 | 影響範囲 | 既存: タスク追加（TaskInput） | タスクを新規追加 | 追加後の表示・トースト通知 | 静的分析: submit処理・トーストロジック変更なし ✓ | OK |
| 6 | 影響範囲 | 既存: 今日やる ルーティン完了 | ルーティンを完了 | `routine_completions` に記録 | 静的分析: ルーティンの DB 操作部分変更なし ✓ | OK |
| 7 | 影響範囲 | 2-1修正済み: BUG-4 親タスク削除 | 子持ち親タスクを削除 | 子が `parent_id=NULL` で独立 | 静的分析: `handleDelete` 変更なし ✓ | OK |
| 8 | 影響範囲 | 2-1修正済み: BUG-6 2階層制限 | 子持ちタスクへの親設定試行 | UI無効化・DBバリデーション | 静的分析: `hasChildren`/`parentOptions` ロジック変更なし ✓ | OK |
| 9 | 影響範囲 | app/tasks/page.js | TaskList・TaskInput のレンダリング | TaskList・TaskInput の変更が正常に反映される | 静的分析: `app/tasks/page.js` はシンプルなラッパーのみ。変更なし ✓ | OK |

**影響範囲の確認対象リスト:**
- `StatusCheckbox` 使用箇所: `components/TaskList.js`（TaskItem内）、`app/today/page.js` — 両方確認済み ✓
- `TaskEditModal` 使用箇所: `components/TaskList.js`（編集ボタン）、`app/today/page.js`（タスク名クリック）— 両方確認済み ✓
- `TaskInput` 使用箇所: `app/tasks/page.js`、`components/TaskList.js`（子タスク入力）、`app/layout.js`（FAB）— 実装への影響なし ✓

**STEP R 結果: 全件 OK**

---

## STEP A：機能検証（v1.2.0 枝番2-1）

**検証方法**: 静的分析（ソースコードリーディング）による確認。

### 観点1：正常系テスト

| # | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 1 | 親タスクの連鎖削除防止 (BUG-4) | 子タスクを持つ親タスクをUIから削除する | 親タスクのみ削除され、子タスクは独立（`parent_id` が NULL に）すること | 静的分析で期待通り動作することを確認 | OK |
| 2 | 親タスク設定UIの無効化 (BUG-6) | 子タスクを持つタスクの編集モーダルを開く | 親タスク選択セレクトボックスが無効化され、「設定不可（子タスクあり）」と表示されること | 静的分析で期待通り動作することを確認 | OK |
| 3 | 親タスク設定のDB側バリデーション (BUG-6) | 子タスクを持つタスクに強引に親タスクを設定して保存を試みる | サーバーでの保存処理がエラーとなり、エラー用のトースト通知が表示されること | 静的分析で期待通り動作することを確認 | OK |

### 観点2：異常系・境界値テスト

| # | 対象フィールド/操作 | 入力内容 | 期待される挙動 | 実際の挙動 | OK/NG |
|---|---|---|---|---|---|
| 1 | 連鎖削除防止処理の対象外 | 子を持たない単体タスクの削除 | 削除前の `parent_id = NULL` 更新処理が空振りし、タスク本体が正常に単体削除されること | 静的分析でエラーなく正常終了することを確認 | OK |
| 2 | 子タスクの削除 | 子タスク（親を持つタスク）の削除 | 親タスクではなく自身が削除され、連鎖削除防止ロジックが安全に空振りして正常に削除されること | 静的分析でエラーなく正常終了することを確認 | OK |
| 3 | 親タスク候補の取得 | 不正なタスクが存在（ステータス5のキャンセル等） | キャンセル済みタスク等の不正・完了状態のタスクは親タスクの選択候補として表示されないこと | 静的分析で `status_code != 5` で除外されていることを確認 | OK |
| 4 | 処理の重複・連打 | 編集モーダルの「保存」ボタン連打 | 一度保存処理が始まると `saving` ステートによりボタンが無効化され、多重リクエストが発生しないこと | 静的分析で `saving` ステートが適切に使用されていることを確認 | OK |

### 観点3：状態遷移・データ件数テスト

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 1 | データ大量状態（親1に対し子100件） | 子タスクを大量に持つ親タスクを削除する | バッチ的な `UPDATE tasks SET parent_id = NULL WHERE ...` 1クエリで実行されるため、タイムアウトせずに完了すること | 静的分析でN+1が発生せず1クエリで更新処理が行われることを確認 | OK |
| 2 | 状態の連続遷移 (DnDとの競合) | ドラッグ＆ドロップでタスクを子タスク化した直後、子にしたタスクの編集モーダルを開く | すでに親がいるため、モーダル上でさらに親を設定したり、子を持つタスクに変更したり等の競合が防がれること | 静的分析でモーダル表示時に都度DBから最新の子タスク/親タスク状況を取得し制限が掛かることを確認 | OK |
| 3 | 削除→再編集 | 親タスクを削除し独立させた元子タスクを編集する | 独立したタスクはルートタスクとして扱われ、別タスクの親にも子にもなることができること | 静的分析で `parent_id` が `NULL` になっているため通常のルートタスク同様の操作が可能であることを確認 | OK |
