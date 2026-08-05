// CRUD for shipping_providers (admin configuration)
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');

async function listProviders(req, res, next) {
  try {
    const result = await query(`SELECT * FROM shipping_providers WHERE status = 'active' ORDER BY name`);
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function createProvider(req, res, next) {
  try {
    const { name, code, api_details, status } = req.body;
    if (!name || !code) return ApiResponse.error(res, 'name and code are required', 400);

    const result = await query(
      `INSERT INTO shipping_providers (name, code, api_details, status)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, code, api_details, status || 'active']
    );
    return ApiResponse.success(res, result.rows[0], 'Shipping provider created', 201);
  } catch (err) {
    next(err);
  }
}

async function updateProvider(req, res, next) {
  try {
    const { name, api_details, status } = req.body;
    const result = await query(
      `UPDATE shipping_providers SET
        name = COALESCE($1, name),
        api_details = COALESCE($2, api_details),
        status = COALESCE($3, status)
       WHERE id = $4 RETURNING *`,
      [name, api_details, status, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Shipping provider not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Shipping provider updated');
  } catch (err) {
    next(err);
  }
}

async function deleteProvider(req, res, next) {
  try {
    const result = await query(`DELETE FROM shipping_providers WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Shipping provider not found', 404);
    return ApiResponse.success(res, null, 'Shipping provider deleted');
  } catch (err) {
    next(err);
  }
}

module.exports = { listProviders, createProvider, updateProvider, deleteProvider };