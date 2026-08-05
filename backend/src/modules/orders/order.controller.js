// Handles orders, order_items, order_status_history, order_snapshots, dropship_orders
// This module contains the core checkout flow: cart -> order with multi-vendor split
const ApiResponse = require('../../utils/apiResponse');
const { query, getClient } = require('../../config/db');
const { getPagination, buildPaginationMeta } = require('../../utils/pagination');
const { getOrCreateCart } = require('../cart/cart.controller');

function generateOrderNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `ORD-${timestamp}-${random}`;
}

// Main checkout function: converts the current cart into an order.
// Steps: validate stock -> compute totals -> create order -> create order_items ->
// split order by vendor -> apply coupon (if any) -> reserve/deduct stock -> clear cart.
async function checkout(req, res, next) {
  const client = await getClient();
  try {
    const { shipping_address_id, billing_address_id, coupon_code } = req.body;

    if (!shipping_address_id) {
      return ApiResponse.error(res, 'shipping_address_id is required', 400);
    }

    await client.query('BEGIN');

    const cart = await getOrCreateCart(req.deviceId, req.user.id);

    const cartItemsResult = await client.query(
      `SELECT ci.quantity, pv.id AS variant_id, pv.sku, pv.price,
              p.id AS product_id, p.name AS product_name, p.vendor_id
       FROM cart_items ci
       JOIN product_variants pv ON pv.id = ci.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE ci.cart_id = $1`,
      [cart.id]
    );

    const cartItems = cartItemsResult.rows;
    if (cartItems.length === 0) {
      await client.query('ROLLBACK');
      return ApiResponse.error(res, 'Cart is empty', 400);
    }

    // Validate stock availability for every item before committing anything
    for (const item of cartItems) {
      const stockResult = await client.query(
        `SELECT COALESCE(SUM(quantity_on_hand - quantity_reserved), 0) AS available
         FROM inventory WHERE variant_id = $1`,
        [item.variant_id]
      );
      const available = parseInt(stockResult.rows[0].available, 10);
      if (available < item.quantity) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, `Insufficient stock for SKU ${item.sku}`, 400);
      }
    }

    const subtotal = cartItems.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);
    let discountAmount = 0;
    let appliedCoupon = null;

    // Validate and apply coupon if provided
    if (coupon_code) {
      const couponResult = await client.query(
        `SELECT * FROM coupons WHERE code = $1
         AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
         AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)`,
        [coupon_code]
      );

      if (couponResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Invalid or expired coupon code', 400);
      }

      appliedCoupon = couponResult.rows[0];

      if (subtotal < appliedCoupon.min_order_amount) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, `Minimum order amount for this coupon is ${appliedCoupon.min_order_amount}`, 400);
      }

      // Check usage limit
      if (appliedCoupon.usage_limit) {
        const usageCount = await client.query(
          `SELECT COUNT(*) FROM coupon_usages WHERE coupon_id = $1`,
          [appliedCoupon.id]
        );
        if (parseInt(usageCount.rows[0].count, 10) >= appliedCoupon.usage_limit) {
          await client.query('ROLLBACK');
          return ApiResponse.error(res, 'Coupon usage limit reached', 400);
        }
      }

      discountAmount = appliedCoupon.discount_type === 'percentage'
        ? subtotal * (appliedCoupon.discount_value / 100)
        : appliedCoupon.discount_value;

      if (appliedCoupon.max_discount_amount) {
        discountAmount = Math.min(discountAmount, appliedCoupon.max_discount_amount);
      }
    }

    const shippingFee = 0.00; // Vendor-level shipping fee is computed per split below
    const taxAmount = 0.00; // Tax calculation can be plugged in via order_taxes if needed
    const totalAmount = subtotal - discountAmount + shippingFee + taxAmount;

    const orderNumber = generateOrderNumber();

    const orderResult = await client.query(
      `INSERT INTO orders
       (user_id, shipping_address_id, billing_address_id, order_number,
        total_amount, subtotal, shipping_fee, tax_amount, discount_amount, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
       RETURNING *`,
      [req.user.id, shipping_address_id, billing_address_id || shipping_address_id,
        orderNumber, totalAmount, subtotal, shippingFee, taxAmount, discountAmount]
    );
    const order = orderResult.rows[0];

    // Create order_items and deduct stock for each item
    const orderItemsCreated = [];
    for (const item of cartItems) {
      const totalPrice = parseFloat(item.price) * item.quantity;

      const orderItemResult = await client.query(
        `INSERT INTO order_items (order_id, variant_id, vendor_id, sku, name, price, quantity, total_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [order.id, item.variant_id, item.vendor_id, item.sku, item.product_name,
          item.price, item.quantity, totalPrice]
      );
      orderItemsCreated.push(orderItemResult.rows[0]);

      // Deduct stock directly (FIFO across warehouses could be added later)
      const invResult = await client.query(
        `SELECT id, quantity_on_hand FROM inventory
         WHERE variant_id = $1 AND (quantity_on_hand - quantity_reserved) >= $2
         ORDER BY quantity_on_hand DESC LIMIT 1`,
        [item.variant_id, item.quantity]
      );

      if (invResult.rows.length > 0) {
        await client.query(
          `UPDATE inventory SET quantity_on_hand = quantity_on_hand - $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [item.quantity, invResult.rows[0].id]
        );
        await client.query(
          `INSERT INTO inventory_movements (inventory_id, quantity, type, reference_id)
           VALUES ($1, $2, 'sale', $3)`,
          [invResult.rows[0].id, -item.quantity, orderNumber]
        );
      }
    }

    // Split order by vendor for payout tracking
    const vendorGroups = {};
    for (const item of cartItems) {
      if (!vendorGroups[item.vendor_id]) vendorGroups[item.vendor_id] = { subtotal: 0 };
      vendorGroups[item.vendor_id].subtotal += parseFloat(item.price) * item.quantity;
    }

    for (const vendorId of Object.keys(vendorGroups)) {
      const vendorSubtotal = vendorGroups[vendorId].subtotal;
      const vendorShare = subtotal > 0 ? vendorSubtotal / subtotal : 0;
      const vendorDiscount = discountAmount * vendorShare;
      const vendorPayout = vendorSubtotal - vendorDiscount;

      await client.query(
        `INSERT INTO order_vendor_splits
         (order_id, vendor_id, subtotal, shipping_fee, tax_amount, commission_amount, vendor_payout, status)
         VALUES ($1,$2,$3,0,0,0,$4,'pending')`,
        [order.id, vendorId, vendorSubtotal, vendorPayout]
      );
    }

    // Record discount usage
    if (appliedCoupon) {
      await client.query(
        `INSERT INTO order_discounts (order_id, coupon_id, amount) VALUES ($1, $2, $3)`,
        [order.id, appliedCoupon.id, discountAmount]
      );
      await client.query(
        `INSERT INTO coupon_usages (coupon_id, user_id, order_id) VALUES ($1, $2, $3)`,
        [appliedCoupon.id, req.user.id, order.id]
      );
    }

    // Snapshot the order state at time of purchase (for audit/history)
    await client.query(
      `INSERT INTO order_snapshots (order_id, snapshot_data) VALUES ($1, $2)`,
      [order.id, JSON.stringify({ order, items: orderItemsCreated })]
    );

    await client.query(
      `INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, 'pending', $2)`,
      [order.id, req.user.id]
    );

    // Clear the cart after successful checkout
    await client.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cart.id]);

    await client.query('COMMIT');

    order.items = orderItemsCreated;
    return ApiResponse.success(res, order, 'Order placed successfully', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function listMyOrders(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req.query);

    const countResult = await query(`SELECT COUNT(*) FROM orders WHERE user_id = $1`, [req.user.id]);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const result = await query(
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    return ApiResponse.paginated(res, result.rows, buildPaginationMeta(page, limit, totalCount));
  } catch (err) {
    next(err);
  }
}

async function listAllOrders(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const { status } = req.query;

    const conditions = [];
    const params = [];
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(`SELECT COUNT(*) FROM orders ${whereClause}`, params);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const result = await query(
      `SELECT * FROM orders ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return ApiResponse.paginated(res, result.rows, buildPaginationMeta(page, limit, totalCount));
  } catch (err) {
    next(err);
  }
}

// Returns orders belonging to items sold by a specific vendor
async function listVendorOrders(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req.query);

    const countResult = await query(
      `SELECT COUNT(DISTINCT order_id) FROM order_items WHERE vendor_id = $1`,
      [req.params.vendorId]
    );
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const result = await query(
      `SELECT DISTINCT o.*
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE oi.vendor_id = $1
       ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.vendorId, limit, offset]
    );

    return ApiResponse.paginated(res, result.rows, buildPaginationMeta(page, limit, totalCount));
  } catch (err) {
    next(err);
  }
}

async function getOrderById(req, res, next) {
  try {
    const orderResult = await query(`SELECT * FROM orders WHERE id = $1`, [req.params.id]);
    if (orderResult.rows.length === 0) return ApiResponse.error(res, 'Order not found', 404);
    const order = orderResult.rows[0];

    // Authorization: owner, or a vendor/admin scope handled at route level
    if (req.user.roles.includes('customer') && order.user_id !== req.user.id) {
      return ApiResponse.error(res, 'Forbidden', 403);
    }

    const [items, splits, discounts, taxes] = await Promise.all([
      query(`SELECT * FROM order_items WHERE order_id = $1`, [req.params.id]),
      query(`SELECT * FROM order_vendor_splits WHERE order_id = $1`, [req.params.id]),
      query(`SELECT * FROM order_discounts WHERE order_id = $1`, [req.params.id]),
      query(`SELECT * FROM order_taxes WHERE order_id = $1`, [req.params.id]),
    ]);

    order.items = items.rows;
    order.vendor_splits = splits.rows;
    order.discounts = discounts.rows;
    order.taxes = taxes.rows;

    return ApiResponse.success(res, order);
  } catch (err) {
    next(err);
  }
}

// Updates order status and logs the change to order_status_history
async function updateOrderStatus(req, res, next) {
  const client = await getClient();
  try {
    const { status, notes } = req.body;
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return ApiResponse.error(res, 'Invalid status value', 400);
    }

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiResponse.error(res, 'Order not found', 404);
    }

    await client.query(
      `INSERT INTO order_status_history (order_id, status, notes, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, status, notes, req.user.id]
    );

    await client.query('COMMIT');
    return ApiResponse.success(res, result.rows[0], 'Order status updated');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function getOrderStatusHistory(req, res, next) {
  try {
    const result = await query(
      `SELECT osh.*, u.name AS changed_by_name
       FROM order_status_history osh
       LEFT JOIN users u ON u.id = osh.changed_by
       WHERE osh.order_id = $1 ORDER BY osh.created_at DESC`,
      [req.params.id]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

// ---- dropship_orders ----

async function createDropshipOrder(req, res, next) {
  try {
    const { supplier_id, supplier_order_reference } = req.body;
    const result = await query(
      `INSERT INTO dropship_orders (order_id, supplier_id, supplier_order_reference)
       VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, supplier_id, supplier_order_reference]
    );
    return ApiResponse.success(res, result.rows[0], 'Dropship order created', 201);
  } catch (err) {
    next(err);
  }
}

async function updateDropshipStatus(req, res, next) {
  try {
    const { status } = req.body;
    const result = await query(
      `UPDATE dropship_orders SET status = $1 WHERE id = $2 RETURNING *`,
      [status, req.params.dropshipId]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Dropship order not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Dropship status updated');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  checkout, listMyOrders, listAllOrders, listVendorOrders, getOrderById,
  updateOrderStatus, getOrderStatusHistory,
  createDropshipOrder, updateDropshipStatus,
};