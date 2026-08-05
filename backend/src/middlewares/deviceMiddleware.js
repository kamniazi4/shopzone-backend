// Extracts the device identifier sent by the frontend on every cart request.
// The cart system is device-scoped, not purely user-scoped, so this id is
// required for all cart operations.
const ApiResponse = require('../utils/apiResponse');

function requireDeviceId(req, res, next) {
  const deviceId = req.headers['x-device-id'];

  if (!deviceId || typeof deviceId !== 'string' || deviceId.trim().length === 0) {
    return ApiResponse.error(res, 'Device ID header (X-Device-Id) is required', 400);
  }

  req.deviceId = deviceId;
  next();
}

module.exports = { requireDeviceId };