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

✅ OK: 12件 全件パス


### 観点2：異常系・境界値テスト

✅ OK: 10件 全件パス


### 観点3：状態遷移・データ件数テスト

✅ OK: 10件 全件パス


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

✅ OK: 21件 全件パス


### 観点2：異常系・境界値テスト

✅ OK: 12件 全件パス


### 観点3：状態遷移・データ件数テスト

✅ OK: 8件 全件パス


### ENH-5 自動完了ロジックの検証（重点チェック項目）

以下は `hooks/useTaskActions.js` の `handleStatusChange` 内の ENH-5 ロジック（L45-69）に対する検証。設定画面単体ではなく、自動完了の発動条件を横断的にテストする。

✅ OK: 9件 パス

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|------------|----------|----------|------------|-------|
| 6 | 設定ON + 親タスクがキャンセル(5) | 親が status=5 の状態で全子タスクを完了 | 親がキャンセルから完了に変更されるべきではない | **NG-1**: L57 の条件は `parentRows[0].status_code !== 3` のみ。status_code=5（キャンセル）は !== 3 → true → 親が自動的に完了(3)に変更される。ユーザーが意図的にキャンセルした親タスクが、子タスクの完了により勝手に復活する | **NG** |

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

✅ OK: 23件 全件パス


### 観点2：異常系・境界値テスト

✅ OK: 12件 全件パス


### 観点3：状態遷移・データ件数テスト

✅ OK: 9件 パス

| # | テスト条件 | 操作内容 | 期待結果 | 実際の結果 | OK/NG |
|---|------------|----------|----------|------------|-------|
| 7 | [重点] processingIds の動作 | ステータス変更中に同タスク操作 | useTaskActions 内部では processingIds 管理中 | **NG-1**: useTaskActions は addProcessing/removeProcessing で processingIds を管理するが、TodayCardItem は processingIds / isProcessing prop を受け取らず、StatusCheckbox に disabled が渡されない。タスク一覧の TaskItem では `isProcessing={processingIds.has(task.id)}` → `disabled={isProcessing}` で保護されているのに対し、今日やるタスク画面では同等の保護がない | **NG** |

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

✅ OK: 24件 全件パス


### 観点2：異常系・境界値テスト

✅ OK: 15件 全件パス


### 観点3：状態遷移・データ件数テスト

✅ OK: 10件 全件パス


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

✅ OK: 18件 全件パス


### 観点2：異常系・境界値テスト

✅ OK: 10件 全件パス


### 観点3：状態遷移・データ件数テスト

✅ OK: 8件 全件パス


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

✅ OK: 14件 全件パス


### 観点2：異常系・境界値テスト

✅ OK: 7件 全件パス


### 観点3：状態遷移・データ件数テスト

✅ OK: 7件 全件パス


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

✅ OK: 10件 全件パス


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

## STEP R：リグレッションテスト（v1.4.0 QA NG項目修正 2026-03-01）

**検証対象**: v1.4.0 リリース前検証（STEP A / B）にて修正されたNG項目4件の既存機能への影響確認
**検証方法**: コードリーディングベースの静的分析（影響範囲の網羅的トレース）
**検証日**: 2026-03-01

### 影響範囲の洗い出し

**変更ファイルと影響先の追跡結果：**

| 変更ファイル | 変更内容 | 参照元・影響先 | 影響有無 |
|---|---|---|---|
| `hooks/useTaskActions.js` | handleStatusChange にキャンセル済み親タスクの自動完了スキップ条件追加 | `components/TaskList.js`、`app/today/page.js` のタスク状態変更 | 自動完了のスキップ条件拡張はキャンセル済み親タスクのケースのみ影響し、通常のタスク完了・未完了切替アクションには影響しないことを確認 |
| `app/today/page.js` | TodayCardItem に `isProcessing` prop 追加、StatusCheckbox等に `disabled` 追加 | 同ファイル内の TodayCardItem | `processingIds` に含まれる対象タスクのボタン類のみ無効化され、それ以外のタスクには影響しないことを確認 |
| `app/routines/page.js`, `app/routines/_components/RoutineFormModal.js` | トグルスイッチのON色をプライマリカラーに変更 | ルーティン一覧および編集モーダル要素 | CSS変数の参照変更のみであり、ルーティン機能のON/OFFロジック自体には影響しないことを確認 |
| `app/settings/_components/OptionsPanel.js`, `hooks/useTodayTasks.js` | `show_overdue_in_today` のON判定ロジックを `=== '1'` に統一 | 設定画面と今日やるタスク画面 | 初期値 `'1'` は db.js にてシード済みであり、値評価が安定するだけで実質的な動作差異はないことを確認 |

### 第1段階：変更箇所の直接テスト

✅ OK: 4件 全件パス


### 第2段階：影響範囲のテスト

✅ OK: 4件 全件パス


### 総合判定

| 段階 | OK | NG | 合計 |
|------|----|----|------|
| 第1段階：変更箇所の直接テスト | 4 | 0 | 4 |
| 第2段階：影響範囲のテスト | 4 | 0 | 4 |
| **合計** | **8** | **0** | **8** |

**結果: 全件OK。NG項目なし。**

---

## STEP R：リグレッションテスト（v1.4.0 動作確認バグ修正 2026-03-01）

**検証対象**: v1.4.0 動作確認で発見された3件のバグ修正の既存機能への影響確認
**変更内容**:
- `app/today/page.js`: `<style jsx>` → `<style jsx global>` に変更（TodayCardItem 子コンポーネントへのスタイル適用修正）
- `lib/holidayService.js`: `isRoutineActiveOnDate()` に daily ルーティンの weekdays_only チェック追加
- `hooks/useTodayTasks.js`: showOverdue 初期値を false に修正、設定値比較を `=== '1'` に厳密化、masterDataReady ガード追加
**検証方法**: コードリーディングベースの静的分析（影響範囲の網羅的トレース）
**検証日**: 2026-03-01

### 影響範囲の洗い出し

**変更ファイルと影響先の追跡結果：**

| 変更ファイル | 変更内容 | 参照元・影響先 | 影響有無 |
|---|---|---|---|
| `app/today/page.js` | styled-jsx を global 化 | TodayCardItem（同ファイル内子コンポーネント）、他ページ（CSSクラス名衝突リスク） | `.today-` プレフィックスは `app/today/page.js` のみで使用（Grep確認済み）。他ページに同名クラスなし。衝突リスクなし |
| `lib/holidayService.js` | `isRoutineActiveOnDate()` に weekdays_only チェック追加 | `hooks/useTodayTasks.js`（今日やるタスクのルーティン取得）、`app/dashboard/page.js`（今日+3日間のルーティンカウント） | 両方とも weekdays_only=1 の daily ルーティンが週末に非アクティブ判定される。これは正しい動作修正。layout.js は独自ロジック（L114）で処理しており `isRoutineActiveOnDate()` を使用しないため影響なし |
| `hooks/useTodayTasks.js` | showOverdue 初期値 false、`=== '1'` 厳密化、masterDataReady ガード | `app/today/page.js`（useTodayTasks フック呼び出し元）、`app/settings/_components/OptionsPanel.js`（トグル表示の一貫性） | today/page.js のデータフローに変更なし（hook の内部改善のみ）。OptionsPanel.js は全3トグルが `=== '1'` に統一済み |

**確認対象ファイル一覧**: `app/today/page.js`, `lib/holidayService.js`, `hooks/useTodayTasks.js`, `app/dashboard/page.js`, `app/layout.js`, `app/settings/_components/OptionsPanel.js`, `app/globals.css`

### 第1段階：変更箇所の直接テスト

✅ OK: 4件 全件パス

### 第2段階：影響範囲のテスト

✅ OK: 6件 全件パス

### 総合判定

| 段階 | OK | NG | 合計 |
|------|----|----|------|
| 第1段階：変更箇所の直接テスト | 4 | 0 | 4 |
| 第2段階：影響範囲のテスト | 6 | 0 | 6 |
| **合計** | **10** | **0** | **10** |

**結果: 全件OK。NG項目なし。**

#### 要実機確認項目

| # | 画面 | 操作 | 確認内容 |
|---|------|------|----------|
| 1 | 今日やるタスク | 画面を開いてカード一覧を確認する | タスク名が横並びのカード形式で正しく表示され、縦並びに崩れていないこと |
| 2 | 今日やるタスク | 土曜日の日付タブをクリックする | 「平日のみ」設定の日次ルーティンがカード一覧に表示されないこと |
| 3 | 今日やるタスク | 画面を開いた直後の一瞬を確認する | 期限切れタスクが一瞬だけ表示されてすぐ消える現象（ちらつき）が発生しないこと |
