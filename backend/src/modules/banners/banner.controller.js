// Handles promo_banners CRUD - powers the homepage hero section
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');

async function listActiveBanners(req, res, next) {
  try {
    const result = await query(
      `SELECT * FROM promo_banners WHERE is_active = TRUE ORDER BY sort_order ASC`
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function listAllBanners(req, res, next) {
  try {
    const result = await query(`SELECT * FROM promo_banners ORDER BY sort_order ASC`);
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function createBanner(req, res, next) {
  try {
    const {
      position, badge_text, title, highlight_text, subtitle,
      button_text, button_link, color_theme, sort_order,
    } = req.body;

    if (!position || !title) {
      return ApiResponse.error(res, 'position and title are required', 400);
    }

    const result = await query(
      `INSERT INTO promo_banners
       (position, badge_text, title, highlight_text, subtitle, button_text, button_link, color_theme, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [position, badge_text, title, highlight_text, subtitle, button_text, button_link,
        color_theme || 'blue', sort_order || 0]
    );
    return ApiResponse.success(res, result.rows[0], 'Banner created', 201);
  } catch (err) {
    next(err);
  }
}

async function updateBanner(req, res, next) {
  try {
    const {
      badge_text, title, highlight_text, subtitle,
      button_text, button_link, color_theme, sort_order, is_active,
    } = req.body;

    const result = await query(
      `UPDATE promo_banners SET
        badge_text = COALESCE($1, badge_text),
        title = COALESCE($2, title),
        highlight_text = COALESCE($3, highlight_text),
        subtitle = COALESCE($4, subtitle),
        button_text = COALESCE($5, button_text),
        button_link = COALESCE($6, button_link),
        color_theme = COALESCE($7, color_theme),
        sort_order = COALESCE($8, sort_order),
        is_active = COALESCE($9, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 RETURNING *`,
      [badge_text, title, highlight_text, subtitle, button_text, button_link,
        color_theme, sort_order, is_active, req.params.id]
    );

    if (result.rows.length === 0) return ApiResponse.error(res, 'Banner not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Banner updated');
  } catch (err) {
    next(err);
  }
}

async function deleteBanner(req, res, next) {
  try {
    const result = await query(`DELETE FROM promo_banners WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Banner not found', 404);
    return ApiResponse.success(res, null, 'Banner deleted');
  } catch (err) {
    next(err);
  }
}

module.exports = { listActiveBanners, listAllBanners, createBanner, updateBanner, deleteBanner };
