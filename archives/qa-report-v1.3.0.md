# QA Report

## STEP A：機能検証（v1.3.0 枝番3-1）

### 観点1：正常系テスト

✅ OK: 4件 全件パス

### 観点2：異常系・境界値テスト

✅ OK: 4件 全件パス

### 観点3：状態遷移・データ件数テスト

✅ OK: 3件 全件パス

## STEP B：品質レビュー（v1.3.0 枝番3-1）

### 観点1：エラーハンドリング確認

✅ OK: 2件 全件パス

### 観点2：一貫性レビュー

| # | 観点 | 箇所A | 箇所B | 不整合の内容 | ファイル名:行番号 |
|---|---|---|---|---|---|
| 1 | UI挙動の不統一（並び替え操作） | `tab === 'status'` のリスト描画（ `row` 関数内の `▲▼` ボタン表示 ） | `tab === 'tags'` のリスト描画 | ✅ 修正済み — `moveTag` 関数を追加し、タグ一覧にも▲▼ボタンを実装。ステータスと同じ操作体系に統一。 | app/settings/page.js |
| 2 | エラー処理の記述（ログ出力） | `addStatus` などの他の更新系関数での例外キャッチ<br>(`catch (e) { console.error(e); flash(...) }`) | `saveMaster` および `saveTags` の例外キャッチ<br>(`catch { flash(...) }`) | ✅ 修正済み — `saveMaster` と `saveTags` の catch ブロックに `(e)` と `console.error(e)` を追加。全関数で統一。 | app/settings/page.js |

## STEP R：リグレッションテスト（v1.3.0 枝番3-1 2026-02-28）

### 第1段階：変更箇所の直接テスト

✅ OK: 9件 全件パス

### 第2段階：影響範囲のテスト

✅ OK: 9件 全件パス

### 実機確認推奨項目

- ⚠️ 要実機確認：[設定画面]で[タグタブを開く]→[タグ名の右に▲▼ボタンが表示されていること]
- ⚠️ 要実機確認：[設定画面]で[タグの▲▼ボタンをクリック]→[タグの順番が入れ替わること]
- ⚠️ 要実機確認：[設定画面]で[タグの並び替え後に「並び順を保存」をクリック]→[画面リロード後もタグの順番が保持されていること]
- ⚠️ 要実機確認：[設定画面]で[タグの並び替え保存後、タスク追加画面を開く]→[タグ選択ドロップダウンに変更後の順番で表示されること]

### 結果サマリー

- **直接テスト**: 9件 全OK
- **影響範囲テスト**: 9件 全OK
- **合計**: 18件 全OK / NG: 0件

## STEP A：機能検証（v1.3.0 枝番3-2）

### 観点1：正常系テスト

✅ OK: 23件 パス

| # | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 24 | 自動アーカイブ: 親子連動なし（バグ） | auto_archive_days = 14、親タスク完了日30日前、子タスク完了日5日前 | 仕様上は親アーカイブ時に子もまとめてアーカイブされるべき | `lib/db.js` L222-229: `runAutoArchive` は個別タスクの `completed_at` のみを評価し、`parent_id` を考慮しない。親が自動アーカイブされても子はアーカイブされない。子の `completed_at` が閾値を超えるまで親子が分離した状態になる。 | ✅ 修正済み |

**NG詳細: #24 自動アーカイブの親子連動欠如**

- **該当ファイル**: `lib/db.js:222-230`
- **再現手順**: (1) 親タスクAを完了する（completed_at = 30日前相当）。(2) 子タスクBを完了する（completed_at = 5日前相当）。(3) 設定画面で自動アーカイブを14日に設定する。(4) runAutoArchive が実行される。
- **期待される挙動**: IMP-2 仕様「親アーカイブ時は子もまとめてアーカイブ」に基づき、親タスクAがアーカイブされる際、子タスクBも連動してアーカイブされるべき。
- **実際の挙動**: `runAutoArchive` の SQL は `WHERE archived_at IS NULL AND status_code = 3 AND completed_at IS NOT NULL AND date(completed_at) <= date(...)` で個別タスクのみを対象とする。親タスクAはアーカイブされるが、子タスクBは `completed_at` が閾値未満のためアーカイブされない。結果として、親が「📦 アーカイブ済み」タブに、子が「📋 タスク」タブに分離して表示される。
- **原因の推定**: `runAutoArchive()` 関数（lib/db.js L216-234）は単一の UPDATE 文で全対象タスクを一括処理しており、親子関係（`parent_id`）を参照するロジックが存在しない。手動アーカイブ（`TaskList.js` L198-237 の `handleArchive`）では親子連動ロジックがあるが、自動アーカイブには未実装。
- **修正方針案**: `runAutoArchive` 内で、自動アーカイブ対象となった親タスクの子タスクも合わせてアーカイブする追加 UPDATE 文を発行する（例: `UPDATE tasks SET archived_at = ... WHERE parent_id IN (SELECT id FROM tasks WHERE archived_at IS NOT NULL AND parent_id IS NULL)` のような連動処理）。

