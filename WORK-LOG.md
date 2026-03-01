# Work Log

## 最新の作業（2026-03-01 24:00）

- **フェーズ**: v1.3.1 R-1 Phase 0 共通ユーティリティ抽出
- **対象バージョン**: v1.3.1
- **ステータス**: ✅ 完了
- **やったこと**:
  - `lib/utils.js` を新規作成（`fetchDb`, `todayStr`, `formatMin`, `parseTags`）
  - `hooks/useFilterOptions.js` を新規作成（フィルタオプション生成フック）
  - `lib/taskSorter.js` を新規作成（`SORT_OPTIONS`, `taskComparator`）
  - 全ファイル（10ファイル）の getDb ボイラープレート（30箇所以上）を `fetchDb()` に統一
  - parseTags 重複コード（3ファイル）を `parseTags()` に統一
  - formatMin 重複定義（3ファイル）を `formatMin()` に統一
  - フィルタオプション useMemo（2ファイル）を `useFilterOptions()` フックに統一
  - ソートロジック switch-case（2ファイル）を `taskComparator()` に統一
  - `npm run lint` — エラーなし
- **変更したファイル**:
  - `lib/utils.js`（★新規）, `hooks/useFilterOptions.js`（★新規）, `lib/taskSorter.js`（★新規）
  - `components/TaskList.js`, `app/today/page.js`, `app/dashboard/page.js`
  - `app/routines/page.js`, `app/settings/page.js`, `app/layout.js`
  - `components/TaskInput.js`, `components/TaskEditModal.js`, `hooks/useMasterData.js`
- **次にやるべきこと**:
  - ROADMAP.md で指定された検証 STEP（STEP V: 動作検証）を実施する
  - `npm run tauri dev` で起動し、全画面・全機能が従来通り動作することを確認する
- **注意事項・申し送り**:
  - **機能変更なし**（リファクタリングのみ）。ユーザーから見た動作は一切変わらない
  - `lib/db.js` の `getDb()` 定義はそのまま。`lib/utils.js` の `fetchDb()` が内部で dynamic import + getDb() を呼ぶラッパー
  - `settings/page.js` の `runAutoArchive` import は `lib/db.js` から直接 import のまま（utils.js に含めていない）
  - `today/page.js` の手動ソート（manual mode）の特殊ロジック（today_sort_order による並び替え）はそのまま残存
  - `todayStr()` は作成済みだが、各ファイルでの `new Date().toLocaleDateString('sv-SE')` 呼び出しは複雑なコンテキスト内が多いため今回は置換せず、将来の Phase で順次適用予定

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-03-01 23:00 — v1.3.0 リリース後片付け作業
- ステータス: ✅ 完了
- やったこと: archives にアーカイブ作成、qa-report.md リセット、ROADMAP.md / ISSUES.md 整理、WORK-LOG.md 更新
- 変更したファイル: `archives/qa-report-v1.3.0.md`（新規）, `archives/roadmap-v1.3.0.md`（新規）, `qa-report.md`, `ROADMAP.md`, `ISSUES.md`, `WORK-LOG.md`

### 2026-03-01 22:00 — v1.3.0 ビルド・リリースノート作成・ドキュメント更新
- ステータス: ✅ 完了
- やったこと: `package.json` / `tauri.conf.json` バージョン更新、`npm run tauri build` 実行、`releases/v1.3.0/` にインストーラー・ポータブル版配置、`RELEASE_NOTES.md` / `AI_CHANGELOG.md` / `CLAUDE.md` 更新
- 変更したファイル: `package.json`, `src-tauri/tauri.conf.json`, `RELEASE_NOTES.md`, `AI_CHANGELOG.md`, `CLAUDE.md`, `WORK-LOG.md`
