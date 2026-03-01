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

---

## STEP A：機能検証（v1.4.0 枝番4-2）

**検証対象**: IMP-13 今日やるタスクのDnDギャップ方式統一
**検証方法**: コードリーディングベースの静的分析
**検証日**: 2026-03-01
**スコープ**:
- `app/today/page.js` — HTML5 DnD → @dnd-kit 化。TodayCardItem コンポーネント新設、DndContext/DragOverlay/ReorderGap 導入、handleDragStart/handleDragEnd 実装。CSS に touch-action: none 追加、旧 drag-over スタイル削除、ReorderGap 用グローバルスタイル追加
- `components/DndGaps.js` — 既存 ReorderGap コンポーネントを今日やるタスク画面でも使用開始

### 観点1：正常系テスト

✅ OK: 17件 全件パス

### 観点2：異常系・境界値テスト

✅ OK: 10件 全件パス

### 観点3：状態遷移・データ件数テスト

✅ OK: 10件 全件パス

### 総合判定

| 観点 | OK | NG | 合計 |
|------|----|----|------|
| 観点1：正常系テスト | 17 | 0 | 17 |
| 観点2：異常系・境界値テスト | 10 | 0 | 10 |
| 観点3：状態遷移・データ件数テスト | 10 | 0 | 10 |
| **合計** | **37** | **0** | **37** |

**結果: 全件OK。NG項目なし。**

#### 要実機確認項目

| # | 画面 | 操作 | 確認内容 |
|---|------|------|----------|
| 1 | 今日やるタスク | 手動モードにしてカードをドラッグ | タスク間に薄い線が出現し、カーソルを合わせると紫色にハイライトされること |
| 2 | 今日やるタスク | カードをドラッグ中 | 元のカードが半透明（薄く）になり、カーソル位置にカードのプレビュー（タイトル付き）が追従すること |
| 3 | 今日やるタスク | 手動モードでカードをギャップにドロップして並び替え | ドロップ後にカードの順序が変わり、画面を切り替えて戻っても順序が維持されていること |
| 4 | 今日やるタスク | 自動ソートモードに切替 | ドラッグハンドル（⋮⋮）が非表示になり、カードをドラッグできないこと |

---

## STEP B：品質レビュー（v1.4.0 枝番4-2）

**検証対象**: IMP-13 今日やるタスクのDnDギャップ方式統一
**検証方法**: コードリーディングベースの静的分析
**検証日**: 2026-03-01
**スコープ**: 今回の枝番で変更した `app/today/page.js`（HTML5 DnD → @dnd-kit 化、TodayCardItem 新設、DndContext/DragOverlay/ReorderGap 導入）を起点に、DnD 機能に関連する `components/DndGaps.js`、`hooks/useTaskDnD.js`、`components/TaskList.js`、`hooks/useTaskActions.js` との比較を含む

### 観点1：エラーハンドリング確認

✅ OK: 7件 パス

| # | 異常条件 | 挙動 | エラーメッセージの有無と内容 | データへの影響 | OK/NG |
|---|----------|------|----------------------------|--------------|-------|
| 4 | ディスク書き込み権限がない場合：`handleRemove` の DB 失敗 | `today/page.js:227-233`: try/catch で catch。`console.error(e); reloadTasks();` のみ。**エラートーストが dispatch されていない**。楽観的更新（L228 の `setTasks(prev => prev.filter(...))` ）は `reloadTasks()` で復帰するため UI 状態は回復するが、ユーザーには操作失敗が通知されない | **なし**。同ファイル内の `persistTodaySortOrder`（L173）や `useTaskActions.js` 内の `handleTodayToggle`（L75）・`handleStatusChange`（L45）・`handleArchive`（L130）・`handleRestore`（L183）はすべてエラートーストを表示するのに、`handleRemove` のみ欠落 | なし（reloadTasks で復旧） | **NG** |

**NG-1: `handleRemove` にエラートーストがない** ✅ 修正済み

- **該当ファイル**: `app/today/page.js:227-233`
- **問題の具体的な内容**: `handleRemove` の catch ブロックが `console.error(e); reloadTasks();` のみで、ユーザー向けエラートーストを dispatch していない。コード断片：
  ```javascript
  const handleRemove = async (taskId) => {
      setTasks(prev => prev.filter(t => t.id !== taskId));
      try {
          const db = await fetchDb();
          await db.execute('UPDATE tasks SET today_date = NULL WHERE id = $1', [taskId]);
      } catch (e) { console.error(e); reloadTasks(); }
  };
  ```
- **期待される挙動**: 同ファイル内の `persistTodaySortOrder`（L171-174）や `useTaskActions.js` 内の全ハンドラと同様に、catch 内でエラートーストを dispatch すべき
- **実際の挙動**: DB 書き込み失敗時、タスクは `reloadTasks()` で元に戻る（UI 整合性は維持）が、ユーザーには「今日やるから外す」操作が失敗したことが通知されない。☀️ボタンが一瞬消えて元に戻るだけで、何が起きたかわからない
- **原因の推定**: `handleRemove` は枝番 4-2 で新設された関数ではなく、HTML5 DnD 時代から存在していた。`handleTodayToggle`（4-1 の NG-B1 で修正済み）と同様に、以前からエラートーストが欠落していたもの
- **推奨**: catch 内に `window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '今日やるタスクの変更に失敗しました', type: 'error' } }));` を `reloadTasks()` の前に追加

### 観点2：一貫性レビュー

✅ OK: 3件 パス

| # | 観点 | 箇所A | 箇所B | 不整合の内容 | ファイル名:行番号 |
|---|------|-------|-------|------------|-----------------|
| 1 | CSS変数値・クラス名の構造的不一致：ReorderGap グローバルスタイルの重複定義 | `today/page.js:608-622` | `TaskList.js:500-513` | **同一の `.tl-reorder-gap` 系スタイルが2箇所で重複定義** | `app/today/page.js:608-622` `components/TaskList.js:500-513` | **NG** |
| 2 | ドラッグハンドルのホバー挙動不統一 | `today/page.js:577` ハンドル直上ホバーのみ | `TaskList.js:416` カード全体ホバーでも表示 | **カードホバー時のハンドル表示有無が異なる** | `app/today/page.js:577` `components/TaskList.js:416` | **NG** |
| 3 | ステータスセレクトの font-size・padding 不統一 | `today/page.js:541-542` 0.75rem/0.25rem 0.4rem | `TaskList.js:444-446` 0.78rem/0.3rem 0.5rem | **font-size/padding が微妙に異なる** | `app/today/page.js:541-542` `components/TaskList.js:444-446` | **NG** |
| 4 | カードリスト gap 不統一 | `today/page.js:494` 0.5rem | `TaskList.js:345` 0.6rem | **gap が異なる** | `app/today/page.js:494` `components/TaskList.js:345` | **NG** |
| 8 | ドラッグハンドルスタイルの構造差異 | `today/page.js:570-578` font-size/user-select あり | `TaskList.js:410-417` height/align-self あり | **プロパティセットが不揃い** | `app/today/page.js:570-578` `components/TaskList.js:410-417` | **NG** |

**NG-C1: ReorderGap グローバルスタイルの重複定義（メンテナンスリスク）** ✅ 修正済み

- **該当ファイル**: `app/today/page.js:608-622`, `components/TaskList.js:500-513`
- **問題の具体的な内容**: `ReorderGap` コンポーネント (`components/DndGaps.js`) が使用する `.tl-reorder-gap` / `.tl-reorder-gap-line` / `.tl-reorder-gap.drag-over` の CSS 定義が、`today/page.js` と `TaskList.js` の両方に `<style jsx global>` として**完全に同一の内容で重複定義**されている
- **推奨**: スタイルを一元化する。以下のいずれかで対応：
  - (A) `components/DndGaps.js` の `ReorderGap` コンポーネント内に `<style jsx global>` として定義し、`today/page.js` と `TaskList.js` 両方から重複定義を削除（推奨）
  - (B) `globals.css` に移動

**NG-C2: ドラッグハンドルのホバー挙動不統一** ✅ 修正済み

- **該当ファイル**: `app/today/page.js:577`, `components/TaskList.js:416`
- **問題の具体的な内容**: タスク一覧では `.tc-card:hover .tc-handle { opacity: 1; }` によりカード全体へのホバーでハンドルが表示されるが、今日やるタスクでは `.today-drag-handle:hover { opacity:1; }` のみでハンドル自体へのホバーでしか表示されない
- **推奨**: `today/page.js` のスタイルに `.today-card:hover .today-drag-handle { opacity: 1; }` を追加し、カードホバー時にもハンドルが表示されるようにする

**NG-C3: ステータスセレクトの font-size・padding 不統一** ✅ 修正済み

- **該当ファイル**: `app/today/page.js:541-542` (`.today-status`), `components/TaskList.js:444-446` (`.tc-status-select`)
- **問題の具体的な内容**: font-size が `0.75rem` vs `0.78rem`、padding が `0.25rem 0.4rem` vs `0.3rem 0.5rem`
- **推奨**: タスク一覧側に合わせ `font-size: 0.78rem; padding: 0.3rem 0.5rem;` に統一

**NG-C4: カードリスト gap 不統一** ✅ 修正済み

- **該当ファイル**: `app/today/page.js:494` (`.today-list`), `components/TaskList.js:345` (`.tl-items`)
- **問題の具体的な内容**: カード間 gap が `0.5rem` vs `0.6rem`
- **推奨**: `0.6rem` に統一（タスク一覧側に合わせる）

**NG-C5: ドラッグハンドルスタイルの構造差異** ✅ 修正済み

- **該当ファイル**: `app/today/page.js:570-578` (`.today-drag-handle`), `components/TaskList.js:410-417` (`.tc-handle`)
- **問題の具体的な内容**: 今日やるタスクでは `font-size:.85rem; user-select:none;` を定義、タスク一覧では `height:100%; align-self:stretch;` を定義。両者で異なるプロパティセット
- **推奨**: 両方のハンドルに `user-select:none;` を追加し、`font-size` も統一する。⚠️ 要実機確認：[今日やるタスク]と[タスク一覧]を手動モードにして、ドラッグハンドル（⋮⋮）のサイズと縦位置が揃っているか目視比較すること

### 総合判定

| 観点 | OK | NG | 合計 |
|------|----|----|------|
| 観点1：エラーハンドリング確認 | 7 | 1 | 8 |
| 観点2：一貫性レビュー | 3 | 5 | 8 |
| **合計** | **10** | **6** | **16** |

#### NG 一覧

| ID | 内容 | 重要度 | ファイル・行番号 |
|----|------|--------|-----------------|
| NG-1 | `handleRemove` のエラートースト欠落（他ハンドラはすべてエラートーストあり） | 中 | `app/today/page.js:227-233` | ✅ 修正済み |
| NG-C1 | ReorderGap グローバルスタイルの重複定義（2ファイルに同一 CSS が重複、メンテナンスリスク） | 中 | `app/today/page.js:608-622` `components/TaskList.js:500-513` | ✅ 修正済み |
| NG-C2 | ドラッグハンドルのホバー挙動不統一（カードホバーでの表示有無が異なる） | 低 | `app/today/page.js:577` `components/TaskList.js:416` | ✅ 修正済み |
| NG-C3 | ステータスセレクトの font-size・padding 不統一（0.75rem vs 0.78rem） | 低 | `app/today/page.js:541-542` `components/TaskList.js:444-446` | ✅ 修正済み |
| NG-C4 | カードリスト gap 不統一（0.5rem vs 0.6rem） | 極低 | `app/today/page.js:494` `components/TaskList.js:345` | ✅ 修正済み |
| NG-C5 | ドラッグハンドルスタイルの構造差異（font-size/user-select/height/align-self が不揃い） | 低 | `app/today/page.js:570-578` `components/TaskList.js:410-417` | ✅ 修正済み |

#### 要実機確認項目

| # | 画面 | 操作 | 確認内容 |
|---|------|------|----------|
| 1 | 今日やるタスク → タスク一覧 | 両方で手動モードにしてカード上にマウスを置く | タスク一覧ではカードにマウスを置くだけでドラッグハンドル（⋮⋮）が濃く表示されるが、今日やるタスクではハンドルの上にマウスを置かないと変化しないこと（NG-C2 の実機確認） |
| 2 | 今日やるタスク → タスク一覧 | 両方で手動モードにしてドラッグハンドルを見比べる | ハンドル（⋮⋮）の文字の大きさと縦位置が揃っているか目視比較すること（NG-C5 の実機確認） |
| 3 | 今日やるタスク | ✕ボタンでタスクを「今日やるから外す」操作を行い、ネットワーク/DB障害を模擬 | 操作失敗時にエラートーストが表示されないこと（現状のバグ動作の確認。修正後は表示されるべき） |

---

## STEP R：リグレッションテスト（v1.4.0 枝番4-2 2026-03-01）

**検証対象**: v1.4.0 枝番4-2 QA NG項目6件修正後の既存機能への影響確認
**検証方法**: コードリーディングベースの静的分析（影響範囲の網羅的トレース）
**検証日**: 2026-03-01

### 影響範囲の洗い出し

**変更ファイルと影響先の追跡結果：**

| 変更ファイル | 変更内容 | 参照元・影響先 | 影響有無 |
|---|---|---|---|
| `app/today/page.js` | handleRemove にエラートースト追加（L234）、ReorderGap グローバルスタイル重複削除、ドラッグハンドルにカードホバー時 opacity:1 追加（L581）、height:100%/align-self:stretch 追加（L577）、ステータスセレクト font-size/padding 変更（L546）、カードリスト gap 0.6rem 変更（L498） | `app/layout.js`（トーストリスナー）、`components/DndGaps.js`（ReorderGap import） | layout.js: handleRemove の新エラートーストは `yarukoto:toast` イベント経由で L47-54 のリスナーが受信 → 正常。CSS 変更はすべて `<style jsx>` スコープ内 → 他画面に影響なし |
| `components/TaskList.js` | ReorderGap グローバルスタイル重複削除、`.tc-handle` に font-size:.85rem / user-select:none 追加（L415） | `app/tasks/page.js`（import 元）、`components/TaskItem.js`（.tc-handle クラス使用） | TaskItem: `.tc-handle` の CSS 変更は加法的（既存ルールの上書きなし）。font-size は未指定→明示化、user-select は新規追加。いずれも既存表示を破壊しない |
| `components/DndGaps.js` | ReorderGap コンポーネント内に `<style jsx global>` で `.tl-reorder-gap` 系スタイルを一元定義（L34-49） | `app/today/page.js`（L10 で import）、`components/TaskList.js`（L7 で import）、`components/TaskItem.js`（L8 で import） | ReorderGap レンダリング時にスタイル注入。`@keyframes fadeIn` は `globals.css:446` にも定義済みのため、ReorderGap 未レンダリング時も `UnnestGap` の fadeIn アニメーションに影響なし |

