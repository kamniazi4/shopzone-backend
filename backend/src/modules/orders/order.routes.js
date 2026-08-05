const express = require('express');
const router = express.Router();
const orderController = require('./order.controller');
const splitController = require('./orderSplit.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { checkRole } = require('../../middlewares/rbacMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');
const { requireDeviceId } = require('../../middlewares/deviceMiddleware');

router.use(authenticate);

// Customer
router.post('/checkout', requireDeviceId, orderController.checkout);
router.get('/my-orders', orderController.listMyOrders);

// Admin
router.get('/', checkRole('admin', 'superadmin'), orderController.listAllOrders);

// Vendor
router.get('/vendor/:vendorId', checkRole('vendor', 'admin', 'superadmin'), validateIntParam('vendorId'), orderController.listVendorOrders);

// Shared (ownership checked inside controller for customers)
router.get('/:id', validateIntParam('id'), orderController.getOrderById);
router.patch('/:id/status', checkRole('vendor', 'admin', 'superadmin'), validateIntParam('id'), orderController.updateOrderStatus);
router.get('/:id/status-history', validateIntParam('id'), orderController.getOrderStatusHistory);

// Dropship
router.post('/:id/dropship', checkRole('vendor', 'admin', 'superadmin'), validateIntParam('id'), orderController.createDropshipOrder);
router.patch('/dropship/:dropshipId/status', checkRole('vendor', 'admin', 'superadmin'), orderController.updateDropshipStatus);

// Vendor splits & taxes
router.get('/:id/splits', checkRole('vendor', 'admin', 'superadmin'), validateIntParam('id'), splitController.listOrderSplits);
router.patch('/splits/:splitId/mark-paid', checkRole('admin', 'superadmin'), splitController.markSplitPaid);
router.get('/:id/taxes', validateIntParam('id'), splitController.listOrderTaxes);
router.post('/:id/taxes', checkRole('admin', 'superadmin'), validateIntParam('id'), splitController.addOrderTax);

module.exports = router;