### 観点2：異常系・境界値テスト

✅ OK: 13件 全件パス

### 観点3：状態遷移・データ件数テスト

✅ OK: 12件 全件パス

### 実機確認推奨項目

- ⚠️ 要実機確認：[タスク一覧画面]で[「📋 タスク」タブと「📦 アーカイブ済み」タブが表示されていること]
- ⚠️ 要実機確認：[タスク一覧画面]で[完了タスクの右側に📦ボタンが表示されていること]
- ⚠️ 要実機確認：[タスク一覧画面]で[📦ボタンをクリック]→[タスクが通常ビューから消え、トースト「アーカイブしました」が表示されること]
- ⚠️ 要実機確認：[タスク一覧画面]で[「📦 アーカイブ済み」タブをクリック]→[アーカイブしたタスクが表示され、📤復元ボタンがあること]
- ⚠️ 要実機確認：[タスク一覧画面]で[📤復元ボタンをクリック]→[タスクがアーカイブビューから消え、通常ビューに戻ること]
- ⚠️ 要実機確認：[設定画面]で[オプションタブの「完了タスクの自動アーカイブ」カードが表示されていること]→[数値入力欄と「日後」ラベルがあること]
- ⚠️ 要実機確認：[タスク一覧画面]で[50件以上のアーカイブ済みタスクを表示]→[スクロールが滑らかで表示が崩れないこと]

### 実機検証で発見された問題

**症状**: アプリ全画面でタスクデータが表示されない（ルーティン管理画面・タグは正常に表示される）

**コンソールエラー**:
```
Tauri DB fetch today error: "error returned from database: (code: 1) no such column: t.archived_at"
Tauri DB fetch error: "error returned from database: (code: 1) no such column: t.archived_at"
Dashboard Tauri DB Error "error returned from database: (code: 1) no such column: archived_at"
```

**原因特定**: `lib/db.js` の globalThis シングルトンパターンにより、HMR（Hot Module Replacement）環境でマイグレーションが実行されない。

- **該当ファイル**: `lib/db.js:25-35`（getDb 関数の globalThis シングルトン）、`lib/db.js:194`（archived_at マイグレーション）
- **再現手順**: (1) アーカイブ機能追加前のコードで `npm run tauri dev` を起動する。(2) 旧 `initDb()` が実行され、`globalThis['__yarukoto_db_promise__']` にPromiseがセットされる。(3) コード更新（アーカイブ機能追加）→ HMR で db.js が再評価される。(4) しかし `globalThis['__yarukoto_db_promise__']` が既に存在するため、新しい `initDb()` は実行されない。(5) `ALTER TABLE tasks ADD COLUMN archived_at TEXT`（L194）が実行されず、`archived_at` カラムが存在しないまま、各画面のクエリが `WHERE t.archived_at IS NULL` を参照してエラーになる。
- **期待される挙動**: マイグレーション済みの `archived_at` カラムが存在し、全タスクの `archived_at` が NULL のため通常通り表示される。
- **実際の挙動**: `no such column: archived_at` エラーにより、タスク関連の全クエリ（今日やるタスク・タスク一覧・ダッシュボード）が失敗し、データが表示されない。ルーティン管理画面は `tasks` テーブルを直接参照しないため正常動作。
- **解決方法**: Tauri dev サーバーを完全に再起動（Ctrl+C → `npm run tauri dev`）することで `globalThis` がリセットされ、新しい `initDb()` で `ALTER TABLE` マイグレーションが実行される。
- **影響範囲**: 開発環境（HMR）のみ。本番ビルドでは毎回アプリ起動時に `initDb()` が実行されるため発生しない。
- **分類**: 開発環境固有の問題（本番影響なし）。新規マイグレーション追加時はdev再起動が必要という運用ルールで対応可能。

### 結果サマリー

