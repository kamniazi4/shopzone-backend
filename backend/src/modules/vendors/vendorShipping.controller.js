// Handles vendor_shipping_settings
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');

async function listVendorShippingSettings(req, res, next) {
  try {
    const result = await query(
      `SELECT vss.*, sp.name AS provider_name, sp.code AS provider_code
       FROM vendor_shipping_settings vss
       JOIN shipping_providers sp ON sp.id = vss.shipping_provider_id
       WHERE vss.vendor_id = $1`,
      [req.params.id]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function addVendorShippingSetting(req, res, next) {
  try {
    const { shipping_provider_id, flat_rate, is_enabled } = req.body;
    if (!shipping_provider_id) return ApiResponse.error(res, 'shipping_provider_id is required', 400);

    const result = await query(
      `INSERT INTO vendor_shipping_settings (vendor_id, shipping_provider_id, flat_rate, is_enabled)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, shipping_provider_id, flat_rate || 0, is_enabled !== undefined ? is_enabled : true]
    );
    return ApiResponse.success(res, result.rows[0], 'Vendor shipping setting added', 201);
  } catch (err) {
    next(err);
  }
}

async function updateVendorShippingSetting(req, res, next) {
  try {
    const { flat_rate, is_enabled } = req.body;
    const result = await query(
      `UPDATE vendor_shipping_settings SET
        flat_rate = COALESCE($1, flat_rate),
        is_enabled = COALESCE($2, is_enabled)
       WHERE id = $3 AND vendor_id = $4 RETURNING *`,
      [flat_rate, is_enabled, req.params.settingId, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Setting not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Vendor shipping setting updated');
  } catch (err) {
    next(err);
  }
}

async function deleteVendorShippingSetting(req, res, next) {
  try {
    const result = await query(
      `DELETE FROM vendor_shipping_settings WHERE id = $1 AND vendor_id = $2 RETURNING id`,
      [req.params.settingId, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Setting not found', 404);
    return ApiResponse.success(res, null, 'Vendor shipping setting deleted');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listVendorShippingSettings, addVendorShippingSetting,
  updateVendorShippingSetting, deleteVendorShippingSetting,
};