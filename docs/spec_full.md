# シラバス外部レビューデータベース — SDD仕様書

| 項目 | 内容 |
|------|------|
| **バージョン** | 1.2 |
| **作成日** | 2025年 |
| **最終更新** | 2026年5月 |
| **ステータス** | 確定 |

---

## 更新履歴

| バージョン | 更新日 | 主な変更内容 |
|-----------|--------|-------------|
| 1.0 | 2025年 | 初版作成 |
| 1.1 | 2026年5月 | better-sqlite3 v11以上必須化、koma_syllabi・assignment_reviews への is_published 追加、PDF Content-Disposition 修正、PDFツールバー非表示対応、詳細モーダル追加、renderMd フォールバック実装、公開バッジUI追加 |
| 1.2 | 2026年5月 | assignment_reviews に assignment_overview 追加、Markdownライブラリのローカル配置、詳細モーダルでのMarkdownレンダリング、シラバスレビュー評価セクション常時表示、loadMasters常時実行対応 |

---

## 1. システム概要

### 1.1 目的

教員が協力企業に依頼して収集したシラバス外部レビューを登録・公開するデータベースシステム。学生が授業のキャリア形成情報・外部評価を参照できるようにする。

### 1.2 利用者と利用方法

| 利用者 | 認証 | できること |
|--------|------|-----------|
| 一般（学生・外部） | 不要 | `is_published = 1` のデータの閲覧のみ |
| 教員 | 要ログイン | 自分が作成したデータの作成・編集・削除（公開・非公開問わず）＋他者の公開データ閲覧 |
| 管理者 | 要ログイン | 全データの操作、ユーザー管理、マスター管理 |

### 1.3 技術スタック

| 項目 | 採用技術 |
|------|---------|
| バックエンド | Node.js 24 + Express |
| データベース | SQLite（better-sqlite3 **v11以上必須**） |
| 認証 | JWT（jsonwebtoken） |
| ファイルアップロード | multer |
| フロントエンド | Vanilla JS SPA（ビルドなし） |
| パスワードハッシュ | bcryptjs（ラウンド数: 10） |
| XSS対策 | helmet、DOMPurify（ローカルファイル）、sanitizeBody |
| レートリミット | express-rate-limit |
| Markdownレンダリング | marked.js + DOMPurify（`public/lib/` にローカル配置） |

> **重要**: `better-sqlite3` は Node.js 24 の V8 C++20 要件に対応するため **v11 以上** が必要。v9 系はビルドエラーになる。`"better-sqlite3": "^11.10.0"` と明示すること。

---

## 2. 環境変数定義（.env）

```env
PORT=3000
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=24h
PDF_UPLOAD_DIR=./uploads
PDF_MAX_SIZE_MB=5
KOMA_MAX_SESSION=15
DB_PATH=./syllabus-review.db
SEED_SAMPLE_DATA=false
```

---

## 3. ファイル構成

```
syllabus-review-db/
├── .env
├── .env.example
├── package.json              # better-sqlite3 ^11.10.0 必須
├── server.js                 # Expressサーバー
├── db/
│   ├── schema.js             # テーブル定義 + ALTER TABLE マイグレーション
│   └── seed.js               # サンプルデータ投入
├── middleware/
│   ├── auth.js               # authenticate / optionalAuth / requireAdmin
│   ├── upload.js             # multer PDF設定
│   └── sanitize.js           # sanitizeBody（XSS対策）
├── routes/
│   ├── auth.js               # ログイン・ログアウト・me
│   ├── syllabi.js            # シラバスレビュー CRUD + PDF配信
│   ├── koma.js               # コマシラバス CRUD（is_published対応）
│   ├── assignments.js        # 課題レビュー CRUD（is_published対応）
│   ├── masters.js            # マスターデータ管理
│   └── users.js              # ユーザー管理
└── public/
    ├── index.html            # ローカルlib読込（CDN不使用）
    ├── app.js                # フロントエンドSPAロジック
    ├── style.css
    └── lib/
        ├── marked.min.js     # node_modules/marked/lib/marked.umd.js をコピー
        └── purify.min.js     # node_modules/dompurify/dist/purify.min.js をコピー
```

---

## 4. データベース設計

### 4.1 users（ユーザー）

