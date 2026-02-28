# Work Log

## 最新の作業（2026-02-28 --:--）

- **フェーズ**: 検証・修正
- **対象バージョン**: v1.2.0
- **対象枝番**: 2-2（STEP B 品質レビュー指摘修正）
- **ステータス**: ✅ 完了
- **やったこと**:
  - qa-report.md の STEP B 品質レビューで検出された NG 指摘を全件修正
  - **観点1 #3 / 観点2 #10**: ステータス変更失敗時のエラートースト未表示
    - `TaskList.js` と `today/page.js` の `handleStatusChange` catchブロック3箇所にトースト通知追加
  - **観点2 #1**: 親タスク選択肢の文言不統一
    - `TaskEditModal.js` の `'なし（ルート）'` → `'なし（ルートタスク）'` に変更
  - **観点2 #2**: 想定工数プレースホルダの不統一
    - `TaskInput.js` の `placeholder="0"` → `placeholder="未設定"` に変更
  - **観点2 #3〜8**: TaskInput / TaskEditModal 間の CSS 不統一
    - ラベル色、入力背景色、padding、font-size、タイトルfont-size、border-radius、フォーカス効果を統一
  - **観点2 #9**: 想定工数 max 属性の欠落
    - `TaskEditModal.js` に `max="99999"` 追加
  - **観点2 #7**: textarea rows の不統一
    - `TaskInput.js` の備考を `rows="2"` → `rows="3"` に変更
  - **観点2 #11**: 親タスク候補フィルタの不統一
    - `TaskEditModal.js` のクエリに `status_code != 3` を追加して統一。現在の親タスクが完了済みの場合は `OR id = $2` で候補に含める
  - `npm run lint` 実行、新規 warning（`task.parent_id` 依存配列漏れ）を修正
- **変更したファイル**:
  - `components/TaskList.js` — handleStatusChange catchにエラートースト追加
  - `components/TaskEditModal.js` — 文言統一、max属性追加、CSS統一（6点）、親候補フィルタ統一、useEffect依存配列修正
  - `components/TaskInput.js` — プレースホルダ統一、textarea rows統一
  - `app/today/page.js` — handleStatusChange catchにエラートースト追加（2箇所）
  - `qa-report.md` — 修正済みマーク追加
- **次にやるべきこと**:
  - STEP R（リグレッションテスト）の実行
  - v1.2.0 枝番 2-3（IMP-3: フィルタ複数選択）の実装開始
- **注意事項・申し送り**:
  - DB変更なし。既存データに影響なし
  - CSS変更は TaskEditModal のみ。TaskInput のスタイルは変更していない
  - 親タスク候補フィルタの変更（#11）により、編集モーダルで完了タスクは親候補に表示されなくなる。ただし、現在の親が完了済みの場合のみ例外的に候補に含まれる
  - 【変更サマリー】
    - ■ 変更した機能：
      - ステータス変更失敗時のエラートースト通知追加（タスク一覧・今日やるタスク画面）
      - タスク追加フォームと編集モーダル間の文言統一（親タスク選択肢・想定工数プレースホルダ）
      - タスク編集モーダルのCSS統一（ラベル色・入力背景色・padding・font-size・タイトルfont-size・border-radius・フォーカス効果）
      - タスク編集モーダルの想定工数に上限バリデーション追加
      - タスク追加フォームの備考欄の初期高さ統一
      - タスク編集モーダルの親タスク候補フィルタ統一（完了タスクを候補から除外）
    - ■ 変更したファイル：
      - `components/TaskList.js` — handleStatusChange の catch ブロックにエラートースト通知を追加
      - `components/TaskEditModal.js` — 親タスク選択肢の文言統一、想定工数に max="99999" 追加、CSS6点統一、親候補クエリに status_code != 3 追加＋OR id = $2、useEffect 依存配列に task.parent_id 追加
      - `components/TaskInput.js` — 想定工数プレースホルダを "0" → "未設定" に変更、備考 textarea の rows を 2 → 3 に変更
      - `app/today/page.js` — handleStatusChange の catch ブロック2箇所にエラートースト通知を追加
    - ■ 変更の概要：
      - qa-report.md STEP B 品質レビューで検出された NG 指摘全11件を修正
      - エラートースト追加: TaskList.js と today/page.js の handleStatusChange の catch ブロック計3箇所にトースト通知追加。handleDelete と同じパターンに統一
      - 文言統一: TaskEditModal.js の 'なし（ルート）' → 'なし（ルートタスク）'
      - プレースホルダ統一: TaskInput.js の想定工数 placeholder "0" → "未設定"
      - CSS統一: TaskEditModal.js の styled-jsx を TaskInput のデザインパターンに寄せた（ラベル色・背景色・padding・font-size・タイトルfont-size・border-radius・フォーカス効果）
      - max属性追加: TaskEditModal.js の想定工数 input に max="99999" 追加
      - textarea rows統一: TaskInput.js の備考を rows="2" → rows="3"
      - 親候補フィルタ統一: TaskEditModal.js に AND status_code != 3 追加。現在の親が完了済みの場合は OR id = $2 で候補に含める
    - ■ 影響が想定される箇所：
      - TaskList.js の handleStatusChange を呼び出す箇所（StatusCheckbox onChange、tc-status-select onChange）
      - today/page.js の handleStatusChange を呼び出す箇所（StatusCheckbox onChange、today-status select onChange）
      - TaskEditModal を使用する全画面（tasks/page.js、today/page.js）
      - TaskInput を使用する全画面（tasks/page.js、TaskList.js 内子タスク追加、layout.js FAB モーダル）
      - TaskEditModal の親タスク候補取得ロジック（完了済み親タスクを持つタスクの編集に影響→OR id=$2 で現在の親は保持）
      - dashboard/page.js（DB値依存のため直接の影響なし）

---

## 過去の作業（直近3件まで保持。4件目以降は削除すること）

### 2026-02-26 --:-- — v1.2.0 枝番2-2 タスクUI改善3点
- ステータス: ✅ 完了
- やったこと: BUG-5（レイアウト統一）、IMP-12（着手中→未着手戻し）、ENH-6（完了日即時反映）
- 変更したファイル: `components/TaskInput.js`, `components/TaskEditModal.js`, `components/StatusCheckbox.js`, `components/TaskList.js`, `app/today/page.js`

### 2026-02-26 --:-- — v1.2.0 枝番2-1 親子タスクのデータ整合性修正
- ステータス: ✅ 完了
- やったこと: BUG-4（親タスク削除時の子タスク連鎖削除防止）、BUG-6（2階層制限バリデーション追加）
- 変更したファイル: `components/TaskList.js`, `components/TaskEditModal.js`

### 2026-02-25 --:-- — ガイドレビュー・改善
- ステータス: ✅ 完了
- やったこと: `dev-flow-guide.md` のレビュー結果に基づき、全15件の改善を適用
- 変更したファイル: `dev-flow-guide.md`