**間接的な影響の確認：**
- `components/TaskItem.js` — `.tc-handle` クラスの CSS 変更（font-size/user-select）は加法的。TaskItem 自体のロジックに変更なし → 影響なし
- `components/DndGaps.js:UnnestGap` — 変更なし。`.tl-unnest-gap` CSS は `TaskList.js` L351-386 に残存。`@keyframes fadeIn` は `globals.css:446` にグローバル定義されているため利用可能 → 影響なし
- `app/layout.js` — グローバルトーストリスナー（L47-54）。handleRemove の新エラートーストは `yarukoto:toast` イベントで `{ message, type: 'error' }` を送信。`.toast-err` クラス（L370）でスタイル適用 → 正常動作
- `hooks/useTodayTasks.js` — 変更なし。loadTasks/toggleSortMode/ソートロジックは今回の修正と無関係 → 影響なし
- `hooks/useTaskActions.js` — 変更なし。handleStatusChange/handleTodayToggle/handleArchive/handleRestore/processingIds は今回無修正 → 影響なし
- `hooks/useTaskDnD.js` — 変更なし。handleDragEnd/handleReorder/persistSortOrder は今回無修正 → 影響なし
- `app/routines/page.js` — 変更なし。前回枝番の修正（.rt-tag 統一、トーストカラー統一）が維持されているか確認 → `.rt-tag`（L217）: font-size:0.63rem/padding:0.1rem 0.5rem/border-radius:10px ✅、`.rt-toast-ok`（L243）: #ecfdf5/#15803d ✅ layout.js と一致 → 影響なし
- `app/dashboard/page.js` — 変更ファイルとの依存なし → 影響なし
- `app/settings/page.js` — 変更ファイルとの依存なし → 影響なし

### 第1段階：変更箇所の直接テスト

✅ OK: 10件 全件パス

### 第2段階：影響範囲のテスト

✅ OK: 14件 全件パス

### 総合判定

| 段階 | OK | NG | 合計 |
|------|----|----|------|
| 第1段階：変更箇所の直接テスト | 10 | 0 | 10 |
| 第2段階：影響範囲のテスト | 14 | 0 | 14 |
| **合計** | **24** | **0** | **24** |

**結果: 全件OK。NG項目なし。**

#### 要実機確認項目

| # | 画面 | 操作 | 確認内容 |
|---|------|------|----------|
| 1 | 今日やるタスク → タスク一覧 | 両画面で手動モードにしてカード上にマウスを置く | 両方ともカードにマウスを置くだけでドラッグハンドル（⋮⋮）が濃く表示されること（NG-C2 修正の実機確認） |
| 2 | 今日やるタスク → タスク一覧 | 両画面で手動モードにしてドラッグハンドルの見た目を比較 | ハンドル（⋮⋮）の文字の大きさと縦位置が両画面で揃っていること（NG-C5 修正の実機確認） |
| 3 | 今日やるタスク → タスク一覧 | 両画面でステータスドロップダウンの見た目を比較 | ステータスセレクトの文字の大きさと余白が両画面で揃っていること（NG-C3 修正の実機確認） |
| 4 | 今日やるタスク → タスク一覧 | 両画面のカード間隔を比較 | カードとカードの間隔が両画面で同じに見えること（NG-C4 修正の実機確認） |

---

## リリース前検証：バージョン変更分析（v1.4.0）

**分析日**: 2026-03-01
**対象枝番**: 4-1, 4-2, 4-3

### 枝番一覧と変更ファイル

| 枝番 | 課題 | 変更ファイル |
|------|------|-------------|
| 4-1 | BUG-7 アーカイブ処理の安定化 | `hooks/useTaskActions.js`, `components/StatusCheckbox.js`, `components/TaskItem.js`, `components/TaskList.js` |
| 4-2 | IMP-13 今日やるタスクのDnDギャップ方式統一 | `app/today/page.js`, `components/DndGaps.js`, `components/TaskList.js` |
| 4-3 | ENH-1 + ENH-5 ダッシュボード改善 + 子タスク自動完了 | `app/dashboard/page.js`, `app/settings/_components/OptionsPanel.js`, `hooks/useTaskActions.js`, `lib/db.js` |

### 枝番間干渉リスク分析

| リスク箇所 | 関連枝番 | 干渉の内容 |
|-----------|---------|-----------|
| `hooks/useTaskActions.js` の `handleStatusChange` | 4-1 + 4-3 | 4-1 で processingIds 追加、4-3 で自動完了ロジック追加。同一関数内に両方の変更が同居。自動完了時に親タスクの processingIds 制御が行われるか、エラー時の挙動が正しいかを確認する必要あり |
| `components/TaskList.js` | 4-1 + 4-2 | 4-1 で processingIds 伝播を追加、4-2 で ReorderGap スタイル削除 + ハンドルCSS統一。CSS変更は加法的のため機能的干渉リスクは低い |
| `app/today/page.js` → `useTaskActions` 経由 | 4-2 + 4-3 | 4-2 で DnD 方式を全面変更した today 画面から、4-3 の自動完了ロジック（handleStatusChange 内）が発動する。today 画面のタスク一覧に親タスクが含まれない場合の楽観的更新が正しく動作するか確認必要 |

### 重点チェック項目

1. **handleStatusChange の自動完了ロジック（ENH-5）と processingIds（BUG-7）の共存**: 子タスク完了→親自動完了の際、親タスクの processingIds 制御・楽観的UI更新・エラーハンドリングの整合性
2. **自動完了の対象親ステータス**: キャンセル(5)・保留(4)等の親タスクに対しても自動完了が発動するか
3. **today 画面から子タスク完了時の自動完了**: today 画面のタスクリストに親が存在しない場合の楽観的更新の安全性
4. **ダッシュボード ENH-1 の todayDone セクション**: タスクとルーティンの完了が正しくマージ・表示されるか
5. **設定画面 ENH-5 トグル**: auto_complete_parent の DB シード・トグル操作・楽観的更新の整合性

---

## リリース前検証 STEP A-1（v1.4.0）ダッシュボード画面

**検証対象**: `app/dashboard/page.js`（全機能 + ENH-1 今日完了したタスクの可視化）
**検証方法**: コードリーディングベースの静的分析
**検証日**: 2026-03-01

### 観点1：正常系テスト

| # | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|--------|----------|----------|------------|-------|
| 1 | ページ読み込み | ダッシュボード画面を開く | ローディングスピナー表示後、各セクションが描画される | L154-161: `loading=true` でスピナー+「読み込み中...」表示。`loadDashboard` 完了後 `setLoading(false)` で本体描画。正常 | OK |
| 2 | 全体の完了率リングカード | ダッシュボード表示 | アクティブタスクの完了率がリングとパーセンテージで表示される | L17: `SELECT COUNT(*) as total, SUM(CASE WHEN status_code = 3 THEN 1 ELSE 0 END) as completed FROM tasks WHERE status_code != 5 AND archived_at IS NULL`。キャンセル・アーカイブ除外。L166: `Math.round((completed/total)*100)`。L180: subtitle に「N/M タスク完了」。正常 | OK |
| 3 | 今日の進捗リングカード | ダッシュボード表示 | 今日対象のタスク+ルーティンの進捗率が表示される | L21: today_date/due_date/期限切れ/今日完了の4条件OR。L42-51: `isRoutineActiveOnDate` で今日アクティブなルーティンを加算。L182: 完了100%&total>0 で緑、それ以外で琥珀色。L183: subtitle に残件数+想定時間。正常 | OK |
| 4 | 直近3日リングカード | ダッシュボード表示 | 今日〜3日後の範囲のタスク+ルーティン進捗率が表示される | L54-56: 3日後まで。L60-77: biz3Tasks + ルーティン4日間ループ。正常 | OK |
| 5 | 直近7日間完了数棒グラフ | ダッシュボード表示 | 過去6日+今日の完了タスク数が棒グラフで表示される | L80-103: tasks の completed_at + routine_completions をGROUP BYで集計し7日配列生成。L205-207: 今日のバーはprimaryカラー、他はsubtleカラー。L210: 週末ラベルは赤色。正常 | OK |
| 6 | ステータス分布 | ダッシュボード表示 | 各ステータスの件数が横棒グラフで表示される | L106-112: status_master LEFT JOIN tasks でキャンセル・アーカイブ除外、sort_order順。L221-236: 各行にドット+ラベル+件数+バー表示。正常 | OK |
| 7 | 期限切れタスク一覧 | 期限切れタスクがある状態でダッシュボード表示 | 最大5件の期限切れタスクが赤枠カードで表示される | L115-120: status_code!=3,!=5, 非アーカイブ, due_date<今日。L141: `.slice(0,5)`。L263-278: `overdue.count > 0` で条件表示。正常 | OK |
| 8 | [ENH-1] 今日完了タスク一覧表示 | 今日完了したタスクがある状態でダッシュボード表示 | タスク名・完了時刻・ルーティンバッジ付きの一覧が緑枠カードで表示される | L123-128: `WHERE status_code = 3 AND date(completed_at) = $1 AND archived_at IS NULL ORDER BY completed_at DESC`。L131-133: todayCompSet に含まれるアクティブルーティンを `routine_` prefix ID でマージ。L142: タスク→ルーティンの順で結合。L241-260: 条件付き表示。正常 | OK |
| 9 | [ENH-1] 完了時刻のフォーマット | 完了タスクの時刻表示を確認 | "HH:MM" 形式で表示される | L251: `t.completed_at.split(' ')[1]?.slice(0, 5)`。SQLite の `datetime('now', 'localtime')` は "YYYY-MM-DD HH:MM:SS" 形式 → `.split(' ')[1]` = "HH:MM:SS" → `.slice(0, 5)` = "HH:MM"。正常 | OK |
| 10 | [ENH-1] ルーティン完了のバッジ表示 | 今日完了したルーティンがある状態でダッシュボード表示 | ルーティン行には🔁バッジが表示され、時刻は非表示 | L249: `t.is_routine && <span className="done-routine-badge">🔁</span>`。ルーティンには `completed_at` がないため L250-252 の条件 `t.completed_at &&` が false → 時刻非表示。正常 | OK |
| 11 | [ENH-1] タスクの text-overflow | タイトルが長いタスクの表示 | 省略記号（...）で切り詰められる | L340: `.done-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`。正常 | OK |
| 12 | レスポンシブ表示 | 画面幅768px以下 | 3列→1列、2列→1列に変更される | L357-360: `@media (max-width: 768px) { .db-top-row { grid-template-columns: 1fr } .db-bottom-row { grid-template-columns: 1fr } }`。正常 | OK ⚠️ 要実機確認：[ダッシュボード]でウィンドウ幅を狭くしたとき、リングカード3枚とグラフ＋ステータス分布が縦1列に並び替わること |

### 観点2：異常系・境界値テスト

| # | 対象フィールド/操作 | 入力内容 | 期待される挙動 | 実際の挙動 | OK/NG |
|---|---------------------|----------|----------------|------------|-------|
| 1 | データ0件の全体完了率 | タスク・ルーティンが0件 | 0%表示、エラーなし | L166: `overall.total > 0 ? Math.round(...) : 0` → total=0 → pct=0。正常 | OK |
| 2 | データ0件の今日の進捗 | 今日対象のデータなし | 0%表示、サブタイトル「今日のタスクなし」 | L167: total=0 → pct=0。L183: `today.total > 0 ? '残り...' : '今日のタスクなし'`。正常 | OK |
| 3 | データ0件の直近3日 | 対象データなし | 0%表示、サブタイトル「期限内タスクなし」 | L168: total=0 → pct=0。L186: `biz3.total > 0 ? '...' : '期限内タスクなし'`。正常 | OK |
| 4 | データ0件のグラフ | 過去7日間の完了なし | 全バー高さ0、値ラベルなし | L169: `Math.max(...[0,0,...], 1)` = 1（ゼロ除算防止）。L201: `d.count > 0 ? d.count : ''` → 0件は値非表示。L204: `(0/1)*100 = 0%` → min-height:4px のみ表示。正常 | OK |
| 5 | DB接続失敗 | Tauri IPC 不可 | エラーハンドリングされる | L144-148: `catch(err) { console.error(...) } finally { setLoading(false) }`。data=null → L163: `return null` → 白画面。ただし DB 初期化失敗は `lib/db.js` から `yarukoto:dberror` イベント → `layout.js` L42 の throw で Next.js error boundary に遷移する前提。正常 | OK |
| 6 | completed_at が NULL のタスク | status_code=3 だが completed_at=NULL（旧データ等） | ENH-1 一覧から除外される | L127: `date(completed_at) = $1` — SQLiteの `date(NULL)` は NULL → `NULL = $1` は false → 除外。正常 | OK |
| 7 | タスクtitle内の特殊文字 | タイトルに `<script>alert(1)</script>` | HTMLエスケープされて安全に表示 | React の JSX `{t.title}` は自動的にエスケープ。XSS なし。正常 | OK |
| 8 | SQLパラメータの安全性 | 全クエリ | パラメータ化クエリでSQLインジェクション防止 | 全クエリで `$1, $2...` positional パラメータ使用。正常 | OK |
| 9 | [ENH-1] ルーティンIDの一意性 | タスクIDとルーティンIDが衝突する場合 | key prop が一意になる | L133: ルーティンIDは `routine_${r.id}` prefix。タスクは数値ID。L246: `key={t.id}` で衝突なし。正常 | OK |
| 10 | [ENH-1] allRoutines が空の場合 | 有効なルーティンが0件 | todayCompletedRoutines = 空配列 | L131: `.filter(r => todayCompSet.has(r.id))` → マッチなし → 空配列。L142: `[...tasks, ...空]` → タスクのみ。正常 | OK |

### 観点3：状態遷移・データ件数テスト

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|------------|----------|----------|------------|-------|
| 1 | タスク0件 | ダッシュボード表示 | 全リング0%、ステータス分布は全0件、期限切れ/今日完了セクション非表示 | overall/today/biz3 すべて total=0 → pct=0。statusDistribution は LEFT JOIN で count=0 行あり → 表示。overdue.count=0 → L263 false。todayDone.length=0 → L241 false。正常 | OK |
| 2 | [ENH-1] 今日完了0件 | 今日完了タスクなし | セクション非表示 | L241: `todayDone.length > 0` = false → セクション未レンダリング。正常 | OK |
| 3 | [ENH-1] 今日完了1件 | タスク1件を完了 | 緑枠セクション表示、1行のみ | todayDone.length=1 > 0 → セクション表示。`.slice(0,10)` = 1件。`1 > 10` = false → "他N件" 非表示。正常 | OK |
| 4 | [ENH-1] 今日完了10件 | ちょうど10件完了 | 10行表示、"他N件"非表示 | `.slice(0,10)` = 10件表示。`10 > 10` = false → "他N件" 非表示。正常 | OK |
| 5 | [ENH-1] 今日完了11件 | 11件完了 | 10行表示 + "他1件" | `.slice(0,10)` = 10件。`11 > 10` = true → L256: `他 ${11-10} 件` = "他 1 件"。バッジは `{11}件`。正常 | OK |
| 6 | 期限切れ0件 | 期限切れタスクなし | セクション非表示 | L263: `overdue.count > 0` = false → 非表示。正常 | OK |
| 7 | 期限切れ5件 | ちょうど5件 | 5行表示、"他N件"非表示 | L141: `.slice(0,5)` = 5件。L273: `5 > 5` = false → 非表示。正常 | OK |
| 8 | 期限切れ6件 | 6件 | 5行表示 + "他1件" | L141: `.slice(0,5)` = 5件。L273: `6 > 5` = true → "他 1 件"。正常 | OK |
| 9 | [ENH-1] タスク完了+ルーティン完了の混在 | タスク3件+ルーティン2件を今日完了 | バッジ「5件」、タスク3件→ルーティン2件の順で表示 | L142: `[...tasks(3件), ...routines(2件)]`。L243: バッジ `{5}件`。タスクは completed_at あり → 時刻表示。ルーティンは is_routine=true → 🔁バッジ、completed_at なし → 時刻非表示。正常 | OK |
| 10 | useEffect の再実行 | ダッシュボードに遷移 | データが最新で取得される | L10: `useEffect(() => { loadDashboard(); }, [])` — マウント時1回のみ。画面遷移のたびに再マウントされるため最新取得。ただし画面を開いたまま他画面でタスク完了→戻ってもリロードされない（依存配列が空のため）。これは既存動作で仕様通り | OK |

