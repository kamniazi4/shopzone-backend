// Handles order_vendor_splits, order_discounts, order_taxes read/management
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');

async function listOrderSplits(req, res, next) {
  try {
    const result = await query(
      `SELECT ovs.*, v.business_name AS vendor_name
       FROM order_vendor_splits ovs
       JOIN vendors v ON v.id = ovs.vendor_id
       WHERE ovs.order_id = $1`,
      [req.params.id]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

// Marks a vendor's split as paid out and credits their wallet
async function markSplitPaid(req, res, next) {
  const { getClient } = require('../../config/db');
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const splitResult = await client.query(
      `UPDATE order_vendor_splits SET status = 'paid' WHERE id = $1 AND status = 'pending' RETURNING *`,
      [req.params.splitId]
    );

    if (splitResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiResponse.error(res, 'Pending split not found', 404);
    }

    const split = splitResult.rows[0];

    await client.query(
      `UPDATE vendor_wallets SET balance = balance + $1, withdrawable_balance = withdrawable_balance + $1,
       updated_at = CURRENT_TIMESTAMP WHERE vendor_id = $2`,
      [split.vendor_payout, split.vendor_id]
    );

    await client.query(
      `INSERT INTO vendor_transactions (vendor_id, amount, type, description, reference_id)
       VALUES ($1, $2, 'credit', 'Order payout', $3)`,
      [split.vendor_id, split.vendor_payout, `order-${split.order_id}`]
    );

    await client.query('COMMIT');
    return ApiResponse.success(res, split, 'Vendor split marked as paid');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ---- order_taxes ----

async function addOrderTax(req, res, next) {
  try {
    const { tax_name, rate, amount } = req.body;
    if (!tax_name || rate === undefined || amount === undefined) {
      return ApiResponse.error(res, 'tax_name, rate and amount are required', 400);
    }

    const result = await query(
      `INSERT INTO order_taxes (order_id, tax_name, rate, amount) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, tax_name, rate, amount]
    );
    return ApiResponse.success(res, result.rows[0], 'Tax line added', 201);
  } catch (err) {
    next(err);
  }
}

async function listOrderTaxes(req, res, next) {
  try {
    const result = await query(`SELECT * FROM order_taxes WHERE order_id = $1`, [req.params.id]);
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { listOrderSplits, markSplitPaid, addOrderTax, listOrderTaxes };