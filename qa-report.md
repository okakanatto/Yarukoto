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
