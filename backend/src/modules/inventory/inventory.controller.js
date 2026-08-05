// Handles inventory and inventory_alerts
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');

async function listInventory(req, res, next) {
  try {
    const { warehouse_id, variant_id } = req.query;
    const conditions = [];
    const params = [];

    if (warehouse_id) {
      params.push(warehouse_id);
      conditions.push(`i.warehouse_id = $${params.length}`);
    }
    if (variant_id) {
      params.push(variant_id);
      conditions.push(`i.variant_id = $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT i.*, w.name AS warehouse_name, pv.sku AS variant_sku
       FROM inventory i
       JOIN warehouses w ON w.id = i.warehouse_id
       JOIN product_variants pv ON pv.id = i.variant_id
       ${whereClause}
       ORDER BY i.updated_at DESC`,
      params
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function getInventoryById(req, res, next) {
  try {
    const result = await query(`SELECT * FROM inventory WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Inventory record not found', 404);
    return ApiResponse.success(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// Creates a stock record for a variant in a warehouse, or updates it if it already exists
async function upsertInventory(req, res, next) {
  try {
    const { warehouse_id, variant_id, quantity_on_hand } = req.body;
    if (!warehouse_id || !variant_id || quantity_on_hand === undefined) {
      return ApiResponse.error(res, 'warehouse_id, variant_id and quantity_on_hand are required', 400);
    }

    const result = await query(
      `INSERT INTO inventory (warehouse_id, variant_id, quantity_on_hand)
       VALUES ($1,$2,$3)
       ON CONFLICT (warehouse_id, variant_id) DO UPDATE
         SET quantity_on_hand = EXCLUDED.quantity_on_hand, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [warehouse_id, variant_id, quantity_on_hand]
    );
    return ApiResponse.success(res, result.rows[0], 'Inventory upserted', 201);
  } catch (err) {
    next(err);
  }
}

async function adjustInventory(req, res, next) {
  const { getClient } = require('../../config/db');
  const client = await getClient();
  try {
    const { quantity, type, reference_id } = req.body;
    if (!quantity || !type) return ApiResponse.error(res, 'quantity and type are required', 400);

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE inventory SET quantity_on_hand = quantity_on_hand + $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [quantity, req.params.id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiResponse.error(res, 'Inventory record not found', 404);
    }

    await client.query(
      `INSERT INTO inventory_movements (inventory_id, quantity, type, reference_id)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, quantity, type, reference_id]
    );

    // Check alert thresholds after adjustment
    await client.query(
      `UPDATE inventory_alerts SET is_triggered = TRUE
       WHERE inventory_id = $1 AND threshold >= $2`,
      [req.params.id, result.rows[0].quantity_on_hand]
    );

    await client.query('COMMIT');
    return ApiResponse.success(res, result.rows[0], 'Inventory adjusted');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ---- inventory_alerts ----

async function setAlert(req, res, next) {
  try {
    const { threshold } = req.body;
    if (threshold === undefined) return ApiResponse.error(res, 'threshold is required', 400);

    const result = await query(
      `INSERT INTO inventory_alerts (inventory_id, threshold) VALUES ($1, $2) RETURNING *`,
      [req.params.id, threshold]
    );
    return ApiResponse.success(res, result.rows[0], 'Alert threshold set', 201);
  } catch (err) {
    next(err);
  }
}

async function listTriggeredAlerts(req, res, next) {
  try {
    const result = await query(
      `SELECT ia.*, i.quantity_on_hand, i.warehouse_id, pv.sku
       FROM inventory_alerts ia
       JOIN inventory i ON i.id = ia.inventory_id
       JOIN product_variants pv ON pv.id = i.variant_id
       WHERE ia.is_triggered = TRUE`
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listInventory, getInventoryById, upsertInventory, adjustInventory,
  setAlert, listTriggeredAlerts,
};