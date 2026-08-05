// Handles system_settings and events
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');

async function listSettings(req, res, next) {
  try {
    const result = await query(`SELECT * FROM system_settings ORDER BY key_name`);
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function getSetting(req, res, next) {
  try {
    const result = await query(`SELECT * FROM system_settings WHERE key_name = $1`, [req.params.key]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Setting not found', 404);
    return ApiResponse.success(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function upsertSetting(req, res, next) {
  try {
    const { value_data, description } = req.body;
    if (value_data === undefined) return ApiResponse.error(res, 'value_data is required', 400);

    const result = await query(
      `INSERT INTO system_settings (key_name, value_data, description)
       VALUES ($1,$2,$3)
       ON CONFLICT (key_name) DO UPDATE
         SET value_data = EXCLUDED.value_data, description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [req.params.key, value_data, description]
    );
    return ApiResponse.success(res, result.rows[0], 'Setting saved');
  } catch (err) {
    next(err);
  }
}

async function deleteSetting(req, res, next) {
  try {
    const result = await query(`DELETE FROM system_settings WHERE key_name = $1 RETURNING key_name`, [req.params.key]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Setting not found', 404);
    return ApiResponse.success(res, null, 'Setting deleted');
  } catch (err) {
    next(err);
  }
}

// ---- events (generic system event log, e.g. webhooks, background job triggers) ----

async function logEvent(req, res, next) {
  try {
    const { event_type, payload } = req.body;
    if (!event_type) return ApiResponse.error(res, 'event_type is required', 400);

    const result = await query(
      `INSERT INTO events (event_type, payload) VALUES ($1,$2) RETURNING *`,
      [event_type, payload]
    );
    return ApiResponse.success(res, result.rows[0], 'Event logged', 201);
  } catch (err) {
    next(err);
  }
}

async function listEvents(req, res, next) {
  try {
    const { event_type } = req.query;
    const conditions = [];
    const params = [];
    if (event_type) {
      params.push(event_type);
      conditions.push(`event_type = $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT * FROM events ${whereClause} ORDER BY created_at DESC LIMIT 100`,
      params
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { listSettings, getSetting, upsertSetting, deleteSetting, logEvent, listEvents };