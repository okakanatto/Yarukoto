# Work Log

## 最新の作業（2026-03-01 02:00）

- **フェーズ**: v1.3.0 枝番3-2 QA指摘5件修正
- **対象バージョン**: v1.3.0
- **対象枝番**: 3-2（IMP-2: アーカイブ機能のQA指摘修正）
- **ステータス**: ✅ 完了
- **やったこと**:
  - STEP B #6: handleArchive をトランザクション（BEGIN/COMMIT/ROLLBACK）で囲み、親子連動アーカイブの all-or-nothing を保証。子アーカイブも for ループから単一 UPDATE 文に統一
  - STEP B #7: handleRestore をトランザクションで囲み、親子連動復元の all-or-nothing を保証
  - STEP A #24: runAutoArchive に親子連動ロジックを追加（自動アーカイブ後、アーカイブ済み親タスクの子も連動アーカイブ）
  - STEP B 一貫性 #10: CSVエクスポートのクエリに WHERE t.archived_at IS NULL を追加、説明文を更新
  - STEP B 一貫性 #4: 復元トーストを親子連動時に具体的なメッセージに変更
  - npm run lint 実行 → エラー0件
- **変更したファイル**:
  - `components/TaskList.js` — handleArchive: トランザクション化 + 子アーカイブを単一UPDATE文に変更。handleRestore: トランザクション化 + 親子連動時のトーストメッセージを改善
  - `lib/db.js` — runAutoArchive: 親子連動アーカイブの追加UPDATE文を追加
  - `app/settings/page.js` — CSVエクスポートクエリに WHERE t.archived_at IS NULL 追加、説明文更新
  - `qa-report.md` — 5件のNG項目に「✅ 修正済み」マーク追記
- **次にやるべきこと**:
  - 枝番3-2 の検証を継続（STEP R リグレッションテスト）
