'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const { authenticate, optionalAuth } = require('../middleware/auth');
const { handleMulterUpload }         = require('../middleware/upload');

const router = express.Router();

// ===========================
// 選択フィールドをシラバスIDから取得するヘルパー
// ===========================
function fetchSelections(db, syllabusId) {
  const rows = db.prepare(`
    SELECT fm.field_type, fm.id, fm.label, fm.sort_order
    FROM syllabus_review_selections srs
    JOIN field_masters fm ON srs.field_master_id = fm.id
    WHERE srs.syllabus_review_id = ?
    ORDER BY fm.field_type, fm.sort_order
  `).all(syllabusId);

  const result = {};
  for (const row of rows) {
    if (!result[row.field_type]) result[row.field_type] = [];
    result[row.field_type].push({ id: row.id, label: row.label });
  }
  return result;
}

// ===========================
// selections の更新（全削除→再挿入）トランザクション
// ===========================
function buildUpdateSelectionsTransaction(db) {
  return db.transaction((syllabusId, selections) => {
    db.prepare(
      'DELETE FROM syllabus_review_selections WHERE syllabus_review_id = ?'
    ).run(syllabusId);

    const insert = db.prepare(`
      INSERT INTO syllabus_review_selections (syllabus_review_id, field_master_id)
      VALUES (?, ?)
    `);

    if (selections && typeof selections === 'object') {
      for (const ids of Object.values(selections)) {
        if (Array.isArray(ids)) {
          for (const id of ids) {
            if (id != null) insert.run(syllabusId, id);
          }
        }
      }
    }
  });
}

// ===========================
// 権限チェックヘルパー（作成者 or admin）
// ===========================
function canEdit(req, syllabus) {
  if (!req.user) return false;
  return req.user.role === 'admin' || req.user.id === syllabus.created_by;
}

