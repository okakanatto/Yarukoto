# QA Report

## STEP A：機能検証（v1.2.0 枝番2-2）

**検証日**: 2026-02-27
**検証方法**: 静的分析（ソースコードリーディング）
**検証スコープ**: WORK-LOG.md 枝番2-2 の「やったこと」「変更したファイル」に基づく。
- BUG-5: TaskInput.js / TaskEditModal.js の入力項目の並び順統一
- IMP-12: StatusCheckbox.js の着手中→未着手戻しボタン追加
- ENH-6: TaskList.js / today/page.js の completed_at 楽観的更新

### 観点1：正常系テスト

| # | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 1 | BUG-5: TaskInput 項目順 | タスク追加フォームを展開し details-panel の項目順を確認 | 仕様順: 終了期限→備考→タグ→親タスク→開始日・想定工数→重要度・緊急度（タスク名は primary row） | 静的分析: `TaskInput.js:196-278` のJSX順が仕様通り。各コメントに番号付きで明記されている。 | OK |
| 2 | BUG-5: TaskEditModal 項目順 | タスク編集モーダルを開き te-body の項目順を確認 | 仕様順: タスク名→ステータス(編集固有)→終了期限→備考→タグ→親タスク→開始日・想定工数→重要度・緊急度→完了日(編集のみ) | 静的分析: `TaskEditModal.js:139-254` のJSX順が仕様通り。ステータスはタスク名直下に独立配置。 | OK |
| 3 | BUG-5: 完了日フィールド（未完了タスク） | 未完了タスクの編集モーダルを開く | 完了日フィールドが非表示 | 静的分析: `TaskEditModal.js:248` — `{task.completed_at && (` で条件レンダリング。falsy 時は非表示 ✓ | OK |
| 4 | BUG-5: 完了日フィールド（完了タスク） | 完了済みタスクの編集モーダルを開く | 完了日が readOnly disabled で表示 | 静的分析: `TaskEditModal.js:251` — `value={task.completed_at.split(' ')[0]} readOnly disabled` ✓ | OK |
| 5 | IMP-12: 未着手(1) ホバー時 ▶ボタン | 未着手タスクにマウスホバー | ▶ボタンが右に出現 | 静的分析: `StatusCheckbox.js:32` — `showPlay = code === 1 && hovered && !twoStateOnly` ✓ | OK |
| 6 | IMP-12: 着手中(2) ホバー時 ↩ボタン | 着手中タスクにマウスホバー | ↩ボタンが右に出現 | 静的分析: `StatusCheckbox.js:33` — `showRevert = code === 2 && hovered && !twoStateOnly` ✓ | OK |
| 7 | IMP-12: ↩クリックで未着手(1)へ | 着手中タスクの↩ボタンをクリック | ステータスが未着手(1)に遷移 | 静的分析: `StatusCheckbox.js:26-30` — `handleRevertClick` → `e.stopPropagation(); onChange(1)` ✓ | OK |
| 8 | IMP-12: 着手中→完了（既存動作維持） | 着手中タスクの本体（▶アイコン部分）をクリック | ステータスが完了(3)に遷移 | 静的分析: `StatusCheckbox.js:13-14` — `if (code === 2) onChange(3)` は変更なし ✓ | OK |
| 9 | IMP-12: ▶と↩の排他性 | 各ステートでのボタン表示 | ▶(code===1) と ↩(code===2) は同時に表示されない | 静的分析: code は同時に1かつ2にならないため、条件が排他的 ✓ | OK |
| 10 | ENH-6: 完了日の即時反映（タスク一覧） | タスク一覧でタスクを完了(3)にする | リロードなしで完了日がカードに即座に表示される | 静的分析: `TaskList.js:114-119` — `completedNow = sv-SE date + time`; 楽観的更新で `completed_at` セット → `TaskList.js:599` の `{isDone && task.completed_at && ...}` で表示 ✓ | OK |
| 11 | ENH-6: 完了日の即時反映（今日やる） | 今日やる画面でタスクを完了(3)にする | リロードなしで完了日が即座に表示される | 静的分析: `today/page.js:275-280` — 同じ楽観的更新パターン → `today/page.js:486` の `{isDone && task.completed_at && ...}` で表示 ✓ | OK |
| 12 | ENH-6: 完了→非完了で完了日クリア | 完了タスクを未着手(1)に戻す | 完了日表示が消える | 静的分析: 楽観的更新で `completed_at: code === 3 ? completedNow : null`。非3は null → isDone=false で非表示 ✓ | OK |