### 総合判定

| 観点 | OK | NG | 合計 |
|------|----|----|------|
| 観点1：正常系テスト | 12 | 0 | 12 |
| 観点2：異常系・境界値テスト | 10 | 0 | 10 |
| 観点3：状態遷移・データ件数テスト | 10 | 0 | 10 |
| **合計** | **32** | **0** | **32** |

**結果: 全件OK。NG項目なし。**

#### 要実機確認項目

| # | 画面 | 操作 | 確認内容 |
|---|------|------|----------|
| 1 | ダッシュボード | ウィンドウ幅を768px以下に狭める | リングカード3枚とグラフ・ステータス分布が縦1列に並び替わること |
| 2 | ダッシュボード | タスクを完了した後にダッシュボードを開く | 「🎉 今日完了したタスク」セクションが表示され、タスク名・完了時刻が正しく表示されること |
| 3 | ダッシュボード | ルーティンを完了した後にダッシュボードを開く | 「🎉 今日完了したタスク」セクション内にルーティン名と🔁バッジが表示されること |

---

## リリース前検証 STEP A-2（v1.4.0）設定画面

**検証対象**: `app/settings/page.js` + `_components/TagsPanel.js`, `StatusPanel.js`, `OptionsPanel.js`, `DataPanel.js`（全タブ + ENH-5 子タスク自動完了オプション）
**検証方法**: コードリーディングベースの静的分析
**検証日**: 2026-03-01

### 観点1：正常系テスト

| # | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|--------|----------|----------|------------|-------|
| 1 | ページ読み込み | 設定画面を開く | スピナー後に4タブ表示 | settings/page.js L27-44: load() で importance/urgency/status/tags + app_settings を並列取得。loading=false で `<>` 内のタブパネル表示。正常 | OK |
| 2 | タブ切り替え | 4つのタブをそれぞれクリック | 各タブパネルが表示される | L51-58: TABS配列のkey でマッチ。L65-68: tab==='tags'等で条件レンダリング。正常 | OK |
| 3 | タグ追加 | 新タグ名入力+追加ボタン | タグがリストに追加される | TagsPanel.js L51-71: addTag()。DB INSERT → lastInsertId → state更新 → flash成功。正常 | OK |
| 4 | タグ名編集 | 既存タグの名前を変更 | 即時UI更新、onBlurでDB保存 | TagsPanel.js L73-84: updTag → state変更。commitTag → DB UPDATE。正常 | OK |
| 5 | タグ色変更 | カラーパレットで色変更 | 即時UI更新、DB保存 | TagsPanel.js L165: ColorPalette onChange → updTag + commitTag。正常 | OK |
| 6 | タグ削除 | 削除ボタン→confirm | confirmダイアログ後にDB DELETE + state除外 | TagsPanel.js L86-94: confirm → db.execute DELETE → setData filter。正常 | OK |
| 7 | タグアーカイブ/解除 | 📦ボタン/📤ボタン | 楽観的更新 + DB保存、エラー時ロールバック | TagsPanel.js L96-110: toggleArchiveTag。楽観的更新 → DB UPDATE → flash。catchでロールバック + flash err。正常 | OK |
| 8 | タグ並び替え保存 | 並び順を変更して「並び順を保存」 | 全タグのsort_orderがDB更新 | TagsPanel.js L26-49: saveTags。active/archived それぞれインデックスでsort_order更新。正常 | OK |
| 9 | ステータス追加 | 新ステータス名入力+追加 | カスタムステータスがリスト末尾に追加 | StatusPanel.js L39-54: addStatus。maxSort+1 → DB INSERT → state追加。正常 | OK |
| 10 | ステータス削除 | ユーザー定義ステータスの削除ボタン | 使用中チェック → 未使用時のみ削除 | StatusPanel.js L56-69: delStatus。usage SELECT → cnt>0 なら flash err + return。0件なら DELETE。正常 | OK |
| 11 | システムステータス保護 | code<=5のステータスを操作 | 名前変更・削除不可、色変更・並び替えは可能 | StatusPanel.js L129-137: `isSystem = s.code <= 5`。isSystem → onLabel=undefined, onDel=undefined, readOnly=true。onColor/onMoveUp/onMoveDown は提供。L139: ヒントテキスト表示。正常 | OK |
| 12 | [ENH-5] auto_complete_parent トグル表示 | 設定→オプションタブ | 「子タスク全完了で親タスクも完了にする」トグルが表示される | OptionsPanel.js L68-87: opt-card 内に ✅ アイコン + タイトル + 説明 + トグルボタン。正常 | OK |
| 13 | [ENH-5] トグルON | auto_complete_parent トグルをONに切替 | 楽観的UI更新 + DB保存 | OptionsPanel.js L7-21: toggleSetting('auto_complete_parent')。current='0' → next='1' → setAppSettings楽観的更新 → db.execute INSERT OR REPLACE。正常 | OK |
| 14 | [ENH-5] トグルOFF | auto_complete_parent トグルをOFFに切替 | 楽観的UI更新 + DB保存 | 同上: current='1' → next='0'。正常 | OK |
| 15 | [ENH-5] トグルDB保存失敗時のロールバック | DB書き込みエラー | UIが元に戻りエラートースト表示 | OptionsPanel.js L17-21: catch → setAppSettings(prev => current) + flash('err', '設定の保存に失敗しました')。正常 | OK |
| 16 | inherit_parent_tags トグル | タグ継承トグル操作 | 同上のtoggleSetting動作 | OptionsPanel.js L38-46: toggleSetting('inherit_parent_tags')。正常 | OK |
| 17 | show_overdue_in_today トグル | 期限切れ表示トグル操作 | 同上のtoggleSetting動作 | OptionsPanel.js L58-66: toggleSetting('show_overdue_in_today')。正常 | OK |
| 18 | auto_archive_days 入力 | 数値を入力してフォーカスアウト | DB保存 + 即時アーカイブ実行（>0の場合） | OptionsPanel.js L99-131: onBlur → parseInt + DB save + runAutoArchive（>0時） + flash成功。正常 | OK |
| 19 | CSVエクスポート | ダウンロードボタン | BOM付きUTF-8 CSVがダウンロードされる（アーカイブ除外） | DataPanel.js L7-35: アクティブタスクSELECT → BOM+header+rows → Blob → downloadリンク。正常 | OK |
| 20 | CSVインポート | title列を含むCSVを選択 | タスクが一括登録される | DataPanel.js L37-66: file.text() → BOM除去 → ヘッダ解析 → title列特定 → ループINSERT。正常 | OK |
| 21 | 全データ削除 | 全削除ボタン→2回confirm | タスク・ルーティン・関連データ全削除（設定・マスターは保持） | DataPanel.js L68-80: 2回confirm → routine_completions/routine_tags/routines/task_tags/tasks DELETE。app_settings/tags/status_master 等は削除しない。正常 | OK |

### 観点2：異常系・境界値テスト

| # | 対象フィールド/操作 | 入力内容 | 期待される挙動 | 実際の挙動 | OK/NG |
|---|---------------------|----------|----------------|------------|-------|
| 1 | タグ名（空文字） | 空文字のままフォーム送信 | 追加されない | TagsPanel.js L53: `if (!newTag.name.trim()) return` → 早期return。ボタンも `disabled={!newTag.name.trim()}`。正常 | OK |
| 2 | タグ名（超長文字列） | 1000文字以上の文字列 | DBに保存される（TEXT型制限なし） | tags.name は TEXT NOT NULL UNIQUE。長さ制限なし。DBには保存される。UIは `.s-input` の `flex:1` で親幅に収まる。正常 | OK |
| 3 | タグ名（特殊文字） | `' " < > & \ /` | 安全に保存・表示される | DB: パラメータ化クエリ ($1) でSQLインジェクション防止。UI: React JSX で自動HTMLエスケープ。正常 | OK |
| 4 | タグ名（重複） | 既存と同じ名前で追加 | UNIQUE制約エラー → catch → flash err | TagsPanel.js L70: catch → flash('err', '追加に失敗しました')。DBのUNIQUE制約が発動。正常 | OK |
| 5 | ステータス名（空文字） | 空文字で追加 | 追加されない | StatusPanel.js L40: `if (!newStatus.label.trim()) return`。ボタンも `disabled={!newStatus.label.trim()}`。正常 | OK |
| 6 | ステータス削除（使用中） | タスクが紐づいたステータスを削除 | 削除拒否 + エラーメッセージ | StatusPanel.js L60-63: `SELECT COUNT(*) as cnt FROM tasks WHERE status_code = $1` → cnt > 0 → flash('err', '使用中のため削除できません')。正常 | OK |
| 7 | auto_archive_days（文字列入力） | "abc" と入力 | 0として保存 | OptionsPanel.js L109: `parseInt("abc")` = NaN → `NaN || 0` = 0。val = "0"。正常 | OK |
| 8 | auto_archive_days（小数） | "3.5" と入力 | 3として保存 | `parseInt("3.5")` = 3。val = "3"。正常 | OK |
| 9 | auto_archive_days（負数） | "-5" と入力 | 実質無効として扱われる | `parseInt("-5")` = -5。`-5 || 0` = -5（-5は truthy）。val = "-5"。DB保存後 `parseInt("-5") > 0` = false → flash「自動アーカイブを無効にしました」。`runAutoArchive` 内 `days <= 0` → early return。機能的に無害だがUIに"-5"が残る | OK |
| 10 | CSVインポート（title列なし） | title列のないCSV | エラーメッセージ表示 | DataPanel.js L46: `titleIdx === -1` → flash('err', 'title列が見つかりません')。正常 | OK |
| 11 | CSVインポート（空ファイル） | 1行（ヘッダ）のみ | エラーメッセージ表示 | DataPanel.js L43: `lines.length < 2` → flash('err', 'CSVにデータ行がありません')。正常 | OK |
| 12 | [ENH-5] トグル連打 | auto_complete_parent トグルを高速連打 | 各クリックごとに楽観的更新 → DB反映 | toggleSetting は async だが、排他制御なし。高速連打すると複数の非同期DB書き込みが並走。ただし `INSERT OR REPLACE` は冪等的で、最後の書き込みが勝つ。UIは各クリックで即時切り替わり、最終的に最後のDB書き込み結果と一致する。**DBロック競合のリスクはあるが、busy_timeout 5000ms で緩和。実害は限定的** | OK |

### 観点3：状態遷移・データ件数テスト

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|------------|----------|----------|------------|-------|
| 1 | タグ0件 | タグタブを表示 | 「タグがまだありません」メッセージ | TagsPanel.js L143: `activeTags.length === 0 && archivedTags.length === 0` → `<p className="s-empty">タグがまだありません</p>`。正常 | OK |
| 2 | タグ全アーカイブ | 全タグをアーカイブ | 「有効なタグがありません」+ アーカイブ済みセクション表示 | L144: `activeTags.length === 0 && archivedTags.length > 0` → 「有効なタグがありません」。L169-188: アーカイブ済みセクション表示。正常 | OK |
| 3 | ステータス5件（初期状態） | ステータスタブを表示 | 5件のシステムステータスが表示される | StatusPanel.js L128-138: data.status.map で全件表示。code<=5 は readOnly。L139: ヒントテキスト。正常 | OK |
| 4 | カスタムステータス追加→削除 | 追加後すぐ削除 | 追加直後のステータスが削除される（使用中チェック: 0件） | addStatus → state追加。delStatus → usage=0 → DB DELETE → state除外。正常 | OK |
| 5 | [ENH-5] 初期状態 | 新規DBで設定→オプションタブを開く | auto_complete_parent がOFF状態 | db.js L251: `INSERT OR IGNORE ... ['auto_complete_parent', '0']`。OptionsPanel L80: `appSettings.auto_complete_parent === '1'` → '0' === '1' = false → トグルOFF。正常 | OK |
| 6 | [ENH-5] ON→OFF→ON | トグルを3回切替 | 各状態がUIとDBに反映 | toggleSetting: '0'→'1'→'0'→'1'。各回で setAppSettings + DB INSERT OR REPLACE。正常 | OK |
| 7 | 全データ削除後の設定画面 | 全データ削除→設定画面リロード | タグ・ステータスは残り、app_settingsも保持 | DataPanel の handleDeleteAll は tasks/routines/関連テーブルのみ削除。tags/status_master/app_settings は削除しない。設定画面リロードで既存データ表示。正常 | OK |
| 8 | タグDnD並び替え | タグの順序をドラッグで変更して保存 | sort_order がDB更新される | TagsPanel.js L24: useDragReorder → HTML5 DnD。L26-49: saveTags で全active/archived の sort_order を UPDATE。正常 | OK ⚠️ 要実機確認：[設定→タグ]でタグをドラッグして並び替え、「並び順を保存」押下後、画面をリロードしても順序が維持されていること |

### ENH-5 自動完了ロジックの検証（重点チェック項目）

以下は `hooks/useTaskActions.js` の `handleStatusChange` 内の ENH-5 ロジック（L45-69）に対する検証。設定画面単体ではなく、自動完了の発動条件を横断的にテストする。

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|------------|----------|----------|------------|-------|
| 1 | 設定OFF + 子タスク全完了 | auto_complete_parent=OFF で子タスクを全て完了 | 親タスクは自動完了しない | L47-48: `db.select("SELECT value FROM app_settings WHERE key = 'auto_complete_parent'")` → value='0' → enabled=false → ロジックスキップ。正常 | OK |
| 2 | 設定ON + 子タスク全完了（2兄弟） | 2つの子タスクを両方完了 | 2つ目の子を完了した時点で親も自動完了 | L50-51: taskId の parent_id 取得 → L53: siblings 取得 → allComplete=true（1つ目は DB で status=3, 2つ目は s.id===taskId で true）→ L56-64: 親の status_code を確認 → 3 でなければ UPDATE + UI更新 + トースト。正常 | OK |
| 3 | 設定ON + 子タスク一部未完了 | 3兄弟のうち2つ完了、1つ未完了 | 親は自動完了しない | L54: `siblings.every(...)` → 未完了の兄弟で false → allComplete=false → 自動完了スキップ。正常 | OK |
| 4 | 設定ON + 親タスクなし（ルートタスク） | ルートタスクを完了 | 自動完了ロジックは発動しない | L50-51: `SELECT parent_id FROM tasks WHERE id=$1` → parent_id=NULL → L52: `if (parentId)` = false → スキップ。正常 | OK |
| 5 | 設定ON + 親タスクが既に完了 | 親が status=3 の状態で子を完了 | 親はそのまま（重複更新しない） | L57: `parentRows[0].status_code !== 3` = false → 条件スキップ。正常 | OK |
| 6 | 設定ON + 親タスクがキャンセル(5) | 親が status=5 の状態で全子タスクを完了 | 親がキャンセルから完了に変更されるべきではない | **NG-1**: L57 の条件は `parentRows[0].status_code !== 3` のみ。status_code=5（キャンセル）は !== 3 → true → 親が自動的に完了(3)に変更される。ユーザーが意図的にキャンセルした親タスクが、子タスクの完了により勝手に復活する | **NG** |
| 7 | 設定ON + 自動完了のUI更新 | 子タスク完了で親が自動完了 | 親タスクのUIが即座に完了状態に更新される | L59-63: `setTasks(prev => prev.map(t => t.id === parentId ? { ...t, status_code: 3, completed_at: completedNow } : t))`。正常 | OK |
| 8 | 設定ON + トースト通知 | 子タスク完了で親が自動完了 | 「子タスクがすべて完了したため、親タスクも完了にしました」トースト | L64: `window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '子タスクがすべて完了したため、親タスクも完了にしました', type: 'success' } }))`。正常 | OK |
| 9 | 設定ON + 子タスクを「未着手」に戻す | 親が自動完了済みの状態で子を未着手に戻す | 親は完了のまま（逆方向の自動変更はしない） | L46: `if (code === 3)` — code=1（未着手）は !== 3 → ブロック全体スキップ。親は変更されない。仕様通り | OK |
| 10 | today 画面から子タスク完了で自動完了発動 | today 画面で子タスクを完了 | 親がtoday画面のリストに存在すればUI更新、存在しなければDB更新のみ | today/page.js L222: `actions.handleStatusChange(taskId, newCode)` で useTaskActions の同一ハンドラが呼ばれる。setTasks は today の setTasks。親がリストにない場合 .map() は変更なし → DB更新のみ。エラーなし。正常 | OK |

