const express = require('express');
const router = express.Router();
const controller = require('./review.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { checkRole } = require('../../middlewares/rbacMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');

// Public read
router.get('/products/:productId', validateIntParam('productId'), controller.listProductReviews);

// Customer write
router.post('/products/:productId', authenticate, validateIntParam('productId'), controller.createReview);
router.delete('/:id', authenticate, validateIntParam('id'), controller.deleteReview);

// Admin moderation
router.patch('/:id/status', authenticate, checkRole('admin', 'superadmin'), validateIntParam('id'), controller.updateReviewStatus);

module.exports = router;