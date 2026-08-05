// Handles payments, payment_events, cod_collections
const ApiResponse = require('../../utils/apiResponse');
const { query, getClient } = require('../../config/db');

async function listPaymentsByOrder(req, res, next) {
  try {
    const result = await query(
      `SELECT p.*, pg.name AS gateway_name
       FROM payments p
       LEFT JOIN payment_gateways pg ON pg.id = p.payment_gateway_id
       WHERE p.order_id = $1 ORDER BY p.created_at DESC`,
      [req.params.orderId]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function getPaymentById(req, res, next) {
  try {
    const result = await query(`SELECT * FROM payments WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Payment not found', 404);
    return ApiResponse.success(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// Initiates a payment record for an order (actual gateway charge happens client-side or via webhook)
async function initiatePayment(req, res, next) {
  try {
    const { payment_gateway_id, amount, payment_method } = req.body;
    if (!amount || !payment_method) {
      return ApiResponse.error(res, 'amount and payment_method are required', 400);
    }

    const transactionReference = `TXN-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;

    const result = await query(
      `INSERT INTO payments (order_id, payment_gateway_id, transaction_reference, amount, payment_method, status)
       VALUES ($1,$2,$3,$4,$5,'pending') RETURNING *`,
      [req.params.orderId, payment_gateway_id || null, transactionReference, amount, payment_method]
    );

    return ApiResponse.success(res, result.rows[0], 'Payment initiated', 201);
  } catch (err) {
    next(err);
  }
}

// Called by webhook or manual confirmation. Updates payment status and order status atomically.
async function confirmPayment(req, res, next) {
  const client = await getClient();
  try {
    const { status } = req.body; // 'completed' or 'failed'
    if (!['completed', 'failed', 'refunded'].includes(status)) {
      return ApiResponse.error(res, 'Invalid payment status', 400);
    }

    await client.query('BEGIN');

    const paymentResult = await client.query(
      `UPDATE payments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );

    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiResponse.error(res, 'Payment not found', 404);
    }

    const payment = paymentResult.rows[0];

    if (status === 'completed') {
      await client.query(
        `UPDATE orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [payment.order_id]
      );
      await client.query(
        `INSERT INTO order_status_history (order_id, status, notes) VALUES ($1, 'confirmed', 'Payment completed')`,
        [payment.order_id]
      );
    }

    await client.query(
      `INSERT INTO payment_events (payment_id, event_name, payload)
       VALUES ($1, $2, $3)`,
      [payment.id, `payment_${status}`, JSON.stringify(req.body)]
    );

    await client.query('COMMIT');
    return ApiResponse.success(res, payment, 'Payment status updated');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function listPaymentEvents(req, res, next) {
  try {
    const result = await query(
      `SELECT * FROM payment_events WHERE payment_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

// ---- cod_collections ----

async function recordCodCollection(req, res, next) {
  try {
    const { amount_collected, collected_by } = req.body;
    if (!amount_collected) return ApiResponse.error(res, 'amount_collected is required', 400);

    const result = await query(
      `INSERT INTO cod_collections (order_id, amount_collected, collected_by, collected_at, status)
       VALUES ($1,$2,$3,CURRENT_TIMESTAMP,'pending') RETURNING *`,
      [req.params.orderId, amount_collected, collected_by]
    );
    return ApiResponse.success(res, result.rows[0], 'COD collection recorded', 201);
  } catch (err) {
    next(err);
  }
}

async function markCodRemitted(req, res, next) {
  try {
    const result = await query(
      `UPDATE cod_collections SET status = 'remitted_to_bank' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'COD collection not found', 404);
    return ApiResponse.success(res, result.rows[0], 'COD collection marked as remitted');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPaymentsByOrder, getPaymentById, initiatePayment, confirmPayment, listPaymentEvents,
  recordCodCollection, markCodRemitted,
};