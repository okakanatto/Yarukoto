# Verification Bugs Log

This file contains bugs and issues identified during the verification steps for v1.1.0. These issues will be addressed in a single batch after all verification steps are complete.

## STEP 2 (異常系・境界値テスト) の検出事項
- [ ] **設定画面（タグ・ステータス名編集）のバグ**: `app/settings/page.js` の `row` コンポーネント内の `<input onChange={...}>` において、文字入力の度に `updTag` / `upd(status)` が同期発火しDB更新処理(`db.execute`) が直接呼び出されている。デバウンス処理（または `onBlur` 処理）が不足しており、連続してキーボード入力を行うとDBへのリクエストがスパイクして状態が不整合となる可能性がある。

## STEP 3 (データ件数・状態遷移テスト) の検出事項
- [ ] **タスク追加時の連続操作による二重送信**: `TaskInput.js` において、データの追加処理（`handleSubmit`）中に `submitting` フラグでボタンを `disabled` にしてガードしているが、Enterキーの連打等（フォームの `onSubmit` 発火）に対しては `if (!title.trim() || submitting) return;` のガードがあるものの、Reactのステート更新（`setSubmitting(true)`）が非同期であるため、極めて高速な連打を行った場合にAPIトランザクションが複数走る「二重送信」の競合リスクがわずかに残存している。

## STEP 4 (例外・エラーハンドリングテスト) の検出事項
- [ ] **DBアクセス不可・破損時のフォールバック不足**: `lib/db.js` の `getDb()` で初期化エラーが発生した場合、例外が投げられるものの、アプリケーション（Reactツリー）全体を包むエラーバウンダリまたはグローバルなエラーキャッチが存在しないため、各ページの `useEffect` 等で暗黙のローディング状態（`loading: true` のまま）または白画面でフリーズしてしまう。ユーザーに「データベースを読み込めませんでした。再起動してください」などの明確なエラーメッセージを提示する仕組みが必要。
