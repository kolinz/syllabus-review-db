'use strict';

/**
 * HTMLタグを除去してXSSを防ぐ
 * @param {*} str
 * @returns {*} 文字列の場合はタグ除去済み、それ以外はそのまま返す
 */
function stripHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').trim();
}

/**
 * sanitizeBody: リクエストボディの全文字列フィールドからHTMLタグを除去する
 * express.json() の後に適用する。
 */
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = stripHtml(req.body[key]);
      }
    }
  }
  next();
}

module.exports = { stripHtml, sanitizeBody };