⚠️ 要実機確認:
- ↩ボタンの `statusCbFadeIn` アニメーションが正常に動作し、レイアウトが崩れないか（CSS `StatusCheckbox.js:143-163`）
- 完了日の楽観的更新が即座に DOM に反映されること（React の状態更新→再レンダリングの実タイミング）
- `sv-SE` ロケールの `toLocaleDateString` / `toLocaleTimeString` が Tauri WebView2 上で `YYYY-MM-DD HH:MM:SS` を返すか

### 観点2：異常系・境界値テスト

| # | 対象フィールド/操作 | 入力内容 | 期待される挙動 | 実際の挙動 | OK/NG |
|---|---|---|---|---|---|
| 1 | IMP-12: キャンセル(5)タスクでの操作 | キャンセルタスクの↩クリック / 本体クリック | `code === 5` ガードで何も起きない | 静的分析: `StatusCheckbox.js:10,22,28` — 3箇所すべてに `if (code === 5) return;` ガードあり ✓ | OK |
| 2 | IMP-12: twoStateOnly モードでの↩ | twoStateOnly=true 時に着手中タスクにホバー | ↩ボタン非表示 | 静的分析: `StatusCheckbox.js:33` — `!twoStateOnly` 条件で false → ボタン非表示 ✓ | OK |
| 3 | IMP-12: ↩ボタン連打 | ↩ボタンを高速連打 | `e.stopPropagation()` で親要素への伝播なし。onChange(1) は冪等（1→1 は状態変化なし） | 静的分析: `StatusCheckbox.js:27` — `stopPropagation` あり。初回クリックで code=1 → `showRevert=false` でボタン消失。連打による副作用なし ✓ | OK |
| 4 | ENH-6: completed_at の null ガード | 未完了タスクの completed_at が null の場合 | エラーにならず完了日が非表示 | 静的分析: `TaskList.js:599` — `isDone && task.completed_at &&` の短絡評価で null.split() は発生しない ✓。`today/page.js:486` も同パターン ✓ | OK |
| 5 | ENH-6: 日付フォーマット互換性 | 楽観的更新の completed_at を split(' ') する | `[0]` で日付部分 `YYYY-MM-DD` が取得できる | 静的分析: `sv-SE` ロケールで `YYYY-MM-DD` + `' '` + `HH:MM:SS`。DB側 `datetime('now', 'localtime')` も `YYYY-MM-DD HH:MM:SS`。split(' ')[0] で互換 ✓ | OK |
| 6 | BUG-5: 空タスク名での保存 | タスク名を空にして保存クリック | 保存ボタンが disabled | 静的分析: `TaskEditModal.js:258` — `disabled={!title.trim() \|\| saving}`、`TaskEditModal.js:61` — `if (!title.trim() \|\| saving) return;` の二重ガード ✓ | OK |
| 7 | BUG-5: 特殊文字のタスク名 | `' " < > & \ /` を含むタスク名 | パラメタライズドクエリで安全に保存される | 静的分析: `TaskEditModal.js:83-107` — `$1` 〜 `$10` の positional パラメータ使用。SQL injection リスクなし ✓ | OK |

### 観点3：状態遷移・データ件数テスト

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 1 | IMP-12: 全ステート遷移の網羅確認 | 各ステータスからの全遷移パスを確認 | 未着手→▶→着手中、未着手→本体→完了、着手中→↩→未着手、着手中→本体→完了、完了→本体→未着手、キャンセル→操作不可 | 静的分析: `StatusCheckbox.js:9-30` — 6パスすべて正しく実装。キャンセル(5)は3箇所で早期 return ✓ | OK |
| 2 | ENH-6: ルーティン完了時の completed_at | 今日やる画面でルーティンを完了にする | 楽観的更新で completed_at がセットされる。ルーティンの DB 管理（routine_completions）には影響なし | 静的分析: `today/page.js:276-280` — ルーティンにも completed_at を設定（JS的には undefined→値に変更で無害）。DB操作は `today/page.js:293` — `INSERT INTO routine_completions` のみで completed_at には触れない ✓ | OK |
| 3 | ENH-6: 今日やる ↔ タスク一覧の整合性 | 今日やる画面で完了→タスク一覧を開く | 完了日が一致する | 静的分析: 両画面とも DB更新は `completed_at = datetime('now', 'localtime')` で同一クエリ。楽観的更新値は表示用のみで、画面遷移後は DB値から再取得 ✓ | OK |
| 4 | BUG-5: 今日やる画面からの編集 | タスク名クリックで編集モーダル表示 | TaskEditModal が開き項目順が仕様通り | 静的分析: `today/page.js:474-476` — `setEditingTask(task)` → `today/page.js:687-694` で TaskEditModal をレンダリング。TaskEditModal の項目順は観点1 #2 で確認済み ✓ | OK |
| 5 | ENH-6: ステータス連続変更（1→2→3→1→3） | タスクのステータスを高速で連続変更 | 各変更ごとに楽観的更新 → DB更新。最終的に DB 値と UI が一致 | 静的分析: `TaskList.js:113-129` — 各呼び出しで `setTasks` による楽観的更新 + 非同期 DB更新。DB エラー時は `fetchTasks()` でロールバック。最終整合性は担保される ⚠️ 高速連続変更時のUI表示の乱れは要実機確認 | OK |

