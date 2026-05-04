'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

/**
 * authenticate: 必須認証ミドルウェア
 * Authorization: Bearer <token> を検証し、req.user にユーザー情報をセットする
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  const token = authHeader.slice(7); // "Bearer " の7文字を除去

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  // DBからユーザーを取得して最新状態を確認
  const user = req.db.prepare(
    'SELECT id, username, role, display_name, is_disabled FROM users WHERE id = ?'
  ).get(payload.id);

  if (!user) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  if (user.is_disabled === 1) {
    return res.status(401).json({ error: 'このアカウントは無効です' });
  }

  req.user = user;
  next();
}

/**
 * optionalAuth: 任意認証ミドルウェア
 * トークンがあれば検証して req.user にセット。
 * なければ（または無効でも）エラーにせず next() を呼ぶ。
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    // 無効・期限切れトークンは無視してゲストとして続行
    return next();
  }

  const user = req.db.prepare(
    'SELECT id, username, role, display_name, is_disabled FROM users WHERE id = ?'
  ).get(payload.id);

  // ユーザーが存在しないまたは無効の場合もゲストとして続行
  if (user && user.is_disabled === 0) {
    req.user = user;
  }

  next();
}

/**
 * requireAdmin: 管理者権限チェックミドルウェア
 * authenticate の後に使用する。
 * admin ロール以外は 403 を返す。
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '管理者権限が必要です' });
  }
  next();
}

module.exports = { authenticate, optionalAuth, requireAdmin };
