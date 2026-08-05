// Powers three recommendation algorithms for the storefront:
// 1. Trending/Viral - products with the most views in a recent time window
// 2. Related products - same category as a given product (content-based)
// 3. People Also Bought - co-purchase analysis from past orders (collaborative filtering)
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');

// Records a single product view. Called whenever a product detail page loads.
async function recordView(req, res, next) {
  try {
    const { product_id } = req.body;
    if (!product_id) return ApiResponse.error(res, 'product_id is required', 400);

    await query(
      `INSERT INTO product_views (product_id, user_id, device_id) VALUES ($1, $2, $3)`,
      [product_id, req.user?.id || null, req.deviceId || null]
    );

    return ApiResponse.success(res, null, 'View recorded', 201);
  } catch (err) {
    next(err);
  }
}

// Algorithm 1: Trending/Viral products - counts views in the last 48 hours
// (a sliding window), ranks products by that count, descending.
async function getTrendingProducts(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;

    const result = await query(
      `SELECT p.id, p.name, p.slug, p.status,
              (SELECT image_url FROM product_images WHERE product_id = p.id AND is_featured = TRUE LIMIT 1) AS featured_image,
              (SELECT MIN(price) FROM product_variants WHERE product_id = p.id) AS min_price,
              COUNT(pv.id) AS view_count
       FROM products p
       JOIN product_views pv ON pv.product_id = p.id
       WHERE p.status = 'published'
         AND pv.created_at >= CURRENT_TIMESTAMP - INTERVAL '48 hours'
       GROUP BY p.id
       ORDER BY view_count DESC
       LIMIT $1`,
      [limit]
    );

    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

// Algorithm 2: Related products - content-based filtering by shared category.
// Given a product, finds other published products sharing at least one category.
async function getRelatedProducts(req, res, next) {
  try {
    const { productId } = req.params;
    const limit = parseInt(req.query.limit, 10) || 10;

    const result = await query(
      `SELECT DISTINCT p.id, p.name, p.slug, p.status,
              (SELECT image_url FROM product_images WHERE product_id = p.id AND is_featured = TRUE LIMIT 1) AS featured_image,
              (SELECT MIN(price) FROM product_variants WHERE product_id = p.id) AS min_price
       FROM products p
       JOIN product_categories pc ON pc.product_id = p.id
       WHERE p.status = 'published'
         AND p.id != $1
         AND pc.category_id IN (
           SELECT category_id FROM product_categories WHERE product_id = $1
         )
       LIMIT $2`,
      [productId, limit]
    );

    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

// Algorithm 3: People Also Bought - collaborative filtering via co-purchase analysis.
// Finds other products that appeared in the same orders as the given product.
async function getAlsoBoughtProducts(req, res, next) {
  try {
    const { productId } = req.params;
    const limit = parseInt(req.query.limit, 10) || 10;

    const result = await query(
      `SELECT p.id, p.name, p.slug, p.status,
              (SELECT image_url FROM product_images WHERE product_id = p.id AND is_featured = TRUE LIMIT 1) AS featured_image,
              (SELECT MIN(price) FROM product_variants WHERE product_id = p.id) AS min_price,
              COUNT(*) AS co_purchase_count
       FROM order_items oi1
       JOIN order_items oi2 ON oi2.order_id = oi1.order_id AND oi2.variant_id != oi1.variant_id
       JOIN product_variants pv1 ON pv1.id = oi1.variant_id
       JOIN product_variants pv2 ON pv2.id = oi2.variant_id
       JOIN products p ON p.id = pv2.product_id
       WHERE pv1.product_id = $1
         AND p.status = 'published'
       GROUP BY p.id
       ORDER BY co_purchase_count DESC
       LIMIT $2`,
      [productId, limit]
    );

    // Fallback: if no co-purchase history exists yet (new store), show same-category products instead
    if (result.rows.length === 0) {
      const fallback = await query(
        `SELECT DISTINCT p.id, p.name, p.slug, p.status,
                (SELECT image_url FROM product_images WHERE product_id = p.id AND is_featured = TRUE LIMIT 1) AS featured_image,
                (SELECT MIN(price) FROM product_variants WHERE product_id = p.id) AS min_price
         FROM products p
         JOIN product_categories pc ON pc.product_id = p.id
         WHERE p.status = 'published'
           AND p.id != $1
           AND pc.category_id IN (SELECT category_id FROM product_categories WHERE product_id = $1)
         LIMIT $2`,
        [productId, limit]
      );
      return ApiResponse.success(res, fallback.rows);
    }

    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { recordView, getTrendingProducts, getRelatedProducts, getAlsoBoughtProducts };