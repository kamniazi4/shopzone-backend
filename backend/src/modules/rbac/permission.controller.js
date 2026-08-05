// CRUD for permissions
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');

async function listPermissions(req, res, next) {
  try {
    const result = await query(`SELECT * FROM permissions ORDER BY name`);
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function createPermission(req, res, next) {
  try {
    const { name, description } = req.body;
    if (!name) return ApiResponse.error(res, 'name is required', 400);

    const result = await query(
      `INSERT INTO permissions (name, description) VALUES ($1, $2) RETURNING *`,
      [name, description]
    );
    return ApiResponse.success(res, result.rows[0], 'Permission created', 201);
  } catch (err) {
    next(err);
  }
}

async function deletePermission(req, res, next) {
  try {
    const result = await query(`DELETE FROM permissions WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Permission not found', 404);
    return ApiResponse.success(res, null, 'Permission deleted');
  } catch (err) {
    next(err);
  }
}

module.exports = { listPermissions, createPermission, deletePermission };