**NG-1: auto_complete_parent がキャンセル済み(5)の親タスクにも自動完了を発動する** ✅ 修正済み

- **該当ファイル**: `hooks/useTaskActions.js:57`
- **再現手順**: [設定→オプション]で「子タスク全完了で親タスクも完了にする」をONにする → [タスク一覧]で親タスクのステータスを「キャンセル」に変更する → 子タスクを全て「完了」にする → 親タスクが自動的に「完了」に変更される
- **期待される挙動**: キャンセル済みの親タスクは自動完了の対象外とすべき。ユーザーが意図的にキャンセルしたタスクが、子タスクの操作により勝手に復活するのは予期しない動作
- **実際の挙動**: `hooks/useTaskActions.js:57` の条件 `if (parentRows[0] && parentRows[0].status_code !== 3)` はキャンセル(5)を除外していない。`5 !== 3` は true → 自動完了が発動し、キャンセル済み親タスクの status_code が 3（完了）に UPDATE される
- **原因の推定**: `handleStatusChange` L57 の条件が「既に完了済み(3)でない場合」のみチェックしており、キャンセル(5)を除外していない
- **修正案**: L57 を以下に変更:
  ```javascript
  if (parentRows[0] && parentRows[0].status_code !== 3 && parentRows[0].status_code !== 5) {
  ```
  これにより、キャンセル済みの親タスクは自動完了の対象外になる
- **影響度**: 中。auto_complete_parent 設定がONのユーザーのみ影響。キャンセル済み親+未完了子という状態の発生頻度は低いが、発生時にユーザーの意図に反する動作となる

### 総合判定

| 観点 | OK | NG | 合計 |
|------|----|----|------|
| 観点1：正常系テスト | 21 | 0 | 21 |
| 観点2：異常系・境界値テスト | 12 | 0 | 12 |
| 観点3：状態遷移・データ件数テスト | 8 | 0 | 8 |
| ENH-5 自動完了ロジック | 9 | 1 | 10 |
| **合計** | **50** | **1** | **51** |

#### NG 一覧

| ID | 内容 | 重要度 | ファイル・行番号 |
|----|------|--------|-----------------|
| NG-1 | auto_complete_parent がキャンセル済み(5)の親タスクにも自動完了を発動する（ユーザーが意図的にキャンセルした親が勝手に完了に変わる） | 中 | `hooks/useTaskActions.js:57` | ✅ 修正済み |

#### 要実機確認項目

| # | 画面 | 操作 | 確認内容 |
|---|------|------|----------|
| 1 | 設定→タグ | タグをドラッグして並び替え、「並び順を保存」押下後にリロード | 並び替えた順序が画面リロード後も維持されていること |
| 2 | 設定→オプション | 「子タスク全完了で親タスクも完了にする」トグルをON/OFF切替 | トグルのつまみが滑らかにスライドし、ONは紫/青、OFFはグレーで表示されること |

### 未検証画面

~~以下の画面は本チャットでは未検証。次チャット以降で順次検証すること。~~

- ~~**今日やるタスク画面** (`app/today/page.js`) — 4-2 で大規模変更あり。DnD・ステータス変更・フィルタ・ソート全般~~ → **STEP A-3 で検証済み**
- ~~**タスク一覧画面** (`app/tasks/page.js` + `components/TaskList.js`, `TaskItem.js`) — 4-1 processingIds + 4-2 CSS変更~~ → **STEP A-4 で検証済み**
- **ルーティン管理画面** (`app/routines/page.js`) — 4-1 CSS統一の影響確認
- **レイアウト共通部** (`app/layout.js`) — FAB・サイドバー・グローバルトースト

---

## リリース前検証 STEP A-3（v1.4.0）今日やるタスク画面

**検証対象**: `app/today/page.js` + `hooks/useTodayTasks.js` + `hooks/useTaskActions.js`（全機能 + 4-2 DnDギャップ方式統一 + 4-3 ENH-5 自動完了ロジックの today 画面での発動）
**検証方法**: コードリーディングベースの静的分析
**検証日**: 2026-03-01
**重点チェック項目**（バージョン変更分析より）:
- handleStatusChange の自動完了ロジック（ENH-5）と processingIds（BUG-7）の共存
- today 画面から子タスク完了時の自動完了動作

### 観点1：正常系テスト

| # | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|--------|----------|----------|------------|-------|
| 1 | ページ読み込み | 今日やるタスク画面を開く | スピナー表示後、タスク一覧が描画される | useTodayTasks: mount 時に useEffect でマスターデータ（statuses/tags/importance/urgency/settings）を並列取得 → loadTasks(selectedDate) で tasks/routines をマージ表示。loading=true でスピナー → loading=false で本体描画。正常 | OK |
| 2 | 日付タブ生成 | 画面表示時 | 今日〜7日後の8つのタブが表示される | buildDateTabs(): for i=0..7 で addDays。labels[0-2] = '今日/明日/明後日'、i≧3 は `月/日` 形式。weekdays で曜日表示。isWeekend 判定あり。正常 | OK |
| 3 | 日付タブ切替 | 別の日付タブをクリック | 対象日のタスク+ルーティンが表示される | setSelectedDate → useEffect(selectedDate, loadTasks) → loadTasks(newDate)。activeRequestId でレースコンディション防止。正常 | OK |
| 4 | ルーティン表示 | 今日アクティブなルーティンがある | ルーティンが 🔄 バッジ付きで表示される | useTodayTasks L134-171: enabled=1, end_date>=date のルーティンを取得。isRoutineActiveOnDate で日次/週次/月次を判定。completion_date で完了判定。TodayCardItem L85: 🔄バッジ。L63: `!!task.is_routine`。正常 | OK |
| 5 | ☀️ピック済みタスク表示 | today_date が設定されたタスク | 黄色ボーダー付きで表示、✕ボタンあり | SQL: `t.today_date = $1`。TodayCardItem L64: `isPickedForToday = task.today_date === selectedDate`。L70: `.picked` クラス → CSS `.today-card.picked { border-left: 3px solid var(--color-warning); }`。L114-115: ✕ボタン表示。正常 | OK |
| 6 | 期限日タスク表示 | due_date が選択日と一致 | 📅バッジ付きで表示、✕ボタン非表示 | SQL: `t.due_date = $2`。TodayCardItem L101: `task.due_date && !isDone` で 📅 表示。isPickedForToday=false → ✕ボタン非表示。正常 | OK |
| 7 | 期限切れタスク表示 | 期限切れの未完了タスクあり＋showOverdue=ON | 今日タブで期限切れタスクが表示される | useTodayTasks L188: `showOverdue && isViewingToday` のとき `OR (t.due_date < $3 AND t.status_code NOT IN (3, 5))` が SQL に追加。今日以外のタブでは非表示。正常 | OK |
| 8 | 今日完了タスク表示 | 今日完了したタスクがある | 完了済みタスクが取り消し線付きで表示される | SQL L189: `OR (t.status_code = 3 AND date(t.completed_at) = $4)`。TodayCardItem L62: `isDone = task.status_code === 3`。L70: `.done` クラス → opacity:0.55。L87: `.strike` クラス。正常 | OK |
| 9 | ステータスフィルタ | 特定のステータスでフィルタ | 該当ステータスのタスクのみ表示 | useTodayTasks L79-94: tConditions に `t.status_code IN (...)` 追加。ルーティンは完了/未完了の2状態マッピング（L85-93）。正常 | OK |
| 10 | タグフィルタ | 特定タグでフィルタ | 該当タグのタスク+ルーティンのみ表示 | useTodayTasks L100-108: task_tags/routine_tags サブクエリ。rSqlParams に個別パラメータ追加。正常 | OK |
| 11 | 重要度/緊急度フィルタ | 特定レベルでフィルタ | 該当レベルのタスク+ルーティンのみ表示 | useTodayTasks L110-128: IN 句で tasks/routines 両方にフィルタ適用。正常 | OK |
| 12 | ソートモード切替 | 手動/自動ボタンクリック | ソートモードが切り替わりDB保存 | useTodayTasks L238-253: toggleSortMode → setSortMode → DB INSERT OR REPLACE → 失敗時はロールバック+エラートースト。正常 | OK |
| 13 | 自動ソート各キー | ソートキーを変更 | 選択したキーでソートされる | taskComparator: priority/status/tag/due_asc/due_desc/created_desc/created_asc/importance/urgency の9キー対応。正常 | OK |
| 14 | 手動ソート | 手動モードでタスク表示 | today_sort_order 順 + 完了タスク末尾 | useTodayTasks L204-213: orderDiff → done/undone → importance サブソート。正常 | OK |
| 15 | 進捗リング | タスクが存在する状態 | 完了率がリングとパーセンテージで表示 | L240-247: stats 計算。total=0 → pct=0。pct=100 → stroke=color-success。残りタスク数+残り想定時間あり。正常 | OK |
| 16 | ステータス変更（通常タスク） | チェックボックスクリック | ステータスが変更され、完了時スパークルアニメ | L211-223: code=3 → justCompletedId設定+700msリセット。actions.handleStatusChange 呼出。楽観的更新+DB。正常 | OK |
| 17 | ステータス変更（ルーティン） | ルーティンのチェックボックスクリック | 完了(3)でINSERT、未完了でDELETE、着手中(2)はUI表示のみ | L217-220: isRoutine → handleRoutineStatusChange。useTaskActions L228-250: code=2→return(UI only)、code=3→INSERT、他→DELETE。正常 | OK |
| 18 | タスク除外（✕ボタン） | ☀️ピックタスクの✕をクリック | タスクがリストから除外され today_date=NULL | L227-236: 楽観的更新(filter) → DB UPDATE → 失敗時エラートースト+reloadTasks。正常 | OK |
| 19 | タスク編集モーダル | タスクタイトルクリック | 編集モーダルが開き、保存後にリロード | L88-89: `!isRoutine → onEdit(task)`。L611-619: TaskEditModal → onSaved → loadTasks(selectedDate)。ルーティンはクリック不可。正常 | OK |
| 20 | マイルストーンバナー | 完了率に応じて表示 | 1件完了/半分突破/全完了バナー | L393-407: pct<50&&completed>=1→スタートバナー。pct>=50&&pct<100→半分突破。pct=100&&total>0→完了バナー。isToday のみ表示。正常 | OK |
| 21 | DnDドラッグ＆ドロップ | 手動モードでカードをドラッグ | ドラッグオーバーレイ表示、ギャップにドロップで並び替え | L179-208: handleDragStart→setActiveId、handleDragEnd→reorder→persistTodaySortOrder。L409-421: DragOverlay。正常 ⚠️ 要実機確認：[今日やるタスク]で手動モードにしてカードをドラッグし、タスク間のギャップにドロップして並び替えが動作すること | OK |
| 22 | 完了スパークルアニメ | タスクを完了にする | チェックマークにスパークルアニメ表示 | L213-215: justCompletedId設定→700msリセット。TodayCardItem L78: `sparkle={justCompletedId === task.id}`。StatusCheckbox sparkle prop。正常 ⚠️ 要実機確認：[今日やるタスク]でタスクのチェックをクリックし、チェックマークに光の粒子アニメーションが表示されること | OK |
| 23 | taskAdded イベントリスナー | FABからタスク追加 | 今日やるタスクリストが自動更新 | useTodayTasks L233-235: `yarukoto:taskAdded` イベントで loadTasks 再実行。正常 | OK |

### 観点2：異常系・境界値テスト

| # | 対象フィールド/操作 | 入力内容 | 期待される挙動 | 実際の挙動 | OK/NG |
|---|---------------------|----------|----------------|------------|-------|
| 1 | タスク0件の表示 | 今日対象のタスク・ルーティン0件 | 空状態メッセージ表示 | L361-367: `!loading && tasks.length === 0` → 今日タブ「☀️ 今日やるタスクがありません」、他タブ「📅 {label}のタスクがありません」。正常 | OK |
| 2 | 特殊文字タイトル | タイトルに `<script>alert(1)</script>` | HTMLエスケープされて安全に表示 | React JSX `{task.title}` は自動エスケープ。SQLは `$1` パラメータ化。XSSなし。正常 | OK |
| 3 | SQLインジェクション | 全クエリ | パラメータ化クエリで防止 | useTodayTasks 全SQL: `$1, $2...` positional パラメータ使用。today/page.js handleRemove: `$1`。正常 | OK |
| 4 | 日付タブ高速切替 | タブを高速連打 | 最後のタブの結果のみ反映 | useTodayTasks L64: `++activeRequestId.current` → L218,224: `currentReq === activeRequestId.current` で古いリクエストの結果を破棄。レースコンディション防止。正常 | OK |
| 5 | DnDで同一位置にドロップ | カードを元の位置に戻す | 順序変わらず | handleDragEnd: oldIndex === targetIndex のとき splice で同じ配列が復元。persistTodaySortOrder は実行されるが同じ値でUPDATE（冪等）。正常 | OK |
| 6 | DnDでドロップ先なし | カードをドロップゾーン外にドロップ | 何も起きない | handleDragEnd L187: `if (!over) return;`。setActiveId(null) でドラッグ状態リセット。正常 | OK |
| 7 | ルーティンIDの一意性 | タスクID=5とルーティンID=5が共存 | key prop が衝突しない | useTodayTasks L160: ルーティンは `routine_${r.id}_${date}` 形式。タスクは数値ID。L370: `key={task.id}` で衝突なし。正常 | OK |
| 8 | showOverdue=false | 設定で期限切れ表示OFF | 期限切れタスクが非表示 | useTodayTasks L52-55: `show_overdue_in_today` 設定読み込み。L188: showOverdue=false → OR句が空文字列。$3 パラメータは SQL で未使用だが sqlParams に含まれる（SQLite は余分パラメータ無視）。正常 | OK |
| 9 | handleRemove のDB失敗 | DB書き込みエラー | エラートースト+リロード | L232-235: catch → console.error + エラートースト dispatch + reloadTasks()。正常（4-2 STEP B 修正済み） | OK |
| 10 | persistTodaySortOrder のDB失敗 | 並び替え保存中にDBエラー | エラートースト+リロード | L171-175: catch → console.error + エラートースト + reloadTasks()。正常 | OK |
| 11 | フィルタ組み合わせでのパラメータ整合性 | ステータス+タグ+重要度+緊急度を全て設定 | 全フィルタが正しく適用される | useTodayTasks: paramIndex / rParamIndex が独立管理。タスクSQL は $5以降、ルーティンSQL は $3以降で衝突なし。正常 | OK |
| 12 | ルーティンステータスフィルタで保留/キャンセルのみ選択 | filterStatuses=[4,5] | ルーティンが全除外される | L85-93: showComplete=false, showIncomplete=false → `1 = 0` → ルーティン全除外。正常 | OK |

