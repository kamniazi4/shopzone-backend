// Handles HTTP requests for authentication
const ApiResponse = require('../../utils/apiResponse');
const authService = require('./auth.service');
const { validateRegisterInput, validateLoginInput } = require('./auth.validator');
const { verifyRefreshToken, generateAccessToken } = require('../../utils/generateToken');

async function register(req, res, next) {
  try {
    const errors = validateRegisterInput(req.body);
    if (errors.length > 0) return ApiResponse.error(res, 'Validation failed', 400, errors);

    const user = await authService.registerUser(req.body);
    const roles = await authService.getUserRoles(user.id);
    const tokens = authService.issueTokens(user, roles);

    return ApiResponse.success(res, { user, roles, ...tokens }, 'Registered successfully', 201);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const errors = validateLoginInput(req.body);
    if (errors.length > 0) return ApiResponse.error(res, 'Validation failed', 400, errors);

    const user = await authService.validateCredentials(req.body.email, req.body.password);
    if (!user) return ApiResponse.error(res, 'Invalid email or password', 401);

    const roles = await authService.getUserRoles(user.id);
    const tokens = authService.issueTokens(user, roles);

    delete user.password_hash;
    return ApiResponse.success(res, { user, roles, ...tokens }, 'Login successful');
  } catch (err) {
    next(err);
  }
}

async function refreshToken(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return ApiResponse.error(res, 'Refresh token required', 400);

    const decoded = verifyRefreshToken(refreshToken);
    const roles = await authService.getUserRoles(decoded.id);

    const accessToken = generateAccessToken({
      id: decoded.id,
      roles: roles.map((r) => r.name),
    });

    return ApiResponse.success(res, { accessToken }, 'Token refreshed');
  } catch (err) {
    return ApiResponse.error(res, 'Invalid or expired refresh token', 401);
  }
}

async function getMe(req, res, next) {
  try {
    return ApiResponse.success(res, req.user, 'Current user fetched');
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, refreshToken, getMe };