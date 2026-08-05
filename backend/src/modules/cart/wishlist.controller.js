// Handles wishlists and wishlist_items
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');

async function listMyWishlists(req, res, next) {
  try {
    const result = await query(
      `SELECT * FROM wishlists WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function createWishlist(req, res, next) {
  try {
    const { name } = req.body;
    const result = await query(
      `INSERT INTO wishlists (user_id, name) VALUES ($1, $2) RETURNING *`,
      [req.user.id, name || 'My Wishlist']
    );
    return ApiResponse.success(res, result.rows[0], 'Wishlist created', 201);
  } catch (err) {
    next(err);
  }
}

async function getWishlistItems(req, res, next) {
  try {
    // Ensure the wishlist belongs to the requesting user
    const ownerCheck = await query(
      `SELECT id FROM wishlists WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (ownerCheck.rows.length === 0) return ApiResponse.error(res, 'Wishlist not found', 404);

    const result = await query(
      `SELECT wi.id, wi.created_at, pv.id AS variant_id, pv.sku, pv.price,
              p.id AS product_id, p.name AS product_name
       FROM wishlist_items wi
       JOIN product_variants pv ON pv.id = wi.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE wi.wishlist_id = $1`,
      [req.params.id]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function addWishlistItem(req, res, next) {
  try {
    const { variant_id } = req.body;
    if (!variant_id) return ApiResponse.error(res, 'variant_id is required', 400);

    const ownerCheck = await query(
      `SELECT id FROM wishlists WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (ownerCheck.rows.length === 0) return ApiResponse.error(res, 'Wishlist not found', 404);

    const result = await query(
      `INSERT INTO wishlist_items (wishlist_id, variant_id) VALUES ($1, $2) RETURNING *`,
      [req.params.id, variant_id]
    );
    return ApiResponse.success(res, result.rows[0], 'Item added to wishlist', 201);
  } catch (err) {
    next(err);
  }
}

async function removeWishlistItem(req, res, next) {
  try {
    const ownerCheck = await query(
      `SELECT id FROM wishlists WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (ownerCheck.rows.length === 0) return ApiResponse.error(res, 'Wishlist not found', 404);

    const result = await query(
      `DELETE FROM wishlist_items WHERE id = $1 AND wishlist_id = $2 RETURNING id`,
      [req.params.itemId, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Wishlist item not found', 404);
    return ApiResponse.success(res, null, 'Item removed from wishlist');
  } catch (err) {
    next(err);
  }
}

async function deleteWishlist(req, res, next) {
  try {
    const result = await query(
      `DELETE FROM wishlists WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Wishlist not found', 404);
    return ApiResponse.success(res, null, 'Wishlist deleted');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listMyWishlists, createWishlist, getWishlistItems,
  addWishlistItem, removeWishlistItem, deleteWishlist,
};