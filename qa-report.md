# QA Report

## STEP A：機能検証（v1.3.0 枝番3-1）

### 観点1：正常系テスト

| # | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 1 | ステータス一覧の表示 | 設定画面のステータスタブを開く | システム必須項目を含めステータス一覧が表示され、上下移動ボタン（▲▼）も表示されること | 期待通り | OK |
| 2 | DnDによる並び替え | ステータスをドラッグ＆ドロップする | ドロップ位置に要素が移動し、リストの並び順が更新されること | 期待通り | OK |
| 3 | 上下ボタンによる並び替え | 各ステータスの▲または▼ボタンをクリックする | 意図した通りに1つ上または1つ下に要素が移動すること | 期待通り | OK |
| 4 | 並び順の保存 | 並び順変更後に「並び順を保存」ボタンをクリックする | 変更された並び順がDBの `sort_order` に正しく更新されること | 期待通り | OK |

### 観点2：異常系・境界値テスト

| # | 対象フィールド/操作 | 入力内容 | 期待される挙動 | 実際の挙動 | OK/NG |
|---|---|---|---|---|---|
| 1 | 上下移動の境界値チェック | 先頭項目の▲ボタン、末尾項目の▼ボタンの確認 | 境界外へ移動する操作が防止され、対応する移動ボタンが無効化（disabled）されていること | 期待通り | OK |
| 2 | 移動ボタンの高速連続実行 | 同じ要素の▲または▼ボタンを連打 | インデックスの境界を越えようとした場合は `moveStatus` 内の判定により無視され、クラッシュしないこと | 期待通り | OK |
| 3 | 新規ステータスの追加（空文字） | ステータス名に空文字や空白のみを入力 | 「追加」ボタンが非活性となりクリックできないこと | 期待通り | OK |
| 4 | 新規ステータスの追加（特殊文字等） | `' " < > & \ / ; --` 等の記号、または超長文字列を入力 | DB制約等によるエラーが起きず保存可能なこと。⚠️ 要実機確認：[設定画面]で[超長文字列のステータスを入力]→[リスト表示時にレイアウトが崩れないこと] | 期待通り。プレースホルダ利用でSQL実行は安全。 | OK |

### 観点3：状態遷移・データ件数テスト

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 1 | 基本ステータスの制御確認 | 操作対象がシステム必須ステータス（コード1〜5） | 名前の編集・削除操作はできず（readOnly）、並べ替えのみ可能なこと | 期待通り | OK |
| 2 | 未保存の連続操作 | ステータス追加直後に、そのまま並び替えを行い保存 | 新規追加された項目を含めて正しく状態が管理され、DBに順序を含めて保存されること | 期待通り | OK |
| 3 | 二重送信の抑止 | 「並び順を保存」をダブルクリックなど連続クリック | 処理中は `saving` フラグによりボタンが非活性になり、重複して保存処理が走らないこと | 期待通り | OK |

## STEP B：品質レビュー（v1.3.0 枝番3-1）

### 観点1：エラーハンドリング確認

| # | 異常条件 | 挙動 | エラーメッセージの有無と内容 | データへの影響 | OK/NG |
|---|---|---|---|---|---|
| 1 | DBファイルが存在しない・破損している・ディスク書き込み権限がない場合 | 保存時に `saveMaster` 内の `db.execute` が例外をスローし、`catch` ブロックで処理される。アプリはクラッシュせず稼働を継続する。 | 画面下部に「❌ 保存に失敗しました」とトーストが表示される。 | DBへの変更は反映されず、既存データは保護される。 | OK |
| 2 | 想定外のデータ・不正な状態 | `moveStatus` 実行時に配列境界外（マイナスや配列長超過）への移動操作が行われても関数冒頭の判定でガードされ無視されるためクラッシュしない。保存時も配列のインデックス番号を `sort_order` として安全に更新するため整合性が保たれる。 | なし | データの損失や破損は発生しない。 | OK |

### 観点2：一貫性レビュー

| # | 観点 | 箇所A | 箇所B | 不整合の内容 | ファイル名:行番号 |
|---|---|---|---|---|---|
| 1 | UI挙動の不統一（並び替え操作） | `tab === 'status'` のリスト描画（ `row` 関数内の `▲▼` ボタン表示 ） | `tab === 'tags'` のリスト描画 | ✅ 修正済み — `moveTag` 関数を追加し、タグ一覧にも▲▼ボタンを実装。ステータスと同じ操作体系に統一。 | app/settings/page.js |
| 2 | エラー処理の記述（ログ出力） | `addStatus` などの他の更新系関数での例外キャッチ<br>(`catch (e) { console.error(e); flash(...) }`) | `saveMaster` および `saveTags` の例外キャッチ<br>(`catch { flash(...) }`) | ✅ 修正済み — `saveMaster` と `saveTags` の catch ブロックに `(e)` と `console.error(e)` を追加。全関数で統一。 | app/settings/page.js |

## STEP R：リグレッションテスト（v1.3.0 枝番3-1 2026-02-28）

### 変更サマリー

- **変更内容**: QA指摘2件修正（タグ一覧に▲▼ボタン追加 + saveMaster/saveTagsにconsole.error追加）
- **変更ファイル**: `app/settings/page.js`（moveTag関数追加、タグ行に▲▼ボタン追加、saveMaster/saveTagsのcatchブロックにconsole.error(e)追加）

### 影響範囲の洗い出し

以下のファイル・関数を確認対象とした：

