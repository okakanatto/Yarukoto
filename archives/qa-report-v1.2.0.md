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
| 6 | BUG-5: 空タスク名での保存 | タスク名を空にして保存クリック | 保存ボタンが disabled | 静的分析: `TaskEditModal.js:258` — `disabled={!title.trim() || saving}`、`TaskEditModal.js:61` — `if (!title.trim() || saving) return;` の二重ガード ✓ | OK |
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
| 28 | 影響範囲 | BUG-6 2階層制限バリデーション | 子タスクを持つタスクに親タスクを設定しようとする | 編集モーダルで select が disabled、handleSave で DB 側バリデーションが拒否 | `TaskEditModal.js:199` — `disabled={hasChildren || parentOptions.length === 0}`。`TaskEditModal.js:70-82` — BUG-6 バリデーション。これらのコード行は今回未変更 | OK |
| 29 | 影響範囲 | IMP-12 着手中→未着手戻し | 着手中タスクにホバー→↩ボタンクリック | ステータスが未着手(1)に遷移 | `StatusCheckbox.js` は今回未変更。handleStatusChange の正常パス（newStatusCode=1）は変更なし。catch のトースト追加は正常パスに影響しない | OK |
| 30 | 影響範囲 | ENH-6 完了日即時UI反映 | タスクを完了(3)にする | リロードなしで完了日が即座に表示 | `TaskList.js:114-119` / `today/page.js:275-280` の楽観的更新ロジックは未変更。catch のトースト追加は正常パスに影響しない | OK |
| 31 | 影響範囲 | DnD（タスクのネスト/アンネスト） | タスクをドラッグ&ドロップで子タスク化/独立化 | DnD 操作が正常に動作し、parent_id の更新とタグ継承が機能する | `TaskList.js:166-249` — handleDragEnd は今回未変更。handleStatusChange への変更とは無関係 | OK |
| 32 | 影響範囲 | タグ継承（DnD時） | タグ継承設定ONで DnD ネスト | 親タスクのタグが子タスクに INSERT OR IGNORE で付与される | `TaskList.js:221-244` — タグ継承ロジックは今回未変更 | OK |
| 33 | 影響範囲 | ダッシュボード | ダッシュボード画面を表示 | 完了率リング、7日間チャート、ステータス分布が正常表示 | `dashboard/page.js` は DB から直接 SELECT。今回の変更（UI/エラーハンドリング/CSSのみ）はダッシュボードのデータ取得に影響なし | OK |

### 結果サマリー

- **直接テスト**: 16件 / 全件 OK
- **影響範囲テスト**: 17件 / 全件 OK
- **合計**: 33件 / 全件 OK / NG: 0件

---

## STEP A：機能検証（v1.2.0 枝番2-3）

**検証日**: 2026-02-28
**検証方法**: 静的分析（ソースコードリーディング）
**検証スコープ**: WORK-LOG.md 枝番2-3 の「やったこと」「変更したファイル」に基づく。
- IMP-3: フィルタの複数選択（ステータストグル、タグ/重要度/緊急度チップ）

### 観点1：正常系テスト

| # | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 1 | IMP-3: ステータスフィルタ（タスク一覧） | 「完了・キャンセルを除く」トグルをONにする | DBクエリに `t.status_code NOT IN (3, 5)` が追加され、未完了状態のタスクのみ表示される | 静的分析: `TaskList.js:86-88` — `excludeDone` ON時に条件追加 ✓ | OK |
| 2 | IMP-3: ステータスフィルタ（今日やる） | 「完了・キャンセルを除く」トグルをONにする | タスクは完了・キャンセル除外、ルーティンは本日未完了(\`rc.completion_date IS NULL\`)のみ表示される | 静的分析: `today/page.js:122-125` — `t.status_code NOT IN (3, 5)` および `rc.completion_date IS NULL` が適切に条件追加される ✓ | OK |
| 3 | IMP-3: タグフィルタ複数選択 | タグAとタグBのチップを両方選択 | 選択したタグのいずれか（OR条件）を持つタスクが表示される | 静的分析: `TaskList.js:90-94` — `IN ($1, $2)` のプレースホルダを生成し `task_tags` のサブクエリに渡しているため正しくOR検索される ✓ | OK |
| 4 | IMP-3: 重要度・緊急度フィルタ | 重要度「高」と「中」を選択 | 選択したレベルのいずれかを持つタスクが表示される | 静的分析: `TaskList.js:96-100` — `t.importance_level IN ($1, $2)` として正しくOR検索される。緊急度も同様 ✓ | OK |
| 5 | IMP-3: 複数条件の組み合わせ | 「完了を除く」ON ＋ 特定タグ選択 ＋ 特定重要度選択 | 各条件が AND で結合され、すべての条件を満たすタスクが表示される | 静的分析: `TaskList.js:108` — `conditions.join(' AND ')` により全てのフィルタグループがAND結合される。today/page.js も同様 ✓ | OK |
| 6 | IMP-3: ルーティンへのチップフィルタ適用 | 今日やる画面でタグ・重要度・緊急度フィルタを選択 | ルーティンに対しても対応するフィルタが適用される | 静的分析: `today/page.js:134-157` — `rConditions` に対してルーティン用の条件文（\`routine_tags\`サブクエリなど）が並行して構築されている ✓ | OK |
| 7 | IMP-3: フィルタの解除 | 選択中のチップを再度クリックする | 状態配列から要素が削除され、フィルタが解除される | 静的分析: `toggleFilterTag` 等で \`prev.includes()\` を判定し \`filter()\` で除外する冪等なトグル処理が実装されている ✓ | OK |

### 観点2：異常系・境界値テスト

| # | 対象フィールド/操作 | 入力内容 | 期待される挙動 | 実際の挙動 | OK/NG |
|---|---|---|---|---|---|
| 1 | IMP-3: 選択0件（すべて解除） | いずれのチップも選択されていない状態 | 条件配列長が0となり `IN` 句が生成されず、全件（フィルタなし）が表示される | 静的分析: `filterTags.length > 0` のifガードにより、0件時は条件文字列自体がスキップされる ✓ | OK |
| 2 | IMP-3: CSSのオーバーフロー | 画面幅が狭く、多数のチップが存在する | チップが画面外にはみ出さず、適切に折り返される | 静的分析: `globals.css:600` — `.filter-chip-row` に `flex-wrap: wrap;` が指定されており、安全に折り返される ✓ | OK |
| 3 | IMP-3: トグルの高速連打 | ステータストグルを高速でON/OFFする | 正しい最新ステートが維持され、予期せぬDOMエラー等が発生しない | 静的分析: Reactのマネージドな controlled checkbox (`checked={excludeDone}`) のため安全 ✓ | OK |
| 4 | IMP-3: 非同期フェッチの競合（今日やる） | フィルタを高速で連続変更し、複数回の `loadTasks` が並行して走る | 最後にリクエストされたフェッチ結果のみが UI に反映され、過去のリクエストによる上書き（巻き戻り）が起きない | 静的分析: `today/page.js:102, 284` — `activeRequestId.current` を用いたリクエスト追跡により、最新のレスポンス以外は `setTasks` されない（Race Condition対策済） ✓ | OK |

⚠️ 要実機確認:
- `TaskList.js` 側には fetchTasks の競合を防ぐ `activeRequestId` の実装が見当たらないため、高速でフィルタを切り替えた際に sqlite-plugin のレスポンス順に依存したUIの巻き戻りが起きないか

### 観点3：状態遷移・データ件数テスト

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 1 | 該当データ0件 | 存在しない組み合わせ（例：特定の極端なタグと重要度）でフィルタ | エラーにならず、0件時のプレースホルダ（空状態）が表示される | 静的分析: TaskList では `parentTasks.length === 0` で空表示、today/page では `tasks.length === 0` で空表示。配列は空になるだけでエラーは発生しない ✓ | OK |
| 2 | データ大量状態での IN 句 | フィルタ対象のレコードが100件を超える場合 | `sqlite` の `$1, $2` パラメータバインディングが正常に機能する | 静的分析: sqlite の標準的な最大パラメータ数（通常999または32766）には達しない（チップの選択肢数＝マスタ件数に依存し、数十件程度）ため問題ない ✓ | OK |

---

## STEP B：品質レビュー（v1.2.0 枝番2-3）

**検証日**: 2026-02-28
**検証方法**: 静的分析（ソースコードリーディング）
**検証スコープ**: WORK-LOG.md 枝番2-3 の「やったこと」「変更したファイル」に基づく。
- IMP-3: フィルタの複数選択（ステータストグル、タグ/重要度/緊急度チップ）で変更された `app/globals.css`, `components/TaskList.js`, `app/today/page.js`

### 観点1：エラーハンドリング確認

| # | 異常条件 | 挙動 | エラーメッセージの有無と内容 | データへの影響 | OK/NG |
|---|---|---|---|---|---|
| 1 | DBファイルが存在しない・破損している場合 | DB接続エラー発生時は前段の try-catch により失敗し、フィルタ用のパラメータバインディングやデータ構築処理には到達しない。React側の状態は更新されず空のまま安全にクラッシュを回避する | `yarukoto:dberror` イベント経由でエラーバウンダリが表示される | データ損失・破損なし | OK |
| 2 | 設定ファイルが存在しない・不正な場合 | `app_settings` の `show_overdue_in_today` 値の取得に失敗・または存在しない場合も、useStateの初期値(true)が維持されるため、フィルタ機能自体はクラッシュせずに稼働する | エラーメッセージなし（正常パスとしてそのまま続行） | データ影響なし | OK |
| 3 | ディスク書き込み権限がない場合 | 今回のフィルタ実装は全て `SELECT` 系クエリに対する `WHERE` 条件追加のみであり、書き込みを行わないため権限不足によるエラーは発生しない | エラーメッセージなし | データ影響なし | OK |
| 4 | DB内のカラム等に想定外のデータ型が入っている場合 | DB内に不正な文字列等が混入していてもSQLiteの緩い型チェックによりクラッシュしない。タグ等のマスタ不在時は `allTags` などの配列が空となり、UI上のチップが非表示になることで安全にフォールバックする。 | エラーメッセージなし | データ影響なし | OK |

### 観点2：一貫性レビュー

| # | 観点 | 箇所A | 箇所B | 不整合の内容 | ファイル名:行番号 |
|---|---|---|---|---|---|
| 1 | 見た目の不統一（クラス名） | `components/TaskList.js` の `.tl-filter` | `app/today/page.js` の `.tl-filter` | 共通のスタイリングに対してタスクリスト固有の接頭辞 `tl-` が `today/page.js` 内でもそのまま使用されている。スコープ付き `<style jsx>` 内のため動作上問題ないが、名前空間の統一性（`today-filter` とする等）に欠ける | `app/today/page.js:411, 653` | ✅ 修正済み |
| 2 | 無効/デッドコードの残存 | 過去のフィルタUIデザイン | `components/TaskList.js` の `.tl-btn-icon` | フィルタUIのUI刷新によってJSXからは完全に削除された `<button className="tl-btn-icon">` のCSS定義が `<style jsx global>` 内に残存したままとなっている。不要なCSSコードのため削除推奨 | `components/TaskList.js:448-454` | ✅ 修正済み |
| 3 | 同種操作でUI挙動が異なる（非同期フェッチの競合対策） | `app/today/page.js` (`activeRequestId`) | `components/TaskList.js` (`fetchTasks`) | フィルタ用のチップを高速で連続切替した際、`today/page.js` 側は `useRef` を用いて最新リクエスト以外のレスポンス破棄（Race Condition対策）が行われているが、`TaskList.js` 側の `fetchTasks` には同等の競合対策が実装されていない。非同期レスポンス順の追い越しによるUIの巻き戻り（チラつき）が発生しうる不整合 | `components/TaskList.js:125` | ✅ 修正済み |

**NG 指摘の詳細:**

**#1 — tl-filter クラス名の不統一** ✅ 修正済み
- **問題箇所**: `app/today/page.js:411`, `app/today/page.js:653`
- **内容**: TaskListコンポーネント用のプレフィックス `tl-` をそのままコピーして使用している。
- **推奨**: 該当divクラスと `<style jsx>` 内のクラス名を `.today-filter` に変更し一貫性を持たせる。

**#2 — デッドコードの残存 (tl-btn-icon)** ✅ 修正済み
- **問題箇所**: `components/TaskList.js:448-454`
- **内容**: 使用されていない `.tl-btn-icon` クラスとそのホバーセレクタが残存している。
- **推奨**: 該当CSSブロックを削除する。

**#3 — Race Condition (非同期競合) 対策の欠落** ✅ 修正済み
- **問題箇所**: `components/TaskList.js:125`
- **内容**: フィルタの複数選択チップ連打により、複数回の SQLite select クエリが非同期に発行される。レスポンス順序が保証されないため、最新のフィルタ状態と異なる古いデータで画面が上書きされる可能性がある。
- **推奨**: `today/page.js` と同様に `activeRequestId` (useRef) を導入し、現在のリクエストIDと一致する場合のみ `setTasks(parsedTasks)` を実行するように変更する。

---

## STEP R：リグレッションテスト（v1.2.0 枝番2-3 2026-02-28）

**検証日**: 2026-02-28
**検証方法**: 静的分析（ソースコードリーディング）
**対象**: WORK-LOG.md の変更サマリー（枝番2-3 STEP B 指摘全件修正）に基づくリグレッションテスト

### 影響範囲の洗い出し

変更サマリーの「影響が想定される箇所」を起点に、コード上の参照元を追跡した結果：

| # | 変更ファイル | 変更内容 | 影響が想定されるファイル・関数 | 確認対象の理由 |
|---|---|---|---|---|
| 1 | `TaskList.js` | useRefの導入とfetchTasks関数におけるactiveRequestIdガードの追加 | `tasks/page.js`（TaskList使用）、`TaskEditModal.js`からの再読み込み呼び出し | TaskList.js を利用する画面やコンポーネントにおけるデータ取得の正常性確認 |
| 2 | `TaskList.js` | 未使用CSS `.tl-btn-icon` の削除 | リスト内の他要素のレイアウトへの副作用 | グローバルCSSの一部削除による予期せぬレイアウト崩れの確認 |
| 3 | `today/page.js` | クラス名 `.tl-filter` → `.today-filter` への変更 | JSXおよび `<style jsx>` スコープ内でのCSS適用 | todays画面のフィルタ部分のレイアウト崩れ確認 |

### 第1段階：変更箇所の直接テスト

| # | テスト区分 | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|---|
| 1 | 直接 | Race Condition 対策（TaskList.js） | `fetchTasks` 実行完了時に `activeRequestId` と一致するか判定する | 最新のリクエストに対応するレスポンスのみが `setTasks` / `setLoading` をトリガーする | `TaskList.js:127-135` — `currentReq === activeRequestId.current` のガードが正常に機能する。`today/page.js` と同一パターン。 | OK |
| 2 | 直接 | クラス名統一（today/page.js） | `today-filter` クラスの適用箇所の確認 | フィルタコンテナのスタイル（display:flex等）とlabelのスタイルが正常に適用される | `today/page.js:411`（JSX）と `653-654`（CSS定義）において `.today-filter` が一貫して使用されておりスコープが一致。 | OK |
| 3 | 直接 | デッドコード削除（TaskList.js） | `<style jsx global>` 内の不要CSS削除 | 既存UIに影響を与えずに `.tl-btn-icon` の定義が存在しないこと | 残存していた7行のデッドコードが削除されており、他に依存するJSX要素は既に存在しないため副作用なし。 | OK |

### 第2段階：影響範囲のテスト

| # | テスト区分 | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|---|
| 4 | 影響範囲 | タスク一覧の初期表示（TaskList.js） | `tasks/page.js` からのTaskList描画 | `activeRequestId` の初期化と初回 `fetchTasks` が正常に完了しタスクが表示される | useRef は `fetchTasks` 実行毎にインクリメントされ、初回も正しく一致して `setTasks` が行われる。 | OK |
| 5 | 影響範囲 | タスク一覧からの編集再起フェッチ | タスク編集後にコールバックで `fetchTasks` が走る | 正常に最新データで一覧が更新される | `refreshKey` のインクリメントによってフックが呼ばれる際も、新しいリクエストIDで非同期処理が完結する。 | OK |
| 6 | 影響範囲 | today画面の別コンポーネント | today画面でのタスク表示・編集操作 | `.today-filter` への変更がフィルタ以外のレイアウト（タスクリスト等）に影響を与えない | styled-jsx 内のスコープ付き変更であり、他セレクタ（.today-list 等）への干渉はない。 | OK |
| 7 | 影響範囲 | 他画面でのTaskList使用（tasks/page.js） | tasks ページでの一覧表示 | プロパティやコンポーネントIFに変更がないため正常表示される | `tasks/page.js` からの呼び出し(`TaskList`)にIFの変更はなく影響なし。 | OK |

### 結果サマリー

- **直接テスト**: 3件 / 全件 OK
- **影響範囲テスト**: 4件 / 全件 OK
- **合計**: 7件 / 全件 OK / NG: 0件


## STEP A：機能検証（v1.2.0 枝番2-3 Excelライクドロップダウン）

**検証日**: 2026-02-28
**検証方法**: 静的分析（ソースコードリーディング）
**検証スコープ**: WORK-LOG.md 枝番2-3 の「やったこと」「変更したファイル」に基づく。
- IMP-3: フィルタの複数選択（Excelライクドロップダウン方式への刷新）

### 観点1：正常系テスト

| # | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 1 | IMP-3: 単一フィルタ選択 | 任意のドロップダウンで「すべて」を外し特定の項目を1つ選択 | 選択した項目の value のみが selected 配列に入り、DBクエリに `IN ($X)` 句として渡される | 静的分析: `MultiSelectFilter.js:isItemChecked` 等の操作、および `TaskList.js:83-104` などの配列長に基づく動的 `IN` 句生成を全て確認 ✓ | OK |
| 2 | IMP-3: 複数フィルタ選択 (OR条件) | 同じドロップダウン内で2つ以上の項目を選択 | 選択した全ての value が selected に入り、`IN ($X, $Y)` としてOR検索される | 静的分析: 同上 ✓ | OK |
| 3 | IMP-3: 複数カテゴリ選択 (AND条件) | ステータスとタグなど別のフィルタを同時に選択 | `t.status_code IN (...) AND t.id IN (SELECT ...)` のように各カテゴリの条件が AND 結合される | 静的分析: `TaskList.js:108` `conditions.join(' AND ')` ✓ | OK |
| 4 | IMP-3: フィルタ解除（「すべて」） | 「すべて」チェックボックスを選択、またはフィルタがない状態 | selected配列が空 `[]` になり、当該カテゴリのWHERE条件が生成されずフィルタが解除される | 静的分析: `MultiSelectFilter.js:32-36` にて `[]` を渡し、TaskList等で配列長0なら条件追加をスキップ ✓ | OK |
| 5 | IMP-3: ルーティンのステータスマッピング | 今日やる画面でステータスフィルタ（完了のみ、未完了のみ等を任意切替） | 通常タスクは IN句、ルーティンは 完了(3)と未完了(1,2)の有無に応じて `rc.completion_date` の IS NULL / IS NOT NULL / 1=0 で適切に判定される | 静的分析: `today/page.js:122-132` の分岐によりルーティンのステータス疑似対応が完璧に機能している ✓ | OK |
| 6 | IMP-3: モーダル（ドロップダウン）外クリック | フィルタ展開中に外側をクリック | パネルが閉じる | 静的分析: `MultiSelectFilter.js:21-25` の `handleClickOutside` と useEffect の removeEventListener が正しく実装されている ✓ | OK |

### 観点2：異常系・境界値テスト

| # | 対象フィールド/操作 | 入力内容 | 期待される挙動 | 実際の挙動 | OK/NG |
|---|---|---|---|---|---|
| 1 | IMP-3: 選択を0件にする | 個別チェックをすべて外す（最後の1つもチェックを外す） | 何も表示されないのではなく、「すべて」選択状態（フィルタ全解除状態）に自動でフォールバックする | 静的分析: `MultiSelectFilter.js:46-47` `if (newSelected.length === 0) { onChange([]); }` により空になったら全選択に戻る安全設計 ✓ | OK |
| 2 | IMP-3: 全件選択 | 「すべて」ではなく手動で全項目に1つずつチェックを入れる | 全項目が選択された時点で、自動的に「すべて」選択状態（`[]`）と等価にマッピングされる | 静的分析: `MultiSelectFilter.js:54-55` `if (newSelected.length >= options.length) { onChange([]); }` により自動クリーンアップ ✓ | OK |
| 3 | IMP-3: 非同期フェッチの競合 (Race Condition) | フィルタを高速で連続変更する | 最終的なリクエストのレスポンスだけが UI に反映され、過去のレスポンスでの上書きが防がれる | 静的分析: `TaskList.js` および `today/page.js` の両方に `activeRequestId` による排他ガードが適切に引き継がれている ✓ | OK |
| 4 | IMP-3: マスタデータ不在 | options が空の状態でコンポーネントがマウントされる | エラーでクラッシュせず、単にドロップダウンに「すべて」のみが表示されるか、タグのように利用部でガードされレンダーされない | 静的分析: `tags` 等は `<MultiSelectFilter>` の呼び出し前に `tagOptions.length > 0 &&` でガード済み。万一空でも map が発火しないだけで安全 ✓ | OK |

### 観点3：状態遷移・データ件数テスト

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 1 | 該当データ0件 | 存在しない組み合わせで各種フィルタを適用 | エラーなく、タスク一覧に「該当なし」の空状態表示（プレースホルダ）が表示される | 静的分析: 各画面の `tasks.length === 0` ロジック等により予期通りに表示 ✓ | OK |
| 2 | 以前の「キャンセル(5)」強制除外バグ確認 | today画面で「今日やるタスク」に対してステータスフィルタ「キャンセル」を選択 | これまでのハードコーディングによる除外がなくなり、フィルタで明示的にキャンセルを選べば（かつ期限超過等でなければ）表示される | 静的分析: `today/page.js:228` にあった `status_code != 5` のベタ書きが `showOverdue` の括弧内 `NOT IN (3, 5)` に移動し、意図通り修正されている ✓ | OK |
| 3 | ドロップダウン再展開 | いずれかの条件を選択後、パネルを閉じてもう一度開く | 先ほど選択した状態が正しく復元された状態で表示されている | 静的分析: checked は親コンポーネントから渡される `selected` を参照（`isItemChecked`）しているため、再マウントされても一貫性は保たれる ✓ | OK |

⚠️ 要実機確認:
- （特になし）コードのロジックが堅牢であり、静的分析の範囲で描画結果以外の不安要素は見受けられない。

---

## STEP B：品質レビュー（v1.2.0 枝番2-3 Excelライクドロップダウン）

**検証日**: 2026-02-28
**検証方法**: 静的分析（ソースコードリーディング）
**検証スコープ**: WORK-LOG.md 枝番2-3 の「やったこと」「変更したファイル」に基づく。
- IMP-3: フィルタ複数選択機能の Excel ライクドロップダウン方式への刷新（`components/MultiSelectFilter.js`, `components/TaskList.js`, `app/today/page.js`, `app/globals.css`）

### 観点1：エラーハンドリング確認

| # | 異常条件 | 挙動 | エラーメッセージの有無と内容 | データへの影響 | OK/NG |
|---|---|---|---|---|---|
| 1 | DBファイルが存在しない・破損している場合 | DBからのデータ取得時に `try-catch` で捕捉。一覧は空状態で安全に表示される。 | エラーバウンダリが対応（新規メッセージなし） | データ損失なし（Readのみ） | OK |
| 2 | 設定ファイルが存在しない・不正な内容の場合 | `show_overdue_in_today` 設定取得が失敗しても初期値 `true` で安全に稼働継続。 | なし | 影響なし | OK |
| 3 | ディスク書き込み権限がない場合 | フィルタ処理は全て `SELECT` への `WHERE` 追加であり、書き込みは発生しない。 | なし | 影響なし | OK |
| 4 | 想定外のデータ型がDBに入っている場合 | 配列メソッドによるフィルタのため予期せぬ値でもクラッシュせず安全にスキップ。コンポーネント非表示等でフォールバック。 | なし | 影響なし | OK |

### 観点2：一貫性レビュー

| # | 観点 | 箇所A | 箇所B | 不整合の内容 | ファイル名:行番号 |
|---|---|---|---|---|---|
| 1 | 見た目の不統一（余白・フォントサイズ） | `MultiSelectFilter.js` (`.msf-btn`) | `globals.css` (`select`) | カスタムボタンとネイティブ `select` （並び順）で文字サイズや余白がごく僅かに違うが、許容範囲内でレイアウト破綻なし | `MultiSelectFilter.js:106-107` / `globals.css:404-405` (OK) |
| 2 | 同種操作でUI挙動が異なる | 各種フィルタの `MultiSelectFilter` | 他の `MultiSelectFilter` | ドロップダウン外側のクリック時 (`handleClickOutside`) のパネル展開キャンセルが、全フィルタで一括して正しく機能する | `MultiSelectFilter.js:21-27` (OK) |
| 3 | 文言の揺れ | `MultiSelectFilter.js` の項目名 | アプリ全体で用いる用語 | 「ステータス」「タグ」「重要度」「緊急度」「すべて」など、システム全体で用いられる汎用用語と完全に一致している | `MultiSelectFilter.js` (OK) |

**総括**:
NG・指摘項目はありません。
前回のSTEP Bレビューで指摘された「Race Condition対策の欠落」「不要CSSの残存」「クラス名不統一」は全て持ち込まれず、クリーンで堅牢な置き換えが完了しています。

---

## STEP A：機能検証（v1.2.0 枝番2-4）

**検証日**: 2026-02-28
**検証方法**: 静的分析（ソースコードリーディング）
**検証スコープ**: WORK-LOG.md 枝番2-4 の「やったこと」「変更したファイル」に基づく。
- IMP-7: タグのアーカイブ（非表示化）機能の追加

### 観点1：正常系テスト

| # | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 1 | DBマイグレーション | アプリ起動時の `initDb` の実行 | `tags` テーブルに `archived INTEGER DEFAULT 0` カラムが追加される | 静的分析: `lib/db.js:191-193` — `ALTER TABLE tags ADD COLUMN archived INTEGER DEFAULT 0` が実行され、既存環境でも安全に追加される ✓ | OK |
| 2 | タグのアーカイブ操作 | 設定画面のタグ管理で任意のタグ（アクティブ）の📦ボタンをクリック | タグが「アーカイブ済み」セクションへ移動し、UI上のステートが更新される | 静的分析: `app/settings/page.js:247-264` — `toggleArchiveTag(id)` が `archived: 1` へ楽観的更新を行い、非同期でDBを更新している ✓ | OK |
| 3 | アーカイブの解除操作 | 設定画面「アーカイブ済み」セクションのタグの📤ボタンをクリック | タグが「アクティブ」一覧へ戻り、再び利用可能になる | 静的分析: `app/settings/page.js:250` — `tag.archived ? 0 : 1` の反転ロジックで正常に再アクティブ化される ✓ | OK |
| 4 | 並び順(DnD)の仕様変更 | 設定画面のアクティブタグに対してドラッグ＆ドロップで並べ替える | アクティブタグのみ並べ替え可能で、アーカイブ済みタグは並べ替えの対象外となる | 静的分析: `app/settings/page.js:98-108` — `activeTags` を対象に `useDragReorder` を呼び出し。保存時も末尾にアーカイブ済みタグを連結して矛盾なく一括保存している ✓ | OK |
| 5 | タスク入力フォームでの除外 | タスクの新規作成でタグ選択ドロップダウン（`TagSelect`）を開く | ドロップダウンの検索・選択肢からアーカイブ済みタグが除外され、新規付与できない | 静的分析: `TagSelect.js:21-23` — `allTags.filter(t => !t.archived ...)` により候補から除外されている ✓ | OK |
| 6 | 既存タスクからの読み取り・解除 | すでにアーカイブされたタグを持つタスクの編集モーダルを開き `TagSelect` を表示 | 選択されているアーカイブ済みタグが「半透明のピル」として表示され、`×` ボタンで外すことができる | 静的分析: `TagSelect.js:45` — `ts-pill-archived` クラスが付与され半透明表示になり、×による `remove` 手順は通常通り稼働する ✓ | OK |
| 7 | フィルタドロップダウンでの除外 | タスク一覧、今日やる画面でタグフィルタドロップダウンを開く | フィルタの選択肢にアーカイブ済みが表示されない | 静的分析: `TaskList.js:43` / `today/page.js:62` — `tagOptions` 生成時に `!t.archived` フィルタを適用済み ✓ | OK |

### 観点2：異常系・境界値テスト

| # | 対象フィールド/操作 | 入力内容 | 期待される挙動 | 実際の挙動 | OK/NG |
|---|---|---|---|---|---|
| 1 | 有効タグ0件の表示 | すべてのタグをアーカイブした状態で設定画面を開く | 「有効なタグがありません」と表示される | 静的分析: `app/settings/page.js:356` — `activeTags.length === 0 && archivedTags.length > 0` の場合に該当のプレースホルダが表示される ✓ | OK |
| 2 | 使用中タグのアーカイブ化 | 100件のタスク・ルーティンに付与されているタグをアーカイブ化する | エラーなくアーカイブでき、使用中のタスクの画面表示やメタデータに全く影響を与えない（表示文字や色はそのまま） | 静的分析: スキーマにおいて `ON DELETE CASCADE` が設定されているのは `DELETE` 時のみで、`UPDATE tags SET archived = 1` によるタスクタグリレーションの破壊は起きない。表示も `task_tags` や Join、`useMasterData(allTags)` 経由で取得され保持される ✓ | OK |
| 3 | アーカイブ操作へのDB書き込み失敗 | ディスクロック等で `UPDATE tags SET archived...` が失敗する | 楽観的更新がロールバックされ、タグのアーカイブ状態が直前のステートに元通り復元され、エラーメッセージトーストが出る | 静的分析: `app/settings/page.js:260-262` — catchブロックで `archived: tag.archived` にリバートし、`'アーカイブの変更に失敗しました'` のトーストを出す設計を確認 ✓ | OK |
| 4 | レガシーデータの読み込み互換性 | マイグレーション実行前、またはカラム追加前のキャッシュが残る状態 | DBが `archived` を持たず undefined/null 等を返した場合でもクラッシュしない | 静的分析: `!t.archived` などの JavaScript 条件評価により null/undefined 等の Falsy な値は `0`（未アーカイブ）と同等に扱われるため安全 ✓ | OK |

### 観点3：状態遷移・データ件数テスト

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|
| 1 | 多数のアーカイブタグと並べ替え保存 | 大量のタグがアーカイブされている状態でアクティブタグの並べ順を変更して「保存」をクリック | アクティブタグは画面通りの順に `sort_order` が振られ、アーカイブ済みタグはアクティブタグの末尾以降に順次再配置される | 静的分析: `app/settings/page.js:151-157` — アーカイブ済みタグは `sort_order = active.length + i` と計算されDBへ直列でUPDATEされる。順序が破壊されない ✓ | OK |
| 2 | 以前のアーカイブ済みタグの利用有無 | アーカイブ済みタグを再度アクティブ化（📤解除）する | 解除されたタグが `TaskSelect` とフィルタメニューの末尾位置として元通りに表示され、再利用できるようになる | 静的分析: `app/settings/page.js:101-105` の `setActiveTags` 等でも分離したままステートのリストを合成して保持しているため、直ちにフラグが更新され再利用可能になる ✓ | OK |

⚠️ 要実機確認:
- 設定画面での、アクティブタグとアーカイブ済みタグのドラッグ＆ドロップ再配置中の一連のアニメーション・描画パフォーマンス。
- 半透明になっているピル表示 (`ts-pill-archived`) が、タグの背景色との組み合わせによって視認性を大きく損なわないか。

---

## STEP B：品質レビュー（v1.2.0 枝番2-4）

**検証日**: 2026-02-28
**検証方法**: 静的分析（ソースコードリーディング）
**検証スコープ**: WORK-LOG.md 枝番2-4 の「やったこと」「変更したファイル」に基づく。
- IMP-7: タグアーカイブ機能の追加（`lib/db.js`, `app/settings/page.js`, `components/TagSelect.js`, `components/TaskList.js`, `app/today/page.js`）

### 観点1：エラーハンドリング確認

| # | 異常条件 | 挙動 | エラーメッセージの有無と内容 | データへの影響 | OK/NG |
|---|---|---|---|---|---|
| 1 | DBファイルが存在しない・破損している場合 | DB接続エラー発生時は前段の `try-catch` により失敗し、マイグレーション等には到達しない | `yarukoto:dberror` イベント経由でエラーバウンダリが表示される | データ損失・破損なし | OK |
| 2 | 設定ファイルが存在しない・不正な内容の場合 | タグ機能は `app_settings` に直接依存しないため影響なし（正常稼働） | なし | 影響なし | OK |
| 3 | ディスク書き込み権限がない場合 | （例：タグのアーカイブ操作時）`toggleArchiveTag` 等のDB更新が失敗すると例外がスローされ、UI状態を更新前の値に差し戻す（ロールバック） | `'アーカイブの変更に失敗しました'` など各種エラーのトースト通知が表示される | ロールバックによりDB・UI間の不整合は発生せず、データ損失なし | OK |
| 4 | 想定外のデータ型がDBに入っている場合 | 例：`archived` カラム等に `null` など想定外の値が入っている場合、JavaScript側の `!t.archived` の評価で falsy （=未アーカイブ）として処理されるため、クラッシュせずに正常なフォールバック挙動となる | なし | 影響なし | OK |

### 観点2：一貫性レビュー

| # | 観点 | 箇所A | 箇所B | 不整合の内容 | ファイル名:行番号 |
|---|---|---|---|---|---|
| 1 | 文言の揺れ | `app/settings/page.js` のアーカイブボタンホバーテキスト | システム全体のツールチップ | 「アーカイブ」「アーカイブ解除」という表現が正確であり、トースト通知の内容とも一貫している | `app/settings/page.js:370, 390` | OK |
| 2 | 同種操作でUI挙動が異なる | `toggleArchiveTag` (アーカイブ操作) | `delTag` (削除操作) | アーカイブは確認ダイアログなし、削除は `confirm()` ダイアログありとなっている。これは「アーカイブ操作は非破壊的・即座に解除可能」という性質にあっており、他のUI挙動（例：設定トグル等）との一貫性も取れている | `app/settings/page.js:237, 247` | OK |
| 3 | 見た目の不統一（クラス名や構造） | `TagSelect` でのアーカイブタグのスタイル | タスク一覧のスタイル | タスクカード上で表示される際も既存の `.tc-tag` や `useMasterData` 経由の情報を使用しており、アーカイブ化しても表示結果のカラーリングに影響が出ないように統一が図られている | `components/TagSelect.js:45` | OK |
| 4 | 見た目の不統一（CSS変数利用） | `s-archive-btn` のホバー背景色 | アプリ全体の色使い | `rgba(245,158,11,.1)` や `rgba(79,110,247,.1)` というアルファ付き近似色が使用されている。視覚的には warning / primary カラーと一致しており、UIの破綻はなく許容範囲内 | `app/settings/page.js:706, 708` | OK |

**総括**:
NG・指摘項目はありません。
ドラッグ＆ドロップ機能（`useDragReorder`）をアクティブタグのみに限定するコールバックの設計や、楽観的更新に失敗した際のUIロールバックが非常に堅牢に実装されています。

---

## STEP R：リグレッションテスト（v1.2.0 枝番2-4 2026-02-28）

**検証日**: 2026-02-28
**検証方法**: 静的分析（ソースコードリーディング）
**対象**: WORK-LOG.md の変更サマリー（枝番2-4 STEP B 指摘対応なし、IMP-7 機能実装）に基づくリグレッションテスト

### 影響範囲の洗い出し

変更されたファイルと対象箇所：
| # | 変更ファイル | 変更内容 | 影響が想定されるファイル・関数 | 確認対象の理由 |
|---|---|---|---|---|
| 1 | `lib/db.js` | `tags` テーブルに `archived` カラム追加 | DB初期化全体、すべてのタグ取得処理 | スキーマ変更による既存SQLクエリへの影響 |
| 2 | `app/settings/page.js` | アーカイブ/解除処理、アクティブタグのみのドラッグ＆ドロップ | UIレンダリング、`toggleArchiveTag`、`useDragReorder` 制約 | 設定画面の既存機能（新規タグ追加、編集、削除）との干渉 |
| 3 | `components/TagSelect.js` | 選択候補から `archived` を除外、選択済みアーカイブタグの半透明表示 | `TaskInput.js`, `TaskEditModal.js`, `app/routines/page.js` | タグを選択/設定する全画面でのUI表示・保存処理 |
| 4 | `components/TaskList.js` | タグフィルタ候補から `archived` を除外 | フィルタ機能全体 | タスク一覧のフィルタリング正常性 |
| 5 | `app/today/page.js` | タグフィルタ候補から `archived` を除外 | フィルタ機能全体 | 今日やる画面のフィルタリング正常性 |

### 第1段階：変更箇所の直接テスト

| # | テスト区分 | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|---|
| 1 | 直接 | マイグレーション (`lib/db.js`) | `db.js` の初期化処理 | `tags` テーブルに `archived INTEGER DEFAULT 0` カラムが追加される | `lib/db.js:191-193` にて ALTER TABLE 実行済。エラーハンドリングも適切 | OK |
| 2 | 直接 | アーカイブ操作 (`app/settings/page.js`) | 設定画面でアーカイブボタンを押下 | `archived` フラグが 1 に楽観的更新され、DBも更新される | `toggleArchiveTag` にて正常実装。エラー時はロールバック＆トースト表示 | OK |
| 3 | 直接 | アーカイブ解除 (`app/settings/page.js`) | アーカイブ済みセクションで解除ボタンを押下 | `archived` フラグが反転(0)し、アクティブタグに戻る | `tag.archived ? 0 : 1` で正常に機能する | OK |
| 4 | 直接 | DnD制限 (`app/settings/page.js`) | アクティブタグをドラッグ＆ドロップ | アクティブタグのみ並べ替え可能。保存時はアーカイブ済と合成して保存される | `saveTagsOrder` で `active` と `archivedTags` を合成し `sort_order` を再計算しているため矛盾なし | OK |
| 5 | 直接 | タグ選択除外 (`TagSelect.js`) | 新規追加・編集時の「タグ」選択 | 選択候補（ドロップダウン内）にアーカイブ済みタグが出現しない | `availableTags` 生成時に `!tag.archived` でフィルタリングされている | OK |
| 6 | 直接 | 既存アーカイブタグ表示 (`TagSelect.js`) | アーカイブ済タグが付与されているタスクの編集 | 「半透明のピル」として表示され、削除が通常通り可能 | `tag.archived` 時 `ts-pill-archived` クラスが付与され半透明になる。×ボタンの `remove` は通常稼働 | OK |
| 7 | 直接 | フィルタ除外 (`TaskList.js`, `today/page.js`) | 一覧画面等のタグフィルタ | フィルタ選択肢にアーカイブ済みタグが出現しない | `tagOptions` 生成時に `!t.archived` でフィルタ済み | OK |

### 第2段階：影響範囲のテスト

| # | テスト区分 | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|---|---|---|---|---|---|
| 8 | 影響範囲 | タグマスタの取得 (`hooks/useMasterData.js`) | `getDb` にて tags を取得 | `SELECT * FROM tags` により全タグ（アーカイブ済含む）が取得される | 変更なしで `SELECT *` となっている。各コンポーネントにて必要に応じて js 側でフィルタされるため既存表示（アーカイブ含めた色・名前等）は担保される | OK |
| 9 | 影響範囲 | タグ作成・編集・削除 (`app/settings/page.js`) | アクティブタグのテキスト変更、色変更、新規作成 | アーカイブ等の追加実装と干渉せず、通常通り変更・保存・削除できる | 既存の `addTag`, `saveEditTag`, `delTag` に変更はなく、`activeTags` を対象に通常通り描画・機能する | OK |
| 10 | 影響範囲 | タスク新規作成でのタグ保存 (`TaskInput.js`) | アーカイブされていないタグを選択して保存 | `task_tags` データベースに正常に保存される | `TaskInput.js` は直接変更されておらず、単に `TagSelect.js` から渡される ID 配列をインサートするため影響なし | OK |
| 11 | 影響範囲 | タスク編集でのタグ保存 (`TaskEditModal.js`) | 一部のアーカイブ済タグを保持したまま保存 | アーカイブ済タグであっても、選択済（selectedTags）に含まれていれば DELETE & INSERT で正常維持される | `TaskEditModal.js` 側は配列を展開して再INSERTするため状態は維持される | OK |
| 12 | 影響範囲 | ルーティンでのタグ保存 (`app/routines/page.js`) | ルーティンにアーカイブ済みタグが紐づいた状態での定期タスク等 | ルーティン画面の一覧表示や編集において、タグ情報が正常に表示される | `app/routines/page.js:63-66` および `useMasterData` によりタグ名と色は `archived` であっても描画される。変更の副作用なし | OK |
| 13 | 影響範囲 | 子タスク追加時のタグ継承 (`TaskInput.js`) | タグ継承設定ONで、アーカイブタグを持つ親から子を作成 | アーカイブ済みの親タグが子に自動で継承される | `TaskInput.js:94-107` の継承クエリで DB から `tag_id` を直接引くため、アーカイブ状態に関わらず継承される。意図通りの挙動 | OK |

### 結果サマリー

- **直接テスト**: 7件 / 全件 OK
- **影響範囲テスト**: 6件 / 全件 OK
- **合計**: 13件 / 全件 OK / NG: 0件