⚠️ 要実機確認:
- ルーティンのカード上で `☑ 完了:` 表示が正しく出るか（ルーティンオブジェクトは元々 `completed_at` を持たないため、楽観的更新で追加された値の表示確認）
- 高速ステータス連続変更時の UI 表示の乱れがないか
- TaskEditModal のレイアウト変更後の styled-jsx レンダリング結果（項目間隔・カラム幅等）

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

---

## STEP B：品質レビュー（v1.2.0 枝番2-2）

**検証日**: 2026-02-28
**検証方法**: 静的分析（ソースコードリーディング）
**検証スコープ**: WORK-LOG.md 枝番2-2 の変更ファイルを起点に、関連箇所を対象。
- BUG-5: `components/TaskInput.js`, `components/TaskEditModal.js` — 入力項目の並び順統一
- IMP-12: `components/StatusCheckbox.js` — 着手中→未着手戻しボタン追加
- ENH-6: `components/TaskList.js`, `app/today/page.js` — completed_at 楽観的更新

### 観点1：エラーハンドリング確認

| # | 異常条件 | 挙動 | エラーメッセージの有無と内容 | データへの影響 | OK/NG |
|---|---|---|---|---|---|
| 1 | DBファイルが存在しない・破損 | `lib/db.js:14-31` で `Database.load()` が失敗 → `globalThis[DB_PROMISE_KEY] = null` でリトライ可能化。`window.dispatchEvent('yarukoto:dberror')` を発火 → `layout.js:36-41` で受信し `throw` → Next.js エラーバウンダリが表示。枝番2-2 の変更ファイルは全て `getDb()` を呼ぶ前段で失敗するため、変更箇所自体に到達しない | `yarukoto:dberror` イベント経由でエラーバウンダリが表示される。ユーザーにはエラー画面が表示される | データ損失なし（DB接続前に失敗） | OK |
| 2 | app_settings テーブルにキーが存在しない | `TaskInput.js:90-92` — `settingRows.length === 0` で条件 false → タグ継承スキップ。`today/page.js:67-70` — `settingsRows.length === 0` でデフォルト `true` のまま（useState 初期値）。いずれもフォールバック動作で正常稼働 | エラーメッセージなし（異常ではなく正常パス扱い） | データ影響なし | OK |
| 3 | ディスク書き込み権限なし（ステータス変更時） | `TaskList.js:120-128` — try/catch で `fetchTasks()` を呼び DB からリフェッチして楽観的更新をロールバック。`today/page.js:297,308` — 同パターンで `loadTasks(selectedDate)` によりロールバック | **エラートースト未表示。** `console.error(e)` のみで、ユーザーにはUIが元に戻るだけで理由が伝わらない。対比: `TaskList.js:143` の `handleDelete` は `'削除に失敗しました'` トーストを表示しており、同一ファイル内で対応が不統一 | 楽観的更新がロールバックされ、DB値と同期される。データ損失なし | ✅ 修正済み |
| 4 | ディスク書き込み権限なし（タスク追加/保存時） | `TaskInput.js:146-150` — catch で `'タスクの追加に失敗しました'` トースト表示。`TaskEditModal.js:120-124` — catch で `'保存に失敗しました'` トースト表示 | 適切なエラートーストがユーザーに表示される | データ損失なし（DB に未到達） | OK |
| 5 | completed_at に想定外のデータ型（数値等）が入っている | `TaskList.js:599` / `today/page.js:486` — 表示条件 `isDone && task.completed_at &&` の短絡評価により、truthy な数値の場合 `.split(' ')` でランタイムエラー（`Number.prototype.split is not a function`）。ただしDB側の `datetime()` 関数は常に文字列を返すため、正常運用で発生する可能性は極めて低い | エラーメッセージなし（ランタイムエラーが発生した場合、Reactのエラーバウンダリに委ねられる） | データ影響なし（読み取り専用パス） | OK（実運用リスク極低） |
| 6 | statusCode に想定外の値が渡される | `StatusCheckbox.js:7` — `parseInt(statusCode)` で NaN になった場合、`code === 5` / `code === 3` / `code === 2` / `code === 1` はすべて false。`handleMainClick` の else 分岐（行16）で `onChange(3)` が呼ばれ、意図しない完了遷移が発生し得る。ただし `statusCode` は常に DB の `status_code` カラム（INTEGER NOT NULL DEFAULT 1）から取得されるため、正常運用で NaN になることはない | エラーメッセージなし（undefined 動作） | 理論上は意図しないステータス変更が発生し得るが、正常運用では到達しない | OK（実運用リスク極低） |

