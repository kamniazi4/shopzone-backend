const express = require('express');
const router = express.Router();
const controller = require('./recommendation.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');

// Optional auth: view recording works whether logged in or not
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticate(req, res, next);
  }
  req.user = null;
  next();
}

router.post('/views', optionalAuth, (req, res, next) => {
  req.deviceId = req.headers['x-device-id'];
  next();
}, controller.recordView);

router.get('/trending', controller.getTrendingProducts);
router.get('/:productId/related', validateIntParam('productId'), controller.getRelatedProducts);
router.get('/:productId/also-bought', validateIntParam('productId'), controller.getAlsoBoughtProducts);

module.exports = router;