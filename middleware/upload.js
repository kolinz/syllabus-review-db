'use strict';

const multer = require('multer');
const path   = require('path');

const uploadDir  = process.env.PDF_UPLOAD_DIR || './uploads';
const maxSizeMB  = parseInt(process.env.PDF_MAX_SIZE_MB || '5', 10);
const maxSizeBytes = maxSizeMB * 1024 * 1024;

// ===========================
// multer ストレージ設定
// ===========================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `syllabus_${Date.now()}.pdf`);
  },
});

// ===========================
// ファイルフィルター（PDFのみ許可）
// ===========================
function fileFilter(req, file, cb) {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'PDFファイルのみアップロード可能です'));
  }
}

// ===========================
// multer インスタンス
// ===========================
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxSizeBytes,
  },
});

/**
 * handleUploadError: multer エラーハンドリングミドルウェア
 * ルートハンドラーの後（エラーミドルウェアとして）使用する。
 *
 * 使用例:
 *   router.post('/:id/pdf', authenticate, upload.single('pdf'), handleUploadError, handler);
 *
 * ただし multer のエラーは upload.single() 内で throw されるため、
 * ルートを wrap する形で使う。
 */
function handleMulterUpload(req, res, next) {
  upload.single('pdf')(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: `PDFファイルのサイズが上限（${maxSizeMB}MB）を超えています`,
        });
      }
      // fileFilter で生成したエラー（LIMIT_UNEXPECTED_FILE + カスタムメッセージ）
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          error: err.field || 'PDFファイルのみアップロード可能です',
        });
      }
      return res.status(400).json({ error: `アップロードエラー: ${err.message}` });
    }

    // その他のエラー
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'ファイルのアップロードに失敗しました' });
  });
}

module.exports = { upload, handleMulterUpload };