- **観点1 正常系テスト**: 24件中 OK: 23件 / **NG: 1件**（#24 自動アーカイブの親子連動欠如）→ ✅ 修正済み
- **観点2 異常系・境界値テスト**: 13件 全OK
- **観点3 状態遷移・データ件数テスト**: 12件 全OK
- **合計**: 49件中 OK: 48件 / **NG: 1件** → ✅ 修正済み

## STEP B：品質レビュー（v1.3.0 枝番3-2）

### 観点1：エラーハンドリング確認

✅ OK: 6件 パス

| # | 異常条件 | 挙動 | エラーメッセージの有無と内容 | データへの影響 | OK/NG |
|---|---|---|---|---|---|
| 6 | 親子連動アーカイブ時にDBエラーが途中で発生した場合 | `handleArchive`（TaskList.js:198-237）で、子タスクのアーカイブ（L223-225のforループ）の途中で例外が発生した場合、catch（L233-236）に飛ぶ。一部の子タスクはアーカイブ済み、残りと親はアーカイブされない中途半端な状態になる。 | 「アーカイブに失敗しました」トースト表示。 | ✅ 修正済み — `handleArchive` を `BEGIN`/`COMMIT`/`ROLLBACK` トランザクションで囲み、all-or-nothing を保証。子アーカイブも単一 UPDATE 文に統一。 | OK |
| 7 | 親子連動復元時にDBエラーが途中で発生した場合 | `handleRestore`（TaskList.js:239-262）で、子タスクの一括復元（L247）は単一のUPDATE文（`WHERE parent_id = $1`）のため中途半端にはなりにくい。ただし子を復元（L247）した後に自身の復元（L255）が失敗した場合、子のみ復元されて親がアーカイブのままになる。 | 「復元に失敗しました」トースト表示。 | ✅ 修正済み — `handleRestore` を `BEGIN`/`COMMIT`/`ROLLBACK` トランザクションで囲み、all-or-nothing を保証。 | OK |

**NG詳細: #6 親子連動アーカイブの非トランザクション処理**

- **該当ファイル**: `components/TaskList.js:220-230`
- **問題の具体的な内容**: `handleArchive` 関数内で、親タスクの子を for ループで個別に `UPDATE tasks SET archived_at = ... WHERE id = $1` している（L223-225）。この処理がトランザクションで囲まれていないため、ループ途中で例外が発生すると一部の子のみアーカイブされた不整合状態が残る。
- **期待される挙動**: 親子連動アーカイブは all-or-nothing で実行されるべき。全子タスクと親タスクのアーカイブが一体として成功するか、全体がロールバックされるか、のいずれか。
- **原因の推定**: `handleArchive` 関数（L198-237）が複数の `db.execute` を逐次呼び出しているが、トランザクション（`BEGIN` / `COMMIT` / `ROLLBACK`）を使用していない。
- **修正方針案**: `handleArchive` の子アーカイブ + 親アーカイブの処理を `db.execute('BEGIN')` ... `db.execute('COMMIT')` で囲み、catch 時に `db.execute('ROLLBACK')` を発行する。

**NG詳細: #7 親子連動復元の非トランザクション処理**

- **該当ファイル**: `components/TaskList.js:244-256`
- **問題の具体的な内容**: `handleRestore` 関数内で、子一括復元（L247）→ 親復元（L252 または自身復元 L255）を逐次実行しているが、トランザクションで囲まれていない。子の復元が成功した後に自身の復元が失敗すると、子のみ復元された状態になる。
- **期待される挙動**: 復元処理も all-or-nothing で実行されるべき。
- **原因の推定**: `handleRestore` 関数（L239-262）も同様にトランザクションを使用していない。
- **修正方針案**: `handleArchive` と同様に、`handleRestore` の復元処理もトランザクションで囲む。

### 観点2：一貫性レビュー

✅ OK: 8件 パス