| ファイル | 確認した関数/箇所 | 変更との関連 |
|---|---|---|
| `app/settings/page.js` L288-298 | `moveTag(index, direction)` — 新規追加 | 直接変更 |
| `app/settings/page.js` L395-398 | タグ行の▲▼ボタンJSX — 新規追加 | 直接変更 |
| `app/settings/page.js` L118-135 | `saveMaster()` — catch に console.error(e) 追加 | 直接変更 |
| `app/settings/page.js` L137-161 | `saveTags()` — catch に console.error(e) 追加 | 直接変更 |
| `app/settings/page.js` L98-108 | `activeTags`, `setActiveTags`, `dragTags` — DnDとmoveTagの共存 | moveTagと同じ state を操作 |
| `hooks/useMasterData.js` L21 | `SELECT * FROM tags ORDER BY sort_order, id` | sort_order変更後の取得順に影響 |
| `app/today/page.js` L74 | `SELECT * FROM tags ORDER BY sort_order, id` | sort_order変更後の取得順に影響 |
| `components/TagSelect.js` L21-23 | `filtered = allTags.filter(...)` — allTagsの順序を保持 | タグ表示順に影響 |
| `components/TaskList.js` L43 | `tagOptions = allTags.filter(...).map(...)` — allTags順を保持 | タグフィルタ表示順に影響 |
| `components/TaskInput.js` L217-220 | `<TagSelect allTags={allTags}>` — useMasterData順を保持 | タグ選択表示順に影響 |
| `app/today/page.js` L71 | `SELECT * FROM status_master ORDER BY sort_order, code` | saveMasterの変更がstatus sort_orderに影響する可能性 |
| `components/TaskList.js` L300-302 | ステータス順ソート `allStatuses.find(...)?.sort_order` | saveMasterの変更がstatus sort_orderに影響する可能性 |

### 第1段階：変更箇所の直接テスト

| # | テスト区分 | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|---|
| 1 | 直接 | moveTag 境界チェック（上限） | 先頭アイテム（index=0）で moveTag(0, -1) が呼ばれた場合 | newIndex=-1 で return され、状態変更なし | L291 `newIndex < 0` で return。正常にガード | OK |
| 2 | 直接 | moveTag 境界チェック（下限） | 末尾アイテムで moveTag(lastIndex, 1) が呼ばれた場合 | newIndex >= activeTags.length で return | L291 `newIndex >= activeTags.length` で return。正常にガード | OK |
| 3 | 直接 | moveTag 正常スワップ | 中間アイテムの▲▼操作 | active配列内で隣接要素がスワップされ、archived配列は末尾固定のまま維持 | L293-296 active/archived分離→スワップ→[...active, ...archived]結合。正常動作 | OK |
| 4 | 直接 | タグ▲ボタン disabled制御 | 先頭アイテム（i=0）の▲ボタン表示 | disabled={true} でクリック不可 | L396 `disabled={i === 0}` — i=0のとき true | OK |
| 5 | 直接 | タグ▼ボタン disabled制御 | 末尾アイテムの▼ボタン表示 | disabled={true} でクリック不可 | L397 `disabled={i === activeTags.length - 1}` — 末尾で true | OK |
| 6 | 直接 | タグ▲▼ CSS共用 | .s-move-btns / .s-move-btn のスタイル適用 | ステータスと同じCSSクラスが使われ、同じ見た目になること | L683-699 で共用CSS定義。タグ・ステータス両方が同じクラス名を使用 | OK |
| 7 | 直接 | saveTags sort_order保存 | moveTagで並べ替え後にsaveTags実行 | active[i]のsort_orderがindex値(0,1,2...)で保存され、archived分はactive.length以降の連番 | L144-157 active→sort_order=i、archived→sort_order=active.length+i でUPDATE | OK |
| 8 | 直接 | saveMaster console.error | saveMaster実行中にDB例外が発生した場合 | console.error(e)でエラーが出力されること | L133 `catch (e) { console.error(e); flash('err', ...); }` | OK |
| 9 | 直接 | saveTags console.error | saveTags実行中にDB例外が発生した場合 | console.error(e)でエラーが出力されること | L159 `catch (e) { console.error(e); flash('err', ...); }` | OK |

### 第2段階：影響範囲のテスト

| # | テスト区分 | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|---|
| 10 | 影響範囲 | useMasterData タグ取得順 | アプリ各画面でタグをフェッチ | sort_order昇順でタグが取得されること | hooks/useMasterData.js L21 `ORDER BY sort_order, id` — sort_order変更後も正しく反映 | OK |
| 11 | 影響範囲 | today/page.js タグ取得順 | 今日やるタスク画面を表示 | sort_order昇順でタグが取得されること | app/today/page.js L74 `ORDER BY sort_order, id` — sort_order変更後も正しく反映 | OK |
| 12 | 影響範囲 | TagSelect タグ表示順 | タスク入力/編集でTagSelectドロップダウンを開く | allTagsの順序（=sort_order順）で表示されること | components/TagSelect.js L21-23 `allTags.filter(!archived)` — 入力順（sort_order順）を保持 | OK |
| 13 | 影響範囲 | TaskList タグフィルタ | タスク一覧のタグフィルタドロップダウンを開く | sort_order順でタグ選択肢が表示されること | components/TaskList.js L43 `allTags.filter(!archived).map(...)` — useMasterData順を保持 | OK |
| 14 | 影響範囲 | TaskInput タグ選択 | タスク追加フォームでタグ選択ドロップダウンを開く | sort_order順でタグが表示されること | components/TaskInput.js L217-220 `<TagSelect allTags={allTags}>` — useMasterData順を保持 | OK |
| 15 | 影響範囲 | ステータスタブ saveMaster | ステータスの並び順を変更して保存 | console.error追加以外に動作変更がないこと（ロジック不変） | app/settings/page.js L118-135 — ループ内のUPDATE SQL・flash呼び出し等すべて変更なし。catchにconsole.error追加のみ | OK |
| 16 | 影響範囲 | タグDnD moveTagとの共存 | DnDとmoveTag(▲▼)の両方でタグを並べ替え | 両方の操作が競合なく正常動作すること | L100-107 `setActiveTags`（DnD用）と L288-298 `moveTag` は同一パターン（active/archived分離→スワップ→結合）で state を更新。両者のデータ構造は一貫 | OK |
| 17 | 影響範囲 | ステータスsort_order 今日やるタスク | 今日やるタスク画面でステータス順ソートを選択 | sort_orderに基づき正しくソートされること | app/today/page.js L71 `ORDER BY sort_order, code`、L260-262 `statuses.find(...).sort_order` で参照。saveMasterのロジック変更なしのため影響なし | OK |
| 18 | 影響範囲 | ステータスsort_order タスク一覧 | タスク一覧でステータス順ソートを選択 | sort_orderに基づき正しくソートされること | components/TaskList.js L300-302 `allStatuses.find(...).sort_order` で参照。saveMasterのロジック変更なしのため影響なし | OK |

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

| # | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 1 | DBマイグレーション: archived_at カラム追加 | アプリ起動時に `initDb()` が実行される | `tasks` テーブルに `archived_at TEXT` カラムが追加され、インデックス `idx_tasks_archived_at` が作成されること | `lib/db.js` L194 で `ALTER TABLE tasks ADD COLUMN archived_at TEXT` を try/catch で実行（既存時は無視）。L198 で `CREATE INDEX IF NOT EXISTS idx_tasks_archived_at` を実行。正常動作。 | OK |
| 2 | DBマイグレーション: auto_archive_days シード | アプリ起動時に `initDb()` が実行される | `app_settings` に `auto_archive_days = '0'` が INSERT OR IGNORE されること | `lib/db.js` L201 で `INSERT OR IGNORE INTO app_settings (key, value) VALUES ($1, $2)` を `['auto_archive_days', '0']` で実行。既存行があれば無視される。正常動作。 | OK |
| 3 | 手動アーカイブ: 完了タスクのアーカイブ | タスク一覧で完了(status_code=3)タスクの📦ボタンをクリック | `archived_at` に現在日時がセットされ、タスクが通常ビューから消えること | `TaskList.js` L206 で `status_code !== 3 && !== 5` をバリデーション。L230 で `UPDATE tasks SET archived_at = datetime('now', 'localtime')` を実行。L232 で `setRefreshKey` により再フェッチ。正常動作。 | OK |
| 4 | 手動アーカイブ: キャンセルタスクのアーカイブ | タスク一覧でキャンセル(status_code=5)タスクの📦ボタンをクリック | 完了タスクと同様にアーカイブされること | L206 の条件で `status_code === 5` もパス。L230 の UPDATE が実行される。正常動作。 | OK |
| 5 | 手動アーカイブ: 📦ボタンの表示条件 | 未着手・着手中タスクを表示 | 📦ボタンが表示されないこと | `TaskList.js` L765: `{(task.status_code === 3 \|\| task.status_code === 5) && onArchive && (...)}` により、status_code が 3 または 5 以外ではボタンが描画されない。正常動作。 | OK |
| 6 | 親子連動アーカイブ: 親タスクのアーカイブ | 完了した親タスク（子もすべて完了/キャンセル）の📦ボタンをクリック | 親と子がすべてアーカイブされること | `TaskList.js` L212-227: 親タスク（`!task.parent_id`）の場合、L213 で `SELECT id, status_code FROM tasks WHERE parent_id = $1` で子を取得、L214 で未完了チェック、L220-226 で子を個別にアーカイブ、L230 で親をアーカイブ。正常動作。 | OK |
| 7 | 親子連動アーカイブ: 未完了の子がある場合の阻止 | 完了した親タスク（子に未完了タスクあり）の📦ボタンをクリック | エラートーストが表示され、アーカイブされないこと | `TaskList.js` L214-218: `children.some(c => c.status_code !== 3 && c.status_code !== 5)` が true の場合、エラートースト「未完了の子タスクがあるためアーカイブできません」を dispatch して return。正常動作。 | OK |
| 8 | 子タスク単体のアーカイブ | 完了した子タスクの📦ボタンをクリック | 子タスクのみがアーカイブされ、親はアーカイブされないこと | `TaskList.js` L212: `if (!task.parent_id)` の条件に入らず（子タスクは parent_id あり）、L230 で子タスクのみアーカイブ。親タスクには影響なし。正常動作。 | OK |
| 9 | アーカイブ済みタブの表示 | タスク一覧の「📦 アーカイブ済み」タブをクリック | アーカイブ済みタスクのみが表示されること | `TaskList.js` L85-89: `showArchived` が true の場合 `t.archived_at IS NOT NULL`、false の場合 `t.archived_at IS NULL` の WHERE 条件が追加。L404 のタブクリックで `setShowArchived(true)` が実行。正常動作。 | OK |
| 10 | アーカイブ済みタスクの復元: 親タスクの復元 | アーカイブ済みビューで親タスクの📤ボタンをクリック | 親と子がすべて復元されること | `TaskList.js` L246-248: 親タスク（`!task.parent_id`）の場合、`UPDATE tasks SET archived_at = NULL WHERE parent_id = $1` で子を一括復元。L255 で自身を復元。正常動作。 | OK |
| 11 | アーカイブ済みタスクの復元: 子タスクの復元 | アーカイブ済みビューで子タスクの📤ボタンをクリック | 子タスクと親タスクが復元されること | `TaskList.js` L251-253: 子タスク（`task.parent_id` あり）の場合、`UPDATE tasks SET archived_at = NULL WHERE id = $1` で親も復元。L255 で自身を復元。正常動作。 | OK |
| 12 | 今日やるタスクからのアーカイブ除外 | アーカイブ済みタスクがある状態で今日やるタスク画面を表示 | アーカイブ済みタスクが表示されないこと | `app/today/page.js` L218: `WHERE t.archived_at IS NULL` がクエリに含まれている。正常動作。 | OK |
| 13 | ダッシュボードからのアーカイブ除外 | アーカイブ済みタスクがある状態でダッシュボードを表示 | 統計にアーカイブ済みタスクが含まれないこと | `app/dashboard/page.js` 全6クエリに `AND archived_at IS NULL` が含まれている：L17（全体完了率）、L21（今日の進捗）、L57（直近3営業日）、L83（7日間完了数）、L109（ステータス分布）、L118（期限切れ）。正常動作。 | OK |
| 14 | タスク入力: 親タスク候補からのアーカイブ除外 | タスク追加フォームを展開し、親タスクドロップダウンを確認 | アーカイブ済みタスクが候補に含まれないこと | `TaskInput.js` L37: `AND archived_at IS NULL` がクエリに含まれている。正常動作。 | OK |
| 15 | タスク編集: 親タスク候補からのアーカイブ除外 | タスク編集モーダルの親タスクドロップダウンを確認 | アーカイブ済みタスクが候補に含まれないこと | `TaskEditModal.js` L42-45: 両分岐のクエリに `archived_at IS NULL` が含まれている。正常動作。 | OK |
| 16 | 自動アーカイブ: 起動時の実行 | アプリ起動時に `initDb()` が完了する | `runAutoArchive(db)` が実行されること | `lib/db.js` L204: `await runAutoArchive(db);` が initDb 内で呼ばれる。正常動作。 | OK |
| 17 | 自動アーカイブ: 無効時（0日設定）の動作 | auto_archive_days = 0 の状態で runAutoArchive が実行される | 何もアーカイブされずに return すること | `lib/db.js` L220: `if (days <= 0) return;` で早期リターン。正常動作。 | OK |
| 18 | 自動アーカイブ: 有効時の動作 | auto_archive_days = 14 の状態で、14日以上前に完了したタスクがある | 該当タスクがアーカイブされること | `lib/db.js` L222-229: `WHERE archived_at IS NULL AND status_code = 3 AND completed_at IS NOT NULL AND date(completed_at) <= date('now', 'localtime', '-' \|\| $1 \|\| ' days')` で条件合致タスクを UPDATE。正常動作。 | OK |
| 19 | 自動アーカイブ: キャンセルタスクの除外 | auto_archive_days > 0 で、キャンセル済みタスクがある | キャンセルタスクは自動アーカイブされないこと | `lib/db.js` L226: `AND status_code = 3` によりキャンセル（status_code=5）は対象外。さらに L227: `AND completed_at IS NOT NULL` によりキャンセルタスクは completed_at が NULL のため除外。正常動作。 | OK |
| 20 | 設定画面: 自動アーカイブ日数の表示 | 設定画面のオプションタブを開く | 「完了タスクの自動アーカイブ」カードが表示され、数値入力欄と「日後」ラベルがあること | `app/settings/page.js` L511-556: opt-card 内に 📦 アイコン、タイトル「完了タスクの自動アーカイブ」、説明文、数値 input (min=0, max=9999)、「日後」ラベルを描画。正常動作。 | OK ⚠️ 要実機確認：[設定画面]で[オプションタブを開く]→[「完了タスクの自動アーカイブ」カードに数値入力欄と「日後」が表示されていること] |
| 21 | 設定画面: 自動アーカイブ日数の保存 | 数値を入力してフォーカスを外す（onBlur） | DBに値が保存され、0より大きい場合は runAutoArchive が即時実行されること | `app/settings/page.js` L531-551: onBlur で `parseInt` → DB保存 → `parseInt(val) > 0` なら `runAutoArchive(db)` を実行。正常動作。 | OK |
| 22 | アーカイブ済みビューのUI制御 | アーカイブ済みタブでタスクカードを確認 | ステータスラベル（読み取り専用）と📤復元ボタンのみ表示。ステータスselect・☀️ボタン・📦ボタン・＋ボタン・🗑ボタンは非表示。DnD無効。 | `TaskList.js` L747-751: `isArchived` 時は `tc-status-label` と `tc-restore-btn` のみ描画。L453: `isDraggable={!showArchived && ...}`。L785: `isDraggable={!isArchived}`。正常動作。 | OK |
| 23 | アーカイブ日時の表示 | アーカイブ済みタスクのメタ情報を確認 | 📦 アーカイブ日が表示されること | `TaskList.js` L728: `{task.archived_at && <span className="tc-meta-item">📦 アーカイブ: {task.archived_at.split(' ')[0]}</span>}` で archived_at の日付部分を表示。正常動作。 | OK |
| 24 | 自動アーカイブ: 親子連動なし（バグ） | auto_archive_days = 14、親タスク完了日30日前、子タスク完了日5日前 | 仕様上は親アーカイブ時に子もまとめてアーカイブされるべき | `lib/db.js` L222-229: `runAutoArchive` は個別タスクの `completed_at` のみを評価し、`parent_id` を考慮しない。親が自動アーカイブされても子はアーカイブされない。子の `completed_at` が閾値を超えるまで親子が分離した状態になる。 | ✅ 修正済み |