### 観点3：状態遷移・データ件数テスト

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|------------|----------|----------|------------|-------|
| 1 | タスク0件 | 画面表示 | 空状態メッセージ + 進捗リング0% + バナー非表示 | tasks=[] → stats: total=0, pct=0。空状態メッセージ表示。マイルストーンバナーは total>0 条件で非表示。正常 | OK |
| 2 | 1件完了 | 1件のみのタスクを完了 | pct=100 → 完了バナー表示 | stats: total=1, completed=1, pct=100。L403-407: isToday && pct===100 && total>0 → 完了バナー。正常 | OK |
| 3 | フィルタで全件除外 | 該当なしのフィルタ適用 | 空状態メッセージ表示 | tasks=[] → 空状態表示。stats: total=0, pct=0。正常 | OK |
| 4 | 手動→自動ソート切替 | ソートモード変更 | タスク表示順が変わる | toggleSortMode → sortMode変更 → loadTasks依存配列に sortMode → 再fetch + 再ソート。正常 | OK |
| 5 | ルーティン+タスク混在 | 両方が今日対象 | ルーティンは 🔄 バッジ、タスクはステータスセレクト表示 | TodayCardItem L85: ルーティン→🔄バッジ。L108: `!isRoutine` でステータスセレクト。L114: `!isRoutine` で✕ボタン。正常 | OK |
| 6 | [重点] today画面で子タスク完了→ENH-5自動完了 | 設定ON、today画面で子タスクを全完了 | 親がtoday画面にあればUI更新、なければDB更新のみ | today/page.js L222: `actions.handleStatusChange(taskId, newCode)` → useTaskActions handleStatusChange L46-69: 自動完了ロジック。setTasks は today の setTasks → 親が tasks 配列にあれば .map() で完了に更新、なければ変更なし（DB更新は正常）。正常 | OK |
| 7 | [重点] processingIds の動作 | ステータス変更中に同タスク操作 | useTaskActions 内部では processingIds 管理中 | **NG-1**: useTaskActions は addProcessing/removeProcessing で processingIds を管理するが、TodayCardItem は processingIds / isProcessing prop を受け取らず、StatusCheckbox に disabled が渡されない。タスク一覧の TaskItem では `isProcessing={processingIds.has(task.id)}` → `disabled={isProcessing}` で保護されているのに対し、今日やるタスク画面では同等の保護がない | **NG** |
| 8 | 手動並び替え後の永続化 | DnDで並び替え → 画面遷移 → 戻る | 並び替え順が維持される | persistTodaySortOrder: forループで全タスクの today_sort_order を UPDATE。手動ソート時は today_sort_order 順で再読み込み。正常 ⚠️ 要実機確認：[今日やるタスク]で手動モードにしてカードを並び替え、他の画面に移動して戻ったとき順序が維持されていること | OK |
| 9 | 50件以上のタスク | 大量タスクが今日対象 | パフォーマンス以外は機能的に正常 | 全件リスト表示（仮想化なし）。persistTodaySortOrder は50回のDB UPDATE（busy_timeout 5000msで緩和）。機能的に問題なし | OK |
| 10 | 今日完了+期限切れ重複 | 今日完了した期限切れタスク | 1回のみ表示 | SQL: `GROUP BY t.id` で重複排除。status_code=3 → 期限切れ条件 `status_code NOT IN (3,5)` にマッチしない → 今日完了条件のみマッチ。1行表示。正常 | OK |

**NG-1: processingIds が今日やるタスク画面の UI に反映されていない**

- **該当ファイル**: `app/today/page.js:49-119`（TodayCardItem コンポーネント）
- **再現手順**: [今日やるタスク]画面でタスクのステータスを変更（チェックボックスクリック）→ DB更新完了前に同じタスクのステータスセレクトや✕ボタンをクリック
- **期待される挙動**: タスク一覧画面の TaskItem と同様に、操作中のタスクのボタン類が disabled になり操作不可になること
- **実際の挙動**: `useTaskActions` は内部で `processingIds` を管理し `addProcessing(taskId)` / `removeProcessing(taskId)` を実行するが、`TodayCardItem` コンポーネントは `processingIds` や `isProcessing` を props として受け取っていない。`StatusCheckbox`（L75-79）に `disabled` prop が渡されず、ステータスセレクト（L109-112）にも `disabled` がない。結果として、DB更新中も全ボタンがクリック可能なまま
- **原因の推定**: 4-1（BUG-7）で `components/TaskItem.js` と `components/TaskList.js` に `processingIds` 伝播を追加したが、`app/today/page.js` の `TodayCardItem` にはこの保護が追加されなかった。TodayCardItem は today/page.js 内のローカルコンポーネントであるため、TaskItem の修正の影響範囲外だった
- **修正案**: 以下の3箇所を修正:
  1. `app/today/page.js` の TodayCardItem に `processingIds` prop を追加
  2. StatusCheckbox に `disabled={processingIds.has(task.id)}` を追加
  3. ステータスセレクト（L109）に `disabled={processingIds.has(task.id)}` を追加
  4. ✕ボタン（L115）に `disabled={processingIds.has(task.id)}` を追加
  5. TodayCardItem の呼び出し元（L374-385）で `processingIds={actions.processingIds}` を渡す（`actions` は L147 で `useTaskActions` から取得済みで `processingIds` を含む）
- **影響度**: 低。今日やるタスク画面にはアーカイブ/復元ボタンがなく（BUG-7 の主要問題）、ステータス変更の連打は冪等な UPDATE のため実害は限定的。busy_timeout 5000ms による DB ロック緩和もあり

### 総合判定

| 観点 | OK | NG | 合計 |
|------|----|----|------|
| 観点1：正常系テスト | 23 | 0 | 23 |
| 観点2：異常系・境界値テスト | 12 | 0 | 12 |
| 観点3：状態遷移・データ件数テスト | 9 | 1 | 10 |
| **合計** | **44** | **1** | **45** |

#### NG 一覧

| ID | 内容 | 重要度 | ファイル・行番号 |
|----|------|--------|-----------------|
| NG-1 | processingIds が今日やるタスク画面の UI に反映されておらず、操作中の状態でもボタンが disabled にならない（タスク一覧との不一致） | 低 | `app/today/page.js:49-119`（TodayCardItem） | ✅ 修正済み |

#### 要実機確認項目

| # | 画面 | 操作 | 確認内容 |
|---|------|------|----------|
| 1 | 今日やるタスク | 手動モードにしてカードをドラッグし、ギャップにドロップ | カードの並び替えが動作し、画面遷移して戻っても順序が維持されること |
| 2 | 今日やるタスク | タスクのチェックをクリックして完了にする | チェックマークに光の粒子アニメーションが表示されること |
| 3 | 今日やるタスク | 日付タブを切り替える | 各日付のタスク+ルーティンが正しく切り替わって表示されること |

---

## リリース前検証 STEP A-4（v1.4.0）タスク一覧画面

**検証対象**: `app/tasks/page.js` + `components/TaskList.js` + `components/TaskItem.js` + `components/TaskInput.js` + `components/TaskEditModal.js` + `hooks/useTaskActions.js` + `hooks/useTaskDnD.js`（全機能 + 4-1 processingIds + 4-2 CSS統一 + 4-3 ENH-5 自動完了ロジック）
**検証方法**: コードリーディングベースの静的分析
**検証日**: 2026-03-01
**重点チェック項目**（バージョン変更分析より）:
- handleStatusChange の自動完了ロジック（ENH-5）と processingIds（BUG-7）の共存
- 自動完了の対象親ステータス（A-2 で NG-1 として検出済み、ここでは追加の観点を確認）

### 観点1：正常系テスト

| # | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|--------|----------|----------|------------|-------|
| 1 | ページ読み込み | タスク一覧画面を開く | TaskInput + TaskList 表示 | tasks/page.js: TaskInput + TaskList をマウント。TaskList: fetchTasks → loading → 表示。正常 | OK |
| 2 | タスク追加（簡易） | タイトル入力+Enter | タスクがリスト先頭に追加される | TaskInput L47-169: handleSubmit → sort_order = MIN-1 → INSERT → onTaskAdded → refreshKey++。正常 | OK |
| 3 | タスク追加（詳細） | フォーム展開+各フィールド入力+登録 | 全フィールドが保存される | TaskInput L74-90: INSERT with title/parent_id/status_code/importance/urgency/start_date/due_date/estimated_hours/notes/sort_order。タグ: L96-100 INSERT。正常 | OK |
| 4 | 子タスク追加 | ＋ボタン→TaskInput(predefinedParentId) | 子タスクが親の下に追加される | TaskItem L136,143: showSub → TaskInput with predefinedParentId。TaskInput L53: actualParentId = predefinedParentId。正常 | OK |
| 5 | タスク編集 | タスクカードのinfo領域クリック | 編集モーダルが開く | TaskItem L84: `onClick={() => onEdit(task)}`。TaskList L332: TaskEditModal。正常 | OK |
| 6 | タスク編集保存 | モーダルで変更+保存ボタン | 全フィールドが更新される | TaskEditModal L61-128: handleSave → UPDATE tasks SET ... + DELETE/INSERT task_tags。completed_at は CASE文で status_code=3 のとき自動設定。正常 | OK |
| 7 | タスク削除 | 🗑ボタン+confirm | 子タスクが独立化した上でタスク削除 | useTaskActions L79-91: confirm → parent_id NULL化 → DELETE。正常 | OK |
| 8 | ステータス変更（チェックボックス） | StatusCheckbox クリック | 3ステートで遷移: 未着手→完了、着手中→完了、完了→未着手 | StatusCheckbox: code=1→3（完了）、code=2→3（完了）、code=3→1（未着手）。▶で code=1→2（着手中）、↩で code=2→1（未着手）。disabled/cancelled 時は操作不可。正常 | OK |
| 9 | ステータス変更（セレクト） | ステータスドロップダウン変更 | 任意のステータスに変更可能 | TaskItem L120-123: select onChange → onStatusChange。allStatuses 全件表示。正常 | OK |
| 10 | 今日ピック（☀️ボタン） | ☀️ボタンクリック | today_date が設定/解除される | useTaskActions L93-105: handleTodayToggle → 楽観的更新 + DB UPDATE。エラー時トースト+fetchTasks。正常 | OK |
| 11 | アーカイブ | 完了/キャンセル済みタスクの📦ボタン | タスクがアーカイブ済みタブへ移動 | useTaskActions L107-162: handleArchive → バリデーション(status_code=3|5) → トランザクション(BEGIN/COMMIT/ROLLBACK) → 親の子も一括アーカイブ。正常 | OK |
| 12 | 復元 | アーカイブ済みタブの📤ボタン | タスクがタスクタブへ復元 | useTaskActions L164-215: handleRestore → トランザクション → 親+子/子+親をまとめて復元。正常 | OK |
| 13 | アーカイブタブ切替 | 📋/📦タブクリック | アクティブ/アーカイブ済みの切替表示 | TaskList L77-81: showArchived → fetchTasks 条件変更。L222-228: タブUI。正常 | OK |
| 14 | フィルタ（4種） | ステータス/タグ/重要度/緊急度で複数選択フィルタ | 条件に合致するタスクのみ表示 | TaskList L83-106: IN句 + サブクエリでフィルタ。paramIndex で正しくインクリメント。正常 | OK |
| 15 | 自動ソート | ソートキー変更 | 選択キーでソートされる | TaskList L181-189: sortedParentTasks → taskComparator。SORT_OPTIONS 9種。正常 | OK |
| 16 | 手動ソート切替 | ✋手動/🔀自動ボタン | ソートモード切替 + DB保存 | TaskList L145-160: toggleSortMode → INSERT OR REPLACE → 失敗時ロールバック+トースト。正常 | OK |
| 17 | 親子タスク展開/折りたたみ | ›ボタンクリック | 子タスク表示/非表示 | TaskItem L16: expanded state。L78-81: `childTasks.length > 0` で›ボタン表示。L145-171: expanded && childTasks で子表示。正常 | OK |
| 18 | DnD ネスト | タスクを他のタスクにドロップ | ドロップ先の子タスクになる | useTaskDnD L178-241: handleDragEnd → parent_id 更新 + タグ継承チェック + fetchTasks。正常 ⚠️ 要実機確認：[タスク一覧]でタスクを別のタスクにドラッグ＆ドロップし、子タスクとしてネストされること | OK |
| 19 | DnD アンネスト | 子タスクをUnnestGapにドロップ | ルートタスクに戻る | useTaskDnD L139-156: unnest → parent_id=NULL + sort_order更新。L171-176: isUnnestZone判定。正常 ⚠️ 要実機確認：[タスク一覧]で子タスクをタスク間の青い線にドラッグ＆ドロップし、ルートタスクに戻ること | OK |
| 20 | DnD 手動並び替え | 手動モードでReorderGapにドロップ | 並び順が変更され永続化 | useTaskDnD L67-129: handleReorder → splice + optimistic update + persistSortOrder。正常 | OK |
| 21 | タグ継承（DnD） | inherit_parent_tags=ON でネスト | 親タグが子に継承される | useTaskDnD L211-235: settingRows チェック → INSERT OR IGNORE task_tags → fetchTasks。正常 | OK |
| 22 | processingIds保護 | 操作中のボタン | disabled表示 | TaskList L297-298: `isProcessing={processingIds.has(task.id)}`, `processingIds={processingIds}`。TaskItem L75: `disabled={isProcessing}`。L116,121,130,134: `disabled={isProcessing}`。L162: 子 `isProcessing={isProcessing \|\| processingIds.has(c.id)}`。正常 | OK |
| 23 | DragOverlay表示 | タスクをドラッグ中 | 半透明のプレビューカード | TaskList L319-330: activeTaskData でタイトル付きプレビュー。正常 | OK |
| 24 | FAB追加イベント | FABからタスク追加 | タスク一覧が自動更新 | tasks/page.js L12-14: `yarukoto:taskAdded` イベントで refreshKey++。TaskList の key 変更で再マウント。正常 | OK |

### 観点2：異常系・境界値テスト