| # | 観点 | 箇所A | 箇所B | 不整合の内容 | ファイル名:行番号 |
|---|---|---|---|---|---|
| 4 | 同種操作でのUI挙動の不統一（アーカイブ済みビューでの子タスク操作） | 通常ビューの子タスク: ステータスselect・☀️ボタン・📦ボタン・＋ボタン・🗑ボタンが表示される | アーカイブ済みビューの子タスク: ステータスラベル（読み取り専用）と📤復元ボタンのみ表示。**ただし、子タスクの📤復元ボタンをクリックすると親も連動復元される（TaskList.js:251-253）が、この挙動はUI上で事前に告知されない。** | ✅ 修正済み — 復元トーストを親子連動時は「親タスクと子タスクをまとめて復元しました」「子タスクと親タスクを復元しました」に変更。連動復元の事実がユーザーに伝わるようにした。 | `components/TaskList.js` |
| 10 | 文言の揺れ（CSVエクスポートに archived_at が含まれない） | CSVエクスポートのヘッダー: `'id,title,status,importance,urgency,start_date,due_date,estimated_minutes,notes,created_at'`（settings/page.js:588） | DB上のタスクデータ: `archived_at` カラムが存在する | ✅ 修正済み — CSVエクスポートのSQLクエリに `WHERE t.archived_at IS NULL` を追加し、アーカイブ済みタスクを除外。説明文も「アクティブなタスクをCSVファイルとしてダウンロードします（アーカイブ済みは除外）」に更新。 | `app/settings/page.js` |

**NG詳細: #4 子タスク復元時の親連動復元が告知されない**

- **該当ファイル**: `components/TaskList.js:251-256`
- **問題の具体的な内容**: アーカイブ済みビューで子タスクの📤復元ボタンをクリックすると、子タスクだけでなく親タスクも連動して復元される（L251-253: `UPDATE tasks SET archived_at = NULL WHERE id = $1` で parent_id の先の親を復元）。しかし復元完了後のトーストは「復元しました」（L256）のみで、親タスクも復元されたことがユーザーに伝わらない。
- **期待される挙動**: 子タスク復元時のトーストを「子タスクと親タスクを復元しました」等に変更するか、復元前に「親タスクも一緒に復元されます。よろしいですか？」の確認を入れるべき。逆に親タスク復元時のトースト（L256）も「親タスクと子タスクを復元しました」等にすると一貫性が高まる。
- **原因の推定**: `handleRestore` 関数（L239-262）で、親子連動の条件分岐（L246-248: 親→子一括復元、L251-253: 子→親復元）はあるが、トーストメッセージが共通の「復元しました」（L256）のまま。
- **推奨**: 以下のいずれかに統一する。
  - (A) 連動復元時はトーストメッセージを変える（例: 「親タスクと子タスクをまとめて復元しました」）
  - (B) 子タスク復元時に confirm で事前確認する

**NG詳細: #10 CSVエクスポートがアーカイブ済みタスクを区別しない**

- **該当ファイル**: `app/settings/page.js:579-590`
- **問題の具体的な内容**: CSVエクスポートのSQLクエリ（L579-587）は `SELECT t.*, ... FROM tasks t LEFT JOIN ... ORDER BY t.id` であり、`archived_at IS NULL` のフィルタがない。そのためアーカイブ済みタスクもCSVに含まれる。さらにCSVヘッダー（L588）に `archived_at` 列が存在しないため、どのタスクがアーカイブ済みかCSVから判別できない。
- **期待される挙動**: 以下のいずれかの対応が望ましい。
  - (A) CSVエクスポートにアーカイブ済みタスクを含めない（`WHERE archived_at IS NULL` を追加）
  - (B) CSVヘッダーに `archived_at` 列を追加して、アーカイブ状態をエクスポートに含める
- **原因の推定**: アーカイブ機能追加時に、CSVエクスポート処理の更新が漏れた。
- **推奨**: (A) が最もシンプル。ユーザーがアーカイブ済みタスクもエクスポートしたい場合に備え、(B) の対応も検討に値する。

### 実機確認推奨項目

- ⚠️ 要実機確認：[タスク一覧画面]で[完了タスクをアーカイブし、親と子が分かれるケースを作る]→[アーカイブ済みビューで子タスクの📤ボタンをクリック]→[親タスクも一緒に復元され、通常ビューに戻ること]
- ⚠️ 要実機確認：[設定画面]で[データ管理タブ→CSVエクスポート→ダウンロード]→[CSVを開いてアーカイブ済みタスクが含まれていること（=現状の挙動）を確認]

### 結果サマリー

- **観点1 エラーハンドリング**: 8件中 OK: 6件 / **NG: 2件**（#6, #7）→ ✅ 全件修正済み
- **観点2 一貫性レビュー**: 10件中 OK: 8件 / **NG: 2件**（#4, #10）→ ✅ 全件修正済み
- **合計**: 18件中 OK: 14件 / **NG: 4件** → ✅ 全件修正済み

