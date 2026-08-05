// Centralized error handler - must be registered last in app.js
const ApiResponse = require('../utils/apiResponse');

function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);

  // Postgres unique_violation
  if (err.code === '23505') {
    return ApiResponse.error(res, 'Duplicate entry, resource already exists', 409, err.detail);
  }

  // Postgres foreign_key_violation
  if (err.code === '23503') {
    return ApiResponse.error(res, 'Referenced resource does not exist', 400, err.detail);
  }

  // Postgres not_null_violation
  if (err.code === '23502') {
    return ApiResponse.error(res, `Missing required field: ${err.column}`, 400);
  }

  // Postgres check_violation
  if (err.code === '23514') {
    return ApiResponse.error(res, 'Value violates a check constraint', 400, err.detail);
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  return ApiResponse.error(res, message, statusCode);
}

function notFoundHandler(req, res) {
  return ApiResponse.error(res, `Route not found: ${req.originalUrl}`, 404);
}

module.exports = { errorHandler, notFoundHandler };