// ===========================
// GET /api/syllabi  （optionalAuth）
// ===========================
router.get('/', optionalAuth, (req, res) => {
  const { year, department_id, keyword } = req.query;

  // 公開フィルタの構築
  let publishClause = '';
  const params = [];

  if (!req.user) {
    publishClause = 'AND sr.is_published = 1';
  } else if (req.user.role !== 'admin') {
    publishClause = 'AND (sr.created_by = ? OR sr.is_published = 1)';
    params.push(req.user.id);
  }
  // admin は全件（追加条件なし）

  // 追加フィルタ
  let filterClause = '';
  if (year) {
    filterClause += ' AND sr.academic_year = ?';
    params.push(parseInt(year, 10));
  }
  if (department_id) {
    filterClause += ' AND sr.department_id = ?';
    params.push(parseInt(department_id, 10));
  }
  if (keyword) {
    filterClause += ' AND sr.subject_name LIKE ?';
    params.push(`%${keyword}%`);
  }

  try {
    const rows = req.db.prepare(`
      SELECT
        sr.id, sr.subject_name, sr.academic_year,
        sr.department_id, sr.pdf_path,
        sr.knowledge_skills, sr.ai_skills, sr.non_ict_value,
        sr.evaluation_id, sr.evaluation_comment, sr.university_learning,
        sr.is_published, sr.created_by, sr.created_at, sr.updated_at,
        dept.label  AS department,
        eval.label  AS evaluation,
        u.display_name AS created_by_name
      FROM syllabus_reviews sr
      LEFT JOIN field_masters dept ON sr.department_id  = dept.id
      LEFT JOIN field_masters eval ON sr.evaluation_id  = eval.id
      LEFT JOIN users         u    ON sr.created_by     = u.id
      WHERE 1=1
        ${publishClause}
        ${filterClause}
      ORDER BY sr.updated_at DESC, sr.id DESC
    `).all(...params);

    // selections を各レコードに付与
    const data = rows.map(row => ({
      ...row,
      selections: fetchSelections(req.db, row.id),
    }));

    return res.json({ data });
  } catch (err) {
    console.error('シラバス一覧取得エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

// ===========================
// GET /api/syllabi/:id  （optionalAuth）
// ===========================
router.get('/:id', optionalAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);

  try {
    const row = req.db.prepare(`
      SELECT
        sr.id, sr.subject_name, sr.academic_year,
        sr.department_id, sr.pdf_path,
        sr.knowledge_skills, sr.ai_skills, sr.non_ict_value,
        sr.evaluation_id, sr.evaluation_comment, sr.university_learning,
        sr.is_published, sr.created_by, sr.created_at, sr.updated_at,
        dept.label  AS department,
        eval.label  AS evaluation,
        u.display_name AS created_by_name
      FROM syllabus_reviews sr
      LEFT JOIN field_masters dept ON sr.department_id  = dept.id
      LEFT JOIN field_masters eval ON sr.evaluation_id  = eval.id
      LEFT JOIN users         u    ON sr.created_by     = u.id
      WHERE sr.id = ?
    `).get(id);

    if (!row) {
      return res.status(404).json({ error: 'シラバスレビューが見つかりません' });
    }

    // 公開フィルタ（未認証かつ非公開は404扱い）
    if (!req.user && row.is_published !== 1) {
      return res.status(404).json({ error: 'シラバスレビューが見つかりません' });
    }
    if (req.user && req.user.role !== 'admin' && row.is_published !== 1 && req.user.id !== row.created_by) {
      return res.status(404).json({ error: 'シラバスレビューが見つかりません' });
    }

    // コマシラバス・課題レビューの件数
    const komaCount = req.db.prepare(
      'SELECT COUNT(*) as cnt FROM koma_syllabi WHERE syllabus_review_id = ?'
    ).get(id);
    const assignmentCount = req.db.prepare(
      'SELECT COUNT(*) as cnt FROM assignment_reviews WHERE syllabus_review_id = ?'
    ).get(id);

    return res.json({
      data: {
        ...row,
        selections:       fetchSelections(req.db, id),
        koma_count:       komaCount.cnt,
        assignment_count: assignmentCount.cnt,
      },
    });
  } catch (err) {
    console.error('シラバス詳細取得エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

// ===========================
// POST /api/syllabi  （authenticate）
// ===========================
router.post('/', authenticate, (req, res) => {
  const {
    subject_name, academic_year, department_id,
    knowledge_skills, ai_skills, non_ict_value,
    evaluation_id, evaluation_comment, university_learning,
    is_published, selections,
  } = req.body;

  // 必須チェック
  if (!subject_name || !academic_year) {
    return res.status(400).json({ error: '科目名と年度は必須です' });
  }

  // 重複チェック
  const duplicate = req.db.prepare(
    'SELECT id FROM syllabus_reviews WHERE subject_name = ? AND academic_year = ?'
  ).get(subject_name, parseInt(academic_year, 10));

  if (duplicate) {
    return res.status(409).json({ error: '同じ科目名・年度のシラバスレビューが既に存在します' });
  }

  const updateSelectionsTransaction = buildUpdateSelectionsTransaction(req.db);

  const createTransaction = req.db.transaction(() => {
    const result = req.db.prepare(`
      INSERT INTO syllabus_reviews (
        subject_name, academic_year, department_id,
        knowledge_skills, ai_skills, non_ict_value,
        evaluation_id, evaluation_comment, university_learning,
        is_published, created_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      subject_name,
      parseInt(academic_year, 10),
      department_id  ? parseInt(department_id, 10)  : null,
      knowledge_skills    || null,
      ai_skills           || null,
      non_ict_value       || null,
      evaluation_id  ? parseInt(evaluation_id, 10)  : null,
      evaluation_comment  || null,
      university_learning || null,
      is_published ? 1 : 0,
      req.user.id,
    );

    const syllabusId = result.lastInsertRowid;
    updateSelectionsTransaction(syllabusId, selections);
    return syllabusId;
  });

  try {
    const syllabusId = createTransaction();
    const created = req.db.prepare('SELECT * FROM syllabus_reviews WHERE id = ?').get(syllabusId);
    return res.status(201).json({ data: { ...created, selections: fetchSelections(req.db, syllabusId) } });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: '同じ科目名・年度のシラバスレビューが既に存在します' });
    }
    console.error('シラバス作成エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

// ===========================
// PUT /api/syllabi/:id  （authenticate）
// ===========================
router.put('/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id, 10);

  const existing = req.db.prepare('SELECT * FROM syllabus_reviews WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'シラバスレビューが見つかりません' });
  }

  if (!canEdit(req, existing)) {
    return res.status(403).json({ error: 'このシラバスレビューを編集する権限がありません' });
  }

  const {
    subject_name, academic_year, department_id,
    knowledge_skills, ai_skills, non_ict_value,
    evaluation_id, evaluation_comment, university_learning,
    is_published, selections,
  } = req.body;

  // 重複チェック（自分以外に同じ subject_name + academic_year があれば 409）
  const targetYear = academic_year != null ? parseInt(academic_year, 10) : existing.academic_year;
  const targetName = subject_name  != null ? subject_name               : existing.subject_name;

  const duplicate = req.db.prepare(
    'SELECT id FROM syllabus_reviews WHERE subject_name = ? AND academic_year = ? AND id != ?'
  ).get(targetName, targetYear, id);

  if (duplicate) {
    return res.status(409).json({ error: '同じ科目名・年度のシラバスレビューが既に存在します' });
  }

  const updateSelectionsTransaction = buildUpdateSelectionsTransaction(req.db);

  const updateTransaction = req.db.transaction(() => {
    req.db.prepare(`
      UPDATE syllabus_reviews SET
        subject_name        = ?,
        academic_year       = ?,
        department_id       = ?,
        knowledge_skills    = ?,
        ai_skills           = ?,
        non_ict_value       = ?,
        evaluation_id       = ?,
        evaluation_comment  = ?,
        university_learning = ?,
        is_published        = ?,
        updated_at          = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      targetName,
      targetYear,
      department_id  != null ? parseInt(department_id, 10)  : existing.department_id,
      knowledge_skills    != null ? knowledge_skills    : existing.knowledge_skills,
      ai_skills           != null ? ai_skills           : existing.ai_skills,
      non_ict_value       != null ? non_ict_value       : existing.non_ict_value,
      evaluation_id  != null ? parseInt(evaluation_id, 10)  : existing.evaluation_id,
      evaluation_comment  != null ? evaluation_comment  : existing.evaluation_comment,
      university_learning != null ? university_learning : existing.university_learning,
      is_published   != null ? (is_published ? 1 : 0)   : existing.is_published,
      id,
    );

    if (selections !== undefined) {
      updateSelectionsTransaction(id, selections);
    }
  });

  try {
    updateTransaction();
    const updated = req.db.prepare('SELECT * FROM syllabus_reviews WHERE id = ?').get(id);
    return res.json({ data: { ...updated, selections: fetchSelections(req.db, id) } });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: '同じ科目名・年度のシラバスレビューが既に存在します' });
    }
    console.error('シラバス更新エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

// ===========================
// DELETE /api/syllabi/:id  （authenticate）
// ===========================
router.delete('/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id, 10);

  const existing = req.db.prepare('SELECT * FROM syllabus_reviews WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'シラバスレビューが見つかりません' });
  }

  if (!canEdit(req, existing)) {
    return res.status(403).json({ error: 'このシラバスレビューを削除する権限がありません' });
  }

  // PDFファイルの削除（DBとファイルシステムを同期）
  if (existing.pdf_path) {
    const fullPath = path.resolve(existing.pdf_path);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (err) {
        console.error('PDFファイル削除エラー:', err.stack);
      }
    }
  }

  try {
    // CASCADE DELETE で koma_syllabi / assignment_reviews / syllabus_review_selections も削除
    req.db.prepare('DELETE FROM syllabus_reviews WHERE id = ?').run(id);
    return res.json({ message: 'シラバスレビューを削除しました' });
  } catch (err) {
    console.error('シラバス削除エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

// ===========================
// POST /api/syllabi/:id/pdf  （authenticate + multer）
// ===========================
router.post('/:id/pdf', authenticate, handleMulterUpload, (req, res) => {
  const id = parseInt(req.params.id, 10);

  const existing = req.db.prepare('SELECT * FROM syllabus_reviews WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'シラバスレビューが見つかりません' });
  }

  if (!canEdit(req, existing)) {
    return res.status(403).json({ error: 'このシラバスレビューを編集する権限がありません' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'PDFファイルを選択してください' });
  }

  // 既存PDFがある場合は先に削除
  if (existing.pdf_path) {
    const oldPath = path.resolve(existing.pdf_path);
    if (fs.existsSync(oldPath)) {
      try {
        fs.unlinkSync(oldPath);
      } catch (err) {
        console.error('旧PDFファイル削除エラー:', err.stack);
      }
    }
  }

  const pdfPath = req.file.path;

  try {
    req.db.prepare(
      'UPDATE syllabus_reviews SET pdf_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(pdfPath, id);

    return res.json({ data: { pdf_path: pdfPath } });
  } catch (err) {
    console.error('PDFパス保存エラー:', err.stack);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました' });
  }
});

// ===========================
// GET /api/syllabi/:id/pdf  （認証不要）
// ===========================
router.get('/:id/pdf', (req, res) => {
  const id = parseInt(req.params.id, 10);

  const row = req.db.prepare(
    'SELECT pdf_path, subject_name, academic_year FROM syllabus_reviews WHERE id = ?'
  ).get(id);

  if (!row) {
    return res.status(404).json({ error: 'シラバスレビューが見つかりません' });
  }

  if (!row.pdf_path) {
    return res.status(404).json({ error: 'PDFファイルが登録されていません' });
  }

  const fullPath = path.resolve(row.pdf_path);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'PDFファイルが見つかりません' });
  }

  // filename*=UTF-8 形式で日本語ファイル名を付与（filename= はASCII限定）
  const encodedFilename = encodeURIComponent(row.subject_name + '_' + row.academic_year + '.pdf');
  const disposition = 'inline; filename="syllabus.pdf"; filename*=UTF-8\'\'' + encodedFilename;

  return res.sendFile(fullPath, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': disposition,
    },
  });
});

module.exports = router;
