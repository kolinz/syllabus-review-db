'use strict';

const express = require('express');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

const KOMA_MAX_SESSION = parseInt(process.env.KOMA_MAX_SESSION || '15', 10);

// ===========================
// 権限チェックヘルパー
// 関連シラバスレビューの created_by が req.user.id と一致するか、admin か
// ===========================
function canEditKoma(req, syllabus) {
  return req.user.role === 'admin' || req.user.id === syllabus.created_by;
}

// ===========================
// GET /api/koma  （認証不要）
// ===========================
router.get('/', optionalAuth, (req, res) => {
  const { syllabus_review_id, sort } = req.query;

  // 許可リスト方式でソートカラムを検証
  const ALLOWED_SORT = ['session_number', 'syllabus_review_id'];
  const sortCol = ALLOWED_SORT.includes(sort) ? sort : 'session_number';

  const params = [];
  let filterClause = 'WHERE 1=1';
  if (syllabus_review_id) {
    filterClause += ' AND ks.syllabus_review_id = ?';
    params.push(parseInt(syllabus_review_id, 10));
  }

  // 公開フィルタ（syllabus_reviews と同じルール）
  if (!req.user) {
    filterClause += ' AND ks.is_published = 1';
  } else if (req.user.role !== 'admin') {
    filterClause += ' AND (sr.created_by = ? OR ks.is_published = 1)';
    params.push(req.user.id);
  }

  try {
    const rows = req.db.prepare(`
      SELECT
        ks.id, ks.syllabus_review_id, ks.session_number,
        ks.learning_overview, ks.learning_objectives,
        ks.is_published,
        ks.created_by, ks.created_at, ks.updated_at,
        sr.subject_name, sr.academic_year
      FROM koma_syllabi ks
      JOIN syllabus_reviews sr ON ks.syllabus_review_id = sr.id
      ${filterClause}
      ORDER BY ks.${sortCol}, ks.id
    `).all(...params);

    return res.json({ data: rows });
  } catch (err) {
    console.error('コマシラバス一覧取得エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

// ===========================
// GET /api/koma/:id  （認証不要）
// ===========================
router.get('/:id', optionalAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);

  const row = req.db.prepare(`
    SELECT
      ks.id, ks.syllabus_review_id, ks.session_number,
      ks.learning_overview, ks.learning_objectives,
      ks.is_published,
      ks.created_by, ks.created_at, ks.updated_at,
      sr.subject_name, sr.academic_year
    FROM koma_syllabi ks
    JOIN syllabus_reviews sr ON ks.syllabus_review_id = sr.id
    WHERE ks.id = ?
  `).get(id);

  if (!row) {
    return res.status(404).json({ error: 'コマシラバスが見つかりません' });
  }

  return res.json({ data: row });
});

// ===========================
// POST /api/koma  （authenticate）
// ===========================
router.post('/', authenticate, (req, res) => {
  const { syllabus_review_id, session_number, learning_overview, learning_objectives, is_published } = req.body;

  // 必須チェック
  if (!syllabus_review_id || session_number == null) {
    return res.status(400).json({ error: 'syllabus_review_id と session_number は必須です' });
  }

  const syllabusId    = parseInt(syllabus_review_id, 10);
  const sessionNumber = parseInt(session_number, 10);

  // 関連シラバスレビューの存在確認
  const syllabus = req.db.prepare(
    'SELECT id, created_by FROM syllabus_reviews WHERE id = ?'
  ).get(syllabusId);

  if (!syllabus) {
    return res.status(404).json({ error: '関連するシラバスレビューが見つかりません' });
  }

  // 権限チェック（関連シラバスの created_by）
  if (!canEditKoma(req, syllabus)) {
    return res.status(403).json({ error: 'このコマシラバスを作成する権限がありません' });
  }

  // session_number 範囲チェック
  if (sessionNumber < 1 || sessionNumber > KOMA_MAX_SESSION) {
    return res.status(400).json({
      error: `回数は1〜${KOMA_MAX_SESSION}の範囲で入力してください`,
    });
  }

  // 重複チェック
  const duplicate = req.db.prepare(
    'SELECT id FROM koma_syllabi WHERE syllabus_review_id = ? AND session_number = ?'
  ).get(syllabusId, sessionNumber);

  if (duplicate) {
    return res.status(409).json({ error: '同じシラバスレビューに同じ回数のコマシラバスが既に存在します' });
  }

  try {
    const result = req.db.prepare(`
      INSERT INTO koma_syllabi
        (syllabus_review_id, session_number, learning_overview, learning_objectives, is_published, created_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      syllabusId,
      sessionNumber,
      learning_overview   || null,
      learning_objectives || null,
      is_published ? 1 : 0,
      req.user.id,
    );

    const created = req.db.prepare(`
      SELECT ks.id, ks.syllabus_review_id, ks.session_number,
             ks.learning_overview, ks.learning_objectives, ks.is_published,
             ks.created_by, ks.created_at, ks.updated_at,
             sr.subject_name, sr.academic_year
      FROM koma_syllabi ks
      JOIN syllabus_reviews sr ON ks.syllabus_review_id = sr.id
      WHERE ks.id = ?
    `).get(result.lastInsertRowid);

    return res.status(201).json({ data: created });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: '同じシラバスレビューに同じ回数のコマシラバスが既に存在します' });
    }
    console.error('コマシラバス作成エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

// ===========================
// PUT /api/koma/:id  （authenticate）
// 更新可能: learning_overview, learning_objectives
// ===========================
router.put('/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id, 10);

  const existing = req.db.prepare(
    'SELECT ks.*, sr.created_by AS syllabus_created_by FROM koma_syllabi ks JOIN syllabus_reviews sr ON ks.syllabus_review_id = sr.id WHERE ks.id = ?'
  ).get(id);

  if (!existing) {
    return res.status(404).json({ error: 'コマシラバスが見つかりません' });
  }

  // 権限チェック（関連シラバスの created_by）
  if (!canEditKoma(req, { created_by: existing.syllabus_created_by })) {
    return res.status(403).json({ error: 'このコマシラバスを編集する権限がありません' });
  }

  const learning_overview    = req.body.learning_overview    != null ? req.body.learning_overview    : existing.learning_overview;
  const learning_objectives  = req.body.learning_objectives  != null ? req.body.learning_objectives  : existing.learning_objectives;
  const is_published         = req.body.is_published         != null ? (req.body.is_published ? 1 : 0) : existing.is_published;

  try {
    req.db.prepare(`
      UPDATE koma_syllabi
      SET learning_overview = ?, learning_objectives = ?, is_published = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(learning_overview, learning_objectives, is_published, id);

    const updated = req.db.prepare(`
      SELECT ks.id, ks.syllabus_review_id, ks.session_number,
             ks.learning_overview, ks.learning_objectives, ks.is_published,
             ks.created_by, ks.created_at, ks.updated_at,
             sr.subject_name, sr.academic_year
      FROM koma_syllabi ks
      JOIN syllabus_reviews sr ON ks.syllabus_review_id = sr.id
      WHERE ks.id = ?
    `).get(id);

    return res.json({ data: updated });
  } catch (err) {
    console.error('コマシラバス更新エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

// ===========================
// DELETE /api/koma/:id  （authenticate）
// ===========================
router.delete('/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id, 10);

  const existing = req.db.prepare(
    'SELECT ks.id, sr.created_by AS syllabus_created_by FROM koma_syllabi ks JOIN syllabus_reviews sr ON ks.syllabus_review_id = sr.id WHERE ks.id = ?'
  ).get(id);

  if (!existing) {
    return res.status(404).json({ error: 'コマシラバスが見つかりません' });
  }

  // 権限チェック（関連シラバスの created_by）
  if (!canEditKoma(req, { created_by: existing.syllabus_created_by })) {
    return res.status(403).json({ error: 'このコマシラバスを削除する権限がありません' });
  }

  try {
    req.db.prepare('DELETE FROM koma_syllabi WHERE id = ?').run(id);
    return res.json({ message: 'コマシラバスを削除しました' });
  } catch (err) {
    console.error('コマシラバス削除エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

module.exports = router;
