'use strict';
require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const fs        = require('fs');
const Database  = require('better-sqlite3');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const { initializeDatabase } = require('./db/schema');
const { seedDatabase }       = require('./db/seed');
const { sanitizeBody }       = require('./middleware/sanitize');

// ===========================
// アプリケーション初期化
// ===========================
const app  = express();
const PORT = process.env.PORT || 3000;

// ===========================
// PDFアップロードディレクトリの作成
// ===========================
const pdfUploadDir = path.resolve(process.env.PDF_UPLOAD_DIR || './uploads');
if (!fs.existsSync(pdfUploadDir)) {
  fs.mkdirSync(pdfUploadDir, { recursive: true });
  console.log(`PDFディレクトリを作成しました: ${pdfUploadDir}`);
}

// ===========================
// データベース接続・初期化
// ===========================
const dbPath = path.resolve(process.env.DB_PATH || './syllabus-review.db');
const db     = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// テーブル初期化（CREATE IF NOT EXISTS）
initializeDatabase(db);
console.log('データベースを初期化しました');

// サンプルデータ投入（SEED_SAMPLE_DATA=true のときのみ）
if (process.env.SEED_SAMPLE_DATA === 'true') {
  seedDatabase(db);
  console.log('サンプルデータを投入しました');
}

// ===========================
// 基本ミドルウェア
// ===========================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===========================
// セキュリティ設定（express.json() の直後）
// ===========================

// helmet: HTTPセキュリティヘッダーの付与
// CSP でフロントエンド（unpkg CDN / DOMPurify）の読み込みを許可しつつ XSS を防ぐ
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", 'https://unpkg.com', "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:'],
      frameSrc:   ["'self'"],
    },
  },
}));

// レートリミット: ログインAPIへのブルートフォース攻撃を防ぐ
// 15分間に10回を超えるリクエストを制限する
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 10,
  message: { error: 'ログイン試行回数が上限を超えました。15分後に再試行してください。' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', loginLimiter);

// XSS対策: リクエストボディの全文字列フィールドからHTMLタグを除去する
app.use(sanitizeBody);

// ===========================
// 静的ファイル配信
// ===========================
// PDFアップロードディレクトリを /uploads として配信
app.use('/uploads', express.static(pdfUploadDir));

// public/ フォルダを静的配信
app.use(express.static(path.join(__dirname, 'public')));

// ===========================
// DB インスタンスをルートで参照できるようリクエストに付与
// ===========================
app.use((req, res, next) => {
  req.db = db;
  next();
});

// ===========================
// API ルート登録
// ===========================
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/syllabi',     require('./routes/syllabi'));
app.use('/api/koma',        require('./routes/koma'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/masters',     require('./routes/masters'));
app.use('/api/users',       require('./routes/users'));

// ===========================
// SPA フォールバック
// ===========================
// API 以外の全ルートで index.html を返す
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('index.html が見つかりません');
  }
});

// ===========================
// グローバルエラーハンドラー
// ===========================
app.use((err, req, res, next) => {
  console.error('サーバーエラー:', err.stack);
  res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
});

// ===========================
// サーバー起動
// ===========================
app.listen(PORT, () => {
  console.log('========================================');
  console.log('  シラバス外部レビューデータベース');
  console.log('========================================');
  console.log(`  URL  : http://localhost:${PORT}`);
  console.log(`  DB   : ${dbPath}`);
  console.log(`  PDF  : ${pdfUploadDir}`);
  console.log(`  ENV  : ${process.env.NODE_ENV || 'development'}`);
  console.log('========================================');
});

module.exports = { app, db };
