# Work Log

## 最新の作業（2026-03-01）

- **フェーズ**: v1.4.0 動作確認バグ修正（今日やるタスク画面の表示不具合）
- **対象バージョン**: v1.4.0
- **対象課題**: 「今日やるタスク」画面でタスクが重複表示される不具合の修正
- **ステータス**: ✅ 完了
- **やったこと**:
  - `hooks/useTodayTasks.js` に3点の修正を適用:
    1. `showOverdue` の初期値を `true` → `false` に修正（DB デフォルト値 `'0'` との不整合を解消）
    2. `masterDataReady` ref ガードを追加し、マスターデータ読込完了前の `loadTasks` 実行を抑止（React StrictMode の二重 mount によるレースコンディション対策）
    3. ルーティン＋通常タスクのマージ後に `Set` ベースの重複排除ロジックを追加
  - `npm run lint` 実行、エラーなし
- **変更したファイル**: `hooks/useTodayTasks.js`
- **影響範囲**: 「今日やるタスク」画面のデータ取得ロジックのみ。他画面（タスク一覧・ダッシュボード等）への影響なし
- **次にやるべきこと**:
  - 実機で修正を確認する
  - フェーズ5（動作確認）を続行する
- **注意事項・申し送り**:
  - 根本原因: React StrictMode（Next.js 16 デフォルト有効）による useEffect の二重実行と、`showOverdue` 初期値の不整合が組み合わさり、マスターデータ読込前に不正な条件でタスクが2回フェッチされていた

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-03-01 — v1.4.0 QA NG項目修正 STEP R + 完了処理
- ステータス: ✅ 完了
- やったこと: STEP R リグレッションテスト実施（全8件OK、NG 0件）、ISSUES.md・ROADMAP.md・qa-report.md 更新
- 変更したファイル: `ISSUES.md`, `ROADMAP.md`, `qa-report.md`, `WORK-LOG.md`

### 2026-03-01 — v1.4.0 QA NG項目修正
- ステータス: ✅ 完了
- やったこと: STEP A・STEP B で検出された NG 項目4件の修正（A-2 NG-1, A-3 NG-1, B NG-2, B NG-1）
- 変更したファイル: `hooks/useTaskActions.js`, `app/today/page.js`, `app/routines/page.js`, `app/routines/_components/RoutineFormModal.js`, `app/settings/_components/OptionsPanel.js`, `hooks/useTodayTasks.js`