| # | 対象フィールド/操作 | 入力内容 | 期待される挙動 | 実際の挙動 | OK/NG |
|---|---------------------|----------|----------------|------------|-------|
| 1 | タイトル（空文字） | 空文字のまま送信 | 追加されない | TaskInput L49: `if (!title.trim() \|\| isSubmittingRef.current) return`。L302: `disabled={!title.trim() \|\| submitting}`。正常 | OK |
| 2 | タイトル（超長文字列） | 1000文字以上 | DB保存される、UIは折り返し | TEXT型制限なし。.tc-info `flex:1; min-width:0` で折り返し。正常 | OK |
| 3 | タイトル（特殊文字） | `' " < > & \ / ; --` | 安全に保存・表示 | SQL: $1 パラメータ化。UI: React 自動エスケープ。正常 | OK |
| 4 | 送信連打 | 追加ボタン高速連打 | 1回のみ登録 | TaskInput L49: `isSubmittingRef.current` ガード。L51-52: ref + state 二重ロック。正常 | OK |
| 5 | 想定工数（文字列） | "abc" | 無視される | TaskInput L87: `parseInt("abc")` = NaN → null として保存（`estimatedMinutes ? parseInt(...)` → falsy のまま）。正常。ただし HTML `type="number"` のため実際にはブラウザが数値入力を強制 | OK |
| 6 | 想定工数（負数） | "-10" | 負値として保存 | `parseInt("-10")` = -10。DB に保存される。UIで formatMin(-10) は負値表示になるが、input に `min="0"` が設定されている（L264）ためブラウザが負値入力を抑止 | OK |
| 7 | 子タスクを持つタスクを他の子にする（DnD） | 子持ちタスクを他タスクにドロップ | 拒否される | useTaskDnD L187-191: `activeChildren.length > 0` → `alert('子タスクを持つタスクは…')` → return。正常 | OK |
| 8 | 子タスクを他の子タスクにネスト（DnD） | 子を別の子にドロップ | 無視される | useTaskDnD L185: `if (parentTask.parent_id) return` → 3階層防止。正常 | OK |
| 9 | 自分自身にDnDドロップ | タスクを自身にドロップ | 何も起きない | useTaskDnD L179: `if (active.id === over.id) return`。正常 | OK |
| 10 | DB接続失敗 | Tauri IPC不可 | エラーログ出力 | TaskList L124: `catch(e) { console.error(...) }`。loading=false で空のリスト表示。正常 | OK |
| 11 | 使用中ステータスのタスク削除 | タスクを削除 | confirm後にDB削除（子は独立化） | useTaskActions L82-84: `UPDATE parent_id=NULL` → `DELETE`。ステータスマスターとは無関係。正常 | OK |
| 12 | アーカイブ（未完了タスク） | 未着手/着手中のタスクで📦ボタン | ボタンが表示されない | TaskItem L133: `task.status_code === 3 \|\| task.status_code === 5` のみ📦ボタン表示。正常 | OK |
| 13 | アーカイブ（未完了子タスクあり） | 子に未完了がある親をアーカイブ | エラートースト表示 | useTaskActions L131-138: children の status_code チェック → `hasInProgress` → トースト「未完了の子タスクがあるためアーカイブできません」+ fetchTasks。正常 | OK |
| 14 | 編集モーダル（タイトル空） | タイトルを空にして保存 | 保存ボタンが無効 | TaskEditModal L258: `disabled={!title.trim() \|\| saving}`。正常 | OK |
| 15 | 編集モーダル（子持ちタスクに親設定） | 子タスクを持つタスクに親を設定 | UI + DB 二重ガード | TaskEditModal L22,38-39: `hasChildren` → select disabled + placeholder「設定不可（子タスクあり）」。L67-80: DB 側バリデーション。正常 | OK |

### 観点3：状態遷移・データ件数テスト

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|------------|----------|----------|------------|-------|
| 1 | タスク0件 | タスク一覧表示 | 🌱 空状態メッセージ | TaskList L262-268: `!loading && parentTasks.length === 0 && !showArchived` → 🌱メッセージ。正常 | OK |
| 2 | アーカイブ0件 | アーカイブ済みタブ表示 | 📦 空状態メッセージ | TaskList L269-274: `showArchived` → 📦メッセージ。正常 | OK |
| 3 | 追加→編集→削除 | 1件のタスクで一連操作 | 各操作が正常動作 | 追加: refreshKey++ → 再fetch。編集: handleTaskEdited → refreshKey++。削除: handleDelete → refresh。正常 | OK |
| 4 | 50件以上のタスク | 大量タスク表示 | 全件リスト表示 | 仮想化なし。全件DOMレンダリング。機能的に問題なし（パフォーマンスは実機依存）| OK |
| 5 | 親子構造の表示 | 親+子タスクが混在 | 親の下に子が表示、フィルタで親不在なら子がルート表示 | TaskList L167: parentTasks フィルタ。子の親がフィルタで除外された場合 `!tasks.some(p => p.id === t.parent_id)` → true → ルートレベル表示。TaskItem L85-86: `📌 {task.parent_title} ›` ラベル。正常 | OK |
| 6 | [重点] ENH-5 自動完了 + processingIds | 子タスク完了で親自動完了 | 親のUI更新+トースト、processingIds は子のみ管理 | useTaskActions L29: addProcessing(childId)。L46-69: 自動完了ロジック。L58: 親DB更新。L59-63: 親UI楽観的更新。L64: トースト。L75: removeProcessing(childId)。**parentId は processingIds に追加されない**が、自動完了は同一 await 内で高速完了し、直後に removeProcessing が呼ばれるため実質的リスクは極低 | OK |
| 7 | [重点] ENH-5 自動完了のエラー時 | 親DB更新失敗 | fetchTasksでロールバック | L70-73: catch → エラートースト + fetchTasks。子の DB 更新は成功済み（L40-43）。fetchTasks で DB の実状態を読み込む → 子は完了、親は未完了。整合性あり | OK |
| 8 | showArchived 切替 | タスク←→アーカイブ済み | 表示タスクが切り替わる | TaskList L77-81: showArchived → fetchTasks 依存で再 fetch。手動並び替えボタンは showArchived=true で非表示（L237）。正常 | OK |
| 9 | 手動並び替え子タスクの ReorderGap | 手動モードで子タスクをドラッグ | 同じ親の子タスク間にのみ ReorderGap 表示 | TaskItem L150-151: `sortMode === 'manual' && activeId && activeDragParentId === task.id` → 親IDが一致する場合のみ ReorderGap 表示。正常 | OK |
| 10 | 復元時の親子連動 | 子タスクを復元 | 親タスクも一緒に復元 | useTaskActions L190-191: `task.parent_id` → 親の archived_at=NULL。楽観的更新で両方をフィルタ除去。トースト「子タスクと親タスクを復元しました」。正常 | OK |

### 総合判定

| 観点 | OK | NG | 合計 |
|------|----|----|------|
| 観点1：正常系テスト | 24 | 0 | 24 |
| 観点2：異常系・境界値テスト | 15 | 0 | 15 |
| 観点3：状態遷移・データ件数テスト | 10 | 0 | 10 |
| **合計** | **49** | **0** | **49** |

**結果: 全件OK。NG項目なし。**

（注: ENH-5 の「キャンセル済み親タスクにも自動完了が発動する」問題は STEP A-2 の NG-1 として既に報告済み。本画面の検証で追加の NG は発見されなかった）

#### 要実機確認項目

| # | 画面 | 操作 | 確認内容 |
|---|------|------|----------|
| 1 | タスク一覧 | タスクを別のタスクにドラッグ＆ドロップ | 子タスクとしてネストされ、親の下にインデント表示されること |
| 2 | タスク一覧 | 子タスクをタスク間の青い線にドラッグ＆ドロップ | ルートタスクに戻ること |
| 3 | タスク一覧 | 手動モードでカードを並び替え | 並び替え後、画面リロードしても順序が維持されていること |

### 未検証画面

~~以下の画面は本チャットでは未検証。次チャット以降で順次検証すること。~~

- ~~**ルーティン管理画面** (`app/routines/page.js`) — 4-1 CSS統一の影響確認~~ → **STEP A-5 で検証済み**
- ~~**レイアウト共通部** (`app/layout.js`) — FAB・サイドバー・グローバルトースト~~ → **STEP A-6 で検証済み**

**全画面検証済み**

---

## リリース前検証 STEP A-5（v1.4.0）ルーティン管理画面

**検証対象**: `app/routines/page.js` + `app/routines/_components/RoutineFormModal.js`（全機能）
**検証方法**: コードリーディングベースの静的分析
**検証日**: 2026-03-01
**v1.4.0 影響分析**: ルーティン管理画面は useTaskActions / TaskList / TaskItem / DndGaps を使用せず、v1.4.0 の3枝番（BUG-7 / IMP-13 / ENH-1+ENH-5）の直接的なコード変更なし。lib/db.js の auto_complete_parent シード（INSERT OR IGNORE）は routines 機能に無関係。→ リグレッションがないことの確認が主目的

### 観点1：正常系テスト

| # | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|--------|----------|----------|------------|-------|
| 1 | ページ読み込み | ルーティン画面を開く | スピナー表示後、ルーティン一覧が描画される | page.js L22-45: loadRoutines → setLoading(true) → SQL SELECT + LEFT JOIN tags → parseTags → setRoutines → setLoading(false)。loading中はスピナー表示(L120)。正常 | OK |
| 2 | 有効/停止タブ切替 | 有効タブ→停止中タブ | タブに応じたルーティンが表示、件数バッジ更新 | L103-116: activeTab state。L108: `routines.filter(r => r.enabled).length`。L114: `routines.filter(r => !r.enabled).length`。L86-88: filteredRoutines フィルタ。正常 | OK |
| 3 | クイック有効/停止トグル | カード内のトグルスイッチ操作 | 楽観的UI更新 + DB保存、トースト表示 | L59-72: handleQuickToggle → e.stopPropagation() → 楽観的更新 → DB UPDATE → flash('ok')。正常 | OK |
| 4 | クイック有効/停止エラー時 | DB保存失敗 | UI ロールバック + エラートースト | L67-71: catch → ロールバック（元の enabled 復元）→ flash('err', '更新に失敗しました')。正常 | OK |
| 5 | 新規作成モーダル表示 | ＋新規作成ボタン | 空フォームのモーダルが開く | L49-52: handleOpenModal(null)。RoutineFormModal L28-47: routine=null → getEmptyForm()。正常 | OK |
| 6 | 編集モーダル表示 | カードクリック | 既存データが入ったモーダルが開く | L133: onClick → handleOpenModal(r)。RoutineFormModal L29-44: 各フィールド復元。tags: `routine.tags.map(t => t.id)`。正常 | OK |
| 7 | ルーティン新規保存 | フォーム入力+保存 | DB INSERT + タグ保存 + リスト更新 | RoutineFormModal L108-127: INSERT → lastInsertId → tags INSERT → flash('ok') → onClose → onSaved。正常 | OK |
| 8 | ルーティン更新保存 | 編集+保存 | DB UPDATE + タグ再構築 + リスト更新 | L88-107: UPDATE → DELETE routine_tags → tags INSERT → flash('ok') → onClose → onSaved。正常 | OK |
| 9 | ルーティン削除 | 削除ボタン+confirm | DB DELETE + リスト更新 | L135-145: confirm → DELETE → flash('ok') → onClose → onSaved。CASCADE で routine_tags/routine_completions も削除。正常 | OK |
| 10 | 頻度表示（毎日） | daily ルーティン | 「毎日」または「毎営業日 (月-金)」 | L74-76: weekdays_only or holiday_action='skip' → '毎営業日 (月-金)'。正常 | OK |
| 11 | 頻度表示（毎週） | weekly ルーティン | 「毎週 月・水・金」形式 | L77-80: days_of_week.split(',') → DAY_LABELS → join('・')。正常 | OK |
| 12 | 頻度表示（毎月） | monthly ルーティン | 「毎月 15日」または「毎月末」 | L81: monthly_type='end_of_month' → '毎月末'、'date' → `毎月 ${day_of_month}日`。正常 | OK |
| 13 | タグ・見積・終了日表示 | 各メタ情報付きルーティン | カード内に各バッジ表示 | L140-148: tags.map → バッジ。estimated_hours > 0 → ⏱表示。end_date → 📅表示。正常 | OK |
| 14 | トースト通知 | 各操作成功/失敗時 | トースト表示→3秒後消滅 | L19-20: flash → setToast → setTimeout 3000 → null。L172: toast表示。正常 | OK |
| 15 | Escapeキー・バックドロップ | モーダル表示中 | モーダルが閉じる | RoutineFormModal L52-56: Escape → onClose()。L149: backdrop onClick → onClose。正常 | OK |
| 16 | 曜日選択（週次） | 曜日ボタンクリック | トグルで選択/解除 | L58-64: toggleDow → includes判定 → filter/push → sort → join。正常 | OK |
| 17 | 休日対応設定 | 各 holiday_action 選択 | frequency に応じた選択肢表示 | L228-237: forward/backward は `frequency !== 'daily'` のみ表示。正常 | OK |
| 18 | 有効/無効トグル（モーダル内） | 編集時のトグルスイッチ | フォーム状態が切り替わる | L264-284: editingId のみ表示。form.enabled トグル → アイコン/テキスト動的変更。正常 | OK |

### 観点2：異常系・境界値テスト

| # | 対象フィールド/操作 | 入力内容 | 期待される挙動 | 実際の挙動 | OK/NG |
|---|---------------------|----------|----------------|------------|-------|
| 1 | タイトル（空文字） | 空文字のまま保存 | 保存されない | RoutineFormModal L68: `if (!form.title.trim()) return`。L337: `disabled={!form.title.trim()}`。二重ガード。正常 | OK |
| 2 | タイトル（特殊文字） | `' " < > &` | 安全に保存・表示 | DB: $1 パラメータ化。UI: React JSX 自動エスケープ。正常 | OK |
| 3 | 週次で曜日未選択 | 曜日を1つも選択せず保存 | エラートースト | L69-71: 空文字チェック → flash('err', '曜日を1つ以上選択してください')。正常 | OK |
| 4 | 月日指定（境界値 0, 31） | 0日 or 31日 | 0日は機能的に無効（表示されない）、31日は30日月でスキップ | L195: `min="1" max="31"` でブラウザ側バリデーション。isRoutineActiveOnDate で不一致→非表示。実害なし | OK |
| 5 | 見積時間（0分） | 0を入力 | DB に 0 保存、カードに非表示 | RoutineFormModal: `Number("0")` = 0。page.js L143: `estimated_hours > 0` = false → 非表示。正常 | OK |
| 6 | DB保存失敗（新規/更新/削除） | 各DB操作エラー | エラートースト表示 | L132/L144: catch → flash('err', '保存/削除に失敗しました')。正常 | OK |
| 7 | SQL パラメータ安全性 | 全クエリ | SQLインジェクション防止 | 全SQL で $1〜$13 パラメータ化。正常 | OK |
| 8 | holiday_action サニタイズ | daily で forward/backward が残存 | none に矯正 | L82: 頻度変更時のフォーム残値を payload レベルで矯正。正常 | OK |
| 9 | 終了日クリア | ✕終了日をクリア ボタン | end_date='' → DB に null 保存 | L255: onClick → end_date=''。L81: `form.end_date || null` → null。正常 | OK |
| 10 | 削除確認キャンセル | confirm ダイアログで「いいえ」 | 何も起こらない | L137: `if (!confirm(...)) return`。正常 | OK |

### 観点3：状態遷移・データ件数テスト

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|------------|----------|----------|------------|-------|
| 1 | ルーティン0件 | ルーティン画面表示 | 空状態メッセージ + ＋新規作成ボタン | L122-130: filteredRoutines.length===0 → rt-empty。active → 📭「有効なルーティンはありません」。archived → 🗑️「停止中のルーティンはありません」。正常 | OK |
| 2 | 有効5件/停止2件 | タブ切替 | 件数バッジが正しく表示 | L108: 有効5。L114: 停止2。filteredRoutines で各タブ切り替え。正常 | OK |
| 3 | 全ルーティン停止 | 全てを停止に切替 | 有効タブ0件 + 停止タブに全件表示 | 有効(0)→空状態、停止(N)→全件表示。正常 | OK |
| 4 | 新規作成→即編集 | 新規保存後にカードクリック | 保存データが正しく表示 | onSaved → loadRoutines → 最新データ表示。カードクリック → handleOpenModal(r) → 復元。正常 | OK |
| 5 | 作成→削除 | 作成直後に削除 | ルーティンが削除される | 保存 → loadRoutines → カード表示 → クリック → 削除 → confirm → DELETE → loadRoutines。正常 | OK |
| 6 | 頻度変更（daily↔weekly↔monthly） | 編集モーダルで頻度変更 | 頻度固有UIが動的表示 | weekly → rt-dow-container表示。monthly → 月日指定UI表示。daily → 両方非表示。payload サニタイズで不要フィールド=null。正常 | OK |
| 7 | 50件以上のルーティン | 大量ルーティン表示 | 全件リスト表示 | filteredRoutines.map で全件レンダリング。animationDelay で順次アニメ。機能的問題なし | OK |
| 8 | [v1.4.0] lib/db.js 新シードとの共存 | アプリ起動 | auto_complete_parent シードがルーティンに影響しない | lib/db.js L250-251: app_settings への INSERT OR IGNORE。routines テーブルに変更なし。正常 | OK |

