// CRUD for organizations and organization_users
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');
const { getPagination, buildPaginationMeta } = require('../../utils/pagination');

async function listOrganizations(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req.query);

    const countResult = await query(`SELECT COUNT(*) FROM organizations`);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const result = await query(
      `SELECT * FROM organizations ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return ApiResponse.paginated(res, result.rows, buildPaginationMeta(page, limit, totalCount));
  } catch (err) {
    next(err);
  }
}

async function getOrganizationById(req, res, next) {
  try {
    const result = await query(`SELECT * FROM organizations WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Organization not found', 404);
    return ApiResponse.success(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function createOrganization(req, res, next) {
  try {
    const { name, code, status } = req.body;
    if (!name) return ApiResponse.error(res, 'name is required', 400);

    const result = await query(
      `INSERT INTO organizations (name, code, status) VALUES ($1, $2, $3) RETURNING *`,
      [name, code, status || 'active']
    );
    return ApiResponse.success(res, result.rows[0], 'Organization created', 201);
  } catch (err) {
    next(err);
  }
}

async function updateOrganization(req, res, next) {
  try {
    const { name, code, status } = req.body;
    const result = await query(
      `UPDATE organizations SET
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        status = COALESCE($3, status)
       WHERE id = $4 RETURNING *`,
      [name, code, status, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Organization not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Organization updated');
  } catch (err) {
    next(err);
  }
}

async function deleteOrganization(req, res, next) {
  try {
    const result = await query(`DELETE FROM organizations WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Organization not found', 404);
    return ApiResponse.success(res, null, 'Organization deleted');
  } catch (err) {
    next(err);
  }
}

// ---- organization_users ----

async function addUserToOrganization(req, res, next) {
  try {
    const { user_id, role } = req.body;
    if (!user_id) return ApiResponse.error(res, 'user_id is required', 400);

    const result = await query(
      `INSERT INTO organization_users (organization_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING *`,
      [req.params.id, user_id, role]
    );
    return ApiResponse.success(res, result.rows[0], 'User added to organization', 201);
  } catch (err) {
    next(err);
  }
}

async function listOrganizationUsers(req, res, next) {
  try {
    const result = await query(
      `SELECT ou.role, u.id, u.name, u.email
       FROM organization_users ou
       JOIN users u ON u.id = ou.user_id
       WHERE ou.organization_id = $1`,
      [req.params.id]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function removeUserFromOrganization(req, res, next) {
  try {
    await query(
      `DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2`,
      [req.params.id, req.params.userId]
    );
    return ApiResponse.success(res, null, 'User removed from organization');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listOrganizations, getOrganizationById, createOrganization, updateOrganization, deleteOrganization,
  addUserToOrganization, listOrganizationUsers, removeUserFromOrganization,
};