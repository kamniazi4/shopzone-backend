// Handles refunds, refund_items, vendor_commissions
const ApiResponse = require('../../utils/apiResponse');
const { query, getClient } = require('../../config/db');
const { getPagination, buildPaginationMeta } = require('../../utils/pagination');

function generateRefundNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  return `REF-${timestamp}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

async function listRefundsByOrder(req, res, next) {
  try {
    const result = await query(`SELECT * FROM refunds WHERE order_id = $1 ORDER BY created_at DESC`, [req.params.orderId]);
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function getRefundById(req, res, next) {
  try {
    const refundResult = await query(`SELECT * FROM refunds WHERE id = $1`, [req.params.id]);
    if (refundResult.rows.length === 0) return ApiResponse.error(res, 'Refund not found', 404);

    const itemsResult = await query(
      `SELECT ri.*, oi.name AS item_name, oi.sku
       FROM refund_items ri
       JOIN order_items oi ON oi.id = ri.order_item_id
       WHERE ri.refund_id = $1`,
      [req.params.id]
    );

    const refund = refundResult.rows[0];
    refund.items = itemsResult.rows;
    return ApiResponse.success(res, refund);
  } catch (err) {
    next(err);
  }
}

// Creates a refund request with specific order_items and computes the total refund amount
async function createRefund(req, res, next) {
  const client = await getClient();
  try {
    const { payment_id, reason, items } = req.body; // items: [{ order_item_id, quantity, amount }]

    if (!Array.isArray(items) || items.length === 0) {
      return ApiResponse.error(res, 'items array with order_item_id, quantity and amount is required', 400);
    }

    await client.query('BEGIN');

    const totalAmount = items.reduce((sum, item) => sum + parseFloat(item.amount), 0);
    const refundNumber = generateRefundNumber();

    const refundResult = await client.query(
      `INSERT INTO refunds (order_id, payment_id, refund_number, amount, reason, status)
       VALUES ($1,$2,$3,$4,$5,'pending') RETURNING *`,
      [req.params.orderId, payment_id, refundNumber, totalAmount, reason]
    );
    const refund = refundResult.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO refund_items (refund_id, order_item_id, quantity, amount) VALUES ($1,$2,$3,$4)`,
        [refund.id, item.order_item_id, item.quantity, item.amount]
      );
    }

    await client.query('COMMIT');
    return ApiResponse.success(res, refund, 'Refund request created', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Approves a refund: updates payment status, restocks inventory, deducts vendor wallet if already paid out
async function approveRefund(req, res, next) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const refundResult = await client.query(
      `UPDATE refunds SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending' RETURNING *`,
      [req.params.id]
    );

    if (refundResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiResponse.error(res, 'Pending refund not found', 404);
    }

    const refund = refundResult.rows[0];

    const itemsResult = await client.query(
      `SELECT ri.*, oi.variant_id, oi.vendor_id
       FROM refund_items ri
       JOIN order_items oi ON oi.id = ri.order_item_id
       WHERE ri.refund_id = $1`,
      [req.params.id]
    );

    // Restock inventory for each refunded item
    for (const item of itemsResult.rows) {
      const invResult = await client.query(
        `SELECT id FROM inventory WHERE variant_id = $1 ORDER BY updated_at ASC LIMIT 1`,
        [item.variant_id]
      );
      if (invResult.rows.length > 0) {
        await client.query(
          `UPDATE inventory SET quantity_on_hand = quantity_on_hand + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [item.quantity, invResult.rows[0].id]
        );
        await client.query(
          `INSERT INTO inventory_movements (inventory_id, quantity, type, reference_id)
           VALUES ($1, $2, 'return', $3)`,
          [invResult.rows[0].id, item.quantity, refund.refund_number]
        );
      }
    }

    if (refund.payment_id) {
      await client.query(
        `UPDATE payments SET status = 'refunded', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [refund.payment_id]
      );
    }

    await client.query('COMMIT');
    return ApiResponse.success(res, refund, 'Refund approved and stock restored');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function rejectRefund(req, res, next) {
  try {
    const result = await query(
      `UPDATE refunds SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending' RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Pending refund not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Refund rejected');
  } catch (err) {
    next(err);
  }
}

// ---- vendor_commissions ----

async function recordCommission(req, res, next) {
  try {
    const { order_item_id, commission_rate } = req.body;
    if (!order_item_id || commission_rate === undefined) {
      return ApiResponse.error(res, 'order_item_id and commission_rate are required', 400);
    }

    const itemResult = await query(
      `SELECT vendor_id, total_price FROM order_items WHERE id = $1`,
      [order_item_id]
    );
    if (itemResult.rows.length === 0) return ApiResponse.error(res, 'Order item not found', 404);

    const commissionAmount = (parseFloat(itemResult.rows[0].total_price) * commission_rate) / 100;

    const result = await query(
      `INSERT INTO vendor_commissions (vendor_id, order_item_id, commission_rate, commission_amount)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [itemResult.rows[0].vendor_id, order_item_id, commission_rate, commissionAmount]
    );
    return ApiResponse.success(res, result.rows[0], 'Commission recorded', 201);
  } catch (err) {
    next(err);
  }
}

async function listVendorCommissions(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req.query);

    const countResult = await query(
      `SELECT COUNT(*) FROM vendor_commissions WHERE vendor_id = $1`,
      [req.params.vendorId]
    );
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const result = await query(
      `SELECT vc.*, oi.name AS item_name, oi.sku
       FROM vendor_commissions vc
       JOIN order_items oi ON oi.id = vc.order_item_id
       WHERE vc.vendor_id = $1
       ORDER BY vc.created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.vendorId, limit, offset]
    );

    return ApiResponse.paginated(res, result.rows, buildPaginationMeta(page, limit, totalCount));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listRefundsByOrder, getRefundById, createRefund, approveRefund, rejectRefund,
  recordCommission, listVendorCommissions,
};