## STEP R：リグレッションテスト（v1.3.0 枝番3-2 2026-03-01）

### 第1段階：変更箇所の直接テスト

✅ OK: 15件 全件パス

### 第2段階：影響範囲の特定とテスト

✅ OK: 10件 全件パス

### 結果サマリー

- **第1段階 直接テスト**: 15件 全OK
- **第2段階 影響範囲テスト**: 10件 全OK
- **合計**: 25件 全OK / NG: 0件

---

## STEP A：機能検証（v1.3.0 枝番3-3）

> 対象: IMP-4 ソートON/OFF切替 + DnDによる手動並び替え
> 変更ファイル: `lib/db.js`, `components/TaskList.js`, `app/today/page.js`, `components/TaskInput.js`

### 観点1：正常系テスト

✅ OK: 27件 全件パス

### 観点2：異常系・境界値テスト

✅ OK: 10件 パス

| # | 対象フィールド/操作 | 入力内容 | 期待される挙動 | 実際の挙動 | OK/NG |
|---|---|---|---|---|---|
| 11 | 今日やるタスクDnD: リスト変更中のドラッグ（インデックスベースの競合） | 手動モードでドラッグ中に`yarukoto:taskAdded`イベントが発火しタスクリストが更新された場合 | ドラッグ開始時に保存したインデックスが更新後のリストと一致し、正しいタスクが移動されること | ✅ 修正済み。`today/page.js:401` `dragIdx.current = i` でインデックス（タスクIDではなく配列位置）を保存。`today/page.js:421` `const newTasks = [...tasks]` で現在のtasks stateを取得するが、ドラッグ中にtasksが更新された場合（例: FABからタスク追加→yarukoto:taskAddedイベント→loadTasks→setTasks）、保存したインデックスが更新後のリストの異なるタスクを指す。例: 元リスト[A,B,C]でBをドラッグ(idx=1)→新タスクX挿入で[X,A,B,C]→idx=1はAを指す→Bでなく**Aが移動される**。TaskList.jsの@dnd-kitはIDベースで安全 | ✅ 修正済み |

**NG#11 詳細:**
- **該当ファイル**: `app/today/page.js:400-438`
- **再現手順**: [今日やるタスク画面]で[手動モードをON]→[カードをドラッグ開始]→[ドラッグ中にFABから新タスク追加]→[ドロップで並び替え完了]→[意図したタスクと異なるタスクが移動される]
- **期待される挙動**: ドラッグしたタスクが移動されること
- **実際の挙動**: ドラッグ中にリストが更新されると、保存されたインデックスが別のタスクを指し、誤ったタスクが移動される
- **原因**: `dragIdx`（`useRef`）にタスクIDではなく配列インデックスを保存しているため。TaskList.jsの`@dnd-kit`ライブラリはIDベースで追跡するため同様の問題は発生しない。`onTodayDragStart`（L401）で`dragIdx.current = i`としているが、`dragIdx.current = tasks[i].id`に変更し、`onTodayDrop`でIDからインデックスを再計算すべき
- **発生確率**: 低（ドラッグ中に別操作でタスク追加する必要がある）

### 観点3：状態遷移・データ件数テスト

✅ OK: 10件 全件パス

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 9 | フィルター適用中の手動並び替え | フィルターでタスクを絞り込んだ状態で手動並び替え | 表示中のタスクのみ並び替えが適用され、非表示タスクのsort_orderは変更されないこと | ✅ 修正済み — `TaskList.js:335` `siblings = sortedParentTasks`はフィルター適用後のリスト。`persistSortOrder`は表示中のIDのみ更新。非表示タスクのsort_order値は不変。**ただし**、表示タスクのsort_orderが1,2,3...に再割当されるため、非表示タスクの既存sort_order値（例: 2, 4）と重複する可能性がある。フィルター解除後の表示順が意図しない順序になる場合がある（同値の場合DB側の返却順に依存） | ✅ 修正済み |

