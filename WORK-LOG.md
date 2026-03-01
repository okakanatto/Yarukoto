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