**NG詳細: #24 自動アーカイブの親子連動欠如**

- **該当ファイル**: `lib/db.js:222-230`
- **再現手順**: (1) 親タスクAを完了する（completed_at = 30日前相当）。(2) 子タスクBを完了する（completed_at = 5日前相当）。(3) 設定画面で自動アーカイブを14日に設定する。(4) runAutoArchive が実行される。
- **期待される挙動**: IMP-2 仕様「親アーカイブ時は子もまとめてアーカイブ」に基づき、親タスクAがアーカイブされる際、子タスクBも連動してアーカイブされるべき。
- **実際の挙動**: `runAutoArchive` の SQL は `WHERE archived_at IS NULL AND status_code = 3 AND completed_at IS NOT NULL AND date(completed_at) <= date(...)` で個別タスクのみを対象とする。親タスクAはアーカイブされるが、子タスクBは `completed_at` が閾値未満のためアーカイブされない。結果として、親が「📦 アーカイブ済み」タブに、子が「📋 タスク」タブに分離して表示される。
- **原因の推定**: `runAutoArchive()` 関数（lib/db.js L216-234）は単一の UPDATE 文で全対象タスクを一括処理しており、親子関係（`parent_id`）を参照するロジックが存在しない。手動アーカイブ（`TaskList.js` L198-237 の `handleArchive`）では親子連動ロジックがあるが、自動アーカイブには未実装。
- **修正方針案**: `runAutoArchive` 内で、自動アーカイブ対象となった親タスクの子タスクも合わせてアーカイブする追加 UPDATE 文を発行する（例: `UPDATE tasks SET archived_at = ... WHERE parent_id IN (SELECT id FROM tasks WHERE archived_at IS NOT NULL AND parent_id IS NULL)` のような連動処理）。