| カラム | 型 | 制約 | 説明 |
|-------|----|------|------|
| id | INTEGER | PK, AUTOINCREMENT | |
| username | TEXT | UNIQUE, NOT NULL | ログインID |
| password_hash | TEXT | NOT NULL | bcryptハッシュ |
| role | TEXT | NOT NULL | `admin` または `teacher` |
| display_name | TEXT | | 表示名 |
| is_disabled | INTEGER | DEFAULT 0 | 1=ログイン不可 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### 4.2 field_masters（選択肢マスター）

| カラム | 型 | 制約 | 説明 |
|-------|----|------|------|
| id | INTEGER | PK, AUTOINCREMENT | |
| field_type | TEXT | NOT NULL | 種別 |
| label | TEXT | NOT NULL | 表示値 |
| sort_order | INTEGER | DEFAULT 0 | 並び順 |
| is_disabled | INTEGER | DEFAULT 0 | 1=無効 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**field_type 一覧**

| field_type | 対応フィールド | 選択方式 |
|-----------|--------------|---------|
| `department` | 学部名 | 単一選択 |
| `game_element` | ゲーム要素の導入 | 複数選択 |
| `consultation_method` | 教員への相談方法 | 複数選択 |
| `ai_usage_scope` | AIの使用範囲 | 複数選択 |
| `industry` | 授業内容が役立つ業種 | 複数選択 |
| `occupation` | 授業内容が役立つ職種 | 複数選択 |
| `evaluation` | 評価（秀・優・良・可・不可） | 単一選択 |

### 4.3 syllabus_reviews（シラバスレビュー）

| カラム | 型 | 制約 | 説明 |
|-------|----|------|------|
| id | INTEGER | PK, AUTOINCREMENT | |
| subject_name | TEXT | NOT NULL | 科目名 |
| academic_year | INTEGER | NOT NULL | 年度（西暦4桁） |
| department_id | INTEGER | FK → field_masters | 学部名（単一） |
| pdf_path | TEXT | | PDFファイルパス |
| knowledge_skills | TEXT | | 習得できる知識・技能（Markdown） |
| ai_skills | TEXT | | 磨けるAI活用能力（Markdown） |
| non_ict_value | TEXT | | 情報通信業以外で役立つこと（Markdown） |
| evaluation_id | INTEGER | FK → field_masters | 評価（単一） |
| evaluation_comment | TEXT | | 評価コメント（Markdown） |
| university_learning | TEXT | | 大学生のうちに学んでほしいこと（Markdown） |
| is_published | INTEGER | NOT NULL DEFAULT 0 | 1=公開、0=非公開 |
| created_by | INTEGER | FK → users | 作成者 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**ユニーク制約**: `(subject_name, academic_year)`

### 4.4 syllabus_review_selections（複数選択）

| カラム | 型 | 制約 | 説明 |
|-------|----|------|------|
| id | INTEGER | PK, AUTOINCREMENT | |
| syllabus_review_id | INTEGER | FK → syllabus_reviews, CASCADE | |
| field_master_id | INTEGER | FK → field_masters | 選択値 |

対象: `game_element`, `consultation_method`, `ai_usage_scope`, `industry`, `occupation`

### 4.5 koma_syllabi（コマシラバス）

| カラム | 型 | 制約 | 説明 |
|-------|----|------|------|
| id | INTEGER | PK, AUTOINCREMENT | |
| syllabus_review_id | INTEGER | FK → syllabus_reviews, CASCADE | |
| session_number | INTEGER | NOT NULL | 回数（1〜15） |
| learning_overview | TEXT | | 学習概要（Markdown） |
| learning_objectives | TEXT | | 学習目標（Markdown） |
| is_published | INTEGER | NOT NULL DEFAULT 0 | 1=公開、0=非公開 |
| created_by | INTEGER | FK → users | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**制約**: `(syllabus_review_id, session_number)` でユニーク。`session_number` は 1〜15。
**マイグレーション**: `is_published` は `ALTER TABLE koma_syllabi ADD COLUMN` で追加（try/catch で冪等実行）。

### 4.6 assignment_reviews（課題レビュー）