- **注意事項・申し送り**:
  - handleArchive の子アーカイブを for ループ→単一 UPDATE 文に変更したため、挙動が若干異なる（filter で archived_at 未設定の子を選ぶ代わりに、SQL の WHERE archived_at IS NULL で同等の条件を処理）
  - runAutoArchive の親子連動は、status_code に関係なくアーカイブ済み親の子を全てアーカイブする。これは手動アーカイブと同じ挙動（手動も親アーカイブ時に子全部をアーカイブ）
  - 【変更サマリー】
  - ■ 変更した機能：
    - タスクのアーカイブ操作（手動アーカイブ）：トランザクション処理に変更し、親子連動アーカイブの all-or-nothing を保証
    - タスクの復元操作：トランザクション処理に変更し、親子連動復元の all-or-nothing を保証
    - タスクの復元トースト通知：親子連動復元時に「親タスクと子タスクをまとめて復元しました」等の具体的メッセージに変更
    - 自動アーカイブの親子連動：親タスクが自動アーカイブされた際、子タスクも連動してアーカイブされるように修正
    - CSVエクスポート：アーカイブ済みタスクをエクスポート対象から除外、説明文を更新
  - ■ 変更したファイル：
    - `components/TaskList.js` — handleArchive: BEGIN/COMMIT/ROLLBACK トランザクション化、子アーカイブを for ループから単一 UPDATE WHERE parent_id 文に変更。handleRestore: トランザクション化、復元トーストを親子連動時に具体的メッセージに分岐（親→子: 「親タスクと子タスクをまとめて復元しました」、子→親: 「子タスクと親タスクを復元しました」、単体: 「復元しました」）
    - `lib/db.js` — runAutoArchive(): 自動アーカイブ UPDATE 後に親子連動 UPDATE を追加（`UPDATE tasks SET archived_at = ... WHERE archived_at IS NULL AND parent_id IN (SELECT id FROM tasks WHERE archived_at IS NOT NULL AND parent_id IS NULL)`）
    - `app/settings/page.js` — CSVエクスポートの SELECT クエリに `WHERE t.archived_at IS NULL` を追加。説明文を「アクティブなタスクをCSVファイルとしてダウンロードします（アーカイブ済みは除外）」に変更
  - ■ 変更の概要：
    - QA レポート（STEP A + STEP B）で検出された NG 5件を修正。handleArchive/handleRestore が複数の db.execute を逐次呼び出していたためDBエラー時に不整合状態が発生し得た問題を、BEGIN/COMMIT/ROLLBACK トランザクションで囲むことで解決。handleArchive の子アーカイブは for ループで個別 UPDATE していたものを単一 UPDATE WHERE parent_id 文に統一し、効率と安全性を向上。runAutoArchive は完了日ベースの自動アーカイブのみで親子関係を考慮していなかったため、自動アーカイブ後にアーカイブ済み親の子を連動アーカイブする追加 UPDATE を実装。CSVエクスポートはアーカイブ済みタスクも含めて出力していたため WHERE archived_at IS NULL で除外。復元トーストは親子連動の事実をユーザーに伝えるためメッセージを分岐。
  - ■ 影響が想定される箇所：
    - `app/tasks/page.js` — TaskList を使用。handleArchive/handleRestore のトランザクション化による再レンダリングタイミングは変更なし（setRefreshKey は COMMIT 後に呼ばれる）
    - `components/TaskList.js` L467-475 — TaskItem への onArchive/onRestore props 受け渡し。handleArchive/handleRestore の引数・戻り値は変更なし
    - `components/TaskList.js` L800-806 — 子タスク TaskItem への onArchive/onRestore props 受け渡し。変更なし
    - `components/TaskList.js` L770 — 📤復元ボタンの onClick。handleRestore の呼び出しインターフェースは変更なし
    - `components/TaskList.js` L785-787 — 📦アーカイブボタンの onClick。handleArchive の呼び出しインターフェースは変更なし
    - `lib/db.js` L204 — initDb() 内の `await runAutoArchive(db)` 呼び出し。runAutoArchive の引数・戻り値は変更なし
    - `app/settings/page.js` L546-547 — 設定画面 onBlur からの `runAutoArchive(db)` 呼び出し。インターフェース変更なし
    - `app/settings/page.js` L579-592 — CSVエクスポートのクエリ変更。CSVインポート（L621-652）には影響なし
    - `app/today/page.js` — タスク取得クエリ（archived_at IS NULL）は変更なし。runAutoArchive の親子連動により、自動アーカイブ後の表示結果が変わる可能性あり（親がアーカイブされると子も消える）
    - `app/dashboard/page.js` — 統計クエリ（archived_at IS NULL）は変更なし。同上の表示結果変動あり
    - `hooks/useMasterData.js` — 変更なし（影響なし）
    - `components/TaskInput.js` — 親タスク候補クエリ（archived_at IS NULL）は変更なし。同上の候補変動あり
    - `components/TaskEditModal.js` — 親タスク候補クエリ（archived_at IS NULL）は変更なし。同上の候補変動あり

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-03-01 01:00 — v1.3.0 枝番3-2 アーカイブ機能実装
- ステータス: ✅ 完了
- やったこと: IMP-2 アーカイブ機能の全仕様を実装（手動/自動アーカイブ、親子連動、アーカイブ済みタブ、除外処理、設定UI）
- 変更したファイル: `lib/db.js`, `components/TaskList.js`, `components/TaskInput.js`, `components/TaskEditModal.js`, `app/today/page.js`, `app/dashboard/page.js`, `app/settings/page.js`

### 2026-02-28 24:30 — v1.3.0 枝番3-1 リグレッションテスト + 完了処理
- ステータス: ✅ 完了
- やったこと: STEP R リグレッションテスト実施（18件全OK、NG=0件）、完了処理（ISSUES.md BUG-3 → 🟢 完了、ROADMAP.md 枝番3-1 → ✅ 完了）
- 変更したファイル: `qa-report.md`, `ISSUES.md`, `ROADMAP.md`, `WORK-LOG.md`
