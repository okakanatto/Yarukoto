# Work Log

## 最新の作業（2026-03-01）

- **フェーズ**: v1.4.0 動作確認バグ修正（カード表示崩れ + 潜在バグ修正 + DB重複クリーンアップ）
- **対象バージョン**: v1.4.0
- **対象課題**:
  1. 「今日やるタスク」画面でカードが表示されず、タスク名が縦並びに崩れる不具合
  2. dailyルーティンの weekdays_only チェック欠落（潜在バグ）
  3. showOverdue 初期値とマスターデータ読込前のfetch（潜在バグ）
  4. タスク・ルーティンのDB重複レコード（手動クリーンアップ）
- **ステータス**: ✅ 完了
- **やったこと**:
  - **カード表示崩れの根本原因特定と修正**:
    - IMP-13（v1.4.0 リファクタリング）で `TodayCardItem` を `TodayPage` から別の関数コンポーネントとして抽出した際、styled-jsx のスコープが切れた
    - `app/today/page.js` の `<style jsx>` を `<style jsx global>` に変更
  - **weekdays_only チェック欠落の修正**:
    - `lib/holidayService.js` の `isRoutineActiveOnDate()` で daily ルーティンの weekdays_only=1 が無視されていた
    - 週末（土日）を isScheduled=false にするチェックを追加
  - **showOverdue 初期値 + masterDataReady ガード**:
    - `hooks/useTodayTasks.js` の showOverdue 初期値を `true` → `false` に修正（DB既定値 '0' に合致）
    - 設定値の比較を `!== '0'` → `=== '1'` に修正（厳密な真偽判定）
    - masterDataReady ref によるマスターデータ読込前の fetch 抑止ガードを追加
  - **DB重複レコードの調査と手動クリーンアップ**:
    - SQLite DB を直接調査。タスク5件・ルーティン3件の重複を確認・削除
  - **不要な修正のリバート**:
    - クロスエンティティ重複排除（タイトルベース）は誤診に基づく修正だったため除去。実際はDB重複レコードが原因であり既にクリーンアップ済み
- **変更したファイル**: `app/today/page.js`, `lib/holidayService.js`, `hooks/useTodayTasks.js`
- **DB操作**: 重複レコード削除（tasks id:24-28, routines id:8-10 + 関連テーブル）
- **注意事項・申し送り**:
  - DB重複の発生原因は不明（45秒差で同一データが作成されている）。再発した場合は `lib/db.js` のシード処理を確認すべき
  - 【変更サマリー】
  - ■ 変更した機能：
  - ・「今日やるタスク」画面のカード表示（表示崩れ修正）
  - ・「今日やるタスク」画面のルーティン表示（平日のみルーティンが週末に表示されるバグ修正）
  - ・「今日やるタスク」画面のデータ読込（設定読込前の一瞬の誤表示防止）
  - ■ 変更したファイル：
  - ・app/today/page.js — styled-jsx を global 化し、子コンポーネント TodayCardItem にスタイルが適用されるよう修正
  - ・lib/holidayService.js — isRoutineActiveOnDate() に daily ルーティンの weekdays_only チェックを追加
  - ・hooks/useTodayTasks.js — showOverdue 初期値を false に修正、設定値比較を厳密化、masterDataReady ガード追加
  - ■ 変更の概要：
  - ・app/today/page.js: IMP-13 で TodayCardItem を子コンポーネントに分離した際、styled-jsx の `<style jsx>` が親コンポーネントスコープに閉じてしまい子要素に CSS が到達しなくなった。`<style jsx global>` に変更して解消。
  - ・lib/holidayService.js: isRoutineActiveOnDate() の daily 分岐で weekdays_only フラグを無視していた。weekdays_only=1 かつ土日の場合に isScheduled=false を返すよう修正。
  - ・hooks/useTodayTasks.js: showOverdue の useState 初期値が true だったが DB 既定値は '0'（無効）であり、マスターデータ読込完了前に期限切れタスクが一瞬表示される問題があった。初期値を false に変更、設定値比較を `=== '1'` に厳密化、masterDataReady ref ガードでマスターデータ未読込時の fetch をスキップするよう修正。
  - ■ 影響が想定される箇所：
  - ・app/today/page.js の TodayCardItem コンポーネント — styled-jsx global のスタイルが適用される対象。`.today-card`, `.today-card-info`, `.today-card-title`, `.today-card-meta`, `.today-card-actions` 等のクラスを使う全要素
  - ・app/today/page.js の TodayPage コンポーネント — styled-jsx global 化により、同一クラス名が他ページで使われた場合にスタイル衝突の可能性（ただし `.today-` プレフィックスにより実質リスクなし）
  - ・lib/holidayService.js の isRoutineActiveOnDate() を呼び出す箇所 — hooks/useTodayTasks.js（今日やるタスクのルーティン取得）
  - ・hooks/useTodayTasks.js を使用する箇所 — app/today/page.js（useTodayTasks フック呼び出し元）
  - ・app/layout.js のサイドバー進捗カウント — layout.js 内の routinesRes.forEach で weekdays_only チェックが既にあり、holidayService.js の修正と整合している

---

## 過去の作業（直近2件まで保持。3件目以降は削除すること）

### 2026-03-01 — v1.4.0 QA NG項目4件修正
- ステータス: ✅ 完了
- やったこと: 自動完了キャンセル除外・processingIds反映・トグル色統一・ON判定統一
- 変更したファイル: 複数ファイル

### 2026-03-01 — v1.4.0 ENH-1 + ENH-5 実装
- ステータス: ✅ 完了
- やったこと: ダッシュボード今日完了タスク表示 + 子タスク全完了で親自動完了オプション
- 変更したファイル: 複数ファイル
