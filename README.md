# シラバスレビューデータベース

大学教員が協力企業から収集したシラバス外部レビューを登録・公開するWebアプリケーションです。学生がキャリア形成情報や授業の外部評価を閲覧できます。

---

## 主な機能

- **シラバスレビュー管理** — 科目ごとの外部レビューを登録。PDFレビュー資料のアップロード・インライン表示に対応。
- **コマシラバス管理** — 授業回ごとの学習概要・学習目標を Markdown で登録・管理。
- **課題レビュー管理** — 課題ごとの概要・評価コメントを Markdown で登録・管理。
- **公開フラグ制御** — シラバスレビュー・コマシラバス・課題レビューすべてに公開/非公開フラグあり。未ログインユーザーには公開データのみ表示。
- **Markdown レンダリング** — 自由記述フィールドはすべて Markdown 形式で入力・プレビュー表示。
- **マスターデータ管理** — 評価（秀/優/良/可/不可）、学部名、業種、職種などを管理画面から動的に設定可能。
- **ユーザー管理** — 教員・管理者のロール管理。

---

## 技術スタック

| 層 | 技術 |
|----|------|
| バックエンド | Node.js 24 + Express |
| データベース | SQLite（better-sqlite3 v11以上） |
| 認証 | JWT（jsonwebtoken） |
| ファイルアップロード | multer |
| フロントエンド | Vanilla JS SPA（ビルドツールなし） |
| Markdownレンダリング | marked.js + DOMPurify（ローカル配置） |
| セキュリティ | helmet、express-rate-limit、DOMPurify |

---

## セットアップ

### 必要な環境

- **Node.js 24.x 以上**（必須）
- npm

> `better-sqlite3` は Node.js 24 の C++20 要件に対応するため **v11 以上** が必要です。Node.js 18/20 では動作しません。

### インストール

```bash
git clone https://github.com/kolinz/syllabus-review-db.git
cd syllabus-review-db
npm install
```

### 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集して設定します。

```env
PORT=3000
JWT_SECRET=your-secret-key-here   # 必ず変更してください
JWT_EXPIRES_IN=24h
PDF_UPLOAD_DIR=./uploads
PDF_MAX_SIZE_MB=5
KOMA_MAX_SESSION=15
DB_PATH=./syllabus-review.db
SEED_SAMPLE_DATA=false
```

### 起動

```bash
# 通常起動
node server.js

# サンプルデータを投入して起動
SEED_SAMPLE_DATA=true node server.js

# 開発モード（nodemon）
npm run dev
```

起動後、ブラウザで [http://localhost:3000](http://localhost:3000) にアクセスしてください。

---

## サンプルアカウント（SEED_SAMPLE_DATA=true 時）

| ユーザー名 | パスワード | 権限 |
|-----------|----------|------|
| `admin` | `admin123` | 管理者 |
| `yamada` | `teacher123` | 教員 |
| `suzuki` | `teacher123` | 教員 |

> **本番環境では必ずパスワードを変更し、`JWT_SECRET` に安全な値を設定してください。**

---

## ディレクトリ構成

```
syllabus-review-db/
├── .env.example
├── package.json
├── server.js                 # Expressサーバー
├── db/
│   ├── schema.js             # テーブル定義・マイグレーション
│   └── seed.js               # サンプルデータ
├── middleware/
│   ├── auth.js               # JWT認証
│   ├── upload.js             # PDFアップロード設定
│   └── sanitize.js           # XSS対策
├── routes/
│   ├── auth.js
│   ├── syllabi.js            # シラバスレビュー + PDF配信
│   ├── koma.js               # コマシラバス
│   ├── assignments.js        # 課題レビュー
│   ├── masters.js            # マスターデータ
│   └── users.js              # ユーザー管理
└── public/
    ├── index.html
    ├── app.js                # SPA ロジック
    ├── style.css
    └── lib/
        ├── marked.min.js     # npm install 後にコピー
        └── purify.min.js     # npm install 後にコピー
```

---

## 権限モデル

| ユーザー種別 | 閲覧 | 作成・編集・削除 |
|------------|------|----------------|
| 未認証 | 公開データのみ | 不可 |
| 教員 | 自分のデータ全件 + 他者の公開データ | 自分が作成したデータのみ |
| 管理者 | 全データ | 全データ + ユーザー・マスター管理 |

---

## API 概要

| エンドポイント | 説明 |
|--------------|------|
| `POST /api/auth/login` | ログイン |
| `GET /api/syllabi` | シラバスレビュー一覧 |
| `GET /api/syllabi/:id/pdf` | PDF インライン表示 |
| `GET /api/koma` | コマシラバス一覧 |
| `GET /api/assignments` | 課題レビュー一覧 |
| `GET /api/masters` | マスターデータ取得 |

すべてのエンドポイントは `{ "data": ... }` 形式で成功レスポンスを返します。

---

## 既知の制約

- PDF アップロードは、シラバスレビューの保存後に詳細画面から行います（新規作成時は不可）。
---

## ライセンス

MIT
