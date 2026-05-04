'use strict';

const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ===========================
// マスターデータをfield_typeごとにグルーピングするヘルパー
// ===========================
function groupByFieldType(rows) {
  const result = {};
  for (const row of rows) {
    if (!result[row.field_type]) result[row.field_type] = [];
    result[row.field_type].push(row);
  }
  return result;
}

// ===========================
// GET /api/masters
// 有効なマスター（is_disabled=0）を全field_typeまとめて返す（閲覧用）
// ===========================
router.get('/', (req, res) => {
  const rows = req.db.prepare(`
    SELECT id, field_type, label, sort_order, is_disabled
    FROM field_masters
    WHERE is_disabled = 0
    ORDER BY field_type, sort_order, id
  `).all();

  return res.json({ data: groupByFieldType(rows) });
});

// ===========================
// GET /api/masters/all
// 無効なマスターも含めて全件返す（管理画面用）
// authenticate + requireAdmin
// ===========================
router.get('/all', authenticate, requireAdmin, (req, res) => {
  const rows = req.db.prepare(`
    SELECT id, field_type, label, sort_order, is_disabled, created_at
    FROM field_masters
    ORDER BY field_type, sort_order, id
  `).all();

  return res.json({ data: groupByFieldType(rows) });
});

// ===========================
// GET /api/masters/:field_type
// 指定field_typeの有効なマスターをsort_order順で返す
// ===========================
router.get('/:field_type', (req, res) => {
  const { field_type } = req.params;

  const rows = req.db.prepare(`
    SELECT id, field_type, label, sort_order, is_disabled
    FROM field_masters
    WHERE field_type = ? AND is_disabled = 0
    ORDER BY sort_order, id
  `).all(field_type);

  return res.json({ data: rows });
});

// ===========================
// POST /api/masters
// 新規マスター追加（admin のみ）
// ===========================
router.post('/', authenticate, requireAdmin, (req, res) => {
  const { field_type, label, sort_order } = req.body;

  // バリデーション
  if (!field_type || !label) {
    return res.status(400).json({ error: 'field_type と label は必須です' });
  }

  try {
    const result = req.db.prepare(`
      INSERT INTO field_masters (field_type, label, sort_order)
      VALUES (?, ?, ?)
    `).run(field_type, label, sort_order != null ? parseInt(sort_order, 10) : 0);

    const created = req.db.prepare(
      'SELECT * FROM field_masters WHERE id = ?'
    ).get(result.lastInsertRowid);

    return res.status(201).json({ data: created });
  } catch (err) {
    console.error('マスター作成エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

// ===========================
// PUT /api/masters/:id
// マスター更新（admin のみ）
// 更新可能フィールド: label, sort_order, is_disabled
// ===========================
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);

  const existing = req.db.prepare(
    'SELECT * FROM field_masters WHERE id = ?'
  ).get(id);

  if (!existing) {
    return res.status(404).json({ error: 'マスターデータが見つかりません' });
  }

  const label      = req.body.label      != null ? req.body.label      : existing.label;
  const sort_order = req.body.sort_order != null ? parseInt(req.body.sort_order, 10) : existing.sort_order;
  const is_disabled = req.body.is_disabled != null ? (req.body.is_disabled ? 1 : 0) : existing.is_disabled;

  try {
    req.db.prepare(`
      UPDATE field_masters
      SET label = ?, sort_order = ?, is_disabled = ?
      WHERE id = ?
    `).run(label, sort_order, is_disabled, id);

    const updated = req.db.prepare(
      'SELECT * FROM field_masters WHERE id = ?'
    ).get(id);

    return res.json({ data: updated });
  } catch (err) {
    console.error('マスター更新エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

// ===========================
// DELETE /api/masters/:id
// マスター削除（admin のみ）
// いずれかのテーブルで参照中なら400、なければ削除
// ===========================
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);

  const existing = req.db.prepare(
    'SELECT * FROM field_masters WHERE id = ?'
  ).get(id);

  if (!existing) {
    return res.status(404).json({ error: 'マスターデータが見つかりません' });
  }

  // 参照チェック: syllabus_reviews.department_id
  const refDept = req.db.prepare(
    'SELECT COUNT(*) as cnt FROM syllabus_reviews WHERE department_id = ?'
  ).get(id);

  // 参照チェック: syllabus_reviews.evaluation_id
  const refSyllabusEval = req.db.prepare(
    'SELECT COUNT(*) as cnt FROM syllabus_reviews WHERE evaluation_id = ?'
  ).get(id);

  // 参照チェック: syllabus_review_selections.field_master_id
  const refSelection = req.db.prepare(
    'SELECT COUNT(*) as cnt FROM syllabus_review_selections WHERE field_master_id = ?'
  ).get(id);

  // 参照チェック: assignment_reviews.evaluation_id
  const refAssignEval = req.db.prepare(
    'SELECT COUNT(*) as cnt FROM assignment_reviews WHERE evaluation_id = ?'
  ).get(id);

  const isReferenced =
    refDept.cnt > 0 ||
    refSyllabusEval.cnt > 0 ||
    refSelection.cnt > 0 ||
    refAssignEval.cnt > 0;

  if (isReferenced) {
    return res.status(400).json({
      error: '参照中のデータがあるため削除できません。無効化してください。',
    });
  }

  try {
    req.db.prepare('DELETE FROM field_masters WHERE id = ?').run(id);
    return res.json({ message: 'マスターデータを削除しました' });
  } catch (err) {
    console.error('マスター削除エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

module.exports = router;
