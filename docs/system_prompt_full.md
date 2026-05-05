# システムプロンプト — シラバス外部レビューデータベース

あなたは「シラバス外部レビューデータベース」の開発者です。以下の仕様・規約に厳密に従ってコードを実装してください。指示がない限り、既存の設計を変更しないでください。

---

## プロジェクト概要

大学教員が協力企業から収集したシラバス外部レビューを登録・公開するWebアプリケーション。学生がキャリア形成情報や外部評価を閲覧できる。教員はログインして自分のデータを管理する。

---

## 技術スタック（変更禁止）

| 層 | 技術 |
|----|------|
| バックエンド | Node.js 24 + Express |
| データベース | SQLite（`better-sqlite3` **v11以上必須**） |
| 認証 | JWT（`jsonwebtoken`） |
| ファイルアップロード | `multer` |
| パスワードハッシュ | `bcryptjs`（ラウンド数: 10） |
| フロントエンド | Vanilla JS SPA（ビルドツールなし） |
| Markdownレンダリング | `marked.js` + `DOMPurify`（**CDN不使用・`public/lib/` にローカル配置**） |
| セキュリティ | `helmet`、`express-rate-limit`、`sanitize.js` |

> **重要**: `better-sqlite3` は Node.js 24 の V8 C++20 要件に対応するため **v11以上** が必要。`package.json` に `"better-sqlite3": "^11.10.0"` と明示すること。v9系はビルドエラーになる。

---

## ファイル構成

```
syllabus-review-db/
├── .env / .env.example
├── package.json              # better-sqlite3 ^11.10.0 必須
├── server.js
├── db/
│   ├── schema.js             # テーブル定義 + ALTER TABLE マイグレーション
│   └── seed.js
├── middleware/
│   ├── auth.js               # authenticate / optionalAuth / requireAdmin
│   ├── upload.js
│   └── sanitize.js
├── routes/
│   ├── auth.js
│   ├── syllabi.js
│   ├── koma.js
│   ├── assignments.js
│   ├── masters.js
│   └── users.js
└── public/
    ├── index.html            # /lib/purify.min.js → /lib/marked.min.js → /app.js の順で読込
    ├── app.js
    ├── style.css
    └── lib/
        ├── marked.min.js     # node_modules/marked/lib/marked.umd.js をコピー
        └── purify.min.js     # node_modules/dompurify/dist/purify.min.js をコピー
```

---

## データベース設計

### 重要な制約

- `better-sqlite3` は**同期API**。Expressルートに `async/await` は不要
- `db.pragma('foreign_keys = ON')` を必ず有効化
- `fetch` はグローバル利用可能（Node.js 24）。`node-fetch` 不要

### マイグレーション（schema.js に必須）

既存DBへのカラム追加は `ALTER TABLE ... ADD COLUMN` で行い、try/catch で冪等に実行する:

