// CRUD for vendors, vendor_users, vendor_settings
const ApiResponse = require('../../utils/apiResponse');
const { query, getClient } = require('../../config/db');
const { getPagination, buildPaginationMeta } = require('../../utils/pagination');

async function listVendors(req, res, next) {
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

    const countResult = await query(`SELECT COUNT(*) FROM vendors ${whereClause}`, params);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const result = await query(
      `SELECT * FROM vendors ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return ApiResponse.paginated(res, result.rows, buildPaginationMeta(page, limit, totalCount));
  } catch (err) {
    next(err);
  }
}

async function getVendorById(req, res, next) {
  try {
    const result = await query(`SELECT * FROM vendors WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'Vendor not found', 404);
    return ApiResponse.success(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// Vendor self-registration: creates vendor, links current user as owner, creates wallet
async function registerVendor(req, res, next) {
  const client = await getClient();
  try {
    const { business_name, email, phone } = req.body;
    if (!business_name || !email) {
      return ApiResponse.error(res, 'business_name and email are required', 400);
    }

    await client.query('BEGIN');

    const vendorResult = await client.query(
      `INSERT INTO vendors (business_name, email, phone) VALUES ($1, $2, $3) RETURNING *`,
      [business_name, email, phone]
    );
    const vendor = vendorResult.rows[0];

    await client.query(
      `INSERT INTO vendor_users (vendor_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [vendor.id, req.user.id]
    );

    await client.query(`INSERT INTO vendor_wallets (vendor_id) VALUES ($1)`, [vendor.id]);

    // Assign 'vendor' role to the user if not already assigned
    const roleResult = await client.query(`SELECT id FROM roles WHERE name = 'vendor'`);
    if (roleResult.rows.length > 0) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.user.id, roleResult.rows[0].id]
      );
    }

    await client.query('COMMIT');
    return ApiResponse.success(res, vendor, 'Vendor registered, pending approval', 201);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function updateVendorStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!['pending', 'active', 'suspended', 'rejected'].includes(status)) {
      return ApiResponse.error(res, 'Invalid status value', 400);
    }

    const result = await query(
      `UPDATE vendors SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Vendor not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Vendor status updated');
  } catch (err) {
    next(err);
  }
}

async function updateVendor(req, res, next) {
  try {
    const { business_name, phone } = req.body;
    const result = await query(
      `UPDATE vendors SET
        business_name = COALESCE($1, business_name),
        phone = COALESCE($2, phone),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING *`,
      [business_name, phone, req.params.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Vendor not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Vendor updated');
  } catch (err) {
    next(err);
  }
}

// ---- vendor_settings ----

async function getVendorSettings(req, res, next) {
  try {
    const result = await query(`SELECT * FROM vendor_settings WHERE vendor_id = $1`, [req.params.id]);
    return ApiResponse.success(res, result.rows[0] || null);
  } catch (err) {
    next(err);
  }
}

async function upsertVendorSettings(req, res, next) {
  try {
    const { settings } = req.body;
    const result = await query(
      `INSERT INTO vendor_settings (vendor_id, settings)
       VALUES ($1, $2)
       ON CONFLICT (vendor_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [req.params.id, settings]
    );
    return ApiResponse.success(res, result.rows[0], 'Vendor settings saved');
  } catch (err) {
    next(err);
  }
}

// ---- vendor_users (staff management) ----

async function listVendorUsers(req, res, next) {
  try {
    const result = await query(
      `SELECT vu.role, u.id, u.name, u.email
       FROM vendor_users vu
       JOIN users u ON u.id = vu.user_id
       WHERE vu.vendor_id = $1`,
      [req.params.id]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function addVendorStaff(req, res, next) {
  try {
    const { user_id, role } = req.body;
    if (!user_id) return ApiResponse.error(res, 'user_id is required', 400);

    const result = await query(
      `INSERT INTO vendor_users (vendor_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (vendor_id, user_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING *`,
      [req.params.id, user_id, role || 'staff']
    );
    return ApiResponse.success(res, result.rows[0], 'Vendor staff added', 201);
  } catch (err) {
    next(err);
  }
}

async function removeVendorStaff(req, res, next) {
  try {
    await query(
      `DELETE FROM vendor_users WHERE vendor_id = $1 AND user_id = $2`,
      [req.params.id, req.params.userId]
    );
    return ApiResponse.success(res, null, 'Vendor staff removed');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listVendors, getVendorById, registerVendor, updateVendor, updateVendorStatus,
  getVendorSettings, upsertVendorSettings,
  listVendorUsers, addVendorStaff, removeVendorStaff,
};