**NG#9 詳細:**
- **該当ファイル**: `components/TaskList.js:326-386`（handleReorder関数）、`components/TaskList.js:315-323`（persistSortOrder関数）
- **再現手順**: [タスク一覧画面]で[手動モードON]→[ステータスフィルターで「未着手」のみ表示（例: 表示3件、非表示2件）]→[表示中の3件を並び替え]→[フィルターを解除して全件表示]→[並び替え前と異なる意図しない順序になっている]
- **期待される挙動**: フィルター解除後、並び替えたタスクの相対順序は維持され、非表示だったタスクは元の位置関係を保つこと
- **実際の挙動**: `persistSortOrder`（L315-323）がフィルター後の表示タスクのみにsort_order = 1, 2, 3を割り当てるため、非表示タスクの既存sort_order値（例: 2, 4）と重複が発生する。SQLiteのORDER BYで同値の場合は不定順序となり、フィルター解除後に非表示だったタスクが予期しない位置に出現する
- **原因**: `persistSortOrder`が全タスク（非表示含む）のsort_orderを考慮せず、表示タスクのみに連番を振るため。対策として、非表示タスクのsort_order値を避けて値を割り当てるか、全タスクの相対順序を保持する方式への変更が必要
- **発生確率**: 中（手動モード + フィルター併用時に確実に発生）

### 結果サマリー

- **観点1 正常系**: 27件 全OK
- **観点2 異常系・境界値**: 11件 / OK: 10件 / NG: 1件
  - NG#11: 今日やるタスクDnDでインデックスベースの追跡による競合（`today/page.js:400-438`）
- **観点3 状態遷移・データ件数**: 11件 / OK: 10件 / NG: 1件
  - NG#9: フィルター適用中の手動並び替えでsort_order重複（`TaskList.js:315-386`）
- **合計**: 49件 / OK: 47件 / NG: 2件

## STEP B：品質レビュー（v1.3.0 枝番3-3）

### 観点1：エラーハンドリング確認

✅ OK: 3件 パス

| # | 異常条件 | 挙動 | エラーメッセージの有無と内容 | データへの影響 | OK/NG |
|---|---|---|---|---|---|
| 3 | ディスク書き込み権限なし等による `toggleSortMode` の保存エラー | 例外がcatchされ無視されるため、UIのソートモードは切り替わるがDBに保存されない | ✅ 修正済み — ⚠️ なし（エラー通知もUIのロールバックも行われない） | DBとUIの不一致 | ✅ 修正済み |
| 4 | ディスク書き込み権限なし等による DnD 時のDB保存（並び替え）エラー | 例外がcatchされ `fetchTasks` または `loadTasks` によりUIが元の順序にサイレントに巻き戻る | ✅ 修正済み — ⚠️ なし（以前からある `handleStatusChange` にはエラー通知Toastが存在するが、DnDには実装されていない） | 巻き戻るためデータ不整合は防げる | ✅ 修正済み |

**NG詳細: #3 `toggleSortMode` 失敗時のUI不整合とエラー通知漏れ**
- **該当ファイル名と行番号**: `components/TaskList.js:159-170`, `app/today/page.js:386-397`
- **問題の具体的な内容**: `toggleSortMode` 内で `setSortMode(newMode)` でUIを先行更新した後、`db.execute('INSERT OR REPLACE INTO app_settings...')` を実行しているが、失敗時の `catch (e) { console.error(e); }` ブロックでUIの変更を戻す処理やエラー通知がない。
- **期待される挙動と実際の挙動の差分**: 失敗した場合は、「設定の保存に失敗しました」等のToastメッセージを出し、`setSortMode` の状態を元の `sortMode` に戻す（ロールバックする）処理が必要。現状はToastが出ず、画面をリロードするまでUIとDBが食い違った状態になる。
- **原因の推定**: `toggleSortMode` メソッドへの Optimistic UI のロールバック処理および `dispatchEvent('yarukoto:toast')` の実装漏れ。

**NG詳細: #4 DnD操作のDB更新失敗時におけるエラー通知漏れ**
- **該当ファイル名と行番号**: `components/TaskList.js:322`, `385`, `409`, `494`, および `app/today/page.js:437`
- **問題の具体的な内容**: `persistSortOrder` 等の各DnDによる並び替え・アンネスト操作でDB更新が失敗した場合、`catch (e) { console.error(e); fetchTasks(); }` によって単にリストを再取得しUIをサイレントに巻き戻している。
- **期待される挙動と実際の挙動の差分**: `handleStatusChange` 等の既存メソッドが「ステータスの変更に失敗しました」とToastを出すのと同様に、DnD操作失敗時にも「並び替えの保存に失敗しました」等のToastメッセージを表示するべき。現状は無言でUIが元の位置に戻るため、ユーザーが状況を理解できない。
- **原因の推定**: 各種 `catch` ブロックへの `dispatchEvent('yarukoto:toast')` の記述漏れ。