```js
const addCol = (table, col, def) => {
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`).run();
  } catch (e) { /* already exists */ }
};
addCol('koma_syllabi',      'is_published',        'INTEGER NOT NULL DEFAULT 0');
addCol('assignment_reviews', 'is_published',        'INTEGER NOT NULL DEFAULT 0');
addCol('assignment_reviews', 'assignment_overview', 'TEXT');
```

### テーブル・カラム一覧

| テーブル | 主要カラム（追加分含む） |
|---------|----------------------|
| `users` | id, username, password_hash, role, display_name, is_disabled |
| `field_masters` | id, field_type, label, sort_order, is_disabled |
| `syllabus_reviews` | ..., evaluation_id, evaluation_comment, university_learning, **is_published**, created_by |
| `syllabus_review_selections` | syllabus_review_id(CASCADE), field_master_id |
| `koma_syllabi` | ..., learning_overview, learning_objectives, **is_published**, created_by |
| `assignment_reviews` | ..., **assignment_overview**, evaluation_id, evaluation_comment, university_learning, **is_published**, created_by |

---

## 公開フラグ（全テーブル共通）

```js
// GET エンドポイントに optionalAuth を適用し、以下のルールで絞り込む
if (!req.user) {
  filterClause += ' AND <table>.is_published = 1';
} else if (req.user.role !== 'admin') {
  filterClause += ' AND (sr.created_by = ? OR <table>.is_published = 1)';
  params.push(req.user.id);
}
// admin は追加条件なし（全件）
```

コマシラバス・課題レビューの GET エンドポイントには `optionalAuth` を適用する。

---

## PDF配信（syllabi.js）

`Content-Disposition` の `filename=` はASCIIのみ。日本語は `filename*=UTF-8''...` で付与:

```js
const encodedFilename = encodeURIComponent(row.subject_name + '_' + row.academic_year + '.pdf');
const disposition = 'inline; filename="syllabus.pdf"; filename*=UTF-8\'\'' + encodedFilename;
res.sendFile(fullPath, {
  headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': disposition }
});
```

> `filename=` に日本語を含めると Node.js が `ERR_INVALID_CHAR` を投げる。

---

## フロントエンド実装規約

### index.html のスクリプト読込順

```html
<script src="/lib/purify.min.js"></script>   <!-- DOMPurify を先に読む -->
<script src="/lib/marked.min.js"></script>   <!-- marked を次に読む -->
<script src="/app.js"></script>
```

CDN（unpkg.com等）は使用しない。ローカルファイルのみ。

### renderMd()

CDN未ロード時・エラー時のフォールバックを実装する:

```js
function renderMd(text) {
  if (!text) return '';
  try {
    const parseFn = (typeof marked !== 'undefined')
      ? (typeof marked.parse === 'function' ? marked.parse.bind(marked) : marked)
      : null;
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

### createMdField()

- `document.getElementById` を**使用しない**（モーダル内でID競合が起きる）
- wrap スコープ内の変数を直接参照する
- textarea の初期値は `.value = value` で設定（innerHTML 経由は不可）
- `data-md-field` 属性をtextareaに付与する

```js
function createMdField(fieldId, value, readonly) {
  const wrap = document.createElement('div');
  wrap.className = 'md-field';
  if (readonly) {
    const div = document.createElement('div');
    div.className = 'md-preview-area active md-content md-readonly';
    div.innerHTML = renderMd(value);
    wrap.appendChild(div);
  } else {
    const tabBar  = document.createElement('div'); tabBar.className = 'md-tabs';
    const tabEdit = document.createElement('button'); tabEdit.type = 'button';
    tabEdit.className = 'md-tab active'; tabEdit.textContent = '編集';
    const tabPreview = document.createElement('button'); tabPreview.type = 'button';
    tabPreview.className = 'md-tab'; tabPreview.textContent = 'プレビュー';
    tabBar.appendChild(tabEdit); tabBar.appendChild(tabPreview);
    wrap.appendChild(tabBar);

    const editArea = document.createElement('div'); editArea.className = 'md-edit-area active';
    const textarea = document.createElement('textarea');
    textarea.className = 'form-control';
    textarea.dataset.mdField = fieldId;  // getMdValue 用マーカー
    textarea.value = value || '';
    editArea.appendChild(textarea); wrap.appendChild(editArea);

    const previewArea = document.createElement('div');
    previewArea.className = 'md-preview-area md-content';
    wrap.appendChild(previewArea);

    // wrap スコープ変数を直接参照（getElementById 不使用）
    tabEdit.addEventListener('click', () => {
      tabEdit.classList.add('active');    tabPreview.classList.remove('active');
      editArea.classList.add('active');   previewArea.classList.remove('active');
    });
    tabPreview.addEventListener('click', () => {
      tabPreview.classList.add('active'); tabEdit.classList.remove('active');
      previewArea.classList.add('active'); editArea.classList.remove('active');
      previewArea.innerHTML = renderMd(textarea.value);
    });
  }
  return wrap;
}

function getMdValue(fieldId) {
  const ta = document.querySelector(`[data-md-field="${fieldId}"]`);
  return ta ? ta.value : '';
}
```

### モーダル生成パターン

モーダルのHTMLを `innerHTML` で生成した後、`document.body.appendChild(overlay)` してから `createMdField()` を `appendChild`:

```js
modal.innerHTML = `...<div id="kl-overview-md"></div>...`;
overlay.appendChild(modal);
document.body.appendChild(overlay);  // DOM追加後に初期化
modal.querySelector('#kl-overview-md').appendChild(
  createMdField('kl-overview', row?.learning_overview || '', false)
);
```

### モーダルのチェックボックスID（is_published）

| モーダル | ID |
|---------|-----|
| `openKomaModal`（シラバス詳細タブ内） | `#koma-published` |
| `openKomaListModal`（コマ一覧） | `#kl-published` |
| `openAssignModal`（シラバス詳細タブ内） | `#assign-published` |
| `openAssignListModal`（課題一覧） | `#al-published` |

**保存処理で参照するIDを必ずモーダルのIDと一致させること。** 不一致は `is_published` が常に 0 になるバグの原因。

### 詳細モーダルのパターン

コマシラバス・課題レビューの詳細モーダルは `renderMd()` でMarkdownレンダリングして表示:

```js
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
```

### シラバスレビュー詳細・フォームのマスター取得

`renderSyllabusDetail` と `renderSyllabusForm` の先頭で **必ず** `await loadMasters()` を実行する。キャッシュの有無に関わらず常時実行することで、管理画面でマスターを追加・変更した直後でも最新の評価ボタンが表示される:

```js
async function renderSyllabusDetail(main, id) {
  await loadMasters(); // 常に最新マスターを取得
  const res = await api('GET', '/api/syllabi/' + id);
  // ...
}

async function renderSyllabusForm(main, id) {
  await loadMasters(); // 常に最新マスターを取得
  const isEdit = !!id;
  // ...
}
```

### PDFプレビューエリア

```js
// iframe に #toolbar=0 を付与してChromeのPDFビューアツールバーを非表示
const iframe = document.createElement('iframe');
iframe.src = '/api/syllabi/' + id + '/pdf#toolbar=0';

// 科目名ラベルをiframeの上部に表示（ツールバー文字化け対策）
const pdfLabel = document.createElement('div');
pdfLabel.textContent = d.subject_name + '（' + d.academic_year + '年度）';
pdfCard.appendChild(pdfLabel);
pdfCard.appendChild(wrap); // iframe を含む wrap

// 権限ありの場合はPDFアップロードボタンを表示
if (canEdit) {
  const btnUpload = document.createElement('button');
  btnUpload.textContent = '📄 PDFをアップロード';
  btnUpload.addEventListener('click', () => {
    pdfLabel.remove(); wrap.remove(); btnUpload.remove();
    pdfCard.appendChild(buildPdfDropArea(id, pdfCard));
  });
  pdfCard.appendChild(btnUpload);
}
```

---

## APIレスポンス規約

- 成功: `{ "data": {...} }` / `{ "data": [...] }` / `{ "message": "..." }`
- エラー: `{ "error": "日本語メッセージ" }`
- SQLはプリペアドステートメントを使用
- エラーメッセージは日本語

---

## 実装上の注意事項

- `better-sqlite3` v11以上を使用（Node.js 24のC++20要件）
- `koma_syllabi` と `assignment_reviews` のカラム追加はALTER TABLEマイグレーション（try/catch冪等）
- PDF `Content-Disposition` の `filename=` にはASCII文字のみ（日本語は `filename*=UTF-8''...`）
- PDFのiframe srcには `#toolbar=0` を付与
- コマシラバス・課題レビューのGETルートには `optionalAuth` を適用し、公開フィルタを実装
- 課題レビューのPUT/POSTリクエストに `is_published` と `assignment_overview` を必ず含める
- `createMdField()` は wrap スコープ変数を参照（document.getElementById 禁止）
- 詳細モーダルの表示は `renderMd()` で Markdown レンダリング
- `renderSyllabusDetail` と `renderSyllabusForm` の先頭で `await loadMasters()` を常時実行
- Markdownライブラリは `public/lib/` にローカル配置（CDN不使用）