### 観点2：異常系・境界値テスト

| # | 対象フィールド/操作 | 入力内容 | 期待される挙動 | 実際の挙動 | OK/NG |
|---|---|---|---|---|---|
| 1 | 自動アーカイブ日数: 空文字 | 数値欄を空にしてフォーカスを外す | 0として扱われ、自動アーカイブ無効になること | `settings/page.js` L532: `parseInt(appSettings.auto_archive_days) \|\| 0` → `parseInt('') = NaN` → `NaN \|\| 0 = 0`。`val = '0'`。`lib/db.js` L220: `days <= 0` で return。正常動作。 | OK |
| 2 | 自動アーカイブ日数: 文字列入力 | "abc" を入力してフォーカスを外す | 0として扱われ、自動アーカイブ無効になること | `settings/page.js` L532: `parseInt('abc') = NaN` → `NaN \|\| 0 = 0`。正常動作。 | OK |
| 3 | 自動アーカイブ日数: 負の値 | -5 を入力してフォーカスを外す | 0として扱われ、自動アーカイブ無効になること | `parseInt('-5') = -5` → `String(-5 \|\| 0)` → `-5` は truthy なので `String(-5)` = `'-5'`。DB に `'-5'` が保存される。`lib/db.js` L219: `parseInt('-5') = -5` → L220: `days <= 0` で return。自動アーカイブは実行されないが、DB には不正値 `-5` が残る。UI の input は `min="0"` だがブラウザの制約はキーボード入力では回避可能。**実害なし**だが DB 値が不正。 | OK（実害なし） |
| 4 | 自動アーカイブ日数: 超大値 | 9999 を入力してフォーカスを外す | 値が保存され、実質無効と同等に動作すること | `parseInt('9999') = 9999`。DB に保存。SQL `date('now', 'localtime', '-9999 days')` は約27年前の日付を算出。該当タスクはほぼ存在しないため実質無効。正常動作。 | OK |
| 5 | 自動アーカイブ日数: 小数入力 | 3.5 を入力してフォーカスを外す | 整数に丸められて保存されること | `parseInt('3.5') = 3`。`val = '3'`。DB に `'3'` が保存される。正常動作。 | OK |
| 6 | アーカイブ: 未完了タスクのアーカイブ試行 | status_code が 1（未着手）のタスクで handleArchive を直接呼び出す | エラートーストが表示されアーカイブされないこと | `TaskList.js` L206-209: `task.status_code !== 3 && task.status_code !== 5` の場合、トースト「完了またはキャンセル済みのタスクのみアーカイブできます」を dispatch して return。正常動作。UI 上では📦ボタン自体が非表示なので通常到達しない。 | OK |
| 7 | アーカイブ: 存在しないタスクIDでアーカイブ | tasks 配列にないIDで handleArchive を呼び出す | 何もせずに return すること | `TaskList.js` L202-203: `tasks.find(t => t.id === taskId)` が undefined → `if (!task) return;`。正常動作。 | OK |
| 8 | 復元: 存在しないタスクIDで復元 | tasks 配列にないIDで handleRestore を呼び出す | DB UPDATE は実行されるが該当行なし。エラーにならないこと | `TaskList.js` L245: `tasks.find(t => t.id === taskId)` が undefined → task が null → L246 の条件不成立 → L255 の UPDATE は `WHERE id = $1` で該当行なし → `rowsAffected = 0` だがエラーにはならない。正常動作。 | OK |
| 9 | アーカイブ: DB エラー時の挙動 | DB execute が例外をスローした場合 | エラートーストが表示され、アプリがクラッシュしないこと | `TaskList.js` L233-236: catch ブロックで `console.error(e)` + トースト「アーカイブに失敗しました」。正常動作。 | OK |
| 10 | 復元: DB エラー時の挙動 | DB execute が例外をスローした場合 | エラートーストが表示され、アプリがクラッシュしないこと | `TaskList.js` L258-261: catch ブロックで `console.error(e)` + トースト「復元に失敗しました」。正常動作。 | OK |
| 11 | 自動アーカイブ日数保存: DB エラー時の挙動 | DB execute が例外をスローした場合 | エラートーストが表示され、アプリがクラッシュしないこと | `settings/page.js` L548-550: catch ブロックで `console.error(e)` + `flash('err', '設定の保存に失敗しました')`。正常動作。 | OK |
| 12 | 自動アーカイブ: runAutoArchive の DB エラー時 | DB execute が例外をスローした場合 | コンソールエラーが出力され、アプリがクラッシュしないこと | `lib/db.js` L231-233: catch ブロックで `console.error('Auto-archive error:', e);`。initDb 本体のエラーハンドリング (L206-208) にも catch あり。正常動作。 | OK |
| 13 | アーカイブ📦ボタン: 高速連続クリック | 完了タスクの📦ボタンを素早く連打 | 2回目以降はタスクが既に tasks 配列から消えているため `task = undefined` で return | `TaskList.js` L202-203: 1回目のクリックで `setRefreshKey` → 再フェッチ → タスクが通常ビューから消える。2回目のクリック時に `tasks.find` が undefined → `if (!task) return;`。ただし、再フェッチ前に2回目が実行された場合は `tasks` state にまだ存在する可能性あり → 同じ UPDATE が2回実行されるが archived_at が上書きされるだけで実害なし。 | OK |