### 観点2：一貫性レビュー

| # | 観点 | 箇所A | 箇所B | 不整合の内容 | ファイル名:行番号 |
|---|---|---|---|---|---|
| 1 | 色使い・CSS変数の不統一 | `components/TaskList.js:727` | `app/today/page.js:816` | ✅ 修正済み — 手動ソート中にタスクをドラッグして他のタスクに重ねた際（ネストや入れ替えのホバー時）の枠色指定が、TaskListでは `var(--color-primary)`、今日やるタスクでは `var(--color-accent)` とCSS変数が異なっているのを `--color-primary` に統一。 | `components/TaskList.js:727`, `app/today/page.js:816` |

**NG詳細: #1 色使い・CSS変数の不統一**
- **該当ファイル名と行番号**: `components/TaskList.js:727`, `app/today/page.js:816`
- **問題の具体的な内容**: `drag-over` クラスの `box-shadow` に対して、TaskList.js 側は `0 0 0 2px var(--color-primary)` を指定しているが、today/page.js 側は `0 0 0 2px var(--color-accent)` を指定している。
- **どちらに統一すべきかの推奨**: `--color-primary` はアプリ全体で標準利用されているアクセントカラー変数であるため、`app/today/page.js:816` の方も `--color-primary` に統一するべき。
- **原因の推定**: `today/page.js` 側へドラッグ＆ドロップ用スタイルを追加する際、変数名を誤って指定したまま実装されたものと推測される。

---

## STEP R：リグレッションテスト（v1.3.0 枝番3-3 2026-03-01）

### 第1段階：変更箇所の直接テスト

✅ OK: 5件 全件パス

### 第2段階：影響範囲の特定とテスト

✅ OK: 4件 全件パス

### 結果サマリー

- **第1段階 直接テスト**: 5件 全OK
- **第2段階 影響範囲テスト**: 4件 全OK
- **合計**: 9件 全OK / NG: 0件

## STEP R：リグレッションテスト（v1.3.0 枝番3-3 追加修正 2026-03-01）

> 対象変更: 「今日やるタスク」手動並び替え（DnD）が動作しない不具合の修正
> 変更ファイル: `src-tauri/tauri.conf.json`（dragDropEnabled: false 追加）、`app/today/page.js`（onTodayDragStart に setData 追加）

### 影響範囲の洗い出し

以下のファイル・関数を確認対象とした：

| ファイル | 確認した関数・箇所 | DnD方式 | 影響判定 |
|---|---|---|---|
| `app/today/page.js` | `onTodayDragStart` (L405-410), `onTodayDrop` (L422-449), `onTodayDragOver` (L416-420), フィルタ (L118-170), ソート (L251-305), `handleStatusChange` (L326-375), `handleRemove` (L377-384) | HTML5 DnD | 直接変更箇所 |
| `components/TaskList.js` | `DndContext` (L593), `@dnd-kit/core` import (L4) | @dnd-kit (Pointer Events) | 影響なし |
| `app/settings/page.js` | `useDragReorder` (L14-53), CSVインポート `<input type="file">` (L617) | HTML5 DnD（改善方向） | 影響なし |
| `app/tasks/page.js` | ファイル全体 grep 確認 | DnD関連コードなし（TaskList.jsに委譲） | 影響なし |
| `app/layout.js` | ファイル全体 grep 確認 | DnD関連コードなし | 影響なし |
| `src-tauri/tauri.conf.json` | `app.windows[0].dragDropEnabled` (L20) | — | 直接変更箇所 |

### 第1段階：変更箇所の直接テスト

