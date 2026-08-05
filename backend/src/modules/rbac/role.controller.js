// CRUD for roles and role-permission assignment
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');

async function listRoles(req, res, next) {
  try {
    const result = await query(`SELECT * FROM roles ORDER BY name`);
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function createRole(req, res, next) {
  try {
    const { name, description } = req.body;
    if (!name) return ApiResponse.error(res, 'name is required', 400);

    const result = await query(
      `INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING *`,
      [name, description]
    );
    return ApiResponse.success(res, result.rows[0], 'Role created', 201);
  } catch (err) {
    next(err);
  }
}

async function updateRole(req, res, next) {
  try {
    const { name, description } = req.body;
    const result = await query(
      `UPDATE roles SET name = COALESCE($1, name), description = COALESCE($2, description)
       WHERE id = $3 RETURNING *`,
      [name, description, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Role not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Role updated');
  } catch (err) {
    next(err);
  }
}

async function deleteRole(req, res, next) {
  try {
    const result = await query(`DELETE FROM roles WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Role not found', 404);
    return ApiResponse.success(res, null, 'Role deleted');
  } catch (err) {
    next(err);
  }
}

// Assign a role to a user
async function assignRoleToUser(req, res, next) {
  try {
    const { user_id, role_id } = req.body;
    if (!user_id || !role_id) return ApiResponse.error(res, 'user_id and role_id are required', 400);

    await query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [user_id, role_id]
    );
    return ApiResponse.success(res, null, 'Role assigned to user', 201);
  } catch (err) {
    next(err);
  }
}

async function removeRoleFromUser(req, res, next) {
  try {
    const { user_id, role_id } = req.body;
    await query(`DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`, [user_id, role_id]);
    return ApiResponse.success(res, null, 'Role removed from user');
  } catch (err) {
    next(err);
  }
}

// Assign a permission to a role
async function assignPermissionToRole(req, res, next) {
  try {
    const { role_id, permission_id } = req.body;
    if (!role_id || !permission_id) {
      return ApiResponse.error(res, 'role_id and permission_id are required', 400);
    }

    await query(
      `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [role_id, permission_id]
    );
    return ApiResponse.success(res, null, 'Permission assigned to role', 201);
  } catch (err) {
    next(err);
  }
}

async function removePermissionFromRole(req, res, next) {
  try {
    const { role_id, permission_id } = req.body;
    await query(
      `DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2`,
      [role_id, permission_id]
    );
    return ApiResponse.success(res, null, 'Permission removed from role');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listRoles, createRole, updateRole, deleteRole,
  assignRoleToUser, removeRoleFromUser,
  assignPermissionToRole, removePermissionFromRole,
};