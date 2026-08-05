// Validates that :id (and other numeric route params) are valid integers
// Schema uses SERIAL (integer) primary keys, so this guards bad requests early
const ApiResponse = require('../utils/apiResponse');

function validateIntParam(paramName = 'id') {
  return (req, res, next) => {
    const value = req.params[paramName];
    if (!/^\d+$/.test(value)) {
      return ApiResponse.error(res, `Invalid ${paramName}, must be a positive integer`, 400);
    }
    req.params[paramName] = parseInt(value, 10);
    next();
  };
}

module.exports = { validateIntParam };