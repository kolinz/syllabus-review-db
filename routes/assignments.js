'use strict';

const express = require('express');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// ===========================
// 権限チェックヘルパー
// 関連シラバスレビューの created_by が req.user.id と一致するか、admin か
// ===========================
function canEdit(req, syllabus) {
  return req.user.role === 'admin' || req.user.id === syllabus.created_by;
}

// ===========================
// GET /api/assignments  （認証不要）
// ===========================
router.get('/', optionalAuth, (req, res) => {
  const { syllabus_review_id } = req.query;

  const params = [];
  let filterClause = 'WHERE 1=1';
  if (syllabus_review_id) {
    filterClause += ' AND ar.syllabus_review_id = ?';
    params.push(parseInt(syllabus_review_id, 10));
  }

  // 公開フィルタ
  if (!req.user) {
    filterClause += ' AND ar.is_published = 1';
  } else if (req.user.role !== 'admin') {
    filterClause += ' AND (sr.created_by = ? OR ar.is_published = 1)';
    params.push(req.user.id);
  }

  try {
    const rows = req.db.prepare(`
      SELECT
        ar.id, ar.syllabus_review_id, ar.academic_year,
        ar.assignment_number, ar.assignment_name,
        ar.evaluation_id, ar.evaluation_comment, ar.university_learning,
        ar.is_published,
        ar.created_by, ar.created_at, ar.updated_at,
        sr.subject_name,
        eval.label AS evaluation
      FROM assignment_reviews ar
      JOIN syllabus_reviews sr  ON ar.syllabus_review_id = sr.id
      LEFT JOIN field_masters eval ON ar.evaluation_id   = eval.id
      ${filterClause}
      ORDER BY ar.syllabus_review_id, ar.assignment_number, ar.id
    `).all(...params);

    return res.json({ data: rows });
  } catch (err) {
    console.error('課題レビュー一覧取得エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

// ===========================
// GET /api/assignments/:id  （認証不要）
// ===========================
router.get('/:id', optionalAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);

  const row = req.db.prepare(`
    SELECT
      ar.id, ar.syllabus_review_id, ar.academic_year,
      ar.assignment_number, ar.assignment_name,
      ar.evaluation_id, ar.evaluation_comment, ar.university_learning,
      ar.is_published,
      ar.created_by, ar.created_at, ar.updated_at,
      sr.subject_name,
      eval.label AS evaluation
    FROM assignment_reviews ar
    JOIN syllabus_reviews sr  ON ar.syllabus_review_id = sr.id
    LEFT JOIN field_masters eval ON ar.evaluation_id   = eval.id
    WHERE ar.id = ?
  `).get(id);

  if (!row) {
    return res.status(404).json({ error: '課題レビューが見つかりません' });
  }

  return res.json({ data: row });
});

// ===========================
// POST /api/assignments  （authenticate）
// ===========================
router.post('/', authenticate, (req, res) => {
  const {
    syllabus_review_id, academic_year, assignment_number,
    assignment_name, evaluation_id, evaluation_comment, university_learning,
    is_published,
  } = req.body;

  // 必須チェック
  if (!syllabus_review_id || academic_year == null || assignment_number == null) {
    return res.status(400).json({ error: 'syllabus_review_id、academic_year、assignment_number は必須です' });
  }

  const syllabusId = parseInt(syllabus_review_id, 10);

  // 関連シラバスレビューの存在確認
  const syllabus = req.db.prepare(
    'SELECT id, created_by FROM syllabus_reviews WHERE id = ?'
  ).get(syllabusId);

  if (!syllabus) {
    return res.status(404).json({ error: '関連するシラバスレビューが見つかりません' });
  }

  // 権限チェック（関連シラバスの created_by）
  if (!canEdit(req, syllabus)) {
    return res.status(403).json({ error: 'この課題レビューを作成する権限がありません' });
  }

  try {
    const result = req.db.prepare(`
      INSERT INTO assignment_reviews (
        syllabus_review_id, academic_year, assignment_number,
        assignment_name, evaluation_id, evaluation_comment, university_learning,
        is_published, created_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      syllabusId,
      parseInt(academic_year, 10),
      parseInt(assignment_number, 10),
      assignment_name     || null,
      evaluation_id       ? parseInt(evaluation_id, 10) : null,
      evaluation_comment  || null,
      university_learning || null,
      is_published ? 1 : 0,
      req.user.id,
    );

    const created = req.db.prepare(`
      SELECT ar.id, ar.syllabus_review_id, ar.academic_year,
             ar.assignment_number, ar.assignment_name,
             ar.evaluation_id, ar.evaluation_comment, ar.university_learning,
             ar.is_published, ar.created_by, ar.created_at, ar.updated_at,
             sr.subject_name, eval.label AS evaluation
      FROM assignment_reviews ar
      JOIN syllabus_reviews sr ON ar.syllabus_review_id = sr.id
      LEFT JOIN field_masters eval ON ar.evaluation_id = eval.id
      WHERE ar.id = ?
    `).get(result.lastInsertRowid);

    return res.status(201).json({ data: created });
  } catch (err) {
    console.error('課題レビュー作成エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

// ===========================
// PUT /api/assignments/:id  （authenticate）
// 全フィールド更新可能
// ===========================
router.put('/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id, 10);

  // 既存レコードと関連シラバスを取得
  const existing = req.db.prepare(`
    SELECT ar.*, sr.created_by AS syllabus_created_by
    FROM assignment_reviews ar
    JOIN syllabus_reviews sr ON ar.syllabus_review_id = sr.id
    WHERE ar.id = ?
  `).get(id);

  if (!existing) {
    return res.status(404).json({ error: '課題レビューが見つかりません' });
  }

  // 権限チェック（関連シラバスの created_by）
  if (!canEdit(req, { created_by: existing.syllabus_created_by })) {
    return res.status(403).json({ error: 'この課題レビューを編集する権限がありません' });
  }

  const is_published       = req.body.is_published       != null ? (req.body.is_published ? 1 : 0)           : existing.is_published;
  const academic_year      = req.body.academic_year      != null ? parseInt(req.body.academic_year, 10)      : existing.academic_year;
  const assignment_number  = req.body.assignment_number  != null ? parseInt(req.body.assignment_number, 10)  : existing.assignment_number;
  const assignment_name    = req.body.assignment_name    != null ? req.body.assignment_name    : existing.assignment_name;
  const evaluation_id      = req.body.evaluation_id      != null ? parseInt(req.body.evaluation_id, 10)      : existing.evaluation_id;
  const evaluation_comment = req.body.evaluation_comment != null ? req.body.evaluation_comment : existing.evaluation_comment;
  const university_learning = req.body.university_learning != null ? req.body.university_learning : existing.university_learning;

  try {
    req.db.prepare(`
      UPDATE assignment_reviews SET
        academic_year       = ?,
        assignment_number   = ?,
        assignment_name     = ?,
        evaluation_id       = ?,
        evaluation_comment  = ?,
        university_learning = ?,
        is_published        = ?,
        updated_at          = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      academic_year, assignment_number, assignment_name,
      evaluation_id, evaluation_comment, university_learning,
      is_published, id,
    );

    const updated = req.db.prepare(`
      SELECT ar.id, ar.syllabus_review_id, ar.academic_year,
             ar.assignment_number, ar.assignment_name,
             ar.evaluation_id, ar.evaluation_comment, ar.university_learning,
             ar.is_published, ar.created_by, ar.created_at, ar.updated_at,
             sr.subject_name, eval.label AS evaluation
      FROM assignment_reviews ar
      JOIN syllabus_reviews sr ON ar.syllabus_review_id = sr.id
      LEFT JOIN field_masters eval ON ar.evaluation_id = eval.id
      WHERE ar.id = ?
    `).get(id);

    return res.json({ data: updated });
  } catch (err) {
    console.error('課題レビュー更新エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

// ===========================
// DELETE /api/assignments/:id  （authenticate）
// ===========================
router.delete('/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id, 10);

  const existing = req.db.prepare(`
    SELECT ar.id, sr.created_by AS syllabus_created_by
    FROM assignment_reviews ar
    JOIN syllabus_reviews sr ON ar.syllabus_review_id = sr.id
    WHERE ar.id = ?
  `).get(id);

  if (!existing) {
    return res.status(404).json({ error: '課題レビューが見つかりません' });
  }

  // 権限チェック（関連シラバスの created_by）
  if (!canEdit(req, { created_by: existing.syllabus_created_by })) {
    return res.status(403).json({ error: 'この課題レビューを削除する権限がありません' });
  }

  try {
    req.db.prepare('DELETE FROM assignment_reviews WHERE id = ?').run(id);
    return res.json({ message: '課題レビューを削除しました' });
  } catch (err) {
    console.error('課題レビュー削除エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

module.exports = router;
