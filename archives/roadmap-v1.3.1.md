## v1.3.1 — コード構造リファクタリング

> v1.3.0 で肥大化したファイル群（TaskList.js 1032行、settings/page.js 893行、today/page.js 859行）を分割・整理し、v1.4.0 以降の機能追加に備える。ユーザー向けの機能変更なし。詳細は `refactoring-plan.md` を参照。

### R-1. 共通ユーティリティ抽出（Phase 0） ✅ 完了
- **対象**: `lib/utils.js` 新設、`hooks/useFilterOptions.js` 新設、`lib/taskSorter.js` 新設
- **内容**: 全ファイルで重複している getDb ボイラープレート、formatMin、todayStr、parseTags、フィルタ options 生成、ソートロジックを共通化
- **影響範囲**: 全コンポーネントファイル（import パス変更）
- **検証**: STEP A + STEP R
- **作業量**: 普通

### R-2. TaskList.js 分割（Phase 1） ✅ 完了
- **対象**: `components/TaskItem.js` 抽出、`hooks/useTaskActions.js` 新設、`hooks/useTaskDnD.js` 新設、`components/DndGaps.js` 新設
- **内容**: TaskList.js（1032行）から TaskItem コンポーネント、DB操作ハンドラ、DnD ロジックを分離し約350行に削減
- **検証**: STEP A + STEP R
- **作業量**: 重い

### R-3. today/page.js スリム化（Phase 2） ✅ 完了
- **対象**: `hooks/useTodayTasks.js` 新設、`hooks/useDragReorder.js` 移動・汎用化、ステータス変更ハンドラ共通化
- **内容**: today/page.js（859行）からデータ取得・マージロジック、DnD ハンドラを分離し約350行に削減
- **検証**: STEP A + STEP R
- **作業量**: 普通

### R-4. settings タブ分割 + routines 整理（Phase 3 + 4） ✅ 完了
- **対象**: `app/settings/_components/` 配下に TagsPanel / StatusPanel / OptionsPanel / DataPanel 新設、`app/routines/_components/RoutineFormModal.js` 新設（任意）
- **内容**: settings/page.js（893行）を約80行のタブシェルに削減。routines/page.js は余裕があれば整理
- **検証**: STEP A + STEP B + STEP R（最終枝番）
- **作業量**: 普通

### リリース前検証
- STEP A + STEP R
- ※ ユーザー向け機能変更なしのため STEP B は省略（R-4 で実施済み）
- ※ ビルド確認（`npm run tauri build`）は実施すること
