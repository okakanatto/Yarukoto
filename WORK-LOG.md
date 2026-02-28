# Work Log

## 最新の作業（2026-02-28 --:--）

- **フェーズ**: 実装
- **対象バージョン**: v1.2.0
- **対象枝番**: 2-3（IMP-3: フィルタ複数選択）Excelライクドロップダウン方式
- **ステータス**: ✅ 完了
- **やったこと**:
  - フィルタUIをチップ+トグル方式からExcelライクなマルチセレクトドロップダウンに全面変更
  - 新規コンポーネント `MultiSelectFilter.js` を作成（再利用可能なドロップダウン）
  - ステータス・タグ・重要度・緊急度の4フィルタを統一UIで実装
  - ステータスフィルタ: `excludeDone`(bool) → `filterStatuses`(配列) に変更
  - ルーティンのステータスマッピングロジック（完了/未完了の二値対応）を追加
  - globals.css から不要になったfilter-chip/filter-toggleスタイルを削除
  - styled-jsx での CSS Unicode エスケープ問題を修正（チェックマーク表示バグ）
- **変更したファイル**:
  - `components/MultiSelectFilter.js`（新規）— 再利用可能なExcelライクマルチセレクトドロップダウンコンポーネント
  - `components/TaskList.js` — excludeDone→filterStatuses、チップ→ドロップダウン、SQL条件をIN句方式に
  - `app/today/page.js` — 同上＋ルーティンのステータスマッピング、t.status_code!=5→overdue条件内にNOT IN(3,5)移動
  - `app/globals.css` — filter-chip/filter-toggle関連スタイル削除
- **次にやるべきこと**:
  - 枝番2-3の検証（STEP A + STEP B + STEP R）
- **注意事項・申し送り**:
  - 前回のチップ+トグル方式はユーザー要望と異なったため、Excelフィルタ風ドロップダウンに作り直し
  - フィルタ状態モデル: selected=[]（空配列）=フィルタなし（全表示）、selected=[1,2]等=IN句で絞り込み
  - ドロップダウン動作: 初期状態で全チェックON、個別にチェックを外して絞り込み、「すべて」で全選択に戻る
  - `today/page.js` の `t.status_code != 5` ハードコードを削除し、overdue条件内に `NOT IN (3, 5)` として移動。これによりステータスフィルタで明示的にキャンセルを選択すれば表示可能に
  - ルーティン対応: ルーティンは完了(3)/未完了(1)の二値しかないため、filterStatusesの内容に応じてrc.completion_dateの有無で振り分け
  - 影響箇所: app/tasks/page.js（TaskList使用、内部完結で外部IF変更なし）、app/today/page.js（SQL条件変更でフィルタ未使用時にキャンセル済みタスクが表示される可能性あり）

---

## 過去の作業（直近3件まで保持。4件目以降は削除すること）

### 2026-02-28 --:-- — v1.2.0 枝番2-3 IMP-3 UI方式変更（チップ→ドロップダウン途中）
- ステータス: ✅ 完了（途中経過）
- やったこと: フィルタUIをチップ+トグル方式からExcelライクなマルチセレクトドロップダウンに変更開始。チェックマーク表示バグを修正。
- 変更したファイル: `components/MultiSelectFilter.js`（新規）, `components/TaskList.js`, `app/today/page.js`, `app/globals.css`

### 2026-02-28 --:-- — v1.2.0 枝番2-3 IMP-3 STEP R リグレッションテスト + 完了処理
- ステータス: ✅ 完了
- やったこと: 枝番2-3の STEP R リグレッションテスト実施（静的分析、合計7件 全件OK）、ISSUES.md・ROADMAP.md・qa-report.md の完了処理
- 変更したファイル: `ISSUES.md`, `ROADMAP.md`, `qa-report.md`

### 2026-02-28 --:-- — v1.2.0 枝番2-3 IMP-3 フィルタ複数選択（チップ+トグル方式）
- ステータス: ⚠️ 差し戻し（UI方式変更）
- やったこと: IMP-3（フィルタの複数選択）を実装。ステータストグル・タグ/重要度/緊急度チップ方式。→ ユーザーの意図と異なりExcelフィルタ風に変更
- 変更したファイル: `app/globals.css`, `components/TaskList.js`, `app/today/page.js`
