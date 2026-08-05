const express = require('express');
const router = express.Router();
const paymentController = require('./payment.controller');
const gatewayController = require('./paymentGateway.controller');
const riskPaymentController = require('./riskPayment.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { checkRole } = require('../../middlewares/rbacMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');
const { requireDeviceId } = require('../../middlewares/deviceMiddleware');

router.use(authenticate);

// Payments (existing - COD/basic gateway flow)
router.get('/orders/:orderId', validateIntParam('orderId'), paymentController.listPaymentsByOrder);
router.post('/orders/:orderId', validateIntParam('orderId'), paymentController.initiatePayment);
router.get('/:id', validateIntParam('id'), paymentController.getPaymentById);
router.patch('/:id/confirm', checkRole('admin', 'superadmin'), validateIntParam('id'), paymentController.confirmPayment);
router.get('/:id/events', checkRole('admin', 'superadmin'), validateIntParam('id'), paymentController.listPaymentEvents);

// COD
router.post('/orders/:orderId/cod', checkRole('vendor', 'admin', 'superadmin'), validateIntParam('orderId'), paymentController.recordCodCollection);
router.patch('/cod/:id/remit', checkRole('admin', 'superadmin'), validateIntParam('id'), paymentController.markCodRemitted);

// Gateways (admin config)
router.get('/gateways', gatewayController.listGateways);
router.post('/gateways', checkRole('superadmin'), gatewayController.createGateway);
router.put('/gateways/:id', checkRole('superadmin'), validateIntParam('id'), gatewayController.updateGateway);
router.delete('/gateways/:id', checkRole('superadmin'), validateIntParam('id'), gatewayController.deleteGateway);

// Risk-aware payment initiation + OTP verification flow (new)
router.post('/initiate', requireDeviceId, riskPaymentController.initiatePayment);
router.post('/send-otp', riskPaymentController.sendOtp);
router.post('/verify-otp', riskPaymentController.verifyOtp);

module.exports = router;