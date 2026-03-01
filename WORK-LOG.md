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
  - 【変更サマリー】
  - ■ 変更した機能：
    - 「今日やるタスク」画面の手動並び替え（DnD）が動作しない不具合を修正
  - ■ 変更したファイル：
    - `src-tauri/tauri.conf.json` — ウィンドウ設定に `"dragDropEnabled": false` を追加（Tauri のネイティブファイルドロップハンドラを無効化し、WebView2 上の HTML5 DnD イベントが正常に発火するようにした）
    - `app/today/page.js` — `onTodayDragStart` ハンドラに `e.dataTransfer.setData('text/plain', '')` を追加（クロスブラウザ互換性向上）
  - ■ 変更の概要：
    - Tauri v2 のデフォルト設定 `dragDropEnabled: true` が、Windows の WebView2 上で HTML5 DnD イベント（特に `drop` イベント）をネイティブのファイルドロップハンドラで横取りし、「今日やるタスク」画面の DnD が一切動作しなかった（Tauri 既知問題 #8581, #4168, #2014）。`dragDropEnabled: false` で無効化し HTML5 DnD を正常化。また `onTodayDragStart` で `setData()` 未呼出だった点も修正。
  - ■ 影響が想定される箇所：
    - `app/today/page.js` — 手動モード時の DnD ハンドラのみ。自動ソート・フィルタ・ステータス変更等は変更なし
    - `components/TaskList.js` — @dnd-kit（Pointer Events）のため影響なし
    - `src-tauri/tauri.conf.json` — OS ファイルドロップ無効化。アプリ内に使用箇所なし
    - `app/tasks/page.js` — TaskList 経由で DnD 使用するが @dnd-kit のため影響なし
    - `app/layout.js` — FAB からのタスク追加は DnD と無関係。影響なし
    - `app/settings/page.js` — ステータス並び順は上下ボタン方式。影響なし

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
