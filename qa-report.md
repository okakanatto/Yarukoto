# QA Report

## STEP A：機能検証（v1.4.0 枝番4-1）

**検証対象**: BUG-7 アーカイブ処理の安定化
**検証方法**: コードリーディングベースの静的分析
**検証日**: 2026-03-01
**スコープ**:
- `hooks/useTaskActions.js` — handleArchive/handleRestore の楽観的更新・エラー回復・processingIds 追加、handleStatusChange の processingIds 追加
- `components/StatusCheckbox.js` — disabled prop 追加
- `components/TaskItem.js` — isProcessing prop 追加、各操作ボタンの disabled 制御
- `components/TaskList.js` — useTaskActions から processingIds を取得、TaskItem に isProcessing として伝播

### 観点1：正常系テスト

✅ OK: 13件 全件パス

### 観点2：異常系・境界値テスト

✅ OK: 10件 パス

| # | 対象フィールド/操作 | 入力内容 | 期待される挙動 | 実際の挙動 | OK/NG |
|---|---------------------|----------|----------------|------------|-------|
| 11 | 存在しないタスクIDで復元 | `getTasks()` で見つからないID | 早期 return が理想 | `handleRestore` (L135): `task=undefined`。`addProcessing` 実行 → 楽観的更新は `task && ...` ガードで安全 → DB操作もガードでスキップ → しかし L161 `UPDATE ... WHERE id=$1` は実行（存在しないIDならDBは無影響）→ トースト「復元しました」が誤表示。`handleArchive` には `if(!task) return` ガードがあるが `handleRestore` にはない（**NG-1**） | **NG** |

**NG-1: handleRestore で task が undefined の場合の早期 return ガード欠落** ✅ 修正済み

- **該当ファイル**: `hooks/useTaskActions.js:133-137`
- **再現手順**: [タスク一覧]画面のアーカイブ済みタブで、高速連打やDBリフレッシュ遅延等で `getTasks()` 内にないタスクIDが `handleRestore` に渡された場合（通常操作ではほぼ発生しない）
- **期待される挙動**: task が見つからない場合は早期 return し、不要なDB操作やトースト表示を行わない
- **実際の挙動**: `task=undefined` の場合も処理が続行され、L161 の `UPDATE tasks SET archived_at = NULL WHERE id = $1` が実行される（DBに該当IDがなければ影響なし）。また、トースト「復元しました」が誤表示される
- **原因の推定**: `handleArchive` (L78-79) には `if (!task) return;` の早期returnガードがあるが、`handleRestore` (L133-137) にはこのガードがない。L137 の `addProcessing(taskId)` の前に `if (!task) return;` を追加すべき
- **影響度**: 低。通常操作ではまず発生しないレースコンディション

### 観点3：状態遷移・データ件数テスト

✅ OK: 7件 パス

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|------------|----------|----------|------------|-------|
| 8 | 子タスクの個別操作中保護 | 子タスクのステータス変更中に同じ子タスクのアーカイブボタンをクリック | 子タスクのボタンがdisabledで押せない | **NG-2**: `processingIds.has(子ID)` は true だが、`TaskList.js` (L297) では `processingIds.has(親ID)` で判定し、そのまま子に伝播するため子タスク個別のdisabled制御が効かない | **NG** |

**NG-2: 子タスクの操作中保護が親タスクの processingIds で判定されるため、子タスク個別の保護が効かない** ✅ 修正済み

