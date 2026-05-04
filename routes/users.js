'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');

const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 全エンドポイントに authenticate + requireAdmin を適用
router.use(authenticate, requireAdmin);

const ALLOWED_ROLES = ['admin', 'teacher'];

// ===========================
// GET /api/users
// 全ユーザー一覧（password_hash 除外）
// ===========================
router.get('/', (req, res) => {
  const users = req.db.prepare(`
    SELECT id, username, display_name, role, is_disabled, created_at
    FROM users
    ORDER BY id
  `).all();

  return res.json({ data: users });
});

// ===========================
// POST /api/users
// ユーザー新規作成
// ===========================
router.post('/', (req, res) => {
  const { username, password, role, display_name } = req.body;

  // 必須チェック
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'username、password、role は必須です' });
  }

  // ロール値チェック
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: 'role は admin または teacher のみ指定できます' });
  }

  // ユーザー名重複チェック
  const existing = req.db.prepare(
    'SELECT id FROM users WHERE username = ?'
  ).get(username);

  if (existing) {
    return res.status(409).json({ error: 'このユーザー名は既に使用されています' });
  }

  try {
    const passwordHash = bcrypt.hashSync(password, 10);

    const result = req.db.prepare(`
      INSERT INTO users (username, password_hash, role, display_name)
      VALUES (?, ?, ?, ?)
    `).run(username, passwordHash, role, display_name || null);

    const created = req.db.prepare(`
      SELECT id, username, display_name, role, is_disabled, created_at
      FROM users WHERE id = ?
    `).get(result.lastInsertRowid);

    return res.status(201).json({ data: created });
  } catch (err) {
    console.error('ユーザー作成エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

// ===========================
// PUT /api/users/:id
// ユーザー更新
// 更新可能: display_name, role, is_disabled, password（任意）
// ===========================
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);

  const target = req.db.prepare(`
    SELECT id, username, display_name, role, is_disabled
    FROM users WHERE id = ?
  `).get(id);

  if (!target) {
    return res.status(404).json({ error: 'ユーザーが見つかりません' });
  }

  // 自分自身を無効化しようとした場合は拒否
  if (
    req.user.id === id &&
    req.body.is_disabled != null &&
    (req.body.is_disabled === 1 || req.body.is_disabled === true || req.body.is_disabled === '1')
  ) {
    return res.status(400).json({ error: '自分自身を無効化することはできません' });
  }

  // ロール値チェック（指定がある場合）
  if (req.body.role != null && !ALLOWED_ROLES.includes(req.body.role)) {
    return res.status(400).json({ error: 'role は admin または teacher のみ指定できます' });
  }

  const display_name = req.body.display_name != null ? req.body.display_name : target.display_name;
  const role         = req.body.role         != null ? req.body.role         : target.role;
  const is_disabled  = req.body.is_disabled  != null
    ? (req.body.is_disabled ? 1 : 0)
    : target.is_disabled;

  try {
    if (req.body.password) {
      // パスワード変更あり
      const passwordHash = bcrypt.hashSync(req.body.password, 10);
      req.db.prepare(`
        UPDATE users
        SET display_name = ?, role = ?, is_disabled = ?, password_hash = ?
        WHERE id = ?
      `).run(display_name, role, is_disabled, passwordHash, id);
    } else {
      req.db.prepare(`
        UPDATE users
        SET display_name = ?, role = ?, is_disabled = ?
        WHERE id = ?
      `).run(display_name, role, is_disabled, id);
    }

    const updated = req.db.prepare(`
      SELECT id, username, display_name, role, is_disabled, created_at
      FROM users WHERE id = ?
    `).get(id);

    return res.json({ data: updated });
  } catch (err) {
    console.error('ユーザー更新エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

// ===========================
// DELETE /api/users/:id
// ユーザー削除
// created_by に存在するデータがある場合は削除不可
// ===========================
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);

  const target = req.db.prepare(
    'SELECT id FROM users WHERE id = ?'
  ).get(id);

  if (!target) {
    return res.status(404).json({ error: 'ユーザーが見つかりません' });
  }

  // created_by 参照チェック（3テーブル）
  const refSyllabus = req.db.prepare(
    'SELECT COUNT(*) as cnt FROM syllabus_reviews WHERE created_by = ?'
  ).get(id);

  const refKoma = req.db.prepare(
    'SELECT COUNT(*) as cnt FROM koma_syllabi WHERE created_by = ?'
  ).get(id);

  const refAssignment = req.db.prepare(
    'SELECT COUNT(*) as cnt FROM assignment_reviews WHERE created_by = ?'
  ).get(id);

  const hasData =
    refSyllabus.cnt > 0 ||
    refKoma.cnt > 0 ||
    refAssignment.cnt > 0;

  if (hasData) {
    return res.status(400).json({
      error: 'データが存在するため削除できません。無効化してください。',
    });
  }

  try {
    req.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return res.json({ message: 'ユーザーを削除しました' });
  } catch (err) {
    console.error('ユーザー削除エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

module.exports = router;
