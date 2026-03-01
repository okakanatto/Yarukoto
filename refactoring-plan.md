# リファクタリング計画

## 1. 診断結果サマリー

### ファイルサイズランキング

| # | ファイル | 行数 | 優先度 |
|---|---------|------|--------|
| 1 | `components/TaskList.js` | 1032 | **Critical** |
| 2 | `app/settings/page.js` | 893 | **High** |
| 3 | `app/today/page.js` | 859 | **High** |
| 4 | `app/routines/page.js` | 697 | Medium |
| 5 | `app/globals.css` | 536 | Low |
| 6 | `components/TaskInput.js` | 413 | Low |
| 7 | `app/layout.js` | 379 | Low |
| 8 | `app/dashboard/page.js` | 356 | Low |
| 9 | `components/TaskEditModal.js` | 331 | Low |

### 横断的な問題（コード重複）

| 問題 | 発生箇所 | 重複回数 |
|------|---------|---------|
| `getDb` ボイラープレート（`const { getDb } = await import(...); const db = await getDb();`） | 全ファイル | 30回以上 |
| ソートロジック（switch-case による9種ソート） | `TaskList.js`, `today/page.js` | 2箇所 |
| ステータス変更ハンドラ（楽観更新 + DB更新 + エラー時リロード） | `TaskList.js`, `today/page.js` | 2箇所 |
| フィルタ関連 state + options の useMemo パターン | `TaskList.js`, `today/page.js` | 2箇所 |
| タグパース処理（`json_group_array` → JS配列変換） | `TaskList.js`, `today/page.js`, `routines/page.js` | 3箇所 |
| `formatMin()` ユーティリティ関数 | `today/page.js`, `dashboard/page.js` | 2箇所 |
| トースト通知パターン（`flash()` / `window.dispatchEvent`） | `settings/page.js`, `routines/page.js`, 他多数 | 3種類 |
| 日付フォーマット `new Date().toLocaleDateString('sv-SE')` | 全ファイル | 10回以上 |

---

## 2. リファクタリング計画

### Phase 0: 共通ユーティリティの抽出（先に実施、他の全Phaseの前提）

**目的**: 全ファイルで重複しているヘルパー関数・パターンを `lib/` に集約し、以降のPhaseでの分割作業を効率化する。

#### 0-1. `lib/utils.js` の新設

```
lib/utils.js
├── getDb()          — ラッパー関数（import + getDb を1行で呼べるように）
├── todayStr()       — 今日の日付を 'YYYY-MM-DD' で返す
├── formatMin(m)     — 分数を「Xh Ym」形式に変換
└── parseTags(row)   — json_group_array の結果を [{id, name, color}] に変換
```

**対象の重複コード:**

| 関数 | 現在の場所 | 行数削減見込み |
|------|-----------|--------------|
| `getDb` ボイラープレート | 全ファイル (30箇所) | 各2行 → 1行（計30行削減） |
| `formatMin()` | `today/page.js:459-463`, `dashboard/page.js:158-162` | 各5行（計5行削減） |
| `todayStr()` | 全ファイル散在 | 各1行に短縮 |
| `parseTags(row)` | `TaskList.js:125-132`, `today/page.js:197-214,239-246`, `routines/page.js:60-67` | 各7行（計21行削減） |

#### 0-2. `hooks/useFilterOptions.js` の新設

`TaskList.js` と `today/page.js` で完全に重複しているフィルタ options 生成パターンを共通フックに抽出。

```js
// hooks/useFilterOptions.js
export function useFilterOptions(statuses, tags, importance, urgency) {
    const statusOptions = useMemo(() => statuses.map(s => ({ value: s.code, label: s.label, color: s.color })), [statuses]);
    const tagOptions = useMemo(() => tags.filter(t => !t.archived).map(t => ({ value: t.id, label: t.name, color: t.color })), [tags]);
    // ... 同様に importance, urgency
    return { statusOptions, tagOptions, importanceOptions, urgencyOptions };
}
```

**削減**: `TaskList.js` で約8行、`today/page.js` で約8行 → 合計16行削減 + 1つの変更箇所に統一。

#### 0-3. `lib/taskSorter.js` の新設

9種類のソートキーによる `switch-case` ソートロジックが `TaskList.js`（L512-538）と `today/page.js`（L263-304）で完全に重複。

```
lib/taskSorter.js
├── sortTasks(tasks, sortKey, statuses)  — 自動ソート用関数
└── SORT_OPTIONS                          — ソートキー定義配列
```

**削減**: 各ファイルから約40行のswitch-case削減 → 合計80行削減。

---

### Phase 1: `components/TaskList.js` の分割（最優先）

**現状**: 1032行。1ファイルに以下の全責務が混在。
- メインリストコンポーネント（state, フィルタ, ソート, DnD, CRUD操作）
- TaskItem サブコンポーネント（155行）
- UnnestGap / ReorderGap サブコンポーネント（25行）
- styled-jsx CSS（180行）

#### 1-1. `components/TaskItem.js` の抽出

**TaskItem** (L875-1030, 155行) を独立ファイルに切り出す。

```
components/TaskItem.js
├── TaskItem コンポーネント
├── dueMeta 計算ロジック
├── DnD refs (useDraggable, useDroppable)
└── 子タスク展開・インライン子タスク入力
```

**ポイント**:
- props は現状の `TaskItem` の引数そのまま（`task, childTasks, onStatusChange, onDelete, ...`）
- `ReorderGap` の描画もこのファイル内で完結させる

#### 1-2. `hooks/useTaskActions.js` の新設

`TaskList.js` に散在するDB操作ハンドラをカスタムフックに集約。

```
hooks/useTaskActions.js
├── useTaskActions(fetchTasks)
│   ├── handleStatusChange(taskId, newStatusCode)
│   ├── handleDelete(taskId)
│   ├── handleTodayToggle(taskId, currentTodayDate)
│   ├── handleArchive(taskId, tasks)
│   └── handleRestore(taskId, tasks)
└── (各関数は楽観更新用のsetTasksコールバックを受け取る)
```

**削減見込み**: `TaskList.js` から約120行のハンドラ関数を移動。`today/page.js` の `handleStatusChange` / `handleRemove` も同じフックから利用可能。

#### 1-3. `hooks/useTaskDnD.js` の新設

DnD（ネスト・アンネスト・並び替え）関連ロジックをカスタムフックに集約。

```
hooks/useTaskDnD.js
├── useTaskDnD(tasks, setTasks, fetchTasks, sortMode)
│   ├── handleDragStart(event)
│   ├── handleDragEnd(event)
│   ├── handleReorder(activeTaskId, overId)
│   ├── persistSortOrder(orderedIds)
│   └── activeId, activeTaskData, isDraggingChild
```

**削減見込み**: `TaskList.js` から約180行のDnD関連コードを移動。

#### 1-4. `components/DndGaps.js` の新設

`UnnestGap` と `ReorderGap` を独立ファイルに切り出す（約25行）。

#### Phase 1 完了後の `TaskList.js` の見込み

| 項目 | Before | After |
|------|--------|-------|
| 行数 | 1032 | **約350行** |
| 責務 | 全部入り | レイアウト + ツールバー + リスト描画に集中 |

---

### Phase 2: `app/today/page.js` のスリム化

**現状**: 859行。データ取得・ソート・DnD・UI描画・CSSが混在。

#### 2-1. `hooks/useTodayTasks.js` の新設

`loadTasks` 関数（L98-317, 約220行）を丸ごとカスタムフックに抽出。ルーティン取得・タスク取得・マージ・ソートのロジックを内包。

```
hooks/useTodayTasks.js
├── useTodayTasks(selectedDate, filters, sortKey, sortMode)
│   ├── tasks, loading
│   ├── loadTasks()
│   └── 内部でルーティン + タスクの統合ソート
```

**削減見込み**: `today/page.js` から約220行を移動。

#### 2-2. `today/page.js` の DnD ハンドラ統合

`onTodayDragStart` / `onTodayDragEnd` / `onTodayDragOver` / `onTodayDragLeave` / `onTodayDrop` (L400-438, 約40行) を Phase 0 で抽出予定の `useDragReorder` フックのバリエーションとして統合。

`settings/page.js` の `useDragReorder` を `hooks/useDragReorder.js` に移動し、today/page.js でも再利用。

#### 2-3. ステータス変更ハンドラの共通化

Phase 1-2 で作成した `useTaskActions.js` に today 用のステータス変更（ルーティン対応版）も統合。

#### Phase 2 完了後の `today/page.js` の見込み

| 項目 | Before | After |
|------|--------|-------|
| 行数 | 859 | **約350行** |
| 責務 | 全部入り | 日付タブ + ミニダッシュボード + リスト描画 |

---

### Phase 3: `app/settings/page.js` のタブ分割

**現状**: 893行。4つの完全に独立したタブの内容が1ファイルに同居。

#### 3-1. タブパネルごとの分割

```
app/settings/
├── page.js                   — タブ切り替えシェル（約80行）
├── _components/
│   ├── TagsPanel.js          — タグ管理（約180行）
│   ├── StatusPanel.js        — ステータス管理（約100行）
│   ├── OptionsPanel.js       — オプション設定（約100行）
│   └── DataPanel.js          — データ管理（約130行）
```

**ポイント**:
- 各パネルが独自のstate（`newTag`, `newStatus`, `openPalette` 等）を自身で管理
- 共通の `data`, `appSettings` は親 `page.js` から props で渡すか、各パネル内でDBから直接取得
- `useDragReorder` は Phase 2-2 で `hooks/` に移動済みなのでインポートするだけ

#### 3-2. インラインCSV処理の関数化

データ管理タブ内のCSVエクスポート/インポート処理（L576-648）が JSX の `onClick` ハンドラ内に直接書かれている。これを `DataPanel.js` 内の通常の関数に抽出。

#### Phase 3 完了後の `settings/page.js` の見込み

| 項目 | Before | After |
|------|--------|-------|
| 行数 | 893 | **約80行**（タブシェルのみ） |
| 各パネル | — | 100-180行（適正サイズ） |

---

### Phase 4: `app/routines/page.js` の整理（任意）

**現状**: 697行。比較的まとまっているが、フォームモーダルが大きい。

#### 4-1. モーダルの分割（任意）

```
app/routines/
├── page.js                       — リスト表示 + ルーティング（約300行）
└── _components/
    └── RoutineFormModal.js        — 新規作成/編集モーダル（約200行）
```

**実施判断**: Phase 1-3 の完了後に行数が気になれば実施。697行は許容範囲ギリギリなので、他のPhaseが先。

---

## 3. 実施順序と新規ファイル一覧

### 実施順序

```
Phase 0（前提: 共通ユーティリティ）
  ├── 0-1. lib/utils.js
  ├── 0-2. hooks/useFilterOptions.js
  └── 0-3. lib/taskSorter.js
      ↓
Phase 1（最優先: TaskList.js 分割）
  ├── 1-1. components/TaskItem.js
  ├── 1-2. hooks/useTaskActions.js
  ├── 1-3. hooks/useTaskDnD.js
  └── 1-4. components/DndGaps.js
      ↓
Phase 2（today/page.js スリム化）
  ├── 2-1. hooks/useTodayTasks.js
  ├── 2-2. hooks/useDragReorder.js（settings から移動）
  └── 2-3. handleStatusChange 共通化
      ↓
Phase 3（settings/page.js タブ分割）
  ├── 3-1. app/settings/_components/TagsPanel.js
  ├── 3-2. app/settings/_components/StatusPanel.js
  ├── 3-3. app/settings/_components/OptionsPanel.js
  └── 3-4. app/settings/_components/DataPanel.js
      ↓
Phase 4（任意: routines 整理）
  └── 4-1. app/routines/_components/RoutineFormModal.js
```

### 新規作成ファイル一覧

| ファイルパス | 用途 | 推定行数 |
|-------------|------|---------|
| `lib/utils.js` | 共通ユーティリティ（getDb, formatMin, todayStr, parseTags） | ~40 |
| `lib/taskSorter.js` | ソートロジック + SORT_OPTIONS 定数 | ~60 |
| `hooks/useFilterOptions.js` | フィルタ options 生成フック | ~25 |
| `hooks/useTaskActions.js` | タスクCRUD操作フック | ~130 |
| `hooks/useTaskDnD.js` | DnD操作フック | ~180 |
| `hooks/useTodayTasks.js` | 今日のタスク取得・マージフック | ~220 |
| `hooks/useDragReorder.js` | 汎用ドラッグ並び替えフック | ~45 |
| `components/TaskItem.js` | タスクカードコンポーネント | ~160 |
| `components/DndGaps.js` | UnnestGap + ReorderGap | ~30 |
| `app/settings/_components/TagsPanel.js` | タグ管理パネル | ~180 |
| `app/settings/_components/StatusPanel.js` | ステータス管理パネル | ~100 |
| `app/settings/_components/OptionsPanel.js` | オプション設定パネル | ~100 |
| `app/settings/_components/DataPanel.js` | データ管理パネル | ~130 |

---

## 4. リファクタリング前後の比較

| ファイル | Before | After | 削減率 |
|---------|--------|-------|--------|
| `components/TaskList.js` | 1032行 | ~350行 | **-66%** |
| `app/settings/page.js` | 893行 | ~80行 | **-91%** |
| `app/today/page.js` | 859行 | ~350行 | **-59%** |
| `app/routines/page.js` | 697行 | ~300行（Phase 4実施時） | -57% |

### 原則

- **styled-jsx CSS は各コンポーネントに残す**: このプロジェクトのスタイリング方針（コンポーネント内 styled-jsx）は維持する。CSS だけを別ファイルに出すことはしない。
- **ロジックの抽出先はカスタムフック**: React のパターンに沿い、UIロジック（state管理・副作用）はカスタムフックに分離する。
- **純粋な計算・ユーティリティは `lib/` に配置**: DB操作やフォーマット関数などReactに依存しないものは `lib/` に。
- **既存の動作を壊さない**: 各Phaseの完了後に `npm run lint` を実行し、動作確認を行う。
- **段階的に実施**: Phase 単位で完了・確認・コミットを繰り返す。

---

## 5. 注意事項

- `styled-jsx global` スタイルは `TaskList.js` で使用されている。`TaskItem.js` を切り出す際、CSSクラスの参照関係を維持する必要がある（親コンポーネント側で `global` 宣言を残す）。
- `@dnd-kit` の `useDraggable` / `useDroppable` は `DndContext` の子孫でないと動作しない。`TaskItem.js` 切り出し後も `DndContext` は `TaskList.js` に残す。
- `settings/page.js` のタブ分割時、`useDragReorder` を `hooks/` に移動するため、settings 内の3箇所（tagsDrag, statusDrag）のインポートパスが変わる。
- v1.3.0 の IMP-4（ソートON/OFF）が完了直後のため、ソート関連コードが最も入り組んでいる。Phase 0-3 / Phase 1-3 で整理することで、今後の機能追加にも対応しやすくなる。