| カラム | 型 | 制約 | 説明 |
|-------|----|------|------|
| id | INTEGER | PK, AUTOINCREMENT | |
| syllabus_review_id | INTEGER | FK → syllabus_reviews, CASCADE | |
| academic_year | INTEGER | NOT NULL | 年度（西暦4桁） |
| assignment_number | INTEGER | NOT NULL | 課題番号 |
| assignment_name | TEXT | | 課題名 |
| evaluation_id | INTEGER | FK → field_masters | 評価（単一） |
| assignment_overview | TEXT | | 概要（Markdown） |
| evaluation_comment | TEXT | | 評価コメント（Markdown） |
| university_learning | TEXT | | 大学生のうちに学んでほしいこと（Markdown） |
| is_published | INTEGER | NOT NULL DEFAULT 0 | 1=公開、0=非公開 |
| created_by | INTEGER | FK → users | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**マイグレーション**: `is_published` と `assignment_overview` は `ALTER TABLE assignment_reviews ADD COLUMN` で追加（try/catch で冪等実行）。

---

## 5. API仕様

### 5.1 共通規約

- レスポンス成功: `{ "data": {...} }` または `{ "data": [...] }` または `{ "message": "..." }`
- レスポンスエラー: `{ "error": "日本語メッセージ" }`
- 認証: `Authorization: Bearer <JWT>` ヘッダー

### 5.2 認証

| メソッド | エンドポイント | 認証 | 説明 |
|---------|--------------|------|------|
| POST | `/api/auth/login` | 不要 | ログイン → JWT返却 |
| POST | `/api/auth/logout` | 不要 | ログアウト |
| GET | `/api/auth/me` | 要 | 自分のユーザー情報 |

### 5.3 シラバスレビュー

| メソッド | エンドポイント | 認証 | 権限 | 説明 |
|---------|--------------|------|------|------|
| GET | `/api/syllabi` | 不要 | 全員 | 一覧（year/department/keyword フィルタ） |
| GET | `/api/syllabi/:id` | 不要 | 全員 | 詳細（選択値含む） |
| POST | `/api/syllabi` | 要 | teacher/admin | 新規作成 |
| PUT | `/api/syllabi/:id` | 要 | 作成者/admin | 更新 |
| DELETE | `/api/syllabi/:id` | 要 | 作成者/admin | 削除（PDF・関連データも削除） |
| POST | `/api/syllabi/:id/pdf` | 要 | 作成者/admin | PDFアップロード |
| GET | `/api/syllabi/:id/pdf` | 不要 | 全員 | PDFインライン表示 |

**PDFレスポンスヘッダー**:
```
Content-Type: application/pdf
Content-Disposition: inline; filename="syllabus.pdf"; filename*=UTF-8''<URLエンコード済み科目名_年度.pdf>
```
- `filename=` にはASCII文字のみ使用（`"syllabus.pdf"` 固定）
- 日本語ファイル名は `filename*=UTF-8''...` で付与（RFC 6266準拠）
- `filename=` に日本語を入れると Node.js で `ERR_INVALID_CHAR` エラーになる

### 5.4 コマシラバス

| メソッド | エンドポイント | 認証 | 説明 |
|---------|--------------|------|------|
| GET | `/api/koma` | 不要（optionalAuth） | 一覧（公開フィルタあり） |
| GET | `/api/koma/:id` | 不要（optionalAuth） | 詳細 |
| POST | `/api/koma` | 要 | 作成（is_published指定可） |
| PUT | `/api/koma/:id` | 要 | 更新（is_published変更可） |
| DELETE | `/api/koma/:id` | 要 | 削除 |

### 5.5 課題レビュー

| メソッド | エンドポイント | 認証 | 説明 |
|---------|--------------|------|------|
| GET | `/api/assignments` | 不要（optionalAuth） | 一覧（公開フィルタあり） |
| GET | `/api/assignments/:id` | 不要（optionalAuth） | 詳細 |
| POST | `/api/assignments` | 要 | 作成（is_published, assignment_overview指定可） |
| PUT | `/api/assignments/:id` | 要 | 更新（is_published, assignment_overview変更可） |
| DELETE | `/api/assignments/:id` | 要 | 削除 |

### 5.6 マスターデータ

| メソッド | エンドポイント | 認証 | 説明 |
|---------|--------------|------|------|
| GET | `/api/masters` | 不要 | 全マスター（有効のみ） |
| GET | `/api/masters/all` | 要（admin） | 全マスター（無効含む・管理画面用） |
| GET | `/api/masters/:field_type` | 不要 | 特定field_type |
| POST | `/api/masters` | 要（admin） | 追加 |
| PUT | `/api/masters/:id` | 要（admin） | 更新 |
| DELETE | `/api/masters/:id` | 要（admin） | 削除（参照中は不可） |

### 5.7 ユーザー管理

