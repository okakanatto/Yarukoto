# Work Log

## 最新の作業（2026-02-28 --:--）

- **フェーズ**: 実装（UI修正）
- **対象バージョン**: v1.2.0
- **対象枝番**: 2-3（IMP-3: フィルタ複数選択）UI方式変更
- **ステータス**: ✅ 完了
- **やったこと**:
  - フィルタUIをチップ+トグル方式からExcelライクなマルチセレクトドロップダウンに全面変更
  - 新規コンポーネント `MultiSelectFilter.js` を作成（再利用可能なドロップダウン）
  - ステータス・タグ・重要度・緊急度の4フィルタを統一UIで実装
  - ステータスフィルタ: `excludeDone`(bool) → `filterStatuses`(配列) に変更
  - ルーティンのステータスマッピングロジック（完了/未完了の二値対応）を追加
  - globals.css から不要になったfilter-chip/filter-toggleスタイルを削除
- **変更したファイル**:
  - `components/MultiSelectFilter.js`（新規）
  - `components/TaskList.js`
  - `app/today/page.js`
  - `app/globals.css`
- **次にやるべきこと**:
  - 枝番2-3の再検証（STEP A + STEP B + STEP R）
- **注意事項・申し送り**:
  - 前回のチップ+トグル方式はユーザー要望と異なったため、Excelフィルタ風ドロップダウンに作り直し
  - `today/page.js` の `t.status_code != 5` ハードコードを削除し、overdue条件内に `NOT IN (3, 5)` として移動
  - フィルタ未選択状態（`[]`）=全表示、配列にIN句で絞り込み

---

## 過去の作業（直近3件まで保持。4件目以降は削除すること）

### 2026-02-28 --:-- — v1.2.0 枝番2-3 IMP-3 STEP R リグレッションテスト + 完了処理
- ステータス: ✅ 完了
- やったこと: 枝番2-3の STEP R リグレッションテスト実施（静的分析、合計7件 全件OK）、ISSUES.md・ROADMAP.md・qa-report.md の完了処理
- 変更したファイル: `ISSUES.md`, `ROADMAP.md`, `qa-report.md`

### 2026-02-28 --:-- — v1.2.0 枝番2-3 IMP-3 STEP B 品質レビュー指摘修正
- ステータス: ✅ 完了
- やったこと: qa-report.md STEP B 品質レビュー（枝番2-3）で検出された NG 指摘全3件を修正（Race Condition対策、クラス名統一、CSSデッドコード削除）
- 変更したファイル: `components/TaskList.js`, `app/today/page.js`, `qa-report.md`

### 2026-02-28 --:-- — v1.2.0 枝番2-3 IMP-3 フィルタ複数選択（チップ+トグル方式）
- ステータス: ⚠️ 差し戻し（UI方式変更）
- やったこと: IMP-3（フィルタの複数選択）を実装。ステータストグル・タグ/重要度/緊急度チップ方式。→ ユーザーの意図と異なりExcelフィルタ風に変更
- 変更したファイル: `app/globals.css`, `components/TaskList.js`, `app/today/page.js`
