// Handles users, addresses, and user_devices
const ApiResponse = require('../../utils/apiResponse');
const { query } = require('../../config/db');
const userModel = require('./user.model');
const { getPagination, buildPaginationMeta } = require('../../utils/pagination');

// ---- Users (admin scope) ----

async function listUsers(req, res, next) {
  try {
    const { page, limit, offset } = getPagination(req.query);

    const countResult = await query(`SELECT COUNT(*) FROM users`);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const result = await query(
      `SELECT id, name, email, phone, status, created_at
       FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return ApiResponse.paginated(res, result.rows, buildPaginationMeta(page, limit, totalCount));
  } catch (err) {
    next(err);
  }
}

async function getUserById(req, res, next) {
  try {
    const user = await userModel.findById(req.params.id);
    if (!user) return ApiResponse.error(res, 'User not found', 404);
    return ApiResponse.success(res, user);
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const allowedFields = ['name', 'phone', 'status'];
    const fields = {};
    allowedFields.forEach((key) => {
      if (req.body[key] !== undefined) fields[key] = req.body[key];
    });

    const updated = await userModel.updateById(req.params.id, fields);
    if (!updated) return ApiResponse.error(res, 'User not found', 404);
    return ApiResponse.success(res, updated, 'User updated');
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    const result = await query(`DELETE FROM users WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return ApiResponse.error(res, 'User not found', 404);
    return ApiResponse.success(res, null, 'User deleted');
  } catch (err) {
    next(err);
  }
}

// ---- Addresses ----

async function listMyAddresses(req, res, next) {
  try {
    const result = await query(
      `SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [req.user.id]
    );
    return ApiResponse.success(res, result.rows);
  } catch (err) {
    next(err);
  }
}

async function addAddress(req, res, next) {
  try {
    const {
      recipient_name, recipient_email, address_type, is_default,
      address_line1, address_line2, city, state, postal_code, country, phone,
    } = req.body;

    if (!recipient_name || !address_line1 || !city || !country) {
      return ApiResponse.error(res, 'recipient_name, address_line1, city and country are required', 400);
    }

    const result = await query(
      `INSERT INTO addresses
       (user_id, recipient_name, recipient_email, address_type, is_default, address_line1, address_line2, city, state, postal_code, country, phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [req.user.id, recipient_name, recipient_email, address_type || 'shipping', is_default || false,
        address_line1, address_line2, city, state, postal_code, country, phone]
    );

    return ApiResponse.success(res, result.rows[0], 'Address added', 201);
  } catch (err) {
    next(err);
  }
}

async function updateAddress(req, res, next) {
  try {
    const result = await query(
      `UPDATE addresses SET
        recipient_name = COALESCE($1, recipient_name),
        recipient_email = COALESCE($2, recipient_email),
        address_type = COALESCE($3, address_type),
        is_default = COALESCE($4, is_default),
        address_line1 = COALESCE($5, address_line1),
        address_line2 = COALESCE($6, address_line2),
        city = COALESCE($7, city),
        state = COALESCE($8, state),
        postal_code = COALESCE($9, postal_code),
        country = COALESCE($10, country),
        phone = COALESCE($11, phone)
       WHERE id = $12 AND user_id = $13
       RETURNING *`,
      [req.body.recipient_name, req.body.recipient_email, req.body.address_type, req.body.is_default,
        req.body.address_line1, req.body.address_line2, req.body.city, req.body.state,
        req.body.postal_code, req.body.country, req.body.phone,
        req.params.id, req.user.id]
    );

    if (result.rows.length === 0) return ApiResponse.error(res, 'Address not found', 404);
    return ApiResponse.success(res, result.rows[0], 'Address updated');
  } catch (err) {
    next(err);
  }
}

async function deleteAddress(req, res, next) {
  try {
    const result = await query(
      `DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return ApiResponse.error(res, 'Address not found', 404);
    return ApiResponse.success(res, null, 'Address deleted');
  } catch (err) {
    next(err);
  }
}

// ---- Devices (push notification tokens) ----

async function registerDevice(req, res, next) {
  try {
    const { device_token, device_type } = req.body;
    if (!device_token) return ApiResponse.error(res, 'device_token is required', 400);

    const result = await query(
      `INSERT INTO user_devices (user_id, device_token, device_type) VALUES ($1,$2,$3) RETURNING *`,
      [req.user.id, device_token, device_type]
    );
    return ApiResponse.success(res, result.rows[0], 'Device registered', 201);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listUsers, getUserById, updateUser, deleteUser,
  listMyAddresses, addAddress, updateAddress, deleteAddress,
  registerDevice,
};