| メソッド | エンドポイント | 認証 | 説明 |
|---------|--------------|------|------|
| GET | `/api/users` | 要（admin） | 一覧 |
| POST | `/api/users` | 要（admin） | 作成 |
| PUT | `/api/users/:id` | 要（admin） | 更新 |
| DELETE | `/api/users/:id` | 要（admin） | 削除 |

---

## 6. 公開フラグ仕様（全テーブル共通）

| ユーザー種別 | 表示されるデータ |
|------------|----------------|
| 未認証 | `is_published = 1` のデータのみ |
| 教員 | 自分が作成した全データ ＋ 他者の `is_published = 1` |
| 管理者 | 全データ |

**実装パターン（GET エンドポイント）**:
```js
router.get('/', optionalAuth, (req, res) => {
  let filterClause = 'WHERE 1=1';
  const params = [];
  if (!req.user) {
    filterClause += ' AND <table>.is_published = 1';
  } else if (req.user.role !== 'admin') {
    filterClause += ' AND (sr.created_by = ? OR <table>.is_published = 1)';
    params.push(req.user.id);
  }
  // ...
});
```

---

## 7. 画面仕様

### 7.1 共通仕様

- ルーティング: URLハッシュ（`#/syllabi`, `#/koma`, `#/assignments`, `#/admin`）
- 認証状態: localStorage に JWT を保存
- 未ログインでも公開データは閲覧可能
- Markdown: `public/lib/marked.min.js` + `public/lib/purify.min.js`（ローカルファイル・CDN不使用）
- `renderMd()` は try/catch + フォールバック実装

### 7.2 シラバスレビュー一覧（`#/syllabi`）

**フィルタ**: 年度（プルダウン）、学部名（プルダウン）、科目名（テキスト・デバウンス）

**テーブル列**: 科目名、年度、学部名（バッジ）、評価（バッジ）、公開状態（バッジ）、作成者、詳細ボタン

### 7.3 シラバスレビュー詳細（`#/syllabi/:id`）

**セクション構成**:
1. ヘッダー（科目名・年度・学部名、編集/削除/戻るボタン）
2. **PDFレビュー資料**
   - 未登録 + 権限あり: ドラッグ&ドロップエリア
   - 未登録 + 権限なし: 「PDFが登録されていません」
   - 登録済み: `<iframe src="/api/syllabi/{id}/pdf#toolbar=0">` でプレビュー、科目名ラベルをiframe上部に表示、権限ありなら「PDFをアップロード」ボタン表示
3. 基本情報（科目名、年度、学部名）
4. 選択式フィールド（ゲーム要素・相談方法・AI使用範囲）
5. キャリア形成情報（業種・職種、Markdownフィールド3種）
6. **シラバス外部評価**
   - 評価ボタン（秀・優・良・可・不可）を常に読み取り専用で表示（選択済みをハイライト、未選択なら「未設定」）
   - 評価コメント（Markdownプレビュー）
   - 大学生のうちに学んでほしいこと（Markdownプレビュー）
7. 下部タブ（コマシラバス / 課題レビュー）

**詳細画面・フォームの評価セクション**: `renderSyllabusDetail` と `renderSyllabusForm` の先頭で `await loadMasters()` を常時実行し、最新のマスターデータを使用する。

**コマシラバスタブ列**: 回数、公開バッジ、学習概要（抜粋）、詳細ボタン、編集/削除ボタン（権限あり時）

**課題レビュータブ列**: 課題番号、課題名、公開バッジ、評価バッジ、詳細ボタン、編集/削除ボタン（権限あり時）

### 7.4 シラバスレビュー編集・作成（`#/syllabi/:id/edit` / `#/syllabi/new`）

- 新規作成時: PDFエリアに「保存後に詳細画面からアップロード可能」案内
- 編集時: PDFプレビュー（登録済みの場合） ＋「PDFをアップロード」ボタン
- 評価セクション: `createEvalOpts(state.masters.evaluation, selectedId, false)` で選択ボタン表示（`await loadMasters()` 常時実行で最新取得）

### 7.5 コマシラバス一覧（`#/koma`）

**フィルタ**: 関連シラバスレビュー（プルダウン）、ソート（回数順/シラバス順）

**テーブル列**: 回数、公開バッジ、関連シラバスレビュー、学習概要（抜粋）、詳細ボタン、操作ボタン

