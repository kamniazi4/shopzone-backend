const express = require('express');
const router = express.Router();
const couponController = require('./coupon.controller');
const promotionController = require('./promotion.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { checkRole } = require('../../middlewares/rbacMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');

const adminOnly = checkRole('admin', 'superadmin');

// Coupons - validation is public (used during cart preview), rest is admin
router.post('/coupons/validate', couponController.validateCoupon);
router.get('/coupons/code/:code', couponController.getCouponByCode);

router.get('/coupons', authenticate, adminOnly, couponController.listCoupons);
router.post('/coupons', authenticate, adminOnly, couponController.createCoupon);
router.put('/coupons/:id', authenticate, adminOnly, validateIntParam('id'), couponController.updateCoupon);
router.delete('/coupons/:id', authenticate, adminOnly, validateIntParam('id'), couponController.deleteCoupon);
router.get('/coupons/:id/usages', authenticate, adminOnly, validateIntParam('id'), couponController.listCouponUsages);

// Promotions - public read (for storefront banners), admin write
router.get('/', promotionController.listPromotions);
router.get('/:id', validateIntParam('id'), promotionController.getPromotionById);

router.post('/', authenticate, adminOnly, promotionController.createPromotion);
router.put('/:id', authenticate, adminOnly, validateIntParam('id'), promotionController.updatePromotion);
router.delete('/:id', authenticate, adminOnly, validateIntParam('id'), promotionController.deletePromotion);

router.post('/:id/rules', authenticate, adminOnly, validateIntParam('id'), promotionController.addPromotionRule);
router.delete('/:id/rules/:ruleId', authenticate, adminOnly, validateIntParam('id'), promotionController.deletePromotionRule);

module.exports = router;