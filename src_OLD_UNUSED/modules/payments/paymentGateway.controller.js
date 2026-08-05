// CRUD for payment_gateways (admin configuration)
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');

async function listGateways(req, res, next) {
  try {
    const result = await query(`SELECT * FROM payment_gateways WHERE is_active = TRUE ORDER BY name`);
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function createGateway(req, res, next) {
  try {
    const { name, code, settings, is_active } = req.body;
    if (!name || !code) return ApiResponse.error(res, 'name and code are required', 400);

    const result = await query(
      `INSERT INTO payment_gateways (name, code, settings, is_active)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, code, settings, is_active !== undefined ? is_active : true]
    );
    return ApiResponse.success(res, result.rows[0], 'Payment gateway created', 201);
  } catch (err) {
    next(err);
  }
}

async function updateGateway(req, res, next) {
  try {
    const { name, settings, is_active } = req.body;
    const result = await query(
      `UPDATE payment_gateways SET
        name = COALESCE($1, name),
        settings = COALESCE($2, settings),
        is_active = COALESCE($3, is_active)
       WHERE id = $4 RETURNING *`,
      [name, settings, is_active, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Payment gateway not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Payment gateway updated');
  } catch (err) {
    next(err);
  }
}

async function deleteGateway(req, res, next) {
  try {
    const result = await query(`DELETE FROM payment_gateways WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Payment gateway not found', 404);
    return ApiResponse.success(res, null, 'Payment gateway deleted');
  } catch (err) {
    next(err);
  }
}

module.exports = { listGateways, createGateway, updateGateway, deleteGateway };