**詳細モーダル（`openKomaDetailModal`）**:
- タイトル: 第N回 科目名（年度）
- 公開バッジ
- 学習概要・学習目標: `renderMd()` でMarkdownレンダリング表示

**追加・編集モーダル（`openKomaListModal` / `openKomaModal`）**:
- 学習概要・学習目標: `createMdField()` のMarkdownタブ（編集/プレビュー）
- 公開チェックボックス

### 7.6 課題レビュー一覧（`#/assignments`）

**フィルタ**: 関連シラバスレビュー（プルダウン）

**テーブル列**: 課題番号、課題名、公開バッジ、関連シラバスレビュー、評価バッジ、詳細ボタン、操作ボタン

**詳細モーダル（`openAssignDetailModal`）**:
- タイトル: 課題N 課題名 科目名（年度）
- 公開バッジ・評価バッジ
- 概要・評価コメント・大学生のうちに学んでほしいこと: `renderMd()` でMarkdownレンダリング表示

**追加・編集モーダル（`openAssignListModal` / `openAssignModal`）**:
- 課題名、概要（Markdownタブ）、評価ボタン、評価コメント（Markdownタブ）、大学生のうちに学んでほしいこと（Markdownタブ）、公開チェックボックス

### 7.7 管理画面（`#/admin`）

- adminロールのみアクセス可
- **タブ1 ユーザー管理**: 一覧・追加・編集・削除（自分以外・データなし時のみ削除可）
- **タブ2 マスターデータ管理**: `GET /api/masters/all` で無効含む全件取得。field_typeごとにカード表示。追加・編集・無効化・削除

---

## 8. 権限制御ロジック

### 8.1 API側チェック順序

1. JWT有効性検証（`middleware/auth.js`）
2. `is_disabled` チェック（無効ユーザーは401）
3. roleチェック（adminは全許可）
4. `created_by` と要求者IDの一致チェック

### 8.2 コマシラバス・課題レビューの権限

作成・編集・削除は、**関連するシラバスレビューの `created_by` と同一ユーザー**またはadminのみ。

---

## 9. サンプルデータ（SEED_SAMPLE_DATA=true）

| username | password | role |
|----------|---------|------|
| admin | admin123 | admin |
| yamada | teacher123 | teacher |
| suzuki | teacher123 | teacher |

**評価マスター初期値**: 秀、優、良、可、不可

---

## 10. 非機能要件

| 項目 | 仕様 |
|------|------|
| Node.jsバージョン | 24.x |
| better-sqlite3 | **v11以上必須**（Node.js 24 C++20対応） |
| PDFサイズ上限 | `PDF_MAX_SIZE_MB`（デフォルト5MB） |
| コマシラバス最大回数 | `KOMA_MAX_SESSION`（デフォルト15） |
| JWT有効期限 | `JWT_EXPIRES_IN`（デフォルト24h） |
| パスワードハッシュ | bcrypt ラウンド数 10 |
| ログイン試行制限 | 15分間10回 |

---

## 11. 実装上の注意事項

- `better-sqlite3` は同期API。Expressルートに `async/await` は不要
- `fetch` はグローバル利用可能（Node.js 24）。`node-fetch` 不要
- PDF `Content-Disposition` の `filename=` はASCIIのみ（日本語は `filename*=UTF-8''...` で付与）
- iframeのPDFビューアツールバー非表示: src に `#toolbar=0` を付与
- `koma_syllabi` と `assignment_reviews` の追加カラムはALTER TABLEマイグレーション（try/catch で冪等）
- `syllabus_review_selections` の更新は全削除→再挿入
- `createMdField()` は `document.getElementById` を使用せず、wrap スコープ変数を直接参照
- `getMdValue()` は `document.querySelector('[data-md-field="..."]')` で取得
- モーダルHTML生成後に `document.body.appendChild(overlay)` してから `createMdField()` を `appendChild`
- 詳細モーダルでは `renderMd()` を即時実行してもエラーが起きないよう try/catch 済み
- `renderSyllabusDetail` と `renderSyllabusForm` の先頭で `await loadMasters()` を常時実行（キャッシュに依存しない）
- MarkedライブラリはCDN不使用、`public/lib/` にローカル配置

---

## 12. 既知の制約

- PDFアップロードはレコードのIDが必要なため、新規作成後に詳細画面からアップロードする
- コマシラバス・課題レビューの詳細モーダルはMarkdownレンダリング表示のみ（編集不可）
- 評価マスターの並び順は管理画面で手動設定が必要
