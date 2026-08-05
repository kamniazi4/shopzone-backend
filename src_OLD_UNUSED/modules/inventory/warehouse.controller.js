// CRUD for warehouses and warehouse_transfers
const ApiResponse = require('../../utils/apiResponse');
const { query, getClient } = require('../../config/db');

async function listWarehouses(req, res, next) {
  try {
    const { vendor_id } = req.query;
    const conditions = [];
    const params = [];

    if (vendor_id) {
      params.push(vendor_id);
      conditions.push(`vendor_id = $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(`SELECT * FROM warehouses ${whereClause} ORDER BY created_at DESC`, params);
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function getWarehouseById(req, res, next) {
  try {
    const result = await query(`SELECT * FROM warehouses WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Warehouse not found', 404);
    return ApiResponse.success(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function createWarehouse(req, res, next) {
  try {
    const { vendor_id, name, location, is_active } = req.body;
    if (!name) return ApiResponse.error(res, 'name is required', 400);

    const result = await query(
      `INSERT INTO warehouses (vendor_id, name, location, is_active)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [vendor_id || null, name, location, is_active !== undefined ? is_active : true]
    );
    return ApiResponse.success(res, result.rows[0], 'Warehouse created', 201);
  } catch (err) {
    next(err);
  }
}

async function updateWarehouse(req, res, next) {
  try {
    const { name, location, is_active } = req.body;
    const result = await query(
      `UPDATE warehouses SET
        name = COALESCE($1, name),
        location = COALESCE($2, location),
        is_active = COALESCE($3, is_active)
       WHERE id = $4 RETURNING *`,
      [name, location, is_active, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Warehouse not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Warehouse updated');
  } catch (err) {
    next(err);
  }
}

async function deleteWarehouse(req, res, next) {
  try {
    const result = await query(`DELETE FROM warehouses WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Warehouse not found', 404);
    return ApiResponse.success(res, null, 'Warehouse deleted');
  } catch (err) {
    next(err);
  }
}

// ---- warehouse_transfers ----

async function listTransfers(req, res, next) {
  try {
    const result = await query(
      `SELECT wt.*, w1.name AS from_warehouse_name, w2.name AS to_warehouse_name
       FROM warehouse_transfers wt
       JOIN warehouses w1 ON w1.id = wt.from_warehouse_id
       JOIN warehouses w2 ON w2.id = wt.to_warehouse_id
       WHERE wt.from_warehouse_id = $1 OR wt.to_warehouse_id = $1
       ORDER BY wt.created_at DESC`,
      [req.params.id]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

// Creates a transfer request and moves stock atomically once marked completed
async function createTransfer(req, res, next) {
  try {
    const { from_warehouse_id, to_warehouse_id, variant_id, quantity } = req.body;
    if (!from_warehouse_id || !to_warehouse_id || !variant_id || !quantity) {
      return ApiResponse.error(res, 'from_warehouse_id, to_warehouse_id, variant_id and quantity are required', 400);
    }

    const result = await query(
      `INSERT INTO warehouse_transfers (from_warehouse_id, to_warehouse_id, variant_id, quantity)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [from_warehouse_id, to_warehouse_id, variant_id, quantity]
    );
    return ApiResponse.success(res, result.rows[0], 'Transfer request created', 201);
  } catch (err) {
    next(err);
  }
}

async function completeTransfer(req, res, next) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const transferResult = await client.query(
      `SELECT * FROM warehouse_transfers WHERE id = $1 AND status = 'pending'`,
      [req.params.id]
    );
    if (transferResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiResponse.error(res, 'Pending transfer not found', 404);
    }
    const transfer = transferResult.rows[0];

    // Decrease stock at source warehouse
    const sourceInv = await client.query(
      `SELECT * FROM inventory WHERE warehouse_id = $1 AND variant_id = $2`,
      [transfer.from_warehouse_id, transfer.variant_id]
    );
    if (sourceInv.rows.length === 0 || sourceInv.rows[0].quantity_on_hand < transfer.quantity) {
      await client.query('ROLLBACK');
      return ApiResponse.error(res, 'Insufficient stock at source warehouse', 400);
    }

    await client.query(
      `UPDATE inventory SET quantity_on_hand = quantity_on_hand - $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [transfer.quantity, sourceInv.rows[0].id]
    );

    await client.query(
      `INSERT INTO inventory_movements (inventory_id, quantity, type, reference_id)
       VALUES ($1, $2, 'transfer_out', $3)`,
      [sourceInv.rows[0].id, -transfer.quantity, `transfer-${transfer.id}`]
    );

    // Increase (or create) stock at destination warehouse
    const destInv = await client.query(
      `SELECT * FROM inventory WHERE warehouse_id = $1 AND variant_id = $2`,
      [transfer.to_warehouse_id, transfer.variant_id]
    );

    let destInventoryId;
    if (destInv.rows.length === 0) {
      const newInv = await client.query(
        `INSERT INTO inventory (warehouse_id, variant_id, quantity_on_hand)
         VALUES ($1, $2, $3) RETURNING id`,
        [transfer.to_warehouse_id, transfer.variant_id, transfer.quantity]
      );
      destInventoryId = newInv.rows[0].id;
    } else {
      await client.query(
        `UPDATE inventory SET quantity_on_hand = quantity_on_hand + $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [transfer.quantity, destInv.rows[0].id]
      );
      destInventoryId = destInv.rows[0].id;
    }

    await client.query(
      `INSERT INTO inventory_movements (inventory_id, quantity, type, reference_id)
       VALUES ($1, $2, 'transfer_in', $3)`,
      [destInventoryId, transfer.quantity, `transfer-${transfer.id}`]
    );

    const updatedTransfer = await client.query(
      `UPDATE warehouse_transfers SET status = 'completed' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    await client.query('COMMIT');
    return ApiResponse.success(res, updatedTransfer.rows[0], 'Transfer completed');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = {
  listWarehouses, getWarehouseById, createWarehouse, updateWarehouse, deleteWarehouse,
  listTransfers, createTransfer, completeTransfer,
};