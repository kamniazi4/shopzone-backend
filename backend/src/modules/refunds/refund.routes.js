const express = require('express');
const router = express.Router();
const controller = require('./refund.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { checkRole } = require('../../middlewares/rbacMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');

router.use(authenticate);

// Refunds
router.get('/orders/:orderId', validateIntParam('orderId'), controller.listRefundsByOrder);
router.post('/orders/:orderId', validateIntParam('orderId'), controller.createRefund);
router.get('/:id', validateIntParam('id'), controller.getRefundById);
router.patch('/:id/approve', checkRole('admin', 'superadmin'), validateIntParam('id'), controller.approveRefund);
router.patch('/:id/reject', checkRole('admin', 'superadmin'), validateIntParam('id'), controller.rejectRefund);

// Vendor commissions
router.post('/commissions', checkRole('admin', 'superadmin'), controller.recordCommission);
router.get('/commissions/vendor/:vendorId', checkRole('vendor', 'admin', 'superadmin'), validateIntParam('vendorId'), controller.listVendorCommissions);

module.exports = router;