### 観点3：状態遷移・データ件数テスト

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 1 | タスク0件でアーカイブタブ表示 | アーカイブ済みタブをクリック | 「📦 アーカイブ済みのタスクはありません」と表示されること | `TaskList.js` L435-440: `!loading && parentTasks.length === 0 && showArchived` の場合に空メッセージ（📦アイコン + 「アーカイブ済みのタスクはありません」+ ヒント文言）を表示。正常動作。 | OK |
| 2 | タスク0件で通常タブ表示 | 通常タブ（📋 タスク）を表示 | 「最初のタスクを追加して、今日をスタートしましょう！」と表示されること | `TaskList.js` L428-434: `!loading && parentTasks.length === 0 && !showArchived` の場合に空メッセージを表示。正常動作。 | OK |
| 3 | 1件のみのタスクをアーカイブ | 完了タスク1件のみの状態で📦ボタンをクリック | 通常ビューが空になり、アーカイブビューに1件表示されること | L230 で UPDATE → L232 で refreshKey 更新 → 通常ビュー再フェッチ（0件）→ 空メッセージ表示。アーカイブタブに切替 → `showArchived=true` → 再フェッチ → 1件表示。正常動作。 | OK |
| 4 | 親子タスク（親+子2件）を一括アーカイブ | 親タスク（完了）と子タスク2件（いずれも完了）がある状態で、親の📦ボタンをクリック | 親と子2件がすべてアーカイブされること | `TaskList.js` L213 で子を取得（2件）、L214 で `hasInProgress` チェック（false）、L223-225 で子2件を個別 UPDATE、L230 で親を UPDATE。計3件がアーカイブ。正常動作。 | OK |
| 5 | アーカイブ→復元→再アーカイブ | タスクをアーカイブ→復元→再度アーカイブ | 各操作が正常に動作し、`archived_at` が適切に更新/NULL化されること | アーカイブ: `archived_at = datetime('now', 'localtime')`。復元: `archived_at = NULL`。再アーカイブ: 新しい `archived_at` がセットされる。各操作で refreshKey 更新→再フェッチ。正常動作。 | OK |
| 6 | フィルタ適用中のアーカイブ操作 | タグフィルタを適用した状態でアーカイブ | フィルタとアーカイブ条件が AND で結合され、正しいタスクのみ表示されること | `TaskList.js` L84-89 でアーカイブ条件、L91-113 でフィルタ条件が `conditions` 配列に追加され、L116 で `WHERE` + `AND` 結合。正常動作。 | OK |
| 7 | 大量タスク（50件以上）のアーカイブビュー | 50件以上のアーカイブ済みタスクを表示 | 全タスクが正常にレンダリングされること | SQL クエリに件数制限なし。`sortedParentTasks.map()` で全件描画。パフォーマンスは実機依存だが、ロジック上は正常動作。 | OK ⚠️ 要実機確認：[タスク一覧画面]で[50件以上のアーカイブ済みタスクを表示]→[スクロールが滑らかで、表示が崩れないこと] |
| 8 | 自動アーカイブ→手動復元→自動アーカイブ再実行 | 自動アーカイブされたタスクを手動復元した後、再度 runAutoArchive が実行される | 条件を満たすタスクが再びアーカイブされること | 復元で `archived_at = NULL` に戻る → runAutoArchive の WHERE 条件 `archived_at IS NULL AND status_code = 3 AND date(completed_at) <= ...` を再び満たす → 再アーカイブ。正常動作。**注意**: ユーザーが意図的に復元したタスクが次回起動時に再度アーカイブされる。これは仕様通りの動作だが、UX上は注意が必要（ユーザーへの説明等）。 | OK |
| 9 | 設定変更 0→14→0 の遷移 | 自動アーカイブを 0→14→0 に変更 | 14設定時に runAutoArchive 実行、0設定時は実行されないこと | `settings/page.js` L541: `parseInt(val) > 0` で runAutoArchive を呼ぶ。14のとき実行あり、0のとき L541 不成立で実行なし。0 設定でもトースト「自動アーカイブを無効にしました」は表示。正常動作。 | OK |
| 10 | タブ切替の競合チェック | 通常タブ→アーカイブタブを素早く連続切替 | レース条件で古いデータが表示されないこと | `TaskList.js` L56: `activeRequestId.current` でリクエスト ID を管理。L133, L138: 最新リクエストのみ state 更新。古いリクエストの結果は破棄される。正常動作。 | OK |
| 11 | アーカイブ後の今日やるタスク画面整合性 | today_date がセットされたタスクをアーカイブし、今日やるタスク画面を確認 | アーカイブされたタスクが今日やるタスクに表示されないこと | `app/today/page.js` L218: `WHERE t.archived_at IS NULL` でアーカイブ済みを除外。today_date は残るがクエリで除外される。正常動作。 | OK |
| 12 | アーカイブ後のダッシュボード整合性 | 複数タスクをアーカイブし、ダッシュボードを確認 | 完了率・ステータス分布等からアーカイブ済みが除外されること | `app/dashboard/page.js` の全6クエリに `AND archived_at IS NULL` あり。正常動作。 | OK |

### 実機確認推奨項目

- ⚠️ 要実機確認：[タスク一覧画面]で[「📋 タスク」タブと「📦 アーカイブ済み」タブが表示されていること]
- ⚠️ 要実機確認：[タスク一覧画面]で[完了タスクの右側に📦ボタンが表示されていること]
- ⚠️ 要実機確認：[タスク一覧画面]で[📦ボタンをクリック]→[タスクが通常ビューから消え、トースト「アーカイブしました」が表示されること]
- ⚠️ 要実機確認：[タスク一覧画面]で[「📦 アーカイブ済み」タブをクリック]→[アーカイブしたタスクが表示され、📤復元ボタンがあること]
- ⚠️ 要実機確認：[タスク一覧画面]で[📤復元ボタンをクリック]→[タスクがアーカイブビューから消え、通常ビューに戻ること]
- ⚠️ 要実機確認：[設定画面]で[オプションタブの「完了タスクの自動アーカイブ」カードが表示されていること]→[数値入力欄と「日後」ラベルがあること]
- ⚠️ 要実機確認：[タスク一覧画面]で[50件以上のアーカイブ済みタスクを表示]→[スクロールが滑らかで表示が崩れないこと]

