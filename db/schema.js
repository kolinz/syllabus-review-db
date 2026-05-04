'use strict';

const bcrypt = require('bcryptjs');

/**
 * データベースの初期化
 * - テーブルを CREATE TABLE IF NOT EXISTS で定義
 * - admin ユーザーが存在しない場合のみ自動作成
 *
 * @param {import('better-sqlite3').Database} db
 */
function initializeDatabase(db) {
  // ===========================
  // テーブル定義
  // ===========================

  // users: ユーザー
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER  PRIMARY KEY AUTOINCREMENT,
      username      TEXT     NOT NULL UNIQUE,
      password_hash TEXT     NOT NULL,
      role          TEXT     NOT NULL CHECK(role IN ('admin', 'teacher')),
      display_name  TEXT,
      is_disabled   INTEGER  NOT NULL DEFAULT 0,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // field_masters: 選択肢マスター
  db.prepare(`
    CREATE TABLE IF NOT EXISTS field_masters (
      id          INTEGER  PRIMARY KEY AUTOINCREMENT,
      field_type  TEXT     NOT NULL,
      label       TEXT     NOT NULL,
      sort_order  INTEGER  NOT NULL DEFAULT 0,
      is_disabled INTEGER  NOT NULL DEFAULT 0,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // syllabus_reviews: シラバスレビュー本体
  db.prepare(`
    CREATE TABLE IF NOT EXISTS syllabus_reviews (
      id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
      subject_name        TEXT     NOT NULL,
      academic_year       INTEGER  NOT NULL,
      department_id       INTEGER  REFERENCES field_masters(id),
      pdf_path            TEXT,
      knowledge_skills    TEXT,
      ai_skills           TEXT,
      non_ict_value       TEXT,
      evaluation_id       INTEGER  REFERENCES field_masters(id),
      evaluation_comment  TEXT,
      university_learning TEXT,
      is_published        INTEGER  NOT NULL DEFAULT 0,
      created_by          INTEGER  REFERENCES users(id),
      created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(subject_name, academic_year)
    )
  `).run();

  // syllabus_review_selections: 複数選択フィールドの中間テーブル
  db.prepare(`
    CREATE TABLE IF NOT EXISTS syllabus_review_selections (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      syllabus_review_id INTEGER NOT NULL REFERENCES syllabus_reviews(id) ON DELETE CASCADE,
      field_master_id    INTEGER NOT NULL REFERENCES field_masters(id)
    )
  `).run();

  // koma_syllabi: コマシラバス
  db.prepare(`
    CREATE TABLE IF NOT EXISTS koma_syllabi (
      id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
      syllabus_review_id  INTEGER  NOT NULL REFERENCES syllabus_reviews(id) ON DELETE CASCADE,
      session_number      INTEGER  NOT NULL,
      learning_overview   TEXT,
      learning_objectives TEXT,
      created_by          INTEGER  REFERENCES users(id),
      created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(syllabus_review_id, session_number)
    )
  `).run();

  // assignment_reviews: 課題レビュー
  db.prepare(`
    CREATE TABLE IF NOT EXISTS assignment_reviews (
      id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
      syllabus_review_id  INTEGER  NOT NULL REFERENCES syllabus_reviews(id) ON DELETE CASCADE,
      academic_year       INTEGER  NOT NULL,
      assignment_number   INTEGER  NOT NULL,
      assignment_name     TEXT,
      evaluation_id       INTEGER  REFERENCES field_masters(id),
      evaluation_comment  TEXT,
      university_learning TEXT,
      created_by          INTEGER  REFERENCES users(id),
      created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // ===========================
  // カラム追加マイグレーション（is_published）
  // CREATE TABLE IF NOT EXISTS では既存テーブルにカラムを追加できないため
  // ALTER TABLE ADD COLUMN を使用する（既に存在する場合はエラーを無視）
  // ===========================
  const addKomaPublished = () => {
    try {
      db.prepare('ALTER TABLE koma_syllabi ADD COLUMN is_published INTEGER NOT NULL DEFAULT 0').run();
    } catch (e) { /* already exists */ }
  };
  const addAssignPublished = () => {
    try {
      db.prepare('ALTER TABLE assignment_reviews ADD COLUMN is_published INTEGER NOT NULL DEFAULT 0').run();
    } catch (e) { /* already exists */ }
  };
  addKomaPublished();
  addAssignPublished();

  // ===========================
  // admin ユーザーの自動作成
  // ===========================
  const adminExists = db.prepare(
    "SELECT id FROM users WHERE username = 'admin'"
  ).get();

  if (!adminExists) {
    const passwordHash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, role, display_name)
      VALUES ('admin', ?, 'admin', '管理者')
    `).run(passwordHash);
    console.log('admin ユーザーを自動作成しました');
  }
}

module.exports = { initializeDatabase };
