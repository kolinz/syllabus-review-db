'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

const { authenticate } = require('../middleware/auth');

const router = express.Router();

const JWT_SECRET     = process.env.JWT_SECRET     || 'your-secret-key-here';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// ===========================
// POST /api/auth/login
// ===========================
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  // バリデーション: 両フィールド必須
  if (!username || !password) {
    return res.status(400).json({ error: 'ユーザー名とパスワードは必須です' });
  }

  // DBからユーザーを取得
  const user = req.db.prepare(
    'SELECT id, username, password_hash, role, display_name, is_disabled FROM users WHERE username = ?'
  ).get(username);

  if (!user) {
    return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません' });
  }

  // アカウント無効チェック
  if (user.is_disabled === 1) {
    return res.status(401).json({ error: 'このアカウントは無効です' });
  }

  // パスワード検証
  const isValid = bcrypt.compareSync(password, user.password_hash);
  if (!isValid) {
    return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません' });
  }

  // JWT 生成
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return res.json({
    token,
    user: {
      id:           user.id,
      username:     user.username,
      role:         user.role,
      display_name: user.display_name,
    },
  });
});

// ===========================
// POST /api/auth/logout
// ===========================
// クライアント側でトークンを破棄するだけでよいため、サーバー側は 200 を返すのみ
router.post('/logout', (req, res) => {
  return res.json({ message: 'ログアウトしました' });
});

// ===========================
// GET /api/auth/me
// ===========================
router.get('/me', authenticate, (req, res) => {
  return res.json({ data: req.user });
});

module.exports = router;
