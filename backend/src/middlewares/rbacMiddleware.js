// Role and permission based access control
// Depends on authMiddleware having already set req.user
const ApiResponse = require('../utils/apiResponse');
const { query } = require('../config/db');

// Restrict route to specific role names (e.g. 'superadmin', 'admin', 'vendor', 'customer')
function checkRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return ApiResponse.error(res, 'Not authenticated', 401);
    }
    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));
    if (!hasRole) {
      return ApiResponse.error(res, 'Forbidden: insufficient role', 403);
    }
    next();
  };
}

// Restrict route to specific permission name (checked against role_permissions)
function checkPermission(permissionName) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return ApiResponse.error(res, 'Not authenticated', 401);
      }

      const result = await query(
        `SELECT 1
         FROM user_roles ur
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE ur.user_id = $1 AND p.name = $2
         LIMIT 1`,
        [req.user.id, permissionName]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Forbidden: missing permission', 403);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { checkRole, checkPermission };