- **該当ファイル**: `components/TaskItem.js:162`、`components/TaskList.js:297`
- **再現手順**: [タスク一覧]画面で子タスクのステータスを変更（例：未着手→着手中）→ DB更新完了前に同じ子タスクのアーカイブボタン等をクリック
- **期待される挙動**: 子タスクのステータス変更中は、その子タスクのボタン類がdisabledになり操作できない
- **実際の挙動**: `handleStatusChange(子ID, newCode)` → `addProcessing(子ID)` → `processingIds = {子ID}` → しかし `TaskList.js:297` では `processingIds.has(親ID)` で親タスクの `isProcessing` を判定 → false → `TaskItem.js:162` で子 `TaskItem` に `isProcessing={false}` が渡される → 子タスクのボタンは disabled にならない
- **原因の推定**: `TaskList.js:297` で渡すのは `processingIds.has(task.id)` で親タスクのIDのみを判定。`TaskItem.js:162` では子 `TaskItem` に親の `isProcessing` 値をそのまま渡しており、子タスク自身が `processingIds` に含まれるかどうかは検査されない
- **修正案**: 以下のいずれかで対応：
  - (A) `TaskList.js` から `processingIds` を `TaskItem` に prop として渡し、`TaskItem.js:162` で子に `isProcessing={isProcessing || processingIds.has(c.id)}` を設定する
  - (B) `TaskItem.js:75` の `StatusCheckbox` に渡す `disabled` を `isProcessing` だけでなく、直接 `processingIds` を参照して判定する
- **影響度**: 中。子タスクのステータス変更→即アーカイブのような連続操作でDBロック競合が発生する可能性がある

### 総合判定

| 観点 | OK | NG | 合計 |
|------|----|----|------|
| 観点1：正常系テスト | 13 | 0 | 13 |
| 観点2：異常系・境界値テスト | 10 | 1 | 11 |
| 観点3：状態遷移・データ件数テスト | 7 | 1 | 8 |
| **合計** | **30** | **2** | **32** |

#### NG 一覧

| ID | 内容 | 重要度 | ファイル・行番号 |
|----|------|--------|-----------------|
| NG-1 | `handleRestore` で task が undefined の場合の早期 return ガード欠落 | 低 | `hooks/useTaskActions.js:133-137` | ✅ 修正済み |
| NG-2 | 子タスクの操作中保護が親タスクの processingIds で判定されるため、子タスク個別の操作中保護が効かない | 中 | `components/TaskItem.js:162`, `components/TaskList.js:297` | ✅ 修正済み |

## STEP B：品質レビュー（v1.4.0 枝番4-1）

**検証対象**: BUG-7 アーカイブ処理の安定化（変更ファイル: `hooks/useTaskActions.js`, `components/StatusCheckbox.js`, `components/TaskItem.js`, `components/TaskList.js`）
**検証方法**: コードリーディングベースの静的分析
**検証日**: 2026-03-01
**スコープ**: 今回の枝番で変更した機能（アーカイブ／復元の楽観的更新・processingIds）に関連する箇所

### 観点1：エラーハンドリング確認

✅ OK: 7件 パス

| # | 異常条件 | 挙動 | エラーメッセージの有無と内容 | データへの影響 | OK/NG |
|---|----------|------|----------------------------|--------------|-------|
| 5 | handleTodayToggle の DB 失敗 | `useTaskActions.js:73`: catch で `console.error(e)` と `fetchTasks()` のみ。**ユーザー向けエラートーストが表示されない**。楽観的更新（L69）は `fetchTasks()` で DB の実際の値に戻るためデータ整合性は維持されるが、ユーザーは操作が失敗したことを認識できない | **なし**。エラートーストが dispatch されていない。`handleStatusChange`（L45）、`handleArchive`（L126）、`handleRestore`（L178）はすべてエラートーストを表示しているのに対し、`handleTodayToggle` のみ欠落 | なし（fetchTasks で復旧） | **NG** |

**NG-B1: `handleTodayToggle` にエラートーストがない** ✅ 修正済み

- **該当ファイル**: `hooks/useTaskActions.js:73`
- **問題の具体的な内容**: `handleTodayToggle` の catch ブロックが `console.error(e); fetchTasks();` のみで、ユーザー向けエラートーストを dispatch していない。コード断片：
  ```javascript
  } catch (e) { console.error(e); fetchTasks(); }
  ```