### 結果サマリー

- **観点1 正常系テスト**: 24件中 OK: 23件 / **NG: 1件**（#24 自動アーカイブの親子連動欠如）
- **観点2 異常系・境界値テスト**: 13件 全OK
- **観点3 状態遷移・データ件数テスト**: 12件 全OK
- **合計**: 49件中 OK: 48件 / **NG: 1件**
- **NG内容**: `lib/db.js` の `runAutoArchive()` 関数が親子関係を考慮せず、親タスクを自動アーカイブした際に子タスクが連動アーカイブされない。IMP-2 仕様「親アーカイブ時は子もまとめてアーカイブ」に違反。

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

## STEP B：品質レビュー（v1.3.0 枝番3-2）

### 観点1：エラーハンドリング確認

| # | 異常条件 | 挙動 | エラーメッセージの有無と内容 | データへの影響 | OK/NG |
|---|---|---|---|---|---|
| 1 | DBファイルが存在しない・破損している場合（アーカイブ操作時） | `handleArchive`（TaskList.js:198-237）は全体を try/catch で囲んでおり、DB接続失敗や execute 例外時に catch ブロックに入る。アプリはクラッシュせず動作を継続する。`handleRestore`（TaskList.js:239-262）も同様の構造。 | `handleArchive`: 「アーカイブに失敗しました」トースト表示（L235）。`handleRestore`: 「復元に失敗しました」トースト表示（L260）。いずれもグローバルトースト（layout.js の yarukoto:toast リスナー）経由でユーザーに通知される。 | DB書き込みが失敗した場合、`setRefreshKey` が呼ばれないため（catchブロックではrefreshしない）、UIは元の状態を維持する。ただしアーカイブ操作は楽観的更新ではないため、データ不整合は発生しない。 | OK |
| 2 | DBファイルが存在しない・破損している場合（自動アーカイブ実行時） | `runAutoArchive`（lib/db.js:216-234）は全体を try/catch で囲んでいる。`initDb()` 内で呼ばれるため（L204）、起動時にDB接続自体が失敗している場合はそもそも `runAutoArchive` に到達しない（initDb の外側 catch L206-208 で処理）。runAutoArchive 内の SELECT/UPDATE が個別に失敗した場合は catch（L231-233）で処理される。 | `console.error('Auto-archive error:', e)` がコンソールに出力される（L232）。ユーザー向けのトースト通知はなし。起動時の自動処理であるため、ユーザーへの直接通知は不要と判断。 | 自動アーカイブのSELECTが失敗した場合は何もアーカイブされず、UPDATEが中途で失敗した場合は一部のタスクのみアーカイブされる可能性がある（トランザクションで囲んでいないため）。ただし既存データの破損は発生しない。 | OK |
| 3 | DBファイルが存在しない・破損している場合（設定画面で自動アーカイブ日数保存時） | settings/page.js L531-551 の onBlur ハンドラ全体が try/catch で囲まれている。DB接続失敗時も catch に入る。 | 「設定の保存に失敗しました」トースト表示（L550、flash('err', ...)経由）。 | DB保存失敗時、UIの `appSettings` state は既に更新済み（L533）だが、ページリロードで元の値に戻る。設定値のUIとDBの一時的な不整合は発生するが、永続データの損失はない。 | OK |
| 4 | 想定外のデータ型がDBに入っている場合（archived_at に不正な文字列） | `archived_at` は TEXT 型で型制約がないため、任意の文字列がINSERT可能。クエリ側は `IS NULL` / `IS NOT NULL` で判定するため、値の内容に依存しない。TaskList.js L728 の表示は `task.archived_at.split(' ')[0]` で日付部分を切り出すが、不正な形式でも `.split(' ')` は常にstring配列を返すためクラッシュしない。 | なし（エラーにならない）。 | データが不正な形式でもDBの整合性は保たれ、表示が崩れる程度（日付として認識できない文字列が表示される）。 | OK |
| 5 | 想定外のデータ型がDBに入っている場合（auto_archive_days に非数値文字列） | `runAutoArchive` L218-219: `db.select` で取得した value を `parseInt()` で変換。非数値文字列の場合 `parseInt('abc') = NaN`、`NaN || '0'` → `0`、`days = 0`、L220 で `days <= 0` により早期 return。settings/page.js L532 でも同様に `parseInt(...) || 0` で NaN をガード。 | なし（正常にフォールバック）。 | 自動アーカイブが無効として扱われ、既存データに影響なし。 | OK |
| 6 | 親子連動アーカイブ時にDBエラーが途中で発生した場合 | `handleArchive`（TaskList.js:198-237）で、子タスクのアーカイブ（L223-225のforループ）の途中で例外が発生した場合、catch（L233-236）に飛ぶ。一部の子タスクはアーカイブ済み、残りと親はアーカイブされない中途半端な状態になる。 | 「アーカイブに失敗しました」トースト表示。 | ✅ 修正済み — `handleArchive` を `BEGIN`/`COMMIT`/`ROLLBACK` トランザクションで囲み、all-or-nothing を保証。子アーカイブも単一 UPDATE 文に統一。 | OK |
| 7 | 親子連動復元時にDBエラーが途中で発生した場合 | `handleRestore`（TaskList.js:239-262）で、子タスクの一括復元（L247）は単一のUPDATE文（`WHERE parent_id = $1`）のため中途半端にはなりにくい。ただし子を復元（L247）した後に自身の復元（L255）が失敗した場合、子のみ復元されて親がアーカイブのままになる。 | 「復元に失敗しました」トースト表示。 | ✅ 修正済み — `handleRestore` を `BEGIN`/`COMMIT`/`ROLLBACK` トランザクションで囲み、all-or-nothing を保証。 | OK |
| 8 | ディスク書き込み権限がない場合（アーカイブ関連全般） | Tauri プラグインSQL が内部で SQLite の write をラップしており、権限不足の場合は execute 時に例外をスロー。上記 #1～#3 で確認した各 try/catch が対応。 | 各操作の catch ブロックで適切なエラートーストが表示される。 | 書き込みが失敗するため DB は変更されず、データ損失はない。 | OK |

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

