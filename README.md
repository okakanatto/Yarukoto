# Yarukoto

個人用タスク管理デスクトップアプリ。Next.js + SQLite + Tauri v2 によるローカル完結型。

## 特徴

- **ローカル完結**: データはすべてローカルのSQLiteに保存。クラウド不要、アカウント不要
- **今日やるタスク**: ルーティン・ピック済み・期限日タスクをまとめて表示
- **ルーティン管理**: 日次/週次/月次の繰り返しタスクを設定（祝日・休日スキップ対応）
- **親子タスク**: 1階層の親子関係でタスクを整理
- **ドラッグ&ドロップ**: タスクの並び替え・親子関係の変更をDnDで操作
- **ダッシュボード**: 完了率・7日間チャート・ステータス分布を可視化
- **アーカイブ**: 完了済みタスクの手動/自動アーカイブ
- **CSV エクスポート/インポート**: BOM付きUTF-8でExcel互換

## 技術スタック

- **フレームワーク**: [Next.js](https://nextjs.org/) (App Router, Static Export)
- **UI**: React, styled-jsx
- **デスクトップ**: [Tauri v2](https://v2.tauri.app/)
- **DB**: SQLite ([`@tauri-apps/plugin-sql`](https://v2.tauri.app/plugin/sql/))
- **言語**: JavaScript
- **テスト**: Vitest

## セットアップ

### 前提条件

- [Node.js](https://nodejs.org/) (v20以上推奨)
- [Rust](https://www.rust-lang.org/tools/install)
- Tauri v2 の前提条件 ([公式ガイド](https://v2.tauri.app/start/prerequisites/))

### インストール

```bash
git clone https://github.com/okakanatto/Yarukoto.git
cd Yarukoto
npm install
```

### 開発

```bash
npm run tauri dev
```

> **注意**: `npm run dev` だけではTauri IPCにアクセスできないため動作しません。必ず `npm run tauri dev` を使用してください。

### ビルド

```bash
npm run tauri build
```

インストーラー (.exe) とポータブル版が `src-tauri/target/release/` 以下に生成されます。

### テスト

```bash
npm test
```

## ダウンロード

ビルド済みバイナリは [Releases](https://github.com/okakanatto/Yarukoto/releases) からダウンロードできます。

- **インストーラー版** (.exe): Windows用のセットアップファイル
- **ポータブル版** (.exe): インストール不要の単体実行ファイル

## ライセンス

[MIT](LICENSE)
