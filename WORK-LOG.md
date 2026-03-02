# Work Log

## 最新の作業（2026-03-03）

- **フェーズ**: フェーズ4 実装
- **対象バージョン**: v1.4.0
- **対象枝番**: 4-4（自動テスト基盤の構築）
- **ステータス**: ✅ 完了
- **やったこと**:
  - Vitest + better-sqlite3 によるテスト環境をセットアップ
  - Tauri IPC モック層を構築（`@tauri-apps/plugin-sql` → better-sqlite3 インメモリDB、`@tauri-apps/plugin-http` → 503スタブ）
  - テストヘルパー（`createTestDb`, `seedTasks`, `seedTags`, `seedRoutine` 等）を作成
  - 初期テスト69件を作成（10ファイル）:
    - `tests/lib/utils.test.js` — formatMin, parseTags
    - `tests/lib/taskSorter.test.js` — 全ソートコンパレータ, SORT_OPTIONS
    - `tests/lib/holidayService.test.js` — isHolidayOrWeekend, isRoutineActiveOnDate
    - `tests/db/schema.test.js` — テーブル存在, シードデータ, インデックス
    - `tests/db/taskCrud.test.js` — タスクCRUD, CASCADE
    - `tests/db/parentChild.test.js` — 親子関係
    - `tests/db/statusTransition.test.js` — ステータス遷移, auto_complete_parent
    - `tests/db/archive.test.js` — アーカイブ・復元（BUG-7回帰防止）
    - `tests/db/routines.test.js` — ルーティンCRUD, 完了管理
    - `tests/db/settings.test.js` — app_settings 読み書き
  - `npm test` で 69/69 全件パスを確認
  - `dev-flow-guide.md` にプロンプト4-T（自動テスト工程）を追加
  - ROADMAP.md に 4-4 枝番を追加
- **変更したファイル**:
  - `package.json` — test/test:watch スクリプト追加、devDependencies追加
  - `vitest.config.js` — 新規作成（Vitest設定）
  - `tests/__mocks__/tauri-plugin-sql.js` — 新規作成（SQLモック）
  - `tests/__mocks__/tauri-plugin-http.js` — 新規作成（HTTPモック）
  - `tests/__helpers__/setup.js` — 新規作成（グローバルセットアップ）
  - `tests/__helpers__/testDb.js` — 新規作成（DBファクトリ・シードヘルパー）
  - `tests/lib/*.test.js` — 新規作成（3ファイル）
  - `tests/db/*.test.js` — 新規作成（7ファイル）
  - `dev-flow-guide.md` — プロンプト4-T追加、チャット構成・フローチャート・早見表更新
  - `ROADMAP.md` — 4-4枝番追加
- **次にやるべきこと**:
  - 枝番4-5以降の実装（v1.4.0 不具合修正）
- **注意事項・申し送り**:
  - テスト基盤はアプリ本体には一切影響しない（devDependencies + tests/ ディレクトリのみ）
  - `holidayService.js` のモジュールレベルキャッシュ（`holidayCache`）はテスト間で共有されるため、holidayService のテストでは `isHolidayOrWeekend()` の結果ではなく DB操作の正しさを検証している
  - SQLパラメータは `$1, $2` → `?` に自動変換するモックを使用
  - 今後の枝番実装後は `npm test` を実行して既存テストが壊れていないことを確認すること（プロンプト4-T）

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-03-02 — フェーズ5 動作確認 → リリース中止・フェーズ1リセット
- ステータス: ⏸️ 中断
- やったこと: フェーズ5での手動動作確認にて多数の不具合が発見されたため、v1.4.0のリリースを中止。ROADMAP.md差し戻し、qa-report.md退避。
- 注意: 実装済みの4-1〜4-3は完了扱い。不具合は新規課題としてフェーズ2で追加予定。

### 2026-03-01 — v1.4.0 リリース前検証 STEP R + 完了処理
- ステータス: ✅ 完了
- やったこと: 動作確認バグ修正に対するSTEP R リグレッションテスト実施（全10件OK）、完了処理
