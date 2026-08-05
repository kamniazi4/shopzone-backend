// Verifies JWT access token and attaches decoded user + roles to req.user
const { verifyAccessToken } = require('../utils/generateToken');
const ApiResponse = require('../utils/apiResponse');
const { query } = require('../config/db');

async function authenticate(req, res, next) {
  try {
    console.log('DEBUG Authorization header received:', req.headers.authorization);

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('DEBUG: Header missing or malformed');
      return ApiResponse.error(res, 'Authorization token missing', 401);
    }

    const token = authHeader.split(' ')[1];
    console.log('DEBUG: Extracted token:', token);

    const decoded = verifyAccessToken(token);
    console.log('DEBUG: Decoded token payload:', decoded);

    // Fetch user + roles fresh from DB (roles/permissions are dynamic via RBAC tables)
    const userResult = await query(
      `SELECT id, name, email, status FROM users WHERE id = $1`,
      [decoded.id]
    );

    if (userResult.rows.length === 0 || userResult.rows[0].status !== 'active') {
      return ApiResponse.error(res, 'User not found or inactive', 401);
    }

    const rolesResult = await query(
      `SELECT r.id, r.name
       FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [decoded.id]
    );

    // Check if this user owns/manages a vendor, so the frontend knows which vendor_id to use
    const vendorResult = await query(
      `SELECT vendor_id FROM vendor_users WHERE user_id = $1 LIMIT 1`,
      [decoded.id]
    );

    req.user = {
      id: userResult.rows[0].id,
      name: userResult.rows[0].name,
      email: userResult.rows[0].email,
      roles: rolesResult.rows.map((r) => r.name),
      vendor_id: vendorResult.rows.length > 0 ? vendorResult.rows[0].vendor_id : null,
    };

    next();
  } catch (err) {
    console.log('DEBUG: Error in authenticate middleware:', err.message);
    return ApiResponse.error(res, 'Invalid or expired token', 401);
  }
}

module.exports = { authenticate };