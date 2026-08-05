// Business logic for authentication
const bcrypt = require('bcryptjs');
const { query, getClient } = require('../../config/db');
const { generateAccessToken, generateRefreshToken } = require('../../utils/generateToken');

async function registerUser({ name, email, password, phone }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const hashedPassword = await bcrypt.hash(password, 10);

    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, phone, status, created_at`,
      [name, email, hashedPassword, phone]
    );

    const user = userResult.rows[0];

    // Assign default 'customer' role
    const roleResult = await client.query(`SELECT id FROM roles WHERE name = 'customer'`);
    if (roleResult.rows.length > 0) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
        [user.id, roleResult.rows[0].id]
      );
    }

    // Create empty cart for the user
    await client.query(`INSERT INTO carts (user_id) VALUES ($1)`, [user.id]);

    await client.query('COMMIT');
    return user;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function validateCredentials(email, password) {
  const result = await query(
    `SELECT id, name, email, password_hash, status FROM users WHERE email = $1`,
    [email]
  );

  if (result.rows.length === 0) return null;

  const user = result.rows[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) return null;
  if (user.status !== 'active') throw new Error('Account is not active');

  return user;
}

async function getUserRoles(userId) {
  const result = await query(
    `SELECT r.id, r.name
     FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = $1`,
    [userId]
  );
  return result.rows;
}

function issueTokens(user, roles) {
  const payload = { id: user.id, email: user.email, roles: roles.map((r) => r.name) };
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken({ id: user.id }),
  };
}

module.exports = { registerUser, validateCredentials, getUserRoles, issueTokens };