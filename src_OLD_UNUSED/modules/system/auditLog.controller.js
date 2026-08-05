// Read access to audit_logs (write happens via a reusable helper other modules can call)
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');
const { getPagination, buildPaginationMeta } = require('../../utils/pagination');

async function listAuditLogs(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const { table_name, user_id } = req.query;

    const conditions = [];
    const params = [];
    if (table_name) {
      params.push(table_name);
      conditions.push(`table_name = $${params.length}`);
    }
    if (user_id) {
      params.push(user_id);
      conditions.push(`user_id = $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(`SELECT COUNT(*) FROM audit_logs ${whereClause}`, params);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const result = await query(
      `SELECT al.*, u.name AS user_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${whereClause}
       ORDER BY al.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return ApiResponse.paginated(res, result.rows, buildPaginationMeta(page, limit, totalCount));
  } catch (err) {
    next(err);
  }
}

// Reusable helper - other controllers can import and call this to log an action
async function recordAuditLog({ userId, action, tableName, rowId, oldValues, newValues, ipAddress }) {
  await query(
    `INSERT INTO audit_logs (user_id, action, table_name, row_id, old_values, new_values, ip_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [userId, action, tableName, rowId, oldValues, newValues, ipAddress]
  );
}

module.exports = { listAuditLogs, recordAuditLog };