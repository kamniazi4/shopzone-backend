// CRUD for coupons and read access to coupon_usages
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');
const { getPagination, buildPaginationMeta } = require('../../utils/pagination');

async function listCoupons(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req.query);

    const countResult = await query(`SELECT COUNT(*) FROM coupons`);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const result = await query(
      `SELECT * FROM coupons ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return ApiResponse.paginated(res, result.rows, buildPaginationMeta(page, limit, totalCount));
  } catch (err) {
    next(err);
  }
}

async function getCouponByCode(req, res, next) {
  try {
    const result = await query(`SELECT * FROM coupons WHERE code = $1`, [req.params.code]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Coupon not found', 404);
    return ApiResponse.success(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function createCoupon(req, res, next) {
  try {
    const {
      code, discount_type, discount_value, min_order_amount,
      max_discount_amount, starts_at, expires_at, usage_limit,
    } = req.body;

    if (!code || !discount_type || discount_value === undefined) {
      return ApiResponse.error(res, 'code, discount_type and discount_value are required', 400);
    }
    if (!['percentage', 'fixed_amount'].includes(discount_type)) {
      return ApiResponse.error(res, 'discount_type must be percentage or fixed_amount', 400);
    }

    const result = await query(
      `INSERT INTO coupons
       (code, discount_type, discount_value, min_order_amount, max_discount_amount, starts_at, expires_at, usage_limit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [code, discount_type, discount_value, min_order_amount || 0, max_discount_amount,
        starts_at, expires_at, usage_limit]
    );
    return ApiResponse.success(res, result.rows[0], 'Coupon created', 201);
  } catch (err) {
    next(err);
  }
}

async function updateCoupon(req, res, next) {
  try {
    const {
      discount_type, discount_value, min_order_amount,
      max_discount_amount, starts_at, expires_at, usage_limit,
    } = req.body;

    const result = await query(
      `UPDATE coupons SET
        discount_type = COALESCE($1, discount_type),
        discount_value = COALESCE($2, discount_value),
        min_order_amount = COALESCE($3, min_order_amount),
        max_discount_amount = COALESCE($4, max_discount_amount),
        starts_at = COALESCE($5, starts_at),
        expires_at = COALESCE($6, expires_at),
        usage_limit = COALESCE($7, usage_limit)
       WHERE id = $8 RETURNING *`,
      [discount_type, discount_value, min_order_amount, max_discount_amount,
        starts_at, expires_at, usage_limit, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Coupon not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Coupon updated');
  } catch (err) {
    next(err);
  }
}

async function deleteCoupon(req, res, next) {
  try {
    const result = await query(`DELETE FROM coupons WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Coupon not found', 404);
    return ApiResponse.success(res, null, 'Coupon deleted');
  } catch (err) {
    next(err);
  }
}

// Validates a coupon against a given subtotal without applying it (used by cart preview)
async function validateCoupon(req, res, next) {
  try {
    const { code, subtotal } = req.body;
    if (!code || subtotal === undefined) {
      return ApiResponse.error(res, 'code and subtotal are required', 400);
    }

    const result = await query(
      `SELECT * FROM coupons WHERE code = $1
       AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
       AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)`,
      [code]
    );

    if (result.rows.length === 0) {
      return ApiResponse.error(res, 'Invalid or expired coupon code', 400);
    }

    const coupon = result.rows[0];

    if (subtotal < coupon.min_order_amount) {
      return ApiResponse.error(res, `Minimum order amount is ${coupon.min_order_amount}`, 400);
    }

    if (coupon.usage_limit) {
      const usageCount = await query(`SELECT COUNT(*) FROM coupon_usages WHERE coupon_id = $1`, [coupon.id]);
      if (parseInt(usageCount.rows[0].count, 10) >= coupon.usage_limit) {
        return ApiResponse.error(res, 'Coupon usage limit reached', 400);
      }
    }

    let discountAmount = coupon.discount_type === 'percentage'
      ? subtotal * (coupon.discount_value / 100)
      : coupon.discount_value;

    if (coupon.max_discount_amount) {
      discountAmount = Math.min(discountAmount, coupon.max_discount_amount);
    }

    return ApiResponse.success(res, { coupon, discount_amount: discountAmount }, 'Coupon is valid');
  } catch (err) {
    next(err);
  }
}

async function listCouponUsages(req, res, next) {
  try {
    const result = await query(
      `SELECT cu.*, u.name AS user_name, o.order_number
       FROM coupon_usages cu
       LEFT JOIN users u ON u.id = cu.user_id
       LEFT JOIN orders o ON o.id = cu.order_id
       WHERE cu.coupon_id = $1 ORDER BY cu.used_at DESC`,
      [req.params.id]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listCoupons, getCouponByCode, createCoupon, updateCoupon, deleteCoupon,
  validateCoupon, listCouponUsages,
};