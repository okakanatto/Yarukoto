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

| # | 機能名 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|--------|----------|----------|------------|-------|
| 1 | DndContext セットアップ | 今日やるタスク画面を表示 | DndContext が PointerSensor（distance:8）と closestCorners で初期化される | `today/page.js:155-157` で PointerSensor を distance:8 で設定、L259 で DndContext に sensors と closestCorners を渡している。タスク一覧画面（TaskList.js:41-43）と同一のセンサー設定 | OK |
| 2 | TodayCardItem レンダリング | 手動モードで今日やるタスクを表示 | 各カードに useDraggable が適用され、ドラッグハンドル（⋮⋮）が表示される | `today/page.js:50-53` で useDraggable を設定。L72-74 で `isManual` が true のときのみドラッグハンドルを表示。disabled は `!isManual` で制御 | OK |
| 3 | TodayCardItem 自動モード | 自動ソートモードで今日やるタスクを表示 | ドラッグハンドルが非表示、ドラッグ無効 | `useDraggable({ disabled: !isManual })` で自動モード時は disabled=true。L72 の `isManual &&` でハンドルも非表示 | OK |
| 4 | ReorderGap レンダリング | 手動モードでカードをドラッグ開始 | タスク間にギャップゾーン（N+1個）が出現 | `today/page.js:366-386`: tasks.map で各タスクの前後にギャップを配置。i===0 時に `reorder-today-0`、各タスク後に `reorder-today-{i+1}`。3件のタスクなら 4個のギャップが生成される。条件 `isManual && activeId` でドラッグ中のみ表示 | OK |
| 5 | handleDragStart | カードのドラッグハンドルをドラッグ開始 | activeId にドラッグ対象の task.id がセットされる | `today/page.js:179-181` で `setActiveId(event.active.id)` を実行。activeId が設定されることで ReorderGap が表示条件を満たす | OK |
| 6 | handleDragEnd 並び替えロジック | タスク [A,B,C] で A を gap-2（B の後）にドロップ | 結果が [B,A,C] になる | `today/page.js:183-208`: targetIndex=2、oldIndex=0。splice で A を除去 → [B,C]。oldIndex(0) < targetIndex(2) → targetIndex-- → 1。splice(1,0,A) → [B,A,C]。正しい | OK |
| 7 | handleDragEnd 末尾への移動 | タスク [A,B,C] で A を gap-3（C の後）にドロップ | 結果が [B,C,A] になる | targetIndex=3、oldIndex=0。splice → [B,C]。0<3 → targetIndex=2。splice(2,0,A) → [B,C,A]。正しい | OK |
| 8 | handleDragEnd 先頭への移動 | タスク [A,B,C] で C を gap-0（先頭）にドロップ | 結果が [C,A,B] になる | targetIndex=0、oldIndex=2。splice → [A,B]。2 は 0 未満でない → 調整なし。splice(0,0,C) → [C,A,B]。正しい | OK |
| 9 | persistTodaySortOrder DB 永続化 | 並び替え後のDB保存 | ルーティンは routines.today_sort_order、通常タスクは tasks.today_sort_order を更新 | `today/page.js:160-176`: forループで全タスクを走査。`t.is_routine` で分岐し、ルーティンは `routine_id` で UPDATE、通常タスクは `t.id` で UPDATE。sort_order は 1始まり（idx+1）。`lib/db.js:210-217` で両テーブルに today_sort_order カラムがマイグレーション済み | OK |
| 10 | persistTodaySortOrder エラー処理 | DB 書き込み失敗 | エラートースト表示 + reloadTasks でDB状態に復帰 | `today/page.js:171-175`: catch 内で `console.error(err)`、エラートースト `'並び替えの保存に失敗しました'` を dispatch、`reloadTasks()` で DB から再取得 | OK |
| 11 | DragOverlay プレビュー | カードをドラッグ中 | ドラッグ中のカードのプレビューが表示される | `today/page.js:405-417`: activeTaskData が存在する場合、タイトルとドラッグハンドルを含む簡易プレビューを表示。ルーティンの場合は 🔄 バッジも表示。opacity:0.8、scale:1.02 で半透明・拡大表示 | OK |
| 12 | ドラッグ中の元カード表示 | カードをドラッグ中 | ドラッグ元のカードが半透明になる | `today/page.js:55-59`: useDraggable の transform と isDragging を使用。isDragging 時に opacity:0.3、zIndex:100 を適用 | OK |
| 13 | StatusCheckbox 連携 | TodayCardItem 内でステータス変更 | ステータスが正しく変更される（ルーティン/通常タスク分岐） | `today/page.js:75-78`: StatusCheckbox の onChange が `onStatusChange(task.id, newCode, isRoutine)` を呼ぶ。L211-224 の handleStatusChange で isRoutine を判定し、ルーティンは `actions.handleRoutineStatusChange`、通常タスクは `actions.handleStatusChange` にルーティング | OK |
| 14 | 編集モーダル連携 | TodayCardItem のタイトルクリック | タスク編集モーダルが開く（ルーティン以外） | `today/page.js:86-91`: `!isRoutine` の場合のみ `onEdit(task)` を呼び、L378 で `setEditingTask` が実行される。L625-634 で editingTask が存在する場合に TaskEditModal を表示 | OK |
| 15 | 今日やるから外す（✕ボタン） | ピック済みタスクの ✕ ボタンクリック | タスクが今日やるリストから除外される | `today/page.js:114-116`: `!isRoutine && isPickedForToday` の場合のみ ✕ ボタン表示。L227-233 の handleRemove で楽観的にフィルタ + DB の today_date を NULL に更新 | OK |
| 16 | ReorderGap ドロップハイライト | ギャップ上にホバー | ギャップラインがハイライト表示される | `components/DndGaps.js:26-35`: useDroppable の isOver を使用。drag-over クラスでスタイル変更。`today/page.js:608-622` のグローバルスタイルで `.tl-reorder-gap.drag-over` に padding:8px、ライン height:3px + accent color + box-shadow | OK ⚠️ 要実機確認：[今日やるタスク]画面で手動モードにしてカードをドラッグ → タスク間の線が紫色にハイライトされること |
| 17 | ソートモード切替 | 「✋手動」⇔「🔀自動」ボタンクリック | ソートモードが切り替わり、手動時のみギャップ＋ドラッグハンドルが表示される | `today/page.js:255` で `isManual = sortMode === 'manual'`。useTodayTasks.js:238-253 の toggleSortMode で楽観的更新 + DB保存。手動時は DnD ハンドル＋ギャップが表示、自動時は非表示 | OK |