### 総合判定

| 観点 | OK | NG | 合計 |
|------|----|----|------|
| 観点1：正常系テスト | 18 | 0 | 18 |
| 観点2：異常系・境界値テスト | 10 | 0 | 10 |
| 観点3：状態遷移・データ件数テスト | 8 | 0 | 8 |
| **合計** | **36** | **0** | **36** |

**結果: 全件OK。NG項目なし。v1.4.0 による直接的なコード変更がないため、リグレッションも発生していない。**

#### 要実機確認項目

| # | 画面 | 操作 | 確認内容 |
|---|------|------|----------|
| 1 | ルーティン | カード内のトグルスイッチをクリック | 有効/停止が切り替わり、トーストが表示されること |
| 2 | ルーティン | 新規作成→週次→曜日ボタンをタップ | 曜日ボタンが選択状態（青）になり、保存後のカードに正しい曜日が表示されること |

---

## リリース前検証 STEP A-6（v1.4.0）レイアウト共通部

**検証対象**: `app/layout.js`（サイドバー + FABボタン + グローバルトースト + DB エラーハンドリング + サイドバー進捗バー）
**検証方法**: コードリーディングベースの静的分析
**検証日**: 2026-03-01
**v1.4.0 影響分析**: ENH-5 が useTaskActions.js L64 で `yarukoto:toast` グローバルイベントを新たに発火するため、layout のグローバルトーストハンドラとの整合性確認が必要。fetchTodayProgress の SQL クエリ自体に v1.4.0 での変更はないが、ENH-5 の自動完了によるタスク status_code 変化がサイドバー進捗に正しく反映されるか確認

### 観点1：正常系テスト

| # | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|--------|----------|----------|------------|-------|
| 1 | 初期レンダリング | アプリ起動 | mounted=false→true でレイアウト描画 | L24-32: setTimeout(0) で mounted=true + document.title='Yarukoto'。L190: `{mounted && children}` で子ページは mounted 後に描画。suppressHydrationWarning で SSG/CSR ミスマッチ回避。正常 | OK |
| 2 | サイドバーナビ | ナビ項目5つ表示 | 各ページへのリンクが正しく機能 | L130-136: 5項目（ダッシュボード/今日/タスク一覧/ルーティン/設定）。L163: pathname === href で active クラス。正常 | OK |
| 3 | サイドバー折りたたみ | «/»ボタンクリック | サイドバーが折りたたみ/展開 | L152-158: isCollapsed toggle。L142: collapsed クラス。L147: Y/Yarukoto 切替。正常 | OK |
| 4 | FABボタン表示 | mounted 後 | 右下にFABボタン表示 | L195-204: mounted && → fab ボタン。position:fixed, bottom:1.75rem, right:1.75rem。z-index:1000。正常 | OK |
| 5 | FABモーダル表示 | FABクリック | TaskInput を含むモーダルが開く | L199: setFabOpen(v => !v)。L206-222: fabOpen → backdrop + fab-modal + TaskInput。正常 | OK |
| 6 | FABモーダルからタスク追加 | タスク追加完了 | モーダル閉じ + yarukoto:taskAdded イベント発火 | L215-219: onTaskAdded → setFabOpen(false) + dispatchEvent('yarukoto:taskAdded')。正常 | OK |
| 7 | FABモーダル閉じ | Esc / backdrop / ページ遷移 | モーダルが閉じる | L58-63: Escape。L208: backdrop onClick。L66-69: pathname変更。正常 | OK |
| 8 | グローバルトースト表示 | yarukoto:toast イベント | トースト3秒表示 | L45-55: handleToast → setToast → setTimeout 3000 → null。L228-231: toast-ok/toast-err + ✅/❌ + message。正常 | OK |
| 9 | [ENH-5] 自動完了トースト表示 | 子タスク全完了で親自動完了 | 成功トースト表示 | useTaskActions L64: `{ message: '子タスクがすべて完了したため...', type: 'success' }`。layout L229: `toast.type === 'error'` = false → ✅ + message。CSS: toast-ok（緑背景）。正常 | OK |
| 10 | DBエラーハンドリング | DB初期化失敗 | error.js boundary に遷移 | L35-40: yarukoto:dberror → setDbError。L42: throw dbError → Next.js error boundary。正常 | OK |
| 11 | サイドバー進捗バー | 今日対象タスクあり | 完了率バー + 数値表示 | L170-187: total > 0 で表示。completed/total + %。100%で color-success。正常 | OK |
| 12 | 30秒間隔進捗更新 | アプリ使用中 | 進捗バーが定期更新 | L123-128: setInterval 30000。pathname変更でも再実行。正常 | OK |
| 13 | fetchTodayProgress タスクカウント | 4条件OR | 正しいカウント | L77-85: today_date / due_date / overdue / today-completed。status_code!=5 + archived_at IS NULL。重複なし（単一行で複数条件マッチしてもOR結合で1行）。正常 | OK |
| 14 | fetchTodayProgress ルーティンカウント | 有効ルーティン取得 | daily/weekly/monthly 判定 | L92-103: enabled=1, end_date>=today, frequency条件。L113-117: total++ / completion_date で completed++。weekdays_only && isWeekend で除外。正常 | OK |

### 観点2：異常系・境界値テスト

| # | 対象フィールド/操作 | 入力内容 | 期待される挙動 | 実際の挙動 | OK/NG |
|---|---------------------|----------|----------------|------------|-------|
| 1 | todayProgress.total = 0 | 今日対象なし | 進捗バー非表示 | L170: `todayProgress.total > 0` = false → 未レンダリング。正常 | OK |
| 2 | 全タスク完了 (100%) | 全対象完了 | 100% + 緑色バー | L174: `Math.round((completed/total)*100)` = 100。L181: `completed === total` → color-success。正常 | OK |
| 3 | fetchTodayProgress DB接続失敗 | Tauri IPC不可 | コンソールエラーのみ | L120: catch → console.error。todayProgress={total:0, completed:0} のまま → 進捗バー非表示。正常 | OK |
| 4 | トースト連続発火 | 短時間に複数トースト | 最新トーストが表示 | setToast で上書き。前のsetTimeout は並走するが setToast(null) は冪等。最悪ケース: 後発トーストの表示が前のタイマーで早く消える。軽微なUX問題だが既存動作 | OK |
| 5 | [ENH-5] 自動完了トーストと他トーストの競合 | 同時発火の可能性 | 競合なし | handleStatusChange: 正常系は自動完了トースト(L64)のみ。エラー時はcatch(L72)のみ（L64到達前にthrow）。同時発火しない。正常 | OK |
| 6 | FABモーダル内タスク追加失敗 | DB INSERT エラー | エラートースト + モーダル開いたまま | TaskInput: catch → yarukoto:toast(error)。onTaskAdded 未呼出 → fabOpen=true 維持。正常 | OK |
| 7 | SQL パラメータ安全性 | 全クエリ | SQLインジェクション防止 | fetchTodayProgress: $1〜$4 パラメータ化。正常 | OK |

### 観点3：状態遷移・データ件数テスト

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|------------|----------|----------|------------|-------|
| 1 | mounted=false→true | 初期レンダリング→setTimeout | サイドバー枠→全コンテンツ描画 | mounted=false: children/FAB/進捗バー非表示。mounted=true: 全表示。正常 | OK |
| 2 | FAB開閉サイクル | 開く→閉じる→開く | 各状態が正しく遷移 | fabOpen: false→true→false→true。fab-open クラス/backdrop/modal 切替。正常 | OK |
| 3 | サイドバー折りたたみサイクル | 折りたたむ→展開 | isCollapsed 切替 | isCollapsed: false→true→false。collapsed クラス。ロゴ Y/Yarukoto 切替。正常 | OK |
| 4 | 進捗0%→50%→100% | タスク順次完了 | バーが伸びる | 次回 fetchTodayProgress（30秒ごと or ページ遷移）で更新。100%で色変化。正常 | OK |
| 5 | [v1.4.0] ENH-5 自動完了後の進捗反映 | 子タスク全完了→親自動完了 | サイドバー進捗が次回ポーリングで更新 | 自動完了で親 status_code=3 → 次回 fetchTodayProgress で反映。親が today_date/due_date 設定済みなら completed 増加。未設定でも condition 4（today-completed）でカウント。最大30秒遅延は既存動作。正常 | OK |
| 6 | ページ遷移で進捗更新 | 別ページに遷移 | 進捗バーが最新状態に更新 | L128: pathname 依存配列 → fetchTodayProgress 再実行。正常 | OK |
| 7 | dbError 発生 | DB初期化失敗 | error boundary に遷移 | L42: throw dbError → error.js がキャッチ。正常 | OK |

### 総合判定

| 観点 | OK | NG | 合計 |
|------|----|----|------|
| 観点1：正常系テスト | 14 | 0 | 14 |
| 観点2：異常系・境界値テスト | 7 | 0 | 7 |
| 観点3：状態遷移・データ件数テスト | 7 | 0 | 7 |
| **合計** | **28** | **0** | **28** |

**結果: 全件OK。NG項目なし。ENH-5 のグローバルトースト連携は正しく動作する。**

#### 要実機確認項目

| # | 画面 | 操作 | 確認内容 |
|---|------|------|----------|
| 1 | レイアウト | 子タスクを全て完了して ENH-5 自動完了を発動させる | 「子タスクがすべて完了したため、親タスクも完了にしました」の緑トーストが右下に表示されること |
| 2 | レイアウト | FABボタン→タスク追加→閉じる | モーダルが正常に開閉し、追加後にトーストが表示されること |
| 3 | レイアウト | サイドバーの«ボタンをクリック | サイドバーが折りたたまれ、ロゴが「Y」に変わること |

---

## リリース前検証 STEP A 全画面サマリー（v1.4.0）

### 検証完了画面一覧

| # | 画面 | テスト数 | OK | NG | 検証 |
|---|------|----------|----|----|------|
| A-1 | ダッシュボード | 32 | 32 | 0 | 完了 |
| A-2 | 設定画面 + ENH-5 自動完了ロジック | 51 | 50 | 1 | 完了 |
| A-3 | 今日やるタスク画面 | 45 | 44 | 1 | 完了 |
| A-4 | タスク一覧画面 | 49 | 49 | 0 | 完了 |
| A-5 | ルーティン管理画面 | 36 | 36 | 0 | 完了 |
| A-6 | レイアウト共通部 | 28 | 28 | 0 | 完了 |
| **合計** | | **241** | **239** | **2** | |

### NG 一覧（全画面）

| ID | 画面 | 内容 | 重要度 | ファイル・行番号 |
|----|------|------|--------|-----------------|
| A-2 NG-1 | 設定+自動完了ロジック | auto_complete_parent がキャンセル済み(5)の親タスクにも自動完了を発動する | 中 | `hooks/useTaskActions.js:57` | ✅ 修正済み |
| A-3 NG-1 | 今日やるタスク | processingIds が TodayCardItem UI に反映されず、操作中もボタンが disabled にならない | 低 | `app/today/page.js:49-119` | ✅ 修正済み |

### 要実機確認項目（全画面）

| # | 画面 | 操作 | 確認内容 |
|---|------|------|----------|
| 1 | ダッシュボード | ウィンドウ幅768px以下 | リングカード・グラフが縦1列に並び替わること |
| 2 | ダッシュボード | タスク完了後に表示 | 「🎉 今日完了したタスク」セクション表示 |
| 3 | ダッシュボード | ルーティン完了後に表示 | 🔁バッジ付きルーティン表示 |
| 4 | 設定→タグ | DnD並び替え+保存+リロード | 順序が維持されること |
| 5 | 設定→オプション | auto_complete_parent トグル切替 | つまみの滑らかなスライド |
| 6 | 今日やるタスク | 手動モードDnD並び替え | 並び替え動作+永続化 |
| 7 | 今日やるタスク | チェックボックスクリック | スパークルアニメーション |
| 8 | 今日やるタスク | 日付タブ切替 | タスク+ルーティン切替表示 |
| 9 | タスク一覧 | DnDネスト | 子タスク化 |
| 10 | タスク一覧 | DnDアンネスト | ルートタスク復帰 |
| 11 | タスク一覧 | 手動モード並び替え | 順序永続化 |
| 12 | ルーティン | トグルスイッチ操作 | 有効/停止切替+トースト |
| 13 | ルーティン | 週次ルーティン曜日選択 | 曜日ボタン選択状態+保存 |
| 14 | レイアウト | ENH-5 自動完了発動 | 緑トースト表示 |
| 15 | レイアウト | FABタスク追加 | モーダル開閉+トースト |
| 16 | レイアウト | サイドバー折りたたみ | 折りたたみ/展開動作 |

---

## STEP B：品質レビュー（v1.4.0 枝番4-3）

**検証対象**: ENH-1 ダッシュボード改善 + ENH-5 子タスク自動完了オプション
**検証方法**: コードリーディングベースの静的分析
**検証日**: 2026-03-01
**スコープ**: 今回の枝番で変更した `app/dashboard/page.js`（ENH-1 今日完了セクション追加）、`app/settings/_components/OptionsPanel.js`（ENH-5 トグルUI追加）、`hooks/useTaskActions.js`（ENH-5 自動完了ロジック追加）、`lib/db.js`（auto_complete_parent シード追加）を起点に、関連する `app/layout.js`（グローバルトースト）、`app/settings/page.js`（設定画面CSS）、`app/today/page.js`（today画面からの自動完了発動）、`app/routines/page.js`（トーストスタイル比較）との一貫性を含む

### 観点1：エラーハンドリング確認

