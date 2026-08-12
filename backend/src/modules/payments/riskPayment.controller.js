// Handles the risk-aware payment initiation flow and OTP endpoints.
// Named separately from payment.controller.js (which handles COD/gateway admin)
// to avoid any naming collision with the existing module.
const ApiResponse = require('../../utils/apiResponse');
const paymentService = require('./payment.service');
const otpService = require('./otp.service');

// Step 1: Customer clicks "Place Order" already created the order; this
// initiates payment, running risk assessment to decide the flow.
async function initiatePayment(req, res, next) {
  try {
    const { order_id, payment_method } = req.body;
    if (!order_id) return ApiResponse.error(res, 'order_id is required', 400);
    if (!payment_method) return ApiResponse.error(res, 'payment_method is required', 400);

    const allowedMethods = ['card', 'jazzcash', 'easypaisa'];
    if (!allowedMethods.includes(payment_method)) {
      return ApiResponse.error(res, 'Invalid payment_method', 400);
    }

    const result = await paymentService.initiatePayment({
      userId: req.user.id,
      orderId: order_id,
      deviceId: req.deviceId,
      paymentMethod: payment_method,
    });

     if (result.requiresVerification) {
      const contactOptions = await otpService.getMaskedContactOptions(req.user.id);
      return ApiResponse.success(res, {
        payment_id: result.paymentId,
        requires_verification: true,
        contact_options: contactOptions,
      }, 'Additional verification is required to complete this payment');
    }

    return ApiResponse.success(res, {
      payment_id: result.paymentId,
      requires_verification: false,
      gateway: result.gateway,
      client_secret: result.clientSecret || null,
      redirect: result.redirect || null,
    }, 'Payment initiated');
  } catch (err) {
    if (err.status) return ApiResponse.error(res, err.message, err.status);
    next(err);
  }
}
// Sends an OTP to the customer's chosen, already-verified contact method
async function sendOtp(req, res, next) {
  try {
    const { payment_id, delivery_method } = req.body;
    if (!payment_id || !delivery_method) {
      return ApiResponse.error(res, 'payment_id and delivery_method are required', 400);
    }
    if (!['email', 'mobile'].includes(delivery_method)) {
      return ApiResponse.error(res, 'delivery_method must be email or mobile', 400);
    }

    const result = await otpService.sendPaymentOtp(req.user.id, payment_id, delivery_method);
    return ApiResponse.success(res, result, 'Verification code sent');
  } catch (err) {
    return ApiResponse.error(res, err.message || 'Failed to send verification code', 400);
  }
}

// Verifies the OTP, and if successful, creates the Stripe PaymentIntent so
// the frontend can proceed to actual card entry.
async function verifyOtp(req, res, next) {
  try {
    const { payment_id, otp_code } = req.body;
    if (!payment_id || !otp_code) {
      return ApiResponse.error(res, 'payment_id and otp_code are required', 400);
    }

    await otpService.verifyPaymentOtp(payment_id, otp_code);
    const clientSecret = await paymentService.proceedAfterVerification(payment_id, req.user.id);

    return ApiResponse.success(res, { client_secret: clientSecret }, 'Verification successful');
  } catch (err) {
    if (err.status) return ApiResponse.error(res, err.message, err.status);
    return ApiResponse.error(res, err.message || 'Verification failed', 400);
  }
}

module.exports = { initiatePayment, sendOtp, verifyOtp };