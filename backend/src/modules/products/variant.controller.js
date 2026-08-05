// Handles product_variants, variant_attribute_values,
// product_prices, product_promotion_prices
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');

async function listVariants(req, res, next) {
  try {
    const result = await query(
      `SELECT * FROM product_variants WHERE product_id = $1 ORDER BY id`,
      [req.params.productId]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function getVariantById(req, res, next) {
  try {
    const variantResult = await query(`SELECT * FROM product_variants WHERE id = $1`, [req.params.id]);
    if (variantResult.rows.length === 0) return ApiResponse.error(res, 'Variant not found', 404);

    const attrsResult = await query(
      `SELECT a.name AS attribute_name, av.value
       FROM variant_attribute_values vav
       JOIN attribute_values av ON av.id = vav.attribute_value_id
       JOIN attributes a ON a.id = av.attribute_id
       WHERE vav.variant_id = $1`,
      [req.params.id]
    );

    const variant = variantResult.rows[0];
    variant.attributes = attrsResult.rows;
    return ApiResponse.success(res, variant);
  } catch (err) {
    next(err);
  }
}

async function createVariant(req, res, next) {
  try {
    const {
      sku, price, compare_at_price, cost_price, weight, dimensions, attribute_value_ids,
    } = req.body;

    if (!sku || !price) return ApiResponse.error(res, 'sku and price are required', 400);

    const result = await query(
      `INSERT INTO product_variants
       (product_id, sku, price, compare_at_price, cost_price, weight, dimensions)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.productId, sku, price, compare_at_price, cost_price, weight, dimensions]
    );
    const variant = result.rows[0];

    if (Array.isArray(attribute_value_ids)) {
      for (const avId of attribute_value_ids) {
        await query(
          `INSERT INTO variant_attribute_values (variant_id, attribute_value_id) VALUES ($1, $2)`,
          [variant.id, avId]
        );
      }
    }

    return ApiResponse.success(res, variant, 'Variant created', 201);
  } catch (err) {
    next(err);
  }
}

async function updateVariant(req, res, next) {
  try {
    const { sku, price, compare_at_price, cost_price, weight, dimensions } = req.body;
    const result = await query(
      `UPDATE product_variants SET
        sku = COALESCE($1, sku),
        price = COALESCE($2, price),
        compare_at_price = COALESCE($3, compare_at_price),
        cost_price = COALESCE($4, cost_price),
        weight = COALESCE($5, weight),
        dimensions = COALESCE($6, dimensions),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 RETURNING *`,
      [sku, price, compare_at_price, cost_price, weight, dimensions, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Variant not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Variant updated');
  } catch (err) {
    next(err);
  }
}

async function deleteVariant(req, res, next) {
  try {
    const result = await query(`DELETE FROM product_variants WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Variant not found', 404);
    return ApiResponse.success(res, null, 'Variant deleted');
  } catch (err) {
    next(err);
  }
}

// ---- product_prices (currency / tier pricing) ----

async function listVariantPrices(req, res, next) {
  try {
    const result = await query(
      `SELECT * FROM product_prices WHERE variant_id = $1 ORDER BY tier_qty`,
      [req.params.id]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function addVariantPrice(req, res, next) {
  try {
    const { currency, price, tier_qty } = req.body;
    if (!price) return ApiResponse.error(res, 'price is required', 400);

    const result = await query(
      `INSERT INTO product_prices (variant_id, currency, price, tier_qty)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, currency || 'USD', price, tier_qty || 1]
    );
    return ApiResponse.success(res, result.rows[0], 'Tier price added', 201);
  } catch (err) {
    next(err);
  }
}

// ---- product_promotion_prices ----

async function addPromotionPrice(req, res, next) {
  try {
    const { promotion_id, promo_price } = req.body;
    if (!promotion_id || !promo_price) {
      return ApiResponse.error(res, 'promotion_id and promo_price are required', 400);
    }

    const result = await query(
      `INSERT INTO product_promotion_prices (variant_id, promotion_id, promo_price)
       VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, promotion_id, promo_price]
    );
    return ApiResponse.success(res, result.rows[0], 'Promotion price added', 201);
  } catch (err) {
    next(err);
  }
}

// Resolves the effective sell price for a variant: active promo price takes priority over base price
async function getEffectivePrice(req, res, next) {
  try {
    const promoResult = await query(
      `SELECT ppp.promo_price
       FROM product_promotion_prices ppp
       JOIN promotions p ON p.id = ppp.promotion_id
       WHERE ppp.variant_id = $1
         AND p.status = 'active'
         AND (p.starts_at IS NULL OR p.starts_at <= CURRENT_TIMESTAMP)
         AND (p.expires_at IS NULL OR p.expires_at >= CURRENT_TIMESTAMP)
       ORDER BY ppp.promo_price ASC LIMIT 1`,
      [req.params.id]
    );

    if (promoResult.rows.length > 0) {
      return ApiResponse.success(res, { price: promoResult.rows[0].promo_price, source: 'promotion' });
    }

    const baseResult = await query(`SELECT price FROM product_variants WHERE id = $1`, [req.params.id]);
    if (baseResult.rows.length === 0) return ApiResponse.error(res, 'Variant not found', 404);

    return ApiResponse.success(res, { price: baseResult.rows[0].price, source: 'base' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listVariants, getVariantById, createVariant, updateVariant, deleteVariant,
  listVariantPrices, addVariantPrice, addPromotionPrice, getEffectivePrice,
};