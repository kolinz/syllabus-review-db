# 実装プロンプト集 — シラバス外部レビューデータベース

| 項目 | 内容 |
|------|------|
| **バージョン** | 1.2 |
| **作成日** | 2025年 |
| **最終更新** | 2026年5月 |

---

## 更新履歴

| バージョン | 更新日 | 主な変更内容 |
|-----------|--------|-------------|
| 1.0 | 2025年 | 初版作成（P-01〜P-18） |
| 1.1 | 2026年5月 | better-sqlite3 v11必須化、is_published マイグレーション、PDF Content-Disposition修正、createMdField・renderMd安全化、詳細モーダル追加 |
| 1.2 | 2026年5月 | assignment_overview追加、Markdownライブラリのローカル配置、詳細モーダルでのrenderMd、評価セクション常時表示、loadMasters常時実行 |

---

**前提**: 各プロンプトを順番に実行する。`system_prompt.md` の内容をシステムプロンプトとして設定した上で使用すること。

---

## P-01 プロジェクト初期設定

以下のファイルを作成してください。

### package.json

```json
{
  "name": "syllabus-review-db",
  "version": "1.0.0",
  "engines": { "node": ">=24" },
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "better-sqlite3": "^11.10.0",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "multer": "^1.4.5-lts.1",
    "dotenv": "^16.0.0",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "express-rate-limit": "^7.0.0",
    "marked": "^14.0.0",
    "dompurify": "^3.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

> **重要**: `better-sqlite3` は `^11.10.0` と明示すること。Node.js 24 の C++20 要件に対応するため v11以上が必須。v9系はビルドエラーになる。

### .env.example

全環境変数をコメント付きで記載（PORT, JWT_SECRET, JWT_EXPIRES_IN, PDF_UPLOAD_DIR, PDF_MAX_SIZE_MB, KOMA_MAX_SESSION, DB_PATH, SEED_SAMPLE_DATA）。

### server.js（骨格）

- `dotenv/config` を最初に読み込む
- helmet（CSP設定）、レートリミット（15分間10回）を適用
- `express.json()` + sanitizeBody を適用
- `/uploads` を静的配信
- 各ルートを `/api/...` にマウント
- `public/` を静的配信、SPAフォールバックで `public/index.html` を返す
- 起動時に schema.js 実行、PDF ディレクトリ作成、SEED_SAMPLE_DATA 確認

**helmet CSP設定**:
```js
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc:  ["'self'", "'unsafe-inline'"],
      imgSrc:    ["'self'", "data:"],
      frameSrc:  ["'self'"],
    }
  }
})
```

---

## P-02 データベース初期化

`db/schema.js` を作成してください。

`initializeDatabase(db)` 関数をエクスポートし、以下を実行する:

1. `CREATE TABLE IF NOT EXISTS` で全テーブルを定義（users, field_masters, syllabus_reviews, syllabus_review_selections, koma_syllabi, assignment_reviews）
2. **ALTER TABLE マイグレーション（必須）**:

```js
const addCol = (table, col, def) => {
  try { db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`).run(); }
  catch (e) { /* already exists */ }
};
addCol('koma_syllabi',       'is_published',        'INTEGER NOT NULL DEFAULT 0');
addCol('assignment_reviews', 'is_published',        'INTEGER NOT NULL DEFAULT 0');
addCol('assignment_reviews', 'assignment_overview', 'TEXT');
```

3. admin ユーザーが存在しない場合のみ自動作成（password: `admin123`、bcryptハッシュ化）

---

## P-03 サンプルデータ投入

`db/seed.js` を作成してください。冪等性を保つ（field_masters に既存データがあればスキップ）。

**評価マスター**: 秀（sort_order:1）、優（2）、良（3）、可（4）、不可（5）の順で作成する。

**サンプルデータ**: 科目「クラウドコンピューティング」（2025年度・情報学部）、コマシラバス3件（is_published=0）、課題レビュー3件（is_published=0）。

---

## P-04 認証ミドルウェア

### middleware/auth.js

- `authenticate`: Authorization ヘッダーからJWTを検証。`is_disabled=1` なら401。`req.user` にユーザー情報をセット。
- `optionalAuth`: トークンがあれば `req.user` をセット。なければ `req.user = null` で次へ。
- `requireAdmin`: `req.user.role !== 'admin'` なら403。

### middleware/upload.js

- multer の diskStorage で `PDF_UPLOAD_DIR` に保存
- `fileFilter` で PDF のみ許可
- `limits.fileSize` を `PDF_MAX_SIZE_MB * 1024 * 1024` に設定

### middleware/sanitize.js

- `req.body` の全文字列フィールドからHTMLタグを除去（XSS対策）

---

## P-05 認証ルート

`routes/auth.js` を作成（POST /api/auth/login、POST /api/auth/logout、GET /api/auth/me）。

---

## P-06 マスターデータルート

`routes/masters.js` を作成。

**エンドポイント一覧**:
- `GET /api/masters` — `is_disabled=0` のみ返す（field_typeごとにグループ化）
- `GET /api/masters/all` — admin専用・無効含む全件（管理画面用）
- `GET /api/masters/:field_type` — 特定field_type
- `POST /api/masters` — admin専用・追加
- `PUT /api/masters/:id` — admin専用・更新
- `DELETE /api/masters/:id` — admin専用・参照中は400エラー

> `GET /api/masters/all` と `GET /api/masters/:field_type` のルート定義順序に注意。`all` を先に定義すること。

---

## P-07 ユーザー管理ルート

`routes/users.js` を作成（全エンドポイントに authenticate + requireAdmin）。

---

## P-08 シラバスレビュールート

`routes/syllabi.js` を作成。

**PDF配信エンドポイント（重要）**:

```js
router.get('/:id/pdf', (req, res) => {
  const row = req.db.prepare(
    'SELECT pdf_path, subject_name, academic_year FROM syllabus_reviews WHERE id = ?'
  ).get(id);
  // ...
  // filename= はASCIIのみ（日本語を含めると ERR_INVALID_CHAR エラー）
  const encodedFilename = encodeURIComponent(row.subject_name + '_' + row.academic_year + '.pdf');
  const disposition = 'inline; filename="syllabus.pdf"; filename*=UTF-8\'\'' + encodedFilename;
  return res.sendFile(fullPath, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': disposition }
  });
});
```

---

## P-09 コマシラバスルート

`routes/koma.js` を作成。

**is_published 対応**:
- GET エンドポイントに `optionalAuth` を適用
- GETの WHERE 句に公開フィルタを追加（共通パターン参照）
- SELECT 文に `ks.is_published` を含める
- POST/PUT で `is_published` を受け付け（デフォルト: 0）
- PUT の UPDATE 文に `is_published = ?` を含める（漏れ注意）

---

## P-10 課題レビュールート

`routes/assignments.js` を作成。

**is_published + assignment_overview 対応**:
- GET エンドポイントに `optionalAuth` を適用し公開フィルタを追加
- SELECT 文に `ar.is_published`, `ar.assignment_overview` を含める
- POST リクエストボディから `is_published`, `assignment_overview` を取得
- INSERT 文に `assignment_overview`, `is_published` カラムを追加
- PUT で `is_published` と `assignment_overview` の両方を更新
- UPDATE 文に両フィールドを含める（漏れ注意）

---

## P-11 フロントエンド基盤

`public/index.html`, `public/app.js`, `public/style.css` を作成。

### index.html のスクリプト読込（CDN不使用）

```html
<script src="/lib/purify.min.js"></script>
<script src="/lib/marked.min.js"></script>
<script src="/app.js"></script>
```

### ライブラリのローカル配置手順

```bash
npm install marked dompurify
cp node_modules/marked/lib/marked.umd.js     public/lib/marked.min.js
cp node_modules/dompurify/dist/purify.min.js public/lib/purify.min.js
```

### renderMd()（フォールバック必須）

```js
function renderMd(text) {
  if (!text) return '';
  try {
    const parseFn = (typeof marked !== 'undefined')
      ? (typeof marked.parse === 'function' ? marked.parse.bind(marked) : marked) : null;
    const sanitizeFn = (typeof DOMPurify !== 'undefined')
      ? DOMPurify.sanitize.bind(DOMPurify) : null;
    if (parseFn && sanitizeFn) {
      const parsed = parseFn(text);
      if (typeof parsed === 'string') return sanitizeFn(parsed);
    }
  } catch (e) { console.warn('renderMd error:', e); }
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}
```

### createMdField()（wrap スコープ参照・ID競合回避）

- `document.getElementById` を**使用しない**
- wrap スコープ内の変数を直接参照
- textarea の初期値は `.value = value` で設定
- `textarea.dataset.mdField = fieldId` を付与

```js
function getMdValue(fieldId) {
  const ta = document.querySelector(`[data-md-field="${fieldId}"]`);
  return ta ? ta.value : '';
}
```

---

## P-12 フロントエンド: ログイン画面

`renderLogin()` を実装する。

---

## P-13 フロントエンド: シラバスレビュー一覧

`renderSyllabusList()` を実装する。

**テーブル列**: 科目名、年度、学部名（バッジ）、評価（バッジ）、公開状態（バッジ）、作成者、詳細ボタン

---

## P-14 フロントエンド: シラバスレビュー詳細・フォーム

`renderSyllabusDetail()` / `renderSyllabusForm()` を実装する。

### 先頭で loadMasters() を常時実行（必須）

```js
async function renderSyllabusDetail(main, id) {
  await loadMasters(); // キャッシュに依存しない。常に最新マスターを取得
  const res = await api('GET', '/api/syllabi/' + id);
  // ...
}

async function renderSyllabusForm(main, id) {
  await loadMasters(); // キャッシュに依存しない。常に最新マスターを取得
  const isEdit = !!id;
  // ...
}
```

### PDFエリアの仕様

- 新規作成時: 「保存後に詳細画面からPDFをアップロードできます」の案内メッセージを表示
- 登録済み（詳細・編集）: `<iframe src="/api/syllabi/{id}/pdf#toolbar=0">` でプレビュー。科目名ラベルをiframe上部に表示。権限ありの場合「📄 PDFをアップロード」ボタンを表示（クリックでドロップエリアに切り替え）

### 評価セクション（詳細画面）

評価未設定でも評価ボタン群を常に読み取り専用で表示する:

```js
// 詳細画面では readonly=true で評価ボタンを表示
const evalOpts = state.masters.evaluation || [];
if (evalOpts.length > 0) {
  evalGrp.appendChild(createEvalOpts(evalOpts, d.evaluation_id, true));
} else if (d.evaluation) {
  // マスター未ロード時はバッジで代替
  const badge = document.createElement('span');
  badge.className = 'badge ' + (EVAL_BADGE[d.evaluation] || 'badge-muted');
  badge.textContent = d.evaluation;
  evalGrp.appendChild(badge);
} else {
  const msg = document.createElement('span');
  msg.className = 'text-muted';
  msg.textContent = '（未設定）';
  evalGrp.appendChild(msg);
}
```

### 下部タブ: コマシラバス

- テーブル列: 回数、公開バッジ、学習概要（抜粋・Markdownタグ除去）、詳細ボタン、編集/削除（権限あり時）
- 詳細ボタン: `openKomaDetailModal(row)` を呼び出す

### 下部タブ: 課題レビュー

- テーブル列: 課題番号、課題名、公開バッジ、評価バッジ、詳細ボタン、編集/削除（権限あり時）
- 詳細ボタン: `openAssignDetailModal(row)` を呼び出す

### openKomaModal（詳細タブ内の追加・編集）

- 学習概要・学習目標: `createMdField()` のMarkdownタブ
- チェックボックスID: `#koma-published`
- モーダルHTML生成後に `document.body.appendChild(overlay)` してから `createMdField()` を `appendChild`
- 保存時: `getMdValue('koma-overview')`, `getMdValue('koma-objectives')` で値取得

### openAssignModal（詳細タブ内の追加・編集）

- フィールド: 年度、課題番号、課題名、概要（Markdownタブ）、評価ボタン、評価コメント（Markdownタブ）、大学生のうちに学んでほしいこと（Markdownタブ）、公開チェックボックス
- チェックボックスID: `#assign-published`
- 保存時: `assignment_overview: getMdValue('assign-overview')` を必ず含める

---

## P-15 フロントエンド: コマシラバス一覧

`renderKomaList()` と `openKomaListModal()` と `openKomaDetailModal()` を実装する。

### openKomaDetailModal（詳細表示・Markdownレンダリング）

```js
function openKomaDetailModal(row) {
  // ... overlay・modal・header 生成 ...
  function addMdSection(label, content) {
    const grp = document.createElement('div'); grp.className = 'form-group';
    const lbl = document.createElement('div'); lbl.className = 'form-label';
    lbl.textContent = label; grp.appendChild(lbl);
    const div = document.createElement('div');
    div.className = 'md-preview-area active md-content md-readonly';
    div.style.cssText = 'padding:12px 16px;background:#f5f7fc;border-radius:6px;min-height:80px;border:1px solid #d0d8eb;';
    div.innerHTML = content ? renderMd(content) : '<span style="color:#aab4c8;">（未入力）</span>';
    grp.appendChild(div);
    return grp;
  }
  modal.appendChild(addMdSection('学習概要', row.learning_overview));
  modal.appendChild(addMdSection('学習目標', row.learning_objectives));
  // ... フッター・イベント ...
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
```

### テーブル列

回数（第N回）、公開バッジ、関連シラバスレビュー、学習概要（抜粋）、詳細ボタン、操作ボタン

### openKomaListModal（追加・編集）

- 学習概要・学習目標: Markdownタブフィールド（モーダルHTML生成後にDOM追加してから `appendChild`）
- チェックボックスID: `#kl-published`
- 保存時: `getMdValue('kl-overview')`, `getMdValue('kl-objectives')`, `is_published` を必ず含める

---

## P-16 フロントエンド: 課題レビュー一覧

`renderAssignmentList()` と `openAssignListModal()` と `openAssignDetailModal()` を実装する。

### openAssignDetailModal（詳細表示・Markdownレンダリング）

```js
function openAssignDetailModal(row) {
  // ... overlay・modal・header・バッジ行（公開バッジ＋評価バッジ） ...
  function addSection(label, content) {
    if (!content) return;
    const grp = document.createElement('div'); grp.className = 'form-group';
    const lbl = document.createElement('div'); lbl.className = 'form-label';
    lbl.textContent = label; grp.appendChild(lbl);
    const div = document.createElement('div');
    div.className = 'md-preview-area active md-content md-readonly';
    div.style.cssText = 'padding:12px 16px;background:#f5f7fc;border-radius:6px;min-height:80px;border:1px solid #d0d8eb;';
    div.innerHTML = renderMd(content);
    grp.appendChild(div);
    modal.appendChild(grp);
  }
  addSection('概要', row.assignment_overview);
  addSection('評価コメント', row.evaluation_comment);
  addSection('大学生のうちに学んでほしいこと', row.university_learning);
  // すべて未入力の場合は「詳細情報はありません」を表示
  // ... フッター・イベント ...
}
```

### テーブル列

課題番号、課題名、公開バッジ、関連シラバスレビュー、評価バッジ、詳細ボタン、操作ボタン

### openAssignListModal（追加・編集）

- フィールド: 関連シラバス（プルダウン）、年度、課題番号、課題名、概要（Markdownタブ）、評価ボタン、評価コメント（Markdownタブ）、大学生のうちに学んでほしいこと（Markdownタブ）、公開チェックボックス
- チェックボックスID: `#al-published`
- 保存時（PUT・POST 両方）: `is_published`, `assignment_overview: getMdValue('al-overview')` を**必ず**含める（漏れると常に 0/null で保存される）

---

## P-17 フロントエンド: 管理画面

`renderAdmin()` を実装する。

- マスターデータ取得は `GET /api/masters/all`（無効マスターも含む）を使用
- 評価マスターを管理画面で追加・変更した場合、シラバスレビューの詳細・フォーム画面は `await loadMasters()` を常時実行しているため自動的に反映される

---

## P-18 動作確認・仕上げ

### インストール・起動

```bash
npm install
# ライブラリをローカルに配置（CDN不使用）
mkdir -p public/lib
cp node_modules/marked/lib/marked.umd.js     public/lib/marked.min.js
cp node_modules/dompurify/dist/purify.min.js public/lib/purify.min.js

node server.js
# または
SEED_SAMPLE_DATA=true node server.js
```

### 確認項目

**バックエンド**
- `node server.js` でエラーなく起動すること
- `SEED_SAMPLE_DATA=true` でサンプルデータが投入されること
- コマシラバス・課題レビューの `is_published` フィルタが正しく動作すること（未認証では非公開データが返らない）
- PDF配信時に `Content-Disposition` ヘッダーが正しく設定されること

**フロントエンド**
- `## 見出し` や `- 箇条書き` が正しくMarkdownレンダリングされること（ローカルライブラリで動作）
- シラバスレビューの詳細・編集・作成画面で評価ボタン（秀〜不可）が表示されること
- 管理画面で評価マスターを追加後、詳細・フォーム画面に即座に反映されること
- コマシラバス・課題レビューの「詳細」ボタンでMarkdownレンダリングされたモーダルが開くこと
- 課題レビューの「概要」フィールドが保存・表示されること
- 公開チェックボックスの状態が正しく保存されること（PUT・POST 両方）
- PDFのiframeツールバーが非表示になること（`#toolbar=0`）
- 新規作成画面でPDFアップロードエリアの代わりに案内メッセージが表示されること
