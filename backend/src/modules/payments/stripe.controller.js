// Handles Stripe PaymentIntent creation and confirmation for checkout
const ApiResponse = require('../../utils/apiResponse');
const stripe = require('../../config/stripe');
const { query } = require('../../config/db');
const { markDeviceTrusted } = require('./riskAssessment.service');

// Creates a Stripe PaymentIntent for the given amount and returns its client_secret.
// NOTE: The risk-aware checkout flow (payment.service.js) now creates PaymentIntents
// itself after risk assessment/OTP, so this endpoint is kept only for any other
// flow that might still need a direct PaymentIntent.
async function createPaymentIntent(req, res, next) {
  try {
    const { amount, currency, order_id } = req.body;

    if (!amount || amount <= 0) {
      return ApiResponse.error(res, 'A valid amount is required', 400);
    }

    const amountInSmallestUnit = Math.round(parseFloat(amount) * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInSmallestUnit,
      currency: currency || 'usd',
      metadata: { order_id: order_id ? String(order_id) : '' },
      automatic_payment_methods: { enabled: true },
    });

    return ApiResponse.success(res, {
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    }, 'Payment intent created', 201);
  } catch (err) {
    next(err);
  }
}

// Called after the frontend confirms payment with Stripe.js. This is the
// FINAL authority for marking a payment/order as paid - it never trusts
// the frontend and re-verifies everything against Stripe and our own DB.
async function confirmPayment(req, res, next) {
  try {
    const { payment_intent_id, order_id } = req.body;

    if (!payment_intent_id || !order_id) {
      return ApiResponse.error(res, 'payment_intent_id and order_id are required', 400);
    }

    // 1. Order must belong to the authenticated user
    const orderResult = await query(`SELECT * FROM orders WHERE id = $1 AND user_id = $2`, [order_id, req.user.id]);
    if (orderResult.rows.length === 0) {
      return ApiResponse.error(res, 'Order not found or does not belong to you', 403);
    }

    // 2. Payment record must exist, belong to this order, and not already be completed
    const paymentResult = await query(
      `SELECT * FROM payments WHERE order_id = $1 AND gateway_payment_intent_id = $2`,
      [order_id, payment_intent_id]
    );
    if (paymentResult.rows.length === 0) {
      return ApiResponse.error(res, 'Payment record not found for this order', 404);
    }
    const payment = paymentResult.rows[0];

    if (payment.status === 'completed') {
      return ApiResponse.error(res, 'Payment has already been completed', 409);
    }

    // 3. If this payment required OTP verification, confirm it actually happened
    if (payment.requires_verification) {
      const verifiedResult = await query(
        `SELECT 1 FROM payment_otp_verifications WHERE payment_id = $1 AND verified_at IS NOT NULL LIMIT 1`,
        [payment.id]
      );
      if (verifiedResult.rows.length === 0) {
        return ApiResponse.error(res, 'Required verification was not completed for this payment', 403);
      }
    }

    // 4. Re-check with Stripe directly - never trust the client's claim of success
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
    if (paymentIntent.status !== 'succeeded') {
      await query(`UPDATE payments SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [payment.id]);
      return ApiResponse.error(res, `Payment not completed. Status: ${paymentIntent.status}`, 400);
    }

    // 5. All checks passed - mark payment and order as paid
    const updatedPayment = await query(
      `UPDATE payments SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [payment.id]
    );

    await query(`UPDATE orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [order_id]);
    await query(
      `INSERT INTO order_status_history (order_id, status, notes) VALUES ($1, 'confirmed', 'Payment completed via Stripe')`,
      [order_id]
    );

    // Mark this device as trusted for future low-friction payments
    if (req.deviceId) {
      await markDeviceTrusted(req.user.id, req.deviceId);
    }

    return ApiResponse.success(res, updatedPayment.rows[0], 'Payment confirmed successfully');
  } catch (err) {
    next(err);
  }
}

module.exports = { createPaymentIntent, confirmPayment };