- **期待される挙動**: 他のハンドラ（`handleStatusChange` L45、`handleArchive` L126、`handleRestore` L178）と同様に、catch 内で `window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '今日やるタスクの変更に失敗しました', type: 'error' } }))` を dispatch すべき
- **実際の挙動**: DB 書き込み失敗時、☀️ボタンの状態は `fetchTasks()` で元に戻るが、ユーザーに何も通知されない
- **原因の推定**: `handleTodayToggle` 関数は今回の BUG-7 修正の直接的な変更対象ではなく、以前から存在していたエラーハンドリングの不足。同一ファイル内の他ハンドラとの統一性が欠けている
- **推奨**: catch 内に `window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '今日やるタスクの変更に失敗しました', type: 'error' } }));` を追加

### 観点2：一貫性レビュー

✅ OK: 5件 パス

| # | 観点 | 箇所A | 箇所B | 不整合の内容 | ファイル名:行番号 |
|---|------|-------|-------|------------|-----------------|
| 5 | 同種の操作でのUI挙動：disabled ボタンのスタイル | `StatusCheckbox.js:91-95` `.disabled` クラス: `cursor: not-allowed; opacity: 0.5; pointer-events: none;` | `TaskItem.js:116,121,130,134` の各ボタン: HTML 標準の `disabled` 属性のみ | **`StatusCheckbox` は CSS で `pointer-events: none` + `opacity: 0.5` を明示的に適用するが、`TaskItem` 内の各ボタン（📤/📦/☀️/select）は HTML 標準の `disabled` 属性のみで、disabled 時の視覚的フィードバック（半透明化等）の CSS 定義がない**。HTML の `disabled` 属性だけでもブラウザデフォルトで操作不可になるが、見た目の opacity 変化はブラウザ依存。`StatusCheckbox` の `.disabled` クラスと比較すると一貫性に欠ける | `components/StatusCheckbox.js:91-95` `components/TaskItem.js:116,121,130,134` | **NG** |
| 7 | CSS変数値・クラス名の構造的不一致：タスクカードのタグバッジ | `TaskItem.js:90` `.tc-tag`: `font-size:.63rem; padding:.1rem .5rem; border-radius:10px;`（`TaskList.js:432`で定義） | `today/page.js:449` `.today-tag`: `font-size:0.6rem; padding:0.1rem 0.4rem; border-radius:8px;` | **タグバッジの `font-size`、`padding`、`border-radius` が微妙に異なる** | `components/TaskList.js:432` (.tc-tag) `app/today/page.js:449` (.today-tag) `app/routines/page.js:217` (.rt-tag) | **NG** |
| 8 | CSS変数値・クラス名の構造的不一致：メタ情報のフォントサイズ | `TaskList.js:435` `.tc-meta-item`: `font-size:.76rem` | `today/page.js:450` `.today-meta-item`: `font-size:0.75rem` | メタ情報テキストのフォントサイズが `0.76rem` vs `0.75rem` で微妙に異なる | `components/TaskList.js:435` (.tc-meta-item) `app/today/page.js:450` (.today-meta-item) `app/routines/page.js:218` (.rt-meta-item) | **NG** |
| 9 | 余白・色使いの不統一：トーストのスタイル | グローバルトースト（`layout.js:369-370`）: 成功=`#ecfdf5` + `#15803d`、エラー=`#fef2f2` + `#b91c1c` | ルーティンページ（`routines/page.js:243-244`）は成功=`#f0fdf4` + `#166534`、エラー=`#fef2f2` + `#991b1b` で**背景色と文字色が微妙に異なる** | トーストカラーの不統一 | `layout.js:369-370` `settings/page.js:266-267` `routines/page.js:243-244` | **NG** |

**NG-B2: disabled ボタンの視覚的フィードバック不足** ✅ 修正済み

- **該当ファイル**: `components/TaskItem.js:116,121,130,134`
- **推奨**: `TaskList.js` のスタイル定義に `.tc-act-btn:disabled { opacity: 0.5; cursor: not-allowed; }` と `.tc-status-select:disabled { opacity: 0.5; cursor: not-allowed; }` を追加

**NG-B3: タグバッジのスタイル不統一（3画面間）** ✅ 修正済み

