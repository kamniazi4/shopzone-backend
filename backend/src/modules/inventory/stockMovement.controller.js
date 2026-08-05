// Handles inventory_movements (read/history) and inventory_reservations
const ApiResponse = require('../../utils/apiResponse');
const { query, getClient } = require('../../config/db');
const { getPagination, buildPaginationMeta } = require('../../utils/pagination');

async function listMovements(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req.query);

    const countResult = await query(
      `SELECT COUNT(*) FROM inventory_movements WHERE inventory_id = $1`,
      [req.params.id]
    );
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const result = await query(
      `SELECT * FROM inventory_movements WHERE inventory_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );

    return ApiResponse.paginated(res, result.rows, buildPaginationMeta(page, limit, totalCount));
  } catch (err) {
    next(err);
  }
}

// ---- inventory_reservations ----
// Used to hold stock temporarily while a customer is checking out

async function createReservation(req, res, next) {
  const client = await getClient();
  try {
    const { quantity, expires_at } = req.body;
    if (!quantity || !expires_at) {
      return ApiResponse.error(res, 'quantity and expires_at are required', 400);
    }

    await client.query('BEGIN');

    const invResult = await client.query(
      `SELECT * FROM inventory WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (invResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiResponse.error(res, 'Inventory record not found', 404);
    }

    const available = invResult.rows[0].quantity_on_hand - invResult.rows[0].quantity_reserved;
    if (available < quantity) {
      await client.query('ROLLBACK');
      return ApiResponse.error(res, 'Insufficient available stock to reserve', 400);
    }

    await client.query(
      `UPDATE inventory SET quantity_reserved = quantity_reserved + $1 WHERE id = $2`,
      [quantity, req.params.id]
    );

    const reservation = await client.query(
      `INSERT INTO inventory_reservations (inventory_id, quantity, expires_at, status)
       VALUES ($1, $2, $3, 'pending') RETURNING *`,
      [req.params.id, quantity, expires_at]
    );

    await client.query('COMMIT');
    return ApiResponse.success(res, reservation.rows[0], 'Stock reserved', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Releases a reservation: frees reserved quantity without deducting on-hand stock
async function releaseReservation(req, res, next) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const resResult = await client.query(
      `SELECT * FROM inventory_reservations WHERE id = $1 AND status = 'pending'`,
      [req.params.reservationId]
    );
    if (resResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiResponse.error(res, 'Pending reservation not found', 404);
    }
    const reservation = resResult.rows[0];

    await client.query(
      `UPDATE inventory SET quantity_reserved = quantity_reserved - $1 WHERE id = $2`,
      [reservation.quantity, reservation.inventory_id]
    );

    const updated = await client.query(
      `UPDATE inventory_reservations SET status = 'expired' WHERE id = $1 RETURNING *`,
      [req.params.reservationId]
    );

    await client.query('COMMIT');
    return ApiResponse.success(res, updated.rows[0], 'Reservation released');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Completes a reservation: deducts on-hand stock permanently (called on order confirmation)
async function completeReservation(req, res, next) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const resResult = await client.query(
      `SELECT * FROM inventory_reservations WHERE id = $1 AND status = 'pending'`,
      [req.params.reservationId]
    );
    if (resResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiResponse.error(res, 'Pending reservation not found', 404);
    }
    const reservation = resResult.rows[0];

    await client.query(
      `UPDATE inventory
       SET quantity_on_hand = quantity_on_hand - $1, quantity_reserved = quantity_reserved - $1
       WHERE id = $2`,
      [reservation.quantity, reservation.inventory_id]
    );

    await client.query(
      `INSERT INTO inventory_movements (inventory_id, quantity, type, reference_id)
       VALUES ($1, $2, 'sale', $3)`,
      [reservation.inventory_id, -reservation.quantity, `reservation-${reservation.id}`]
    );

    const updated = await client.query(
      `UPDATE inventory_reservations SET status = 'completed' WHERE id = $1 RETURNING *`,
      [req.params.reservationId]
    );

    await client.query('COMMIT');
    return ApiResponse.success(res, updated.rows[0], 'Reservation completed');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { listMovements, createReservation, releaseReservation, completeReservation };