### 観点2：異常系・境界値テスト

| # | 対象フィールド/操作 | 入力内容 | 期待される挙動 | 実際の挙動 | OK/NG |
|---|---------------------|----------|----------------|------------|-------|
| 1 | handleDragEnd: ドロップ先なし | ドラッグして何もない場所でリリース | 並び替え不実行、activeId をクリア | `today/page.js:187`: `if (!over) return;` で早期リターン。L185 の `setActiveId(null)` はリターン前に実行されるため、activeId は確実にクリアされる | OK |
| 2 | handleDragEnd: 非 ReorderGap へのドロップ | 他の UI 要素上でドロップ | 並び替え不実行 | `today/page.js:189`: `if (!overIdStr.startsWith('reorder-today-')) return;` で ReorderGap 以外のドロップターゲットを無視 | OK |
| 3 | handleDragEnd: 同じ位置へのドロップ | B(index=1) を gap-1 にドロップ | 配列順序が変わらない（同一位置への no-op） | targetIndex=1、oldIndex=1。splice(1,1) → [A,C]。1 は 1 未満でない → 調整なし。splice(1,0,B) → [A,B,C]。元と同じ配列。persistTodaySortOrder は実行される（同じ値の書き込み、無害だが冗長） | OK |
| 4 | handleDragEnd: 存在しないタスクID | tasks 配列に含まれない active.id | 並び替え不実行 | `today/page.js:194`: `if (oldIndex < 0) return;`。indexOf が -1 を返した場合に早期リターン | OK |
| 5 | persistTodaySortOrder: ルーティン・通常タスク混在 | ルーティン（is_routine=true）と通常タスク（is_routine=undefined）の混在配列 | それぞれ正しいテーブルを更新 | `today/page.js:165-169`: `if (t.is_routine)` で分岐。ルーティンは `t.routine_id`（数値）で routines テーブルを更新。通常タスクは `t.id`（数値）で tasks テーブルを更新。`is_routine` は `useTodayTasks.js:166` で `true` にセット、通常タスクは `undefined`（falsy） | OK |
| 6 | TodayCardItem: ルーティンタスクのドラッグ | 手動モードでルーティンタスクをドラッグ | 通常タスクと同様にドラッグ可能 | `useDraggable({ id: task.id, disabled: !isManual })`。ルーティンの id は `routine_5_2026-03-01` 形式の文字列。@dnd-kit の UniqueIdentifier は string|number を受け付けるため問題なし | OK |
| 7 | handleDragEnd: ReorderGap ID のパース | `reorder-today-10` や `reorder-today-0` | 正しいインデックスが取得される | `today/page.js:191`: `parseInt(overIdStr.replace('reorder-today-', ''))` で数値変換。`reorder-today-10` → 10、`reorder-today-0` → 0。parseInt は先頭の数値部分のみ変換するため安全 | OK |
| 8 | PointerSensor distance 閾値 | 7px 以下の微小なドラッグ | ドラッグが開始されない（誤操作防止） | `today/page.js:156`: `activationConstraint: { distance: 8 }` で 8px 以上の移動がないとドラッグ開始しない。タスク一覧画面と同一の閾値 | OK |
| 9 | DragOverlay: activeTaskData が null | ドラッグしていない状態 | DragOverlay は空（何も表示しない） | `today/page.js:406-416`: `activeTaskData ? (...) : null`。activeId が null のとき `activeTaskData` も null（L256: `activeId ? tasks.find(t => t.id === activeId) : null`）。DragOverlay 内は null を返す | OK |
| 10 | handleStatusChange: ルーティンが tasks に存在しない | ルーティンステータス変更時に対象が見つからない | 早期リターン | `today/page.js:218-219`: `const item = tasks.find(t => t.id === taskId); if (!item) return;` で見つからない場合は return。actions.handleRoutineStatusChange は呼ばれない | OK |

### 観点3：状態遷移・データ件数テスト

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|------------|----------|----------|------------|-------|
| 1 | タスク 0 件 | 手動モードで画面表示 | 空状態メッセージ表示、ギャップは出現しない | `today/page.js:357-363`: `!loading && tasks.length === 0` で空メッセージ表示。L365-386 の tasks.map は空配列で何も描画しない。ギャップの条件 `isManual && activeId` は activeId が null のため不成立 | OK |
| 2 | タスク 1 件 | 手動モードでドラッグ開始 | ギャップが 2 個（先頭と末尾）出現。並び替え先はどちらも同一位置 | tasks=[A] の場合: gap-0（先頭）+ A + gap-1（末尾）= 2 ギャップ。gap-0 にドロップ: targetIndex=0, oldIndex=0 → splice → [A] → 同一位置。gap-1 にドロップ: targetIndex=1, oldIndex=0 → splice(0,1) → [] → 0<1 → targetIndex=0 → splice(0,0,A) → [A] → 同一位置。いずれも no-op | OK |
| 3 | タスク 50 件以上 | 手動モードでドラッグ | 51 個のギャップが出現。persistTodaySortOrder で 50 件の UPDATE が実行される | ギャップ数は tasks.length + 1。persistTodaySortOrder は for ループで全件 UPDATE。50件でも個別 UPDATE で問題なし（トランザクションは使用していないが、each UPDATE は独立。失敗時は catch で reloadTasks） | OK |
| 4 | ルーティン＋通常タスク混在 | 3 ルーティン + 2 通常タスクの混在でドラッグ | 5 件が正しく並び替えされ、DB 永続化時にそれぞれ正しいテーブルを更新 | handleDragEnd は id ベースで配列操作。persistTodaySortOrder で `t.is_routine` 判定で分岐。ルーティン id（string）と通常タスク id（number）が混在しても indexOf で正しくマッチ（型が一致するため） | OK |
| 5 | ドラッグ中にステータス変更 | カード A をドラッグ中に、カード B のステータスを変更 | @dnd-kit が PointerSensor でポインターをキャプチャしているため、ドラッグ中に他カードのクリック操作は通常発生しない | PointerSensor はアクティブ中にポインターイベントをキャプチャする。仮に別経路でステータス変更が起きた場合: tasks state が更新 → handleDragEnd の依存配列に tasks があるため最新の tasks で再生成 → ドロップ時に最新状態で処理。安全 | OK |
| 6 | ソートモード切替直後のドラッグ | 自動→手動に切替直後にドラッグ開始 | sortMode が 'manual' に更新され、ドラッグが有効化 | `useTodayTasks.js:241` で `setSortMode(newMode)` が同期的に状態更新。React の再レンダリング後、`isManual = sortMode === 'manual'` が true に。useDraggable の `disabled: !isManual` が false になりドラッグ可能に | OK |
| 7 | 日付タブ切替後のドラッグ | 「今日」→「明日」タブに切替後にドラッグ | 明日のタスクリストで並び替えが正しく動作 | `today/page.js:124` で selectedDate が変更 → useTodayTasks の useEffect（L231-236）で loadTasks(selectedDate) が呼ばれ新しい日付のタスクを取得。persistTodaySortOrder の reloadTasks は `useCallback(() => loadTasks(selectedDate), [loadTasks, selectedDate])` で最新の selectedDate を使用 | OK |
| 8 | フィルタ適用中のドラッグ | ステータスフィルタで「着手中」のみ表示中にドラッグ | フィルタされたタスクのみが並び替え対象。persistTodaySortOrder で表示中のタスクの sort_order のみ更新 | handleDragEnd は `tasks`（フィルタ済み配列）を使用。persistTodaySortOrder も同じフィルタ済み配列で DB 更新。非表示タスクの sort_order は変更されない。フィルタ解除後は loadTasks で全件再取得（sort_order が部分的に更新されている可能性がある点に注意。ただし非表示タスクの sort_order は元のまま維持） | OK |
| 9 | 操作の連続実行（並び替え → ステータス変更） | 手動並び替え直後にステータスを完了に変更 | 並び替えの DB 保存と ステータス変更が独立して実行される | persistTodaySortOrder は await で逐次実行。完了後にステータス変更が可能。persistTodaySortOrder 実行中は UI がブロックされないため、ユーザーはステータス変更を開始できる。ただし DB ロック競合の可能性は低い（SQLite の busy_timeout 5000ms で待機） | OK |
| 10 | 高速連続ドラッグ | ドラッグ&ドロップを素早く 3 回連続実行 | 各回の並び替えが楽観的に反映され、最終的に最後の配列順でDB保存 | 各 handleDragEnd で setTasks → 楽観的 UI 更新 → persistTodaySortOrder（非同期）。1回目の persist 完了前に 2回目が開始する可能性がある。各 UPDATE は異なる行を対象とするため DB ロック競合は低い。エラー時は reloadTasks で復帰 | OK |

### 総合判定

| 観点 | OK | NG | 合計 |
|------|----|----|------|
| 観点1：正常系テスト | 17 | 0 | 17 |
| 観点2：異常系・境界値テスト | 10 | 0 | 10 |
| 観点3：状態遷移・データ件数テスト | 10 | 0 | 10 |
| **合計** | **37** | **0** | **37** |

**結果: 全件OK。NG項目なし。**

実装は以下の点で品質が確認された：
- handleDragEnd の並び替えロジック（インデックス調整）が全パターンで正しく動作する
- ルーティンと通常タスクの混在配列を正しく処理し、DB 永続化時に適切なテーブルを更新する
- @dnd-kit の DndContext / useDraggable / useDroppable (ReorderGap) の構成がタスク一覧画面と同一のパターンに従っている
- エッジケース（0件、1件、ドロップ先なし、同一位置ドロップ、存在しないID）がすべてガードされている
- PointerSensor の distance:8 による誤操作防止がタスク一覧と統一されている

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

| # | 異常条件 | 挙動 | エラーメッセージの有無と内容 | データへの影響 | OK/NG |
|---|----------|------|----------------------------|--------------|-------|
| 1 | DBファイルが存在しない・破損している場合 | `lib/db.js:14-31` の `getDb()` が初期化失敗をキャッチし、`globalThis[DB_PROMISE_KEY] = null`（リトライ可能化）。`yarukoto:dberror` カスタムイベントを dispatch。`layout.js:35-42` がこのイベントをリッスンして render 中に throw → Next.js error boundary でエラー画面表示 | `yarukoto:dberror` イベント経由で error boundary が catch。ユーザーにはエラー画面が表示される | データ損失なし。DB が完全に開けない場合は書き込み操作自体が到達しない | OK |
| 2 | 設定が存在しない場合（`sort_mode_today` 等がDBに未登録） | `useTodayTasks.js:57-58`: `db.select('SELECT value FROM app_settings WHERE key = $1', ['sort_mode_today'])` → rows が空配列 → `if (rows.length > 0)` 条件を満たさず → `useState('auto')` のデフォルト値がそのまま使用される | なし（デフォルト値にフォールバック） | なし | OK |
| 3 | ディスク書き込み権限がない場合：`persistTodaySortOrder` の DB 失敗 | `today/page.js:160-176`: try/catch で `fetchDb()` または `db.execute()` の失敗を catch。`console.error(err)` + エラートースト dispatch + `reloadTasks()` で DB 状態に復帰 | `'並び替えの保存に失敗しました'`（type: 'error'）が表示される | 楽観的 UI 更新は `reloadTasks()` で DB 実値に復帰。データ損失なし | OK |
| 4 | ディスク書き込み権限がない場合：`handleRemove` の DB 失敗 | `today/page.js:227-233`: try/catch で catch。`console.error(e); reloadTasks();` のみ。**エラートーストが dispatch されていない**。楽観的更新（L228 の `setTasks(prev => prev.filter(...))` ）は `reloadTasks()` で復帰するため UI 状態は回復するが、ユーザーには操作失敗が通知されない | **なし**。同ファイル内の `persistTodaySortOrder`（L173）や `useTaskActions.js` 内の `handleTodayToggle`（L75）・`handleStatusChange`（L45）・`handleArchive`（L130）・`handleRestore`（L183）はすべてエラートーストを表示するのに、`handleRemove` のみ欠落 | なし（reloadTasks で復旧） | **NG** |
| 5 | ディスク書き込み権限がない場合：`toggleSortMode` の DB 失敗 | `useTodayTasks.js:238-253`: try/catch で catch。`setSortMode(prevMode)` で楽観的更新をロールバック + エラートースト dispatch | `'設定の保存に失敗しました'`（type: 'error'）が表示される | 楽観的更新がロールバックされ、元の sortMode に戻る | OK |
| 6 | 想定外のデータ型：ReorderGap ID のパース | `today/page.js:191`: `parseInt(overIdStr.replace('reorder-today-', ''))` — 万一 replace 後が非数値なら `NaN` を返す。`splice(NaN, ...)` は `splice(0, ...)` として動作するため、先頭に挿入される | なし（クラッシュしない） | 意図しない並び替えが発生するが、ReorderGap の ID は `reorder-today-{index}` 形式でコード内部生成のため、外部データ破損で発生することはない。低リスク | OK |
| 7 | 想定外のデータ型：`task.status_code` が想定外の値 | `today/page.js:61`: `statusMap[task.status_code] || { label: task.status_label || '不明', color: task.status_color || '#94a3b8' }` でフォールバック。ラベル '不明'、色 '#94a3b8' で表示される | なし（フォールバック表示） | なし | OK |
| 8 | handleDragEnd: tasks 配列が空の場合 | `today/page.js:192-194`: `tasks.map(t => t.id)` → 空配列。`indexOf(active.id)` → -1。`if (oldIndex < 0) return;` で早期リターン | なし（正常に no-op） | なし | OK |

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

| # | 観点 | 箇所A | 箇所B | 不整合の内容 | ファイル名:行番号 |
|---|------|-------|-------|------------|-----------------|
| 1 | CSS変数値・クラス名の構造的不一致：ReorderGap グローバルスタイルの重複定義 | `today/page.js:608-622` `.tl-reorder-gap` 系スタイル（`<style jsx global>`） | `TaskList.js:500-513` `.tl-reorder-gap` 系スタイル（`<style jsx global>`） | **同一の `.tl-reorder-gap` / `.tl-reorder-gap-line` / `.tl-reorder-gap.drag-over` スタイルが2箇所で重複定義されている**。現時点では両方の値が完全に同一のため視覚的問題はないが、片方だけ更新すると不整合が発生するメンテナンスリスクがある。`DndGaps.js` コンポーネント内でスタイルを一元管理するか、`globals.css` に移動すべき | `app/today/page.js:608-622` `components/TaskList.js:500-513` | **NG** |
| 2 | 同種の操作でUI挙動が異なる箇所：ドラッグハンドルのホバー挙動 | `today/page.js:577` `.today-drag-handle:hover { opacity:1; }` — ハンドル自体にホバーした時のみ opacity:1 になる | `TaskList.js:416` `.tc-handle:hover, .tc-card:hover .tc-handle { opacity: 1; }` — ハンドル自体のホバーに加え、**カード全体にホバーした時も**ハンドルが opacity:1 になる | **DnD 操作統一を目的とした IMP-13 の趣旨に対し、ドラッグハンドルの発見性（discoverability）が異なる**。タスク一覧ではカードにマウスを置くだけでハンドルが目立つが、今日やるタスクではハンドル直上にマウスを置かないと変化しない | `app/today/page.js:577` `components/TaskList.js:416` | **NG** |
| 3 | 余白・フォントサイズの不統一：ステータスセレクトの font-size・padding | `today/page.js:541-542` `.today-status { font-size: 0.75rem; padding: 0.25rem 0.4rem; }` | `TaskList.js:444-446` `.tc-status-select { font-size: .78rem; padding: .3rem .5rem; }` | **ステータスドロップダウンの font-size が 0.75rem vs 0.78rem、padding も 0.25rem 0.4rem vs 0.3rem 0.5rem で微妙に異なる**。同じ「ステータス選択」UIで一貫性がない | `app/today/page.js:541-542` `components/TaskList.js:444-446` | **NG** |
| 4 | 余白の不統一：カードリストの gap | `today/page.js:494` `.today-list { gap: 0.5rem; }` | `TaskList.js:345` `.tl-items { gap: .6rem; }` | カード間の gap が 0.5rem（8px）vs 0.6rem（9.6px）で異なる | `app/today/page.js:494` `components/TaskList.js:345` | **NG** |
| 5 | 文言の揺れ | 該当なし | 該当なし | 今日やるタスク画面と他画面で、ボタン title 属性（「ドラッグして並び替え」「クリックして編集」「今日やるから外す」）はすべて統一されている。エラーメッセージ「並び替えの保存に失敗しました」も `useTaskDnD.js` と同一 | — | OK |
| 6 | エラーメッセージのトーン・粒度の不統一 | 該当なし | 該当なし | 新設されたエラーメッセージ（`persistTodaySortOrder`）は既存のパターン（`'{操作}に失敗しました'`）に準拠。`handleRemove` のエラートースト欠落は観点1 NG-1 で報告済み | — | OK |
| 7 | 日付・時刻・数値の表示フォーマットの不統一 | 該当なし | 該当なし | `toLocaleDateString('sv-SE')` による YYYY-MM-DD 形式、`formatMin()` による分表示、`completed_at.split(' ')[0]` による日付部抽出はすべて既存パターンと統一されている | — | OK |
| 8 | CSS変数値の構造的不一致：ドラッグハンドルのスタイル差異 | `today/page.js:570-578` `.today-drag-handle`: `font-size:.85rem; user-select:none;` あり。`height` / `align-self` なし | `TaskList.js:410-417` `.tc-handle`: `height: 100%; align-self: stretch;` あり。`font-size` / `user-select` なし | ドラッグハンドルのスタイル定義が構造的に異なる。今日やるタスクでは `font-size` と `user-select` を明示、タスク一覧では `height:100%; align-self:stretch` で親要素の高さに追従。⚠️ 要実機確認：[今日やるタスク]と[タスク一覧]で手動モードにして、ドラッグハンドル（⋮⋮）の見た目の大きさ・位置が同じに見えるか目視比較すること | `app/today/page.js:570-578` `components/TaskList.js:410-417` | **NG** |

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