- **該当ファイル**: `components/TaskList.js:432` (`.tc-tag`), `app/today/page.js:449` (`.today-tag`), `app/routines/page.js:217` (`.rt-tag`)
- **推奨**: 3画面とも `font-size:0.63rem; padding:0.1rem 0.5rem; border-radius:10px;` に統一

**NG-B4: メタ情報フォントサイズの微小不統一** ✅ 修正済み

- **該当ファイル**: `components/TaskList.js:435` (`.tc-meta-item`)
- **推奨**: `0.75rem` に統一

**NG-B5: トーストスタイルの不統一（ルーティン画面）** ✅ 修正済み

- **該当ファイル**: `routines/page.js:243-244`
- **推奨**: ルーティンページのトーストスタイルをグローバルトーストに合わせる

### 総合判定

| 観点 | OK | NG | 合計 |
|------|----|----|------|
| 観点1：エラーハンドリング確認 | 7 | 1 | 8 |
| 観点2：一貫性レビュー | 5 | 4 | 9 |
| **合計** | **12** | **5** | **17** |

#### NG 一覧

| ID | 内容 | 重要度 | ファイル・行番号 |
|----|------|--------|-----------------|
| NG-B1 | `handleTodayToggle` のエラートースト欠落（他ハンドラはすべてエラートーストあり） | 中 | `hooks/useTaskActions.js:73` | ✅ 修正済み |
| NG-B2 | disabled ボタンの視覚的フィードバック不足（`StatusCheckbox` の `.disabled` スタイルと不統一） | 低 | `components/TaskItem.js:116,121,130,134` | ✅ 修正済み |
| NG-B3 | タグバッジのスタイル不統一（3画面で font-size / padding / border-radius が異なる） | 低 | `components/TaskList.js:432` `app/today/page.js:449` `app/routines/page.js:217` | ✅ 修正済み |
| NG-B4 | メタ情報フォントサイズの微小不統一（0.76rem vs 0.75rem） | 極低 | `components/TaskList.js:435` | ✅ 修正済み |
| NG-B5 | トーストスタイルの不統一（ルーティン画面の色がグローバル・設定画面と微妙に異なる） | 低 | `routines/page.js:243-244` | ✅ 修正済み |

---

## STEP A：機能検証（v1.4.0 枝番4-1 NG修正後）

**検証対象**: v1.4.0 枝番4-1 QA NG項目修正（7件：NG-1, NG-2, NG-B1〜B5）
**検証方法**: コードリーディングベースの静的分析
**検証日**: 2026-03-01
**スコープ**:
- `hooks/useTaskActions.js` — handleRestore に `if (!task) return` ガード追加（NG-1）、handleTodayToggle の catch にエラートースト追加（NG-B1）
- `components/TaskItem.js` — processingIds prop 受け取り、子タスクに `isProcessing || processingIds.has(c.id)` で伝播（NG-2）
- `components/TaskList.js` — processingIds を TaskItem に prop 追加、`.tc-act-btn:disabled` / `.tc-status-select:disabled` CSS 追加（NG-B2）、`.tc-meta-item` font-size 0.75rem に統一（NG-B4）
- `app/today/page.js` — `.today-tag` スタイルを `.tc-tag` に統一（NG-B3）
- `app/routines/page.js` — `.rt-tag` スタイルを `.tc-tag` に統一（NG-B3）、トーストカラーをグローバルトーストに統一（NG-B5）

### 観点1：正常系テスト

✅ OK: 15件 全件パス

### 観点2：異常系・境界値テスト

✅ OK: 10件 全件パス

### 観点3：状態遷移・データ件数テスト

✅ OK: 8件 全件パス

### 総合判定

| 観点 | OK | NG | 合計 |
|------|----|----|------|
| 観点1：正常系テスト | 15 | 0 | 15 |
| 観点2：異常系・境界値テスト | 10 | 0 | 10 |
| 観点3：状態遷移・データ件数テスト | 8 | 0 | 8 |
| **合計** | **33** | **0** | **33** |

