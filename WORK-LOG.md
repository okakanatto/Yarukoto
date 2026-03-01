# Work Log

## 最新の作業（2026-03-01 16:00）

- **フェーズ**: v1.3.0 バグ修正（「今日やるタスク」手動並び替え）
- **対象バージョン**: v1.3.0
- **対象枝番**: 3-3（追加修正）
- **ステータス**: ✅ 完了
- **やったこと**:
  - 「今日やるタスク」の手動並び替え（DnD）が動作しない不具合を修正
  - **根本原因**: Tauri v2 のデフォルト設定 `dragDropEnabled: true` が、WebView2 上の HTML5 DnD イベントをネイティブのファイルドロップハンドラで横取りし、`drop` イベントが発火しないことが原因
  - **修正1**: `src-tauri/tauri.conf.json` のウィンドウ設定に `"dragDropEnabled": false` を追加（本アプリはOSからのファイルドロップを使用しないため副作用なし）
  - **修正2**: `app/today/page.js` の `onTodayDragStart` に `e.dataTransfer.setData('text/plain', '')` を追加（クロスブラウザ互換性のベストプラクティス）
  - `npm run lint` — エラーなし
- **変更したファイル**:
  - `src-tauri/tauri.conf.json`, `app/today/page.js`
- **影響範囲**:
  - `app/today/page.js`: 手動モード時のDnD動作のみ。自動ソート・フィルタ・ステータス変更等は変更なし
  - `src-tauri/tauri.conf.json`: ウィンドウのファイルドロップ無効化。アプリ機能にファイルドロップは不使用のため影響なし
  - `components/TaskList.js`: 変更なし（@dnd-kit 使用のため Tauri の DnD 設定の影響を受けない）
- **次にやるべきこと**:
  - リリース前検証の実施
- **注意事項・申し送り**:
  - TaskList.js（タスク一覧）は @dnd-kit（Pointer Events ベース）で DnD を実装しており、今回の Tauri 設定変更の影響は受けない
  - 今後 OS からのファイルドロップ機能が必要になった場合は、`dragDropEnabled` を `true` に戻し、Today ページの DnD を @dnd-kit またはPointer Events ベースの実装に移行する必要あり

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-03-01 15:00 — v1.3.0 枝番3-3 リグレッションテスト
- ステータス: ✅ 完了
- やったこと: STEP R リグレッションテスト実施（直接5件、影響範囲4件 全OK）、ISSUES.md・ROADMAP.md更新
- 変更したファイル: `qa-report.md`, `ISSUES.md`, `ROADMAP.md`, `WORK-LOG.md`

### 2026-03-01 14:30 — v1.3.0 枝番3-3 QA指摘修正
- ステータス: ✅ 完了
- やったこと: QAレポートの指摘事項5件を修正（DnDインデックス修正、フィルタ適用時順序維持、エラー通知等）
- 変更したファイル: `app/today/page.js`, `components/TaskList.js`, `qa-report.md`
