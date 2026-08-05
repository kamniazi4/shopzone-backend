// Direct query helpers for the users table
const { query } = require('../../config/db');

async function findById(id) {
  const result = await query(
    `SELECT id, name, email, phone, status, created_at, updated_at FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function findByEmail(email) {
  const result = await query(`SELECT * FROM users WHERE email = $1`, [email]);
  return result.rows[0] || null;
}

async function updateById(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return findById(id);

  const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
  const values = keys.map((key) => fields[key]);

  const result = await query(
    `UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, name, email, phone, status`,
    [id, ...values]
  );
  return result.rows[0];
}

module.exports = { findById, findByEmail, updateById };