なし。前回指摘の7件（NG-1, NG-2, NG-B1〜B5）はすべて正しく修正されていることを確認。

#### 要実機確認項目

| # | 画面 | 操作 | 確認内容 |
|---|------|------|----------|
| 1 | タスク一覧→今日やるタスク→ルーティン設定 | 3画面を順に表示 | タグバッジの見た目（サイズ・丸み）が全画面で同じであること |
| 2 | 同上 | 同上 | メタ情報テキスト（期限日・見積時間等）のフォントサイズが全画面で同じに見えること |
| 3 | ルーティン設定 | ルーティンを有効化または停止 | トーストの色味がタスク一覧のアーカイブ成功トーストと同じであること |

---

## STEP R：リグレッションテスト（v1.4.0 枝番4-1 2026-03-01）

**検証対象**: v1.4.0 枝番4-1 QA NG項目修正後の既存機能への影響確認
**検証方法**: コードリーディングベースの静的分析（影響範囲の網羅的トレース）
**検証日**: 2026-03-01

### 影響範囲の洗い出し

**変更ファイルと影響先の追跡結果：**

| 変更ファイル | 変更内容 | 参照元・影響先 | 影響有無 |
|---|---|---|---|
| `hooks/useTaskActions.js` | handleRestore ガード追加、handleTodayToggle エラートースト追加 | `components/TaskList.js` (L201で呼出)、`app/today/page.js` (L67で呼出) | TaskList: handleRestore/handleTodayToggle を使用 → 直接影響あり。today: handleTodayToggle 未使用（grepで0件確認） → 影響なし |
| `components/TaskItem.js` | processingIds prop追加、子タスクisProcessing判定変更 | `components/TaskList.js` (L6でimport、L286-299で使用) のみ。他ファイルからのimportなし | TaskList経由でのみ使用 → 影響はTaskList内に閉じる |
| `components/TaskList.js` | processingIds prop追加、disabled CSS追加、meta font-size変更 | タスク一覧画面(`app/tasks/page.js`から利用)。styled-jsx globalのCSS追加 | .tc-act-btn:disabled/.tc-status-select:disabled は加法的ルール → 既存ルールに副作用なし |
| `app/today/page.js` | .today-tag スタイル変更 | styled-jsx(スコープ付き) → 他画面に影響なし | today画面内に閉じる |
| `app/routines/page.js` | .rt-tag スタイル変更、トーストカラー変更 | styled-jsx(スコープ付き) → 他画面に影響なし | routines画面内に閉じる |

**間接的な影響の確認：**
- `components/StatusCheckbox.js` — disabled prop は今回の変更前から存在（前回枝番で追加済み）。今回変更なし → 影響なし
- `components/DndGaps.js` — 変更なし。DnDロジック（useTaskDnD）もprocessingIdsを参照しない → 影響なし
- `app/layout.js` — グローバルトーストリスナー。handleTodayToggle の新トーストは `yarukoto:toast` イベント経由で layout.js L228-232 のリスナーが受信 → 正常動作
- `app/dashboard/page.js` — 独自のDB query使用。変更ファイルとの依存なし → 影響なし
- `app/settings/page.js` — 独自のトースト・データ管理。変更ファイルとの依存なし → 影響なし
- `hooks/useTodayTasks.js` — today/page.js のデータ取得。変更なし → 影響なし
- `hooks/useTaskDnD.js` — DnDロジック。processingIds非参照 → 影響なし

### 第1段階：変更箇所の直接テスト

✅ OK: 11件 全件パス

### 第2段階：影響範囲のテスト

✅ OK: 15件 全件パス

### 総合判定

| 段階 | OK | NG | 合計 |
|------|----|----|------|
| 第1段階：変更箇所の直接テスト | 11 | 0 | 11 |
| 第2段階：影響範囲のテスト | 15 | 0 | 15 |
| **合計** | **26** | **0** | **26** |

**結果: 全件OK。NG項目なし。**