| # | 観点 | 箇所A | 箇所B | 不整合の内容 | ファイル名:行番号 |
|---|---|---|---|---|---|
| 1 | 文言の揺れ（ボタン操作の文言） | TaskInput.js の送信ボタン文言: `'✓ 登録'`（L289）、`'登録中...'`（L289） | TaskEditModal.js の保存ボタン文言: `'保存'`（L260）、`'保存中...'`（L260） | タスク追加時は「登録」、タスク編集時は「保存」で使い分けているが、**これは追加と編集で操作が異なるため意図的な使い分けと判断。問題なし。** | — |
| 2 | 文言の揺れ（トースト通知の動詞） | TaskList.js `handleArchive` 成功トースト: `'アーカイブしました'`（L231） | TaskList.js `handleRestore` 成功トースト: `'復元しました'`（L256） | 統一されている。問題なし。 | — |
| 3 | 同種操作でのUI挙動の不統一（確認ダイアログ） | タスク削除時: `confirm('このタスクを削除しますか？')` が表示される（TaskList.js:172） | タスクアーカイブ時: `confirm` なし、即座にアーカイブが実行される（TaskList.js:198-237） | **削除は不可逆操作のため confirm あり、アーカイブは復元可能なため confirm なしと判断でき、合理的な差異。問題なし。** | — |
| 4 | 同種操作でのUI挙動の不統一（アーカイブ済みビューでの子タスク操作） | 通常ビューの子タスク: ステータスselect・☀️ボタン・📦ボタン・＋ボタン・🗑ボタンが表示される | アーカイブ済みビューの子タスク: ステータスラベル（読み取り専用）と📤復元ボタンのみ表示。**ただし、子タスクの📤復元ボタンをクリックすると親も連動復元される（TaskList.js:251-253）が、この挙動はUI上で事前に告知されない。** | ✅ 修正済み — 復元トーストを親子連動時は「親タスクと子タスクをまとめて復元しました」「子タスクと親タスクを復元しました」に変更。連動復元の事実がユーザーに伝わるようにした。 | `components/TaskList.js` |
| 5 | エラーメッセージのトーン・粒度の不統一 | `handleArchive` 内のバリデーションエラー: `'完了またはキャンセル済みのタスクのみアーカイブできます'`（TaskList.js:207）、`'未完了の子タスクがあるためアーカイブできません'`（TaskList.js:216） | `handleArchive` の DB エラー: `'アーカイブに失敗しました'`（TaskList.js:235）。`handleRestore` の DB エラー: `'復元に失敗しました'`（TaskList.js:260）。 | バリデーションエラーは具体的理由を含み、DBエラーは汎用メッセージ。これはエラーの性質が異なるため合理的。問題なし。 | — |
| 6 | 日付・時刻の表示フォーマットの不統一 | タスクカードの完了日表示: `task.completed_at.split(' ')[0]`（TaskList.js:727） | タスクカードのアーカイブ日表示: `task.archived_at.split(' ')[0]`（TaskList.js:728） | 両方とも `datetime('now', 'localtime')` の結果（`'YYYY-MM-DD HH:MM:SS'` 形式）から日付部分のみ切り出し。フォーマットは統一されている。問題なし。 | — |
| 7 | 日付・時刻の表示フォーマットの不統一（今日やるタスク画面） | 今日やるタスク画面の完了日表示: `task.completed_at.split(' ')[0]`（today/page.js:517） | タスク一覧画面のアーカイブ日表示: `task.archived_at.split(' ')[0]`（TaskList.js:728） | 統一されている。問題なし。 | — |
| 8 | 余白・フォントサイズ・色使いの不統一（アーカイブタブと既存タブ） | タスク一覧の「📋 タスク / 📦 アーカイブ済み」タブ: `.tl-archive-tab`（TaskList.js:617-627）— `padding:.5rem .75rem`, `font-size:.85rem`, `border-radius:8px` | 今日やるタスクの日付タブ: `.date-tab`（today/page.js:571-583）— `padding:0.5rem 0.25rem`, `font-size:（date-tab-label .78rem）`, `border-radius:9px` | **タブの形状は画面の役割が異なるため差異は許容範囲。ただし `border-radius` が 8px vs 9px でわずかに異なる。** 視覚的影響は小さいが、統一するならどちらかに揃えるのが望ましい。 | `components/TaskList.js:620`（8px）vs `app/today/page.js:577`（9px） |
| 9 | 余白・フォントサイズ・色使いの不統一（設定画面のアーカイブ日数入力） | 設定画面の既存トグルスイッチ（inherit_parent_tags, show_overdue_in_today）: `.opt-toggle` による ON/OFF 切替 | 設定画面の自動アーカイブ日数: `.opt-number-input` による数値入力（settings/page.js:522-554） | **異なるUI要素（トグル vs 数値入力）は入力タイプの違いによるもので適切。** opt-card 内の構造（opt-icon, opt-title, opt-desc）は統一されている。問題なし。 | — |
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

- **観点1 エラーハンドリング**: 8件中 OK: 6件 / **NG: 2件**（#6 親子連動アーカイブの非トランザクション処理、#7 親子連動復元の非トランザクション処理）
- **観点2 一貫性レビュー**: 10件中 OK: 8件 / **NG: 2件**（#4 子タスク復元時の親連動復元が告知されない、#10 CSVエクスポートがアーカイブ済みタスクを区別しない）
- **合計**: 18件中 OK: 14件 / **NG: 4件**
