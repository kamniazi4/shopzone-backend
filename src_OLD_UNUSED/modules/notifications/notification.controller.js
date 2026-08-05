// Handles notifications and notification_templates
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');
const { getPagination, buildPaginationMeta } = require('../../utils/pagination');

async function listMyNotifications(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req.query);

    const countResult = await query(`SELECT COUNT(*) FROM notifications WHERE user_id = $1`, [req.user.id]);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const result = await query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    return ApiResponse.paginated(res, result.rows, buildPaginationMeta(page, limit, totalCount));
  } catch (err) {
    next(err);
  }
}

async function createNotification(req, res, next) {
  try {
    const { user_id, title, message } = req.body;
    if (!user_id || !title || !message) {
      return ApiResponse.error(res, 'user_id, title and message are required', 400);
    }

    const result = await query(
      `INSERT INTO notifications (user_id, title, message) VALUES ($1,$2,$3) RETURNING *`,
      [user_id, title, message]
    );
    return ApiResponse.success(res, result.rows[0], 'Notification created', 201);
  } catch (err) {
    next(err);
  }
}

async function markAsRead(req, res, next) {
  try {
    const result = await query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Notification not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Notification marked as read');
  } catch (err) {
    next(err);
  }
}

async function markAllAsRead(req, res, next) {
  try {
    await query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`, [req.user.id]);
    return ApiResponse.success(res, null, 'All notifications marked as read');
  } catch (err) {
    next(err);
  }
}

async function deleteNotification(req, res, next) {
  try {
    const result = await query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Notification not found', 404);
    return ApiResponse.success(res, null, 'Notification deleted');
  } catch (err) {
    next(err);
  }
}

// ---- notification_templates ----

async function listTemplates(req, res, next) {
  try {
    const result = await query(`SELECT * FROM notification_templates ORDER BY name`);
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function createTemplate(req, res, next) {
  try {
    const { name, type, subject, body_template } = req.body;
    if (!name || !type || !body_template) {
      return ApiResponse.error(res, 'name, type and body_template are required', 400);
    }

    const result = await query(
      `INSERT INTO notification_templates (name, type, subject, body_template)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, type, subject, body_template]
    );
    return ApiResponse.success(res, result.rows[0], 'Notification template created', 201);
  } catch (err) {
    next(err);
  }
}

async function updateTemplate(req, res, next) {
  try {
    const { subject, body_template } = req.body;
    const result = await query(
      `UPDATE notification_templates SET
        subject = COALESCE($1, subject),
        body_template = COALESCE($2, body_template)
       WHERE id = $3 RETURNING *`,
      [subject, body_template, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Template not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Template updated');
  } catch (err) {
    next(err);
  }
}

async function deleteTemplate(req, res, next) {
  try {
    const result = await query(`DELETE FROM notification_templates WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Template not found', 404);
    return ApiResponse.success(res, null, 'Template deleted');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listMyNotifications, createNotification, markAsRead, markAllAsRead, deleteNotification,
  listTemplates, createTemplate, updateTemplate, deleteTemplate,
};