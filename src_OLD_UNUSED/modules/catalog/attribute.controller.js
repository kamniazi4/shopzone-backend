// CRUD for attributes and attribute_values
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');

async function listAttributes(req, res, next) {
  try {
    const result = await query(`SELECT * FROM attributes ORDER BY name`);
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function createAttribute(req, res, next) {
  try {
    const { name, type } = req.body;
    if (!name || !type) return ApiResponse.error(res, 'name and type are required', 400);

    const result = await query(
      `INSERT INTO attributes (name, type) VALUES ($1, $2) RETURNING *`,
      [name, type]
    );
    return ApiResponse.success(res, result.rows[0], 'Attribute created', 201);
  } catch (err) {
    next(err);
  }
}

async function deleteAttribute(req, res, next) {
  try {
    const result = await query(`DELETE FROM attributes WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Attribute not found', 404);
    return ApiResponse.success(res, null, 'Attribute deleted');
  } catch (err) {
    next(err);
  }
}

// ---- attribute_values ----

async function listAttributeValues(req, res, next) {
  try {
    const result = await query(
      `SELECT * FROM attribute_values WHERE attribute_id = $1 ORDER BY value`,
      [req.params.id]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function addAttributeValue(req, res, next) {
  try {
    const { value } = req.body;
    if (!value) return ApiResponse.error(res, 'value is required', 400);

    const result = await query(
      `INSERT INTO attribute_values (attribute_id, value) VALUES ($1, $2) RETURNING *`,
      [req.params.id, value]
    );
    return ApiResponse.success(res, result.rows[0], 'Attribute value added', 201);
  } catch (err) {
    next(err);
  }
}

async function deleteAttributeValue(req, res, next) {
  try {
    const result = await query(
      `DELETE FROM attribute_values WHERE id = $1 AND attribute_id = $2 RETURNING id`,
      [req.params.valueId, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Attribute value not found', 404);
    return ApiResponse.success(res, null, 'Attribute value deleted');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAttributes, createAttribute, deleteAttribute,
  listAttributeValues, addAttributeValue, deleteAttributeValue,
};