const express = require('express');
const router = express.Router();
const controller = require('./stripe.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { requireDeviceId } = require('../../middlewares/deviceMiddleware');

router.post('/create-payment-intent', authenticate, controller.createPaymentIntent);
router.post('/confirm-payment', authenticate, requireDeviceId, controller.confirmPayment);

module.exports = router;