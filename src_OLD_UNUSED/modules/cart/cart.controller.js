// Handles carts and cart_items
// Business rule: each user has a single cart (created at registration), so
// most operations resolve the cart from req.user.id rather than a cart id param.
const ApiResponse = require('../../utils/apiResponse');
const { query, getClient } = require('../../config/db');

async function getOrCreateCart(userId) {
  const existing = await query(`SELECT * FROM carts WHERE user_id = $1`, [userId]);
  if (existing.rows.length > 0) return existing.rows[0];

  const created = await query(`INSERT INTO carts (user_id) VALUES ($1) RETURNING *`, [userId]);
  return created.rows[0];
}

async function getMyCart(req, res, next) {
  try {
    const cart = await getOrCreateCart(req.user.id);

    const itemsResult = await query(
      `SELECT ci.id, ci.quantity, pv.id AS variant_id, pv.sku, pv.price,
              p.id AS product_id, p.name AS product_name,
              (SELECT image_url FROM product_images WHERE product_id = p.id AND is_featured = TRUE LIMIT 1) AS image
       FROM cart_items ci
       JOIN product_variants pv ON pv.id = ci.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE ci.cart_id = $1
       ORDER BY ci.created_at DESC`,
      [cart.id]
    );

    const items = itemsResult.rows;
    const subtotal = items.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);

    return ApiResponse.success(res, { cart, items, subtotal });
  } catch (err) {
    next(err);
  }
}

// Adds an item to the cart, or increases quantity if the variant already exists in it
async function addItem(req, res, next) {
  const client = await getClient();
  try {
    const { variant_id, quantity } = req.body;
    if (!variant_id || !quantity || quantity < 1) {
      return ApiResponse.error(res, 'variant_id and a positive quantity are required', 400);
    }

    await client.query('BEGIN');
    const cart = await getOrCreateCart(req.user.id);

    const existing = await client.query(
      `SELECT * FROM cart_items WHERE cart_id = $1 AND variant_id = $2`,
      [cart.id, variant_id]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await client.query(
        `UPDATE cart_items SET quantity = quantity + $1 WHERE id = $2 RETURNING *`,
        [quantity, existing.rows[0].id]
      );
    } else {
      result = await client.query(
        `INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES ($1,$2,$3) RETURNING *`,
        [cart.id, variant_id, quantity]
      );
    }

    await client.query(`UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [cart.id]);
    await client.query('COMMIT');

    return ApiResponse.success(res, result.rows[0], 'Item added to cart', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function updateItemQuantity(req, res, next) {
  try {
    const { quantity } = req.body;
    if (!quantity || quantity < 1) return ApiResponse.error(res, 'A positive quantity is required', 400);

    const cart = await getOrCreateCart(req.user.id);

    const result = await query(
      `UPDATE cart_items SET quantity = $1 WHERE id = $2 AND cart_id = $3 RETURNING *`,
      [quantity, req.params.itemId, cart.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Cart item not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Cart item updated');
  } catch (err) {
    next(err);
  }
}

async function removeItem(req, res, next) {
  try {
    const cart = await getOrCreateCart(req.user.id);

    const result = await query(
      `DELETE FROM cart_items WHERE id = $1 AND cart_id = $2 RETURNING id`,
      [req.params.itemId, cart.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Cart item not found', 404);
    return ApiResponse.success(res, null, 'Item removed from cart');
  } catch (err) {
    next(err);
  }
}

async function clearCart(req, res, next) {
  try {
    const cart = await getOrCreateCart(req.user.id);
    await query(`DELETE FROM cart_items WHERE cart_id = $1`, [cart.id]);
    return ApiResponse.success(res, null, 'Cart cleared');
  } catch (err) {
    next(err);
  }
}

module.exports = { getMyCart, addItem, updateItemQuantity, removeItem, clearCart, getOrCreateCart };