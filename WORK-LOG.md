# Work Log

## 最新の作業（2026-02-28 --:--）

- **フェーズ**: バグ修正
- **対象バージョン**: v1.2.0（リリース前修正）
- **対象枝番**: なし（軽微な不具合修正）
- **ステータス**: ✅ 完了
- **やったこと**:
  - ESLint設定で `src-tauri/**` をグローバル除外に追加（Rust自動生成ファイルのパースエラー解消）
  - `app/today/page.js` の `loadTasks` を `useCallback` でラップし、useEffect の依存配列を修正（React Hook 警告解消）
- **変更したファイル**:
  - `eslint.config.mjs` — globalIgnores に `src-tauri/**` を追加
  - `app/today/page.js` — `useCallback` インポート追加、`loadTasks` を `useCallback` でラップ、useEffect 依存配列を `[selectedDate, loadTasks]` に修正
- **次にやるべきこと**:
  - v1.2.0 リリース手順の実施（リリース前通し検証、変更履歴更新、リリースビルド等）
- **注意事項・申し送り**:
  - 【変更サマリー】
  - ■ 変更した機能：
    - ESLint が src-tauri ディレクトリ内のファイルを lint 対象にしなくなった
    - `app/today/page.js` の React Hook 依存配列警告が解消された
  - ■ 変更したファイル：
    - `eslint.config.mjs` — globalIgnores に `src-tauri/**` パターンを追加
    - `app/today/page.js` — `useCallback` を import に追加、`loadTasks` 関数を `useCallback` で囲み依存配列 `[filterStatuses, filterTags, filterImportance, filterUrgency, sortKey, showOverdue, statuses]` を指定、useEffect の依存配列を `[selectedDate, loadTasks]` に簡素化
  - ■ 変更の概要：
    - ESLint: `src-tauri` は Tauri (Rust) のビルド成果物・自動生成ファイルを含むため、JavaScript の lint 対象から除外するのが正しい。これにより `npm run lint` および `next build` 内部の lint 実行でパースエラーが発生しなくなる。
    - React Hook: `loadTasks` は useEffect 内で呼ばれているが依存配列に含まれていなかった。`useCallback` でメモ化し useEffect の依存に追加することで、`react-hooks/exhaustive-deps` ルールに準拠。動作への影響なし（元々 useEffect の依存配列に `loadTasks` が使う state 変数が列挙されていたため、再実行タイミングは同一）。
  - ■ 影響が想定される箇所：
    - `app/today/page.js` 内の `handleStatusChange`、`handleRemove`、`TaskEditModal.onSaved` から `loadTasks` を呼び出している箇所 → `useCallback` 化しても関数シグネチャは同一のため影響なし

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-02-28 --:-- — v1.2.0 枝番2-4 IMP-7 タグのアーカイブ（非表示化）
- ステータス: ✅ 完了
- やったこと: tags テーブルに `archived` カラム追加マイグレーション、設定画面にアーカイブ/解除UI追加、TagSelectからアーカイブ済み除外、フィルタからアーカイブ済み除外
- 変更したファイル: `lib/db.js`, `app/settings/page.js`, `components/TagSelect.js`, `components/TaskList.js`, `app/today/page.js`

### 2026-02-28 --:-- — v1.2.0 枝番2-3 IMP-3 フィルタ複数選択（Excelライクドロップダウン）
- ステータス: ✅ 完了
- やったこと: フィルタUIをExcelライクなマルチセレクトドロップダウンに全面変更、MultiSelectFilter 新規作成、4フィルタ統一UI実装
- 変更したファイル: `components/MultiSelectFilter.js`（新規）, `components/TaskList.js`, `app/today/page.js`, `app/globals.css`
