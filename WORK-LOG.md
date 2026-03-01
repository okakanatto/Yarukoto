# Work Log

## 最新の作業（2026-03-01）

- **フェーズ**: v1.4.0 動作確認バグ修正（今日やるタスク画面の重複表示 — 再修正）
- **対象バージョン**: v1.4.0
- **対象課題**: 「今日やるタスク」画面でタスクが重複表示される不具合の修正（前回修正では解消されず再調査）
- **ステータス**: ✅ 完了
- **やったこと**:
  - **根本原因の特定**: `lib/holidayService.js` の `isRoutineActiveOnDate()` 関数が `weekdays_only` フィールドを一切チェックしていなかった。daily ルーティンの場合、`isScheduled = true` が無条件に設定されるため、`weekdays_only = 1` のルーティンも週末にアクティブと判定されていた
  - **症状**: 2026-03-01（日曜日）に、平日限定の daily ルーティンが「今日やるタスク」画面に表示される。同名のタスクとルーティンが異なる ID（`routine_X_date` vs 数値ID）で両方表示され、重複に見える。サイドバー（7件）とメインページ（9件）の件数不一致もこれが原因
  - **修正内容**: `isRoutineActiveOnDate()` の daily ルーティン判定に `weekdays_only` チェックを追加。`weekdays_only === 1` の場合、ベース日が週末（土=6, 日=0）なら `isScheduled = false` にする
  - 前回適用した `useTodayTasks.js` の防御的修正（showOverdue 初期値、masterDataReady ガード、Set 重複排除）はそのまま維持
  - `npm run lint` 実行、エラーなし
- **変更したファイル**: `lib/holidayService.js`（`isRoutineActiveOnDate` 関数内）
- **影響範囲**: `isRoutineActiveOnDate()` を使用する箇所すべて（`hooks/useTodayTasks.js` の loadTasks 内）。サイドバーのルーティンカウントは独自SQLで weekdays_only を処理済みのため影響なし。タスク一覧・ダッシュボード・ルーティン管理画面は `isRoutineActiveOnDate` を使用しないため影響なし
- **次にやるべきこと**:
  - 実機で修正を確認する（日曜日の今日やるタスク画面で平日限定ルーティンが非表示であること）
  - フェーズ5（動作確認）を続行する
- **注意事項・申し送り**:
  - 前回修正（useTodayTasks.js の showOverdue 初期値等）は誤った原因分析に基づいていたが、防御的修正として有効なためそのまま維持
  - `isRoutineActiveOnDate` の weekdays_only チェック欠落は v1.0.0 から存在していたが、v1.3.1 以前は today/page.js 内でルーティンの曜日判定を SQL + JS の両方で行っていたため顕在化しなかった。v1.4.0 IMP-13 で DnD 統一リファクタ時に `isRoutineActiveOnDate` に一本化された際に問題が表面化
  - サイドバー（layout.js）のルーティンカウントは独自 SQL で weekdays_only を処理しており、isRoutineActiveOnDate を使用していないため件数の不一致があった

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-03-01 — v1.4.0 動作確認バグ修正（今日やるタスク画面の表示不具合 — 初回修正）
- ステータス: ❌ 不十分（原因分析誤り、再修正で解消）
- やったこと: useTodayTasks.js に showOverdue 初期値修正、masterDataReady ガード追加、Set 重複排除追加
- 変更したファイル: `hooks/useTodayTasks.js`

### 2026-03-01 — v1.4.0 QA NG項目修正 STEP R + 完了処理
- ステータス: ✅ 完了
- やったこと: STEP R リグレッションテスト実施（全8件OK、NG 0件）、ISSUES.md・ROADMAP.md・qa-report.md 更新
- 変更したファイル: `ISSUES.md`, `ROADMAP.md`, `qa-report.md`, `WORK-LOG.md`