**NG 指摘の詳細:**

**#3 — ステータス変更失敗時のエラートースト未表示** ✅ 修正済み
- **該当箇所**: `components/TaskList.js:128`、`app/today/page.js:297`、`app/today/page.js:308`
- **修正内容**: 3箇所の catch ブロックに `window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: 'ステータスの変更に失敗しました', type: 'error' } }))` を追加

### 観点2：一貫性レビュー

| # | 観点 | 箇所A | 箇所B | 不整合の内容 | ファイル名:行番号 |
|---|---|---|---|---|---|
| 1 | 文言の揺れ | TaskInput 親タスクデフォルト選択肢 | TaskEditModal 親タスクデフォルト選択肢 | `'なし（ルートタスク）'` vs `'なし（ルート）'` — 同じ「親なし」の意味だが文言が異なる。`'なし（ルートタスク）'` に統一推奨 | `TaskInput.js:230` / `TaskEditModal.js:200` | ✅ 修正済み |
| 2 | 文言の揺れ | TaskInput 想定工数プレースホルダ | TaskEditModal 想定工数プレースホルダ | `placeholder="0"` vs `placeholder="未設定"` — 同じ想定工数フィールドで異なるプレースホルダ。`'未設定'` に統一推奨（`0` は「0分」と混同しうる） | `TaskInput.js:253` / `TaskEditModal.js:220` | ✅ 修正済み |
| 3 | 見た目の不統一（ラベル色） | TaskInput label | TaskEditModal .te-label | ラベルの文字色が `var(--color-text-muted)` (#8791a5) vs `var(--color-text-secondary)` (#4a5068) で異なる。TaskInput はさらに `text-transform: uppercase; letter-spacing: 0.04em` を指定しているが TaskEditModal にはない。BUG-5「レイアウト統一」の趣旨に照らし、同じ色・装飾に統一推奨（`--color-text-muted` + uppercase が他画面と調和しやすい） | `TaskInput.js:363-366` / `TaskEditModal.js:290` | ✅ 修正済み |
| 4 | 見た目の不統一（入力フィールド背景色） | TaskInput input/select/textarea | TaskEditModal .te-input/.te-select/.te-textarea | 入力フィールドの背景色: `var(--color-surface-hover)` (#f1f3f9) vs `var(--color-surface)` (#ffffff)。同じ種類のフォーム入力なのに背景色が異なる。どちらかに統一推奨 | `TaskInput.js:368` / `TaskEditModal.js:298-299` | ✅ 修正済み |
| 5 | 見た目の不統一（入力フィールドpadding・font-size） | TaskInput input/select/textarea | TaskEditModal .te-input/.te-select/.te-textarea | padding: `0.55rem 0.65rem` vs `0.5rem`、font-size: `0.875rem` vs `0.9rem` — 微差だがBUG-5の趣旨に照らし統一推奨 | `TaskInput.js:369-370` / `TaskEditModal.js:298` | ✅ 修正済み |
| 6 | 見た目の不統一（タイトル入力のfont-size） | TaskInput .task-title-input | TaskEditModal .te-input-title | タイトル入力の font-size: `1.05rem` vs `1.5rem` — 大きな差異。モーダルの方が大きい。BUG-5「レイアウト統一」の趣旨上、同程度のサイズに揃えることを推奨 | `TaskInput.js:327` / `TaskEditModal.js:293` | ✅ 修正済み |
| 7 | 見た目の不統一（textarea rows） | TaskInput 備考 textarea | TaskEditModal 備考 textarea | 同じ「備考」フィールドで `rows="2"` vs `rows="3"` — 初期表示高さが異なる。統一推奨（`rows="3"` が入力しやすい） | `TaskInput.js:206` / `TaskEditModal.js:172` | ✅ 修正済み |
| 8 | 見た目の不統一（ボタンborder-radius） | TaskInput .btn-submit / .btn-collapse | TaskEditModal .te-btn-save / .te-btn-cancel | TaskInput は CSS変数 `var(--radius-sm)` (=8px) を使用。TaskEditModal はハードコーディング `4px`。デザインシステムの一貫性のため `var(--radius-sm)` に統一推奨 | `TaskInput.js:388` / `TaskEditModal.js:321,313` | ✅ 修正済み |
| 9 | 同種操作でUI挙動が異なる | TaskInput 想定工数 input | TaskEditModal 想定工数 input | TaskInput は `max="99999"` で上限バリデーションあり、TaskEditModal には `max` 属性なし。編集画面でも同じ制限を適用すべき | `TaskInput.js:249-250` / `TaskEditModal.js:216` | ✅ 修正済み |
| 10 | 同種操作でUI挙動が異なる（エラートースト） | handleStatusChange（ステータス変更失敗時） | handleDelete（削除失敗時） | ステータス変更の DB 失敗時はトースト通知なし（silent rollback）、削除の DB 失敗時はエラートースト表示。同ファイル内の同種エラーで対応が不統一（観点1 #3 と同一指摘） | `TaskList.js:128` vs `TaskList.js:143` | ✅ 修正済み |
| 11 | 文言の揺れ（親タスク候補フィルタ） | TaskInput 親候補クエリ | TaskEditModal 親候補クエリ | TaskInput は `status_code != 3 AND status_code != 5`（完了+キャンセル除外）、TaskEditModal は `status_code != 5`（キャンセルのみ除外）。新規作成時は完了タスクを親候補から外すが、編集時は完了タスクも親候補に含まれる不統一。編集時も完了タスクを除外するか、意図的な差異なら ISSUES.md に仕様として明記推奨 | `TaskInput.js:37` / `TaskEditModal.js:43-44` | ✅ 修正済み |
| 12 | 日付フォーマットの一貫性 | 全画面 | 全画面 | `sv-SE` ロケールによる `YYYY-MM-DD` 形式が全画面で一貫して使用されている。`completed_at.split(' ')[0]` のパターンも `TaskList.js:599`, `today/page.js:486`, `TaskEditModal.js:251` で統一。`formatMin()` 関数も `today/page.js:340-343` と `dashboard/page.js:158-161` で同一ロジック | — | OK |
| 13 | エラーメッセージのトーン | 全画面 | 全画面 | エラーメッセージは「〜に失敗しました」パターンで統一されている（`TaskInput.js:149` `'タスクの追加に失敗しました'`、`TaskEditModal.js:123` `'保存に失敗しました'`、`TaskList.js:143` `'削除に失敗しました'`）。トーンと粒度に問題なし | — | OK |
| 14 | 削除確認ダイアログ | 全画面 | 全画面 | 削除操作は全て `confirm()` ダイアログで確認を取っている（`TaskList.js:132`, `settings/page.js:163,214,501-502`）。統一されている | — | OK |

**NG 指摘の詳細:**

**#1 — 親タスクデフォルト選択肢の文言不統一** ✅ 修正済み
- `TaskEditModal.js:200` の `'なし（ルート）'` を `'なし（ルートタスク）'` に変更

**#2 — 想定工数プレースホルダの不統一** ✅ 修正済み
- `TaskInput.js:253` の `placeholder` を `"未設定"` に変更

**#3〜8 — TaskInput / TaskEditModal 間の CSS 不統一（BUG-5 関連）** ✅ 修正済み
- TaskEditModal の styled-jsx を TaskInput のデザインパターンに統一:
  - ラベル色を `--color-text-muted` + uppercase + letter-spacing に変更 (#3)
  - 入力フィールド背景色を `--color-surface-hover` に変更 (#4)
  - padding を `0.55rem 0.65rem`、font-size を `0.875rem` に変更 (#5)
  - タイトル入力の font-size を `1.05rem` に変更 (#6)
  - 備考 textarea の rows を `3` に統一 (#7)
  - ボタン border-radius を `var(--radius-sm)` に変更 (#8)
  - フォーカス時の box-shadow と背景変化も追加

**#9 — 想定工数 max 属性の欠落** ✅ 修正済み
- `TaskEditModal.js:216` の `<input type="number">` に `max="99999"` を追加

**#11 — 親タスク候補フィルタの不統一** ✅ 修正済み
- `TaskEditModal.js:43-44` のクエリに `AND status_code != 3` を追加して TaskInput と統一
- 既に完了した親を持つタスクの編集時は、現在の親タスクが候補に含まれるよう `OR id = $2` 条件を追加

---

## STEP R：リグレッションテスト（v1.2.0 枝番2-2 2026-02-28）

**検証日**: 2026-02-28
**検証方法**: 静的分析（ソースコードリーディング）
**対象**: WORK-LOG.md の変更サマリー（STEP B 品質レビュー指摘全件修正）に基づくリグレッションテスト

### 影響範囲の洗い出し

変更サマリーの「影響が想定される箇所」を起点に、コード上の参照元を追跡した結果：

| # | 変更ファイル | 変更内容 | 影響が想定されるファイル・関数 | 確認対象の理由 |
|---|---|---|---|---|
| 1 | `TaskList.js` handleStatusChange catch | エラートースト追加 | `StatusCheckbox onChange`（TaskList.js:584-586）、`tc-status-select onChange`（TaskList.js:622）、`layout.js:46-53` トーストリスナー | handleStatusChange の呼び出し元すべてに影響 |
| 2 | `today/page.js` handleStatusChange catch×2 | エラートースト追加 | `StatusCheckbox onChange`（today/page.js:470-471）、`today-status select onChange`（today/page.js:503）、`layout.js:46-53` トーストリスナー | 同上 |
| 3 | `TaskEditModal.js` 文言・CSS・クエリ変更 | 親選択肢文言、CSS統一、max属性、親候補フィルタ、useEffect依存配列 | `TaskList.js:370`（タスク一覧から編集モーダル表示）、`today/page.js:694-702`（今日やるから編集モーダル表示） | TaskEditModal を使用する全画面 |
| 4 | `TaskInput.js` プレースホルダ・rows変更 | placeholder="未設定"、rows="3" | `tasks/page.js:20`（タスク一覧ページ）、`TaskList.js:638`（子タスクインライン追加）、`layout.js:214-219`（FABモーダル） | TaskInput を使用する全画面 |
| 5 | — | — | `dashboard/page.js` | DB値に直接依存。今回の変更はUI/エラーハンドリングのみのため影響なし |
| 6 | — | — | `components/StatusCheckbox.js` | IMP-12 の実装ファイル。今回の変更で StatusCheckbox 自体は未変更 |

### 第1段階：変更箇所の直接テスト

| # | テスト区分 | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|---|
| 1 | 直接 | エラートースト（TaskList.js） | タスク一覧でステータス変更がDB書き込みエラーになった場合 | エラートースト「ステータスの変更に失敗しました」が表示され、楽観的更新がロールバックされる | `TaskList.js:130` — トースト dispatch 後に `fetchTasks()` でロールバック。`handleDelete`（行147）と同じパターン。layout.js:46-53 のリスナーが受信し3秒後に自動消去 | OK |
| 2 | 直接 | エラートースト（today/page.js ルーティン） | 今日やる画面でルーティンの完了トグルがDBエラーになった場合 | エラートースト表示 + loadTasks で再読込 | `today/page.js:299` — トースト dispatch + `loadTasks(selectedDate)` でロールバック。パターン統一 | OK |
| 3 | 直接 | エラートースト（today/page.js 通常タスク） | 今日やる画面で通常タスクのステータス変更がDBエラーになった場合 | エラートースト表示 + loadTasks で再読込 | `today/page.js:314` — 同上パターン | OK |
| 4 | 直接 | 親タスク選択肢文言（TaskEditModal） | タスク編集モーダルの親タスクデフォルト選択肢を確認 | 「なし（ルートタスク）」と表示（TaskInput と統一） | `TaskEditModal.js:202` — `'なし（ルートタスク）'`。`TaskInput.js:230` と一致 | OK |
| 5 | 直接 | 想定工数プレースホルダ（TaskInput） | タスク追加フォームの想定工数フィールド | placeholder="未設定"（TaskEditModal と統一） | `TaskInput.js:253` — `placeholder="未設定"`。`TaskEditModal.js:222` と一致 | OK |
| 6 | 直接 | CSS統一（TaskEditModal ラベル色） | 編集モーダルのラベルスタイル確認 | `var(--color-text-muted)` + uppercase + letter-spacing 0.04em | `TaskEditModal.js:292` — `color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em;`。TaskInput.js:364-366 と一致 | OK |
| 7 | 直接 | CSS統一（TaskEditModal 入力背景色） | 編集モーダルのinput/select/textarea背景色 | `var(--color-surface-hover)` | `TaskEditModal.js:301` — `background: var(--color-surface-hover);`。TaskInput.js:368 と一致 | OK |
| 8 | 直接 | CSS統一（TaskEditModal padding・font-size） | 編集モーダルのinput padding と font-size | padding: 0.55rem 0.65rem、font-size: 0.875rem | `TaskEditModal.js:300,302` — 値一致。TaskInput.js:369-370 と同一 | OK |
| 9 | 直接 | CSS統一（TaskEditModal タイトルfont-size） | 編集モーダルのタイトル入力 font-size | 1.05rem | `TaskEditModal.js:296` — `font-size: 1.05rem;`。TaskInput.js:327 と一致 | OK |
| 10 | 直接 | CSS統一（TaskEditModal border-radius） | 編集モーダルのボタン border-radius | `var(--radius-sm)` | `TaskEditModal.js:318,323` — `border-radius: var(--radius-sm);`。TaskInput.js:388 と一致。CSS変数は globals.css で定義済み（TaskInput で使用実績あり） | OK |
| 11 | 直接 | CSS統一（TaskEditModal フォーカス効果） | 編集モーダルの入力フィールドフォーカス時 | box-shadow + 背景色変更 | `TaskEditModal.js:305-309` — `box-shadow: 0 0 0 3px var(--color-primary-glow); background: var(--color-surface);`。TaskInput.js:374-376 と一致 | OK |
| 12 | 直接 | max属性（TaskEditModal 想定工数） | 編集モーダルの想定工数input | max="99999" が設定されている | `TaskEditModal.js:218` — `max="99999"`。TaskInput.js:249 と一致 | OK |
| 13 | 直接 | textarea rows（TaskInput 備考） | タスク追加フォームの備考 textarea | rows="3" | `TaskInput.js:206` — `rows="3"`。TaskEditModal.js:174 と一致 | OK |
| 14 | 直接 | 親候補フィルタ（TaskEditModal） | 編集モーダルの親タスク候補クエリ | 完了タスク(status_code=3)が候補から除外される | `TaskEditModal.js:44-47` — `AND status_code != 3 AND status_code != 5`。TaskInput.js:37 と統一 | OK |
| 15 | 直接 | 親候補フィルタ（現在の親が完了の場合） | 完了済み親タスクを持つタスクの編集 | 現在の親は OR 条件で候補に含まれる | `TaskEditModal.js:44-45` — `task.parent_id` truthy 時 `OR id = $2` で現在の親を保持。params: `[task.id, task.parent_id]` | OK |
| 16 | 直接 | useEffect依存配列（TaskEditModal） | 親候補取得の useEffect 依存配列 | `[task.id, task.parent_id]` | `TaskEditModal.js:53` — `[task.id, task.parent_id]`。task.parent_id の有無でクエリ分岐するため正しい依存 | OK |

### 第2段階：影響範囲のテスト

| # | テスト区分 | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|---|
| 17 | 影響範囲 | StatusCheckbox → handleStatusChange（タスク一覧） | タスク一覧で StatusCheckbox をクリックしてステータス変更 | onChange コールバック経由で handleStatusChange が正常に呼ばれ、楽観的更新 + DB更新が実行される | `TaskList.js:584-586` — `onChange={(newCode) => onStatusChange(task.id, newCode)}`。関数シグネチャ・呼び出しパターン変更なし。catch にトースト追加のみで正常パスに影響なし | OK |
| 18 | 影響範囲 | ステータスselect → handleStatusChange（タスク一覧） | タスク一覧のステータスドロップダウンで変更 | select onChange 経由で handleStatusChange が正常動作 | `TaskList.js:622` — `onChange={e => onStatusChange(task.id, e.target.value)}`。正常パスに変更なし | OK |
| 19 | 影響範囲 | StatusCheckbox → handleStatusChange（今日やる） | 今日やる画面で StatusCheckbox をクリック | handleStatusChange(taskId, newCode, isRoutine) が正常動作 | `today/page.js:470-471` — `onChange={(newCode) => handleStatusChange(task.id, newCode, isRoutine)}`。正常パスに変更なし | OK |
| 20 | 影響範囲 | ステータスselect → handleStatusChange（今日やる） | 今日やる画面のステータスドロップダウンで変更 | handleStatusChange(taskId, value, false) が正常動作 | `today/page.js:503` — `onChange={e => handleStatusChange(task.id, e.target.value, false)}`。正常パスに変更なし | OK |
| 21 | 影響範囲 | タスク一覧からの編集モーダル表示 | タスク一覧でタスクカードをクリック→編集モーダル | TaskEditModal に task オブジェクト（id, parent_id 含む全カラム）が渡され、正常にレンダリング | `TaskList.js:370` — `editingTask`（fetchTasks で取得した task オブジェクト）を渡す。task.parent_id は DB の `parent_id` カラム（null or integer）。useEffect 依存配列変更の影響なし | OK |
| 22 | 影響範囲 | 今日やるからの編集モーダル表示 | 今日やる画面でタスク名クリック→編集モーダル | TaskEditModal が正常にレンダリング。ルーティンは編集対象外 | `today/page.js:481-483` — `if (!isRoutine) setEditingTask(task)`。タスクオブジェクトは `t.*` SELECT で parent_id 含む。ルーティンは guard で除外 | OK |
| 23 | 影響範囲 | タスク一覧ページの TaskInput | タスク一覧ページ上部のタスク追加フォーム | placeholder="未設定"、rows="3" で正常レンダリング。predefinedParentId なしで親候補ドロップダウン表示 | `tasks/page.js:20` — `<TaskInput onTaskAdded={...} />`。cosmetic変更のみで動作への影響なし | OK |
| 24 | 影響範囲 | 子タスクインライン追加の TaskInput | タスク一覧で「＋」ボタンから子タスク追加 | predefinedParentId が設定されており、親候補ドロップダウンは非表示。placeholder と rows の変更は正常 | `TaskList.js:638` — `<TaskInput onTaskAdded={...} predefinedParentId={task.id} />`。predefinedParentId ガード（TaskInput.js:30）により親候補クエリは実行されず影響なし | OK |
| 25 | 影響範囲 | FABモーダルの TaskInput | layout.js の FABボタンから新規タスク追加 | FABモーダル内で TaskInput が正常レンダリング。`.fab-modal .task-input-wrapper` CSS オーバーライド（layout.js:341-354）が引き続き適用 | `layout.js:214-219` — `<TaskInput onTaskAdded={...} />`。TaskInput の外観変更は placeholder と rows のみ。FABモーダルのCSSオーバーライドは border, shadow, padding, background に限定されており、rows・placeholder には干渉しない | OK |
| 26 | 影響範囲 | トーストリスナー（layout.js） | エラートースト dispatch が正常に受信・表示される | layout.js のグローバルトーストリスナーが `yarukoto:toast` イベントを受信し、3秒後に自動消去 | `layout.js:46-53` — `handleToast` リスナーは `e.detail` から `{message, type}` を取得。`type: 'error'` の場合 `.toast-err` クラス適用（行229）。今回追加されたトーストの payload は既存パターン（`{message: string, type: 'error'}`) と一致 | OK |
| 27 | 影響範囲 | BUG-4 親タスク削除時の子タスク独立 | 親タスクを削除 | 子タスクの parent_id が NULL 化され独立する（CASCADE は発動しない） | `TaskList.js:140-142` — `UPDATE tasks SET parent_id = NULL WHERE parent_id = $1` + `DELETE FROM tasks WHERE id = $1`。今回の変更は handleStatusChange の catch のみで、handleDelete は未変更 | OK |
| 28 | 影響範囲 | BUG-6 2階層制限バリデーション | 子タスクを持つタスクに親タスクを設定しようとする | 編集モーダルで select が disabled、handleSave で DB 側バリデーションが拒否 | `TaskEditModal.js:199` — `disabled={hasChildren \|\| parentOptions.length === 0}`。`TaskEditModal.js:70-82` — BUG-6 バリデーション。これらのコード行は今回未変更 | OK |
| 29 | 影響範囲 | IMP-12 着手中→未着手戻し | 着手中タスクにホバー→↩ボタンクリック | ステータスが未着手(1)に遷移 | `StatusCheckbox.js` は今回未変更。handleStatusChange の正常パス（newStatusCode=1）は変更なし。catch のトースト追加は正常パスに影響しない | OK |
| 30 | 影響範囲 | ENH-6 完了日即時UI反映 | タスクを完了(3)にする | リロードなしで完了日が即座に表示 | `TaskList.js:114-119` / `today/page.js:275-280` の楽観的更新ロジックは未変更。catch のトースト追加は正常パスに影響しない | OK |
| 31 | 影響範囲 | DnD（タスクのネスト/アンネスト） | タスクをドラッグ&ドロップで子タスク化/独立化 | DnD 操作が正常に動作し、parent_id の更新とタグ継承が機能する | `TaskList.js:166-249` — handleDragEnd は今回未変更。handleStatusChange への変更とは無関係 | OK |
| 32 | 影響範囲 | タグ継承（DnD時） | タグ継承設定ONで DnD ネスト | 親タスクのタグが子タスクに INSERT OR IGNORE で付与される | `TaskList.js:221-244` — タグ継承ロジックは今回未変更 | OK |
| 33 | 影響範囲 | ダッシュボード | ダッシュボード画面を表示 | 完了率リング、7日間チャート、ステータス分布が正常表示 | `dashboard/page.js` は DB から直接 SELECT。今回の変更（UI/エラーハンドリング/CSSのみ）はダッシュボードのデータ取得に影響なし | OK |

### 結果サマリー

- **直接テスト**: 16件 / 全件 OK
- **影響範囲テスト**: 17件 / 全件 OK
- **合計**: 33件 / 全件 OK / NG: 0件