| # | 異常条件 | 挙動 | エラーメッセージの有無と内容 | データへの影響 | OK/NG |
|---|----------|------|----------------------------|--------------|-------|
| 1 | DBファイルが存在しない・破損している場合 | `lib/db.js:14-35`: getDb() が `Database.load('sqlite:tasks.db')` で初期化。失敗時は catch (L24-31) で `globalThis[DB_PROMISE_KEY] = null` にリセットし、`yarukoto:dberror` カスタムイベントを dispatch。`layout.js:35-40` のリスナーが受け取り `setDbError` → L42 `throw dbError` で Next.js error boundary に遷移 | **あり**。`yarukoto:dberror` イベント経由で error boundary にフォールバック。ユーザーにはエラー画面が表示される | なし（DB接続自体が失敗するため、データの読み書きが発生しない） | OK |
| 2 | 設定ファイル（app_settings）が存在しない・不正な内容の場合 | app_settings は `lib/db.js:128-131` の `CREATE TABLE IF NOT EXISTS` で自動作成。L173-181 で初期シード、L251 で `auto_complete_parent` を `INSERT OR IGNORE`。テーブル自体が破損している場合は DB 接続エラーとして #1 と同じ経路で処理。`hooks/useTaskActions.js:47-48`: ENH-5 の設定読み込みは `db.select(...)` → `settingRows[0]?.value === '1'`。行が見つからない場合 `undefined === '1'` → false → 自動完了は無効（安全側にフォールバック）。`OptionsPanel.js:8`: `appSettings[key] || '0'` で未定義キーは '0' 扱い | **あり（間接的）**。設定値が取得できない場合、機能は無効側にフォールバック。ユーザーには通常の状態が表示される | なし | OK |
| 3 | ディスク書き込み権限がない場合：ENH-5 自動完了ロジックの DB 更新失敗 | `hooks/useTaskActions.js:37-76`: `handleStatusChange` の try ブロック内で子タスクのステータス変更（L39-43）は成功するが、自動完了の親タスク UPDATE（L58）が失敗した場合 → catch (L70-73) に遷移 → エラートースト表示 + `fetchTasks()` で DB の実状態を復元。**子のステータス変更は既にコミット済みで巻き戻らない**が、親のステータスは変更されない。fetchTasks で正しい状態が読み込まれるため UI とDB の整合性は維持される | **あり**。`window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: 'ステータスの変更に失敗しました', type: 'error' } }))` (L72) | 子タスクは完了に変更済み、親は未変更。データ損失なし | OK |
| 4 | ディスク書き込み権限がない場合：OptionsPanel トグル保存失敗 | `OptionsPanel.js:17-21`: catch → `setAppSettings(prev => ({ ...prev, [key]: current }))` で楽観的更新をロールバック + `flash('err', '設定の保存に失敗しました')` | **あり**。`flash('err', '設定の保存に失敗しました')` で設定画面ローカルトースト表示 | なし（楽観的更新がロールバックされるため UI と DB の整合性維持） | OK |
| 5 | ディスク書き込み権限がない場合：ダッシュボード loadDashboard 読み込み失敗 | `dashboard/page.js:144-148`: catch → `console.error("Dashboard Tauri DB Error", err)` のみ。finally で `setLoading(false)`。data=null → L163 `if (!data) return null` で**何も表示されない（白画面）** | **なし**。ユーザー向けエラーメッセージがない。console.error のみ。他の画面（tasks, routines, settings）も同じパターン（catch で console.error のみ）だが、ダッシュボードは read-only 画面のため深刻度は低い | なし（読み取りのみ） | OK |
| 6 | 想定外のデータ型：ダッシュボード SQLクエリ結果が空 | `dashboard/page.js:38-40`: `todayTasks[0]?.total || 0` でオプショナルチェーン + fallback。L136: `overallData[0]?.total || 0`。L169: `Math.max(..., 1)` でゼロ除算防止。全カウンタが 0 の場合もゼロ除算なく正常にリング 0% 表示 | N/A（エラー状態にならない） | なし | OK |
| 7 | 想定外のデータ型：ENH-1 completed_at が NULL のタスク | `dashboard/page.js:250-252`: `t.completed_at && (...)` で NULL チェック。`t.completed_at.split(' ')[1]?.slice(0, 5)` — completed_at が空文字列の場合 `''.split(' ')[1]` = undefined → `undefined?.slice(0, 5)` = undefined → 表示されない。安全 | N/A（エラー状態にならない） | なし | OK |
| 8 | 想定外のデータ型：ENH-5 settingRows が空配列 | `useTaskActions.js:47-48`: `settingRows[0]?.value === '1'` — settingRows=[] → `undefined?.value` = undefined → `undefined === '1'` = false → 自動完了無効。安全側にフォールバック | N/A（エラー状態にならない） | なし | OK |
| 9 | 想定外のデータ型：ENH-5 taskRows が空（タスクが削除済み） | `useTaskActions.js:50-51`: `taskRows[0]?.parent_id` — taskRows=[] → undefined → L52 `if (parentId)` = false → スキップ。安全 | N/A | なし | OK |
| 10 | ENH-5 自動完了の楽観的UI更新（L59-63）後に即座にエラーが throw された場合 | 楽観的に親タスクが完了表示。しかし catch (L70) は子タスクのステータス変更全体を覆うため、自動完了だけが失敗するシナリオでも fetchTasks でDB実状態に復帰。親は未変更（DB更新失敗）なので、fetchTasks 後のUIは正しい状態に戻る | **あり**（L72 エラートースト）。ただしメッセージは「ステータスの変更に失敗しました」で、自動完了特有の文言ではない。子のステータス変更自体は成功している可能性がある点で若干不正確だが、fetchTasks で正しい状態に復帰するため許容範囲 | なし（fetchTasks で復旧） | OK |

### 観点2：一貫性レビュー

| # | 観点 | 箇所A | 箇所B | 不整合の内容 | ファイル名:行番号 |
|---|------|-------|-------|------------|-----------------| 
| 1 | 同種の操作でUI挙動が異なる箇所：トグル設定の ON 判定ロジック | `OptionsPanel.js:40` `inherit_parent_tags === '1'`、`OptionsPanel.js:80` `auto_complete_parent === '1'` | `OptionsPanel.js:60` `show_overdue_in_today !== '0'` | **`inherit_parent_tags` と `auto_complete_parent`（ENH-5 新規追加）は `=== '1'` で ON 判定するのに対し、`show_overdue_in_today` のみ `!== '0'` で ON 判定**。通常は `'0'` か `'1'` しか保存されないため実質的に同じ結果だが、万が一空文字や NULL が入った場合に挙動が異なる（`'' !== '0'` は true → ON 扱い vs `'' === '1'` は false → OFF 扱い） | `app/settings/_components/OptionsPanel.js:40,60,80` | **NG** |
| 2 | 同種の操作でUI挙動が異なる箇所：ルーティン画面トグル色 vs 設定画面トグル色 | `app/routines/page.js:231` `.rt-switch.on { background: #34c759; }`（iOS 緑） | `app/settings/page.js:235` `.opt-toggle.on { background: var(--color-primary) }`（アプリのプライマリカラー = 青/紫系） | **同じ「ON/OFF トグルスイッチ」UIパーツだが、ON 時の色が異なる**。ルーティン画面は iOS スタイルの緑（#34c759）、設定画面はアプリのプライマリカラー（var(--color-primary)）。ENH-5 の `auto_complete_parent` トグルは設定画面側の `.opt-toggle` を使用するため青/紫系。同じアプリ内でトグルのON色が2種類存在する | `app/routines/page.js:231` (.rt-switch.on) `app/settings/page.js:235` (.opt-toggle.on) | **NG** |
| 3 | 文言の揺れ：トースト通知の動詞表現 | `useTaskActions.js:64` 自動完了トースト: `'子タスクがすべて完了したため、親タスクも完了にしました'` | `useTaskActions.js:85` 削除トースト: `'タスクを削除しました'`、L154 アーカイブ: `'アーカイブしました'`、L207 復元: `'復元しました'` | 文言パターンの確認。自動完了トーストは理由を含む丁寧な文言で、他のトーストは動作完了のみの簡潔な文言。**不整合ではなく、自動完了は「ユーザーが直接操作していない」自動処理のため理由の説明が適切**。問題なし | N/A | OK |
| 4 | エラーメッセージのトーン・粒度の不統一 | `useTaskActions.js:72` ステータス変更失敗: `'ステータスの変更に失敗しました'` | `OptionsPanel.js:20` 設定保存失敗: `'設定の保存に失敗しました'` | エラーメッセージの書式確認。全エラーメッセージが「〜に失敗しました」の統一パターン。問題なし | N/A | OK |
| 5 | 日付・時刻フォーマットの不統一 | `useTaskActions.js:31` `new Date().toLocaleDateString('sv-SE') + ' ' + new Date().toLocaleTimeString('sv-SE')` | `dashboard/page.js:251` `t.completed_at.split(' ')[1]?.slice(0, 5)` | フォーマット確認。useTaskActions は楽観的 UI 用に `YYYY-MM-DD HH:MM:SS` 形式を生成。DB 側は `datetime('now', 'localtime')` で同じ形式。dashboard は `.split(' ')[1]?.slice(0, 5)` で `HH:MM` を抽出。整合性あり | N/A | OK |
| 6 | CSS変数値・クラス名の構造的不一致：ダッシュボード ENH-1 セクションのバッジスタイル | `dashboard/page.js:326-328` `.done-badge`: `background: var(--color-success); font-size: 0.7rem; padding: 0.1rem 0.5rem; border-radius: 10px;` | `dashboard/page.js:347-349` `.overdue-badge`: `background: var(--color-danger); font-size: 0.7rem; padding: 0.1rem 0.5rem; border-radius: 10px;` | 同一画面内の done-badge と overdue-badge が同じレイアウト構造（font-size/padding/border-radius 統一）。問題なし | N/A | OK |
| 7 | CSS変数値・クラス名の構造的不一致：ダッシュボードカードスタイル | `dashboard/page.js:291-295` `.db-card`: `background: var(--color-surface); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1.25rem 1.5rem;` | `dashboard/page.js:324` `.db-today-done`: `border-color: rgba(22, 163, 74, 0.2); background: rgba(22, 163, 74, 0.02);` | ENH-1 の今日完了セクションは `.db-card` を継承して `.db-today-done` で border-color/background をオーバーライド。既存の `.db-overdue`（L346）と同じパターン。問題なし | N/A | OK |
| 8 | 余白・フォントサイズの不統一：設定画面トーストとグローバルトースト | `app/settings/page.js:259-267` `.s-toast`: `position:fixed; bottom:1.5rem; right:1.5rem; padding:.75rem 1.25rem;` | `app/layout.js:356-370` `.global-toast`: `position:fixed; bottom:calc(1.75rem + 52px + 0.75rem); right:1.75rem; padding:0.75rem 1.25rem;` | 設定画面のローカルトーストは `bottom:1.5rem; right:1.5rem` で FAB ボタンの下に表示されるが、グローバルトーストは `bottom:calc(1.75rem + 52px + 0.75rem)` で FAB の上に表示。**位置が異なるのは、設定画面のトーストは FAB と重なる可能性がある**。ただしこれは v1.4.0 以前から存在する既存設計で、今回の枝番での変更ではない | N/A | OK |
| 9 | 同種の操作でUI挙動が異なる箇所：削除時の確認ダイアログ | `useTaskActions.js:80` タスク削除: `confirm('このタスクを削除しますか？')` | `OptionsPanel.js:108-128` auto_archive_days onBlur: 確認なし（即保存） | 確認ダイアログの使い分け確認。削除操作は confirm あり、設定変更は楽観的更新+即保存。自動完了トグルも即保存（L7-21）。**これは「不可逆操作は確認あり」「可逆操作は確認なし」の設計方針として一貫している**。問題なし | N/A | OK |

**NG-1: トグル設定の ON 判定ロジックが不統一** ✅ 修正済み

- **該当ファイル**: `app/settings/_components/OptionsPanel.js:40,60,80`
- **問題の具体的な内容**: 3つのトグル設定のON判定ロジックが統一されていない。
  - `inherit_parent_tags` (L40): `appSettings.inherit_parent_tags === '1'`
  - `show_overdue_in_today` (L60): `appSettings.show_overdue_in_today !== '0'`
  - `auto_complete_parent` (L80, ENH-5 新規追加): `appSettings.auto_complete_parent === '1'`
  
  コード断片：
  ```javascript
  // L40: inherit_parent_tags
  className={`opt-toggle ${appSettings.inherit_parent_tags === '1' ? 'on' : ''}`}
  // L60: show_overdue_in_today（他と異なる判定）
  className={`opt-toggle ${appSettings.show_overdue_in_today !== '0' ? 'on' : ''}`}
  // L80: auto_complete_parent
  className={`opt-toggle ${appSettings.auto_complete_parent === '1' ? 'on' : ''}`}
  ```
  同様に `aria-checked` も L43 は `=== '1'`、L63 は `!== '0'`、L83 は `=== '1'`。
- **期待される挙動**: 全トグルが同一の判定ロジック（`=== '1'` または `!== '0'`）を使用すべき
- **実際の挙動**: `show_overdue_in_today` のみ `!== '0'` で、値が空文字・undefined・その他の文字列の場合に他のトグルと異なる結果になる可能性がある
- **原因の推定**: `show_overdue_in_today` は v1.1.0 で初期値 `'1'`（デフォルトON）として追加されたため、`!== '0'` で「明示的にOFFにされていなければON」というロジックが採用された。他の2つは初期値 `'0'`（デフォルトOFF）のため `=== '1'` で「明示的にONにされた場合のみON」。デフォルト値の違いに起因する意図的な差異の可能性があるが、`toggleSetting` (L7-22) は `'0'` と `'1'` しか書き込まないため、実質的な差異は初期値が `'1'` のキーが未登録の場合のみ。db.js L177 で `INSERT OR IGNORE` 済みのため通常は発生しない
- **推奨**: 全トグルを `=== '1'` に統一する（`show_overdue_in_today` の L60, L63 を `appSettings.show_overdue_in_today === '1'` に変更）。初期値 `'1'` は db.js L177 でシード済みのため、`=== '1'` でも正しく ON として判定される
- **影響度**: 極低。通常は `'0'`/`'1'` のみが値として存在するため実害なし

**NG-2: ルーティン画面トグルと設定画面トグルの ON 色が不統一** ✅ 修正済み

- **該当ファイル**: `app/routines/page.js:231` (`.rt-switch.on`)、`app/settings/page.js:235` (`.opt-toggle.on`)
- **問題の具体的な内容**: 同じ「ON/OFF トグルスイッチ」UI パーツの ON 時の色が異なる。
  - ルーティン画面: `.rt-switch.on { background: #34c759; }`（iOS の緑色）
  - 設定画面: `.opt-toggle.on { background: var(--color-primary) }`（アプリのプライマリカラー = 青/紫系）
  
  ENH-5 で新規追加した `auto_complete_parent` トグルは設定画面の `.opt-toggle` を使用するため、青/紫系のON色で表示される。
- **期待される挙動**: アプリ全体でトグルスイッチの ON 色が統一されていること
- **実際の挙動**: ルーティン画面で iOS ライクな緑トグル、設定画面でアプリのプライマリカラーのトグルが混在
- **原因の推定**: ルーティン画面のトグルは v1.0.0 で iOS スタイルを参考に実装（`.rt-switch` は `#34c759` ハードコーディング）。設定画面のトグルは v1.1.0 以降で `var(--color-primary)` を使用する設計に変更。両者が統一されないまま残っている
- **推奨**: どちらかに統一。以下のいずれか：
  - (A) ルーティン画面を `var(--color-primary)` に変更（アプリ全体のデザイントーンに合わせる）
  - (B) 設定画面を `#34c759` に変更（ON=緑はユーザーにとって直感的）
  - (C) v2.0.0 の UI 全面リニューアルまで現状維持とする
- **影響度**: 低。視覚的な不統一。機能面の問題はない。⚠️ 要実機確認：[ルーティン]画面のトグルスイッチと[設定→オプション]画面のトグルスイッチを見比べて、ON時の色が異なっていること

### 総合判定

| 観点 | OK | NG | 合計 |
|------|----|----|------|
| 観点1：エラーハンドリング確認 | 10 | 0 | 10 |
| 観点2：一貫性レビュー | 7 | 2 | 9 |
| **合計** | **17** | **2** | **19** |

#### NG 一覧

| ID | 内容 | 重要度 | ファイル・行番号 |
|----|------|--------|-----------------|
| NG-1 | トグル設定の ON 判定ロジック不統一（`show_overdue_in_today` のみ `!== '0'`、他2つは `=== '1'`） | 極低 | `app/settings/_components/OptionsPanel.js:40,60,80` | ✅ 修正済み |
| NG-2 | ルーティン画面トグルと設定画面トグルの ON 色不統一（`#34c759` vs `var(--color-primary)`） | 低 | `app/routines/page.js:231` `app/settings/page.js:235` | ✅ 修正済み |

#### 要実機確認項目

| # | 画面 | 操作 | 確認内容 |
|---|------|------|----------|
| 1 | ルーティン → 設定→オプション | 両画面のトグルスイッチをONにして見比べる | ルーティン画面のトグルが緑色、設定画面のトグルが青/紫色で、色が異なっていること（NG-2 の実機確認） |