| # | テスト区分 | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|---|
| 1 | 直接 | tauri.conf.json dragDropEnabled設定 | `src-tauri/tauri.conf.json` L20 のウィンドウ設定を確認 | `"dragDropEnabled": false` が正しく追加されている | L20に `"dragDropEnabled": false` が存在。JSON構文も正常、他の設定値に影響なし | OK |
| 2 | 直接 | onTodayDragStart setData追加 | `app/today/page.js` L408 を確認 | `e.dataTransfer.setData('text/plain', '')` が追加されている | L408に `e.dataTransfer.setData('text/plain', '')` が正しく追加。引数は `'text/plain'` と空文字列 | OK |
| 3 | 直接 | onTodayDragStart 全体動作 | L405-410 のドラッグ開始ハンドラの処理フローを確認 | ID保存→effectAllowed設定→setData→opacity変更の順で実行 | L406: `dragIdx.current = tasks[i]?.id`（IDベース追跡）→ L407: `effectAllowed = 'move'` → L408: `setData('text/plain', '')` → L409: `opacity: '0.4'`。正常な順序 | OK |
| 4 | 直接 | onTodayDrop のID→インデックス解決 | L422-449 のdropハンドラがIDベースでインデックスを解決するか確認 | dragIdx.currentに保存されたIDからfindIndexで現在のインデックスを取得 | L425: `const fromId = dragIdx.current` → L426: `const from = tasks.findIndex(t => t.id === fromId)` → L427: `if (from === -1 \|\| from === i) return`。IDベースで正しく解決 | OK |
| 5 | 直接 | 自動モード時DnD無効 | sortMode='auto' 時にDnD属性・ハンドラが無効化されるか確認 | `draggable={false}`、全DnDイベントハンドラが`undefined` | L593: `draggable={isManual}`（autoなら false）、L594-598: 各ハンドラが `isManual ? handler : undefined`。自動モード時は完全無効 | OK |
| 6 | 直接 | DnD後のDB永続化 | L432-448 の sort_order 保存処理を確認 | ルーティンは routines.today_sort_order、タスクは tasks.today_sort_order を更新。エラー時はトースト表示+リロード | L436-443: forループで全タスクを走査。L438-439: ルーティン→`UPDATE routines SET today_sort_order`。L440-441: タスク→`UPDATE tasks SET today_sort_order`。L444-448: catch内でトースト+loadTasks。正常 | OK |

### 第2段階：影響範囲の特定とテスト

| # | テスト区分 | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|---|
| 7 | 影響範囲 | TaskList.js @dnd-kit DnD | @dnd-kit の DnD が Tauri `dragDropEnabled` 設定変更の影響を受けないか確認 | @dnd-kit は PointerSensor（Pointer Events）ベースのため、HTML5 DnD 設定に非依存 | L4: `import { DndContext, ... PointerSensor } from '@dnd-kit/core'`。HTML5 DnD イベントを使用しない。影響なし | OK |
| 8 | 影響範囲 | 設定画面 useDragReorder | `useDragReorder`（L14-53）のHTML5 DnDが影響を受けないか確認 | `dragDropEnabled: false` はTauriネイティブハンドラ無効化のため、HTML5 DnDには改善方向の影響 | L14-53: `useDragReorder` のロジック自体は変更なし。`dragDropEnabled: false` により drop イベント横取りが解消され、正常動作が期待される。既存の `onDragStart` に `setData()` 未呼出の点は今回の変更と無関係の既存状態 | OK |
| 9 | 影響範囲 | 今日やるタスク フィルタ・ソート | DnD以外のフィルタ（L118-170）・ソート（L251-305）ロジックが影響を受けないか確認 | DnDハンドラ（L405-449）と独立しており影響なし | フィルタ条件構築（L118-170）、ソートロジック（L251-305）はDnDハンドラを参照していない。完全に独立。影響なし | OK |
| 10 | 影響範囲 | 今日やるタスク ステータス変更・削除 | handleStatusChange（L326-375）、handleRemove（L377-384）が影響を受けないか確認 | DnD変更と独立した関数であり影響なし | 両関数ともDnD関連の変数・関数を参照していない。影響なし | OK |
| 11 | 影響範囲 | CSV インポート/エクスポート | ファイル操作が `dragDropEnabled` 設定変更の影響を受けないか確認 | CSVインポートは `<input type="file">` ダイアログ方式、エクスポートは Blob ダウンロードのため非依存 | settings/page.js L617: `<input type="file" accept=".csv" hidden>` でファイル選択ダイアログ方式。OSファイルドロップに依存しない。影響なし | OK |

### 実機確認推奨項目

- ⚠️ 要実機確認：[今日やるタスク画面]で[手動モードをONにしてタスクカードをドラッグ&ドロップ]→[タスクの並び順が変更され、画面リロード後も順序が保持されていること]
- ⚠️ 要実機確認：[設定画面]で[ステータスタブまたはタグタブの項目をドラッグ&ドロップで並び替え]→[並び替えが正常に動作すること]（`dragDropEnabled: false` による改善確認）

### 結果サマリー

- **第1段階 直接テスト**: 6件 全OK
- **第2段階 影響範囲テスト**: 5件 全OK
- **合計**: 11件 全OK / NG: 0件

