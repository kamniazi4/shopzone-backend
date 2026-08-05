// CRUD for promotions and promotion_rules
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');
const { getPagination, buildPaginationMeta } = require('../../utils/pagination');

async function listPromotions(req, res, next) {
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

    const countResult = await query(`SELECT COUNT(*) FROM promotions ${whereClause}`, params);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const result = await query(
      `SELECT * FROM promotions ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return ApiResponse.paginated(res, result.rows, buildPaginationMeta(page, limit, totalCount));
  } catch (err) {
    next(err);
  }
}

async function getPromotionById(req, res, next) {
  try {
    const promoResult = await query(`SELECT * FROM promotions WHERE id = $1`, [req.params.id]);
    if (promoResult.rows.length === 0) return ApiResponse.error(res, 'Promotion not found', 404);

    const rulesResult = await query(`SELECT * FROM promotion_rules WHERE promotion_id = $1`, [req.params.id]);

    const promotion = promoResult.rows[0];
    promotion.rules = rulesResult.rows;
    return ApiResponse.success(res, promotion);
  } catch (err) {
    next(err);
  }
}

async function createPromotion(req, res, next) {
  try {
    const { name, description, discount_type, discount_value, starts_at, expires_at, status } = req.body;

    if (!name || !discount_type || discount_value === undefined) {
      return ApiResponse.error(res, 'name, discount_type and discount_value are required', 400);
    }

    const result = await query(
      `INSERT INTO promotions (name, description, discount_type, discount_value, starts_at, expires_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, description, discount_type, discount_value, starts_at, expires_at, status || 'inactive']
    );
    return ApiResponse.success(res, result.rows[0], 'Promotion created', 201);
  } catch (err) {
    next(err);
  }
}

async function updatePromotion(req, res, next) {
  try {
    const { name, description, discount_type, discount_value, starts_at, expires_at, status } = req.body;

    const result = await query(
      `UPDATE promotions SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        discount_type = COALESCE($3, discount_type),
        discount_value = COALESCE($4, discount_value),
        starts_at = COALESCE($5, starts_at),
        expires_at = COALESCE($6, expires_at),
        status = COALESCE($7, status)
       WHERE id = $8 RETURNING *`,
      [name, description, discount_type, discount_value, starts_at, expires_at, status, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Promotion not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Promotion updated');
  } catch (err) {
    next(err);
  }
}

async function deletePromotion(req, res, next) {
  try {
    const result = await query(`DELETE FROM promotions WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Promotion not found', 404);
    return ApiResponse.success(res, null, 'Promotion deleted');
  } catch (err) {
    next(err);
  }
}

// ---- promotion_rules ----

async function addPromotionRule(req, res, next) {
  try {
    const { rule_type, configuration } = req.body;
    if (!rule_type) return ApiResponse.error(res, 'rule_type is required', 400);

    const result = await query(
      `INSERT INTO promotion_rules (promotion_id, rule_type, configuration)
       VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, rule_type, configuration]
    );
    return ApiResponse.success(res, result.rows[0], 'Promotion rule added', 201);
  } catch (err) {
    next(err);
  }
}

async function deletePromotionRule(req, res, next) {
  try {
    const result = await query(
      `DELETE FROM promotion_rules WHERE id = $1 AND promotion_id = $2 RETURNING id`,
      [req.params.ruleId, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Promotion rule not found', 404);
    return ApiResponse.success(res, null, 'Promotion rule deleted');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPromotions, getPromotionById, createPromotion, updatePromotion, deletePromotion,
  addPromotionRule, deletePromotionRule,
};