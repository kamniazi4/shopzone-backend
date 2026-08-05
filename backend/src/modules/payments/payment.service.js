// Orchestrates the full payment initiation flow: server-side amount
// calculation, ownership checks, idempotency, risk assessment, and
// deciding whether to go straight to the gateway or require OTP first.
const crypto = require('crypto');
const { query, getClient } = require('../../config/db');
const { assessRisk } = require('./riskAssessment.service');
const stripe = require('../../config/stripe');

// Initiates a payment for an order. Idempotent: if a pending payment already
// exists for this order, it is reused instead of creating a duplicate.
async function initiatePayment({ userId, orderId, deviceId }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Verify the order belongs to this authenticated user (never trust the client)
    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [orderId, userId]
    );
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw { status: 403, message: 'Order not found or does not belong to you' };
    }
    const order = orderResult.rows[0];

    // 2. Server-side amount - always trust the database, never a client-supplied value
    const orderAmount = parseFloat(order.total_amount);

    // 3. Idempotency: check for an existing non-failed payment for this order
    const existingPaymentResult = await client.query(
      `SELECT * FROM payments WHERE order_id = $1 AND status IN ('pending', 'completed') ORDER BY created_at DESC LIMIT 1`,
      [orderId]
    );

    if (existingPaymentResult.rows.length > 0) {
      const existing = existingPaymentResult.rows[0];
      if (existing.status === 'completed') {
        await client.query('ROLLBACK');
        throw { status: 409, message: 'This order has already been paid for' };
      }
      // Reuse the existing pending payment rather than creating a duplicate
      await client.query('COMMIT');
      return resumeExistingPayment(existing, userId, orderId, deviceId);
    }

    // 4. Run risk assessment - pass `client` so every query it runs (including
    // the audit INSERT into payment_risk_assessments) shares this same
    // transaction/connection. This avoids a self-lock against the FOR UPDATE
    // held above on the orders row (previously a different pooled connection
    // would block waiting on this same transaction to commit).
    const riskResult = await assessRisk({ userId, orderId, orderAmount, deviceId, client });

    // 5. Create the payment record
    const gatewayResult = await client.query(`SELECT id FROM payment_gateways WHERE code = 'stripe'`);
    const gatewayId = gatewayResult.rows[0]?.id || null;
    const idempotencyKey = crypto.randomUUID();

    const paymentResult = await client.query(
      `INSERT INTO payments (order_id, payment_gateway_id, transaction_reference, amount, status, payment_method, requires_verification, idempotency_key)
       VALUES ($1, $2, $3, $4, 'pending', 'card', $5, $6)
       RETURNING *`,
      [orderId, gatewayId, `PENDING-${idempotencyKey}`, orderAmount, riskResult.requiresVerification, idempotencyKey]
    );
    const payment = paymentResult.rows[0];

    await client.query('COMMIT');

    if (riskResult.requiresVerification) {
      // High risk: do NOT create the Stripe PaymentIntent yet. Wait for OTP first.
      return {
        paymentId: payment.id,
        requiresVerification: true,
        riskLevel: riskResult.riskLevel,
      };
    }

    // Low/medium risk (not requiring verification): proceed straight to the gateway
    const clientSecret = await createStripeIntentForPayment(payment, order);
    return {
      paymentId: payment.id,
      requiresVerification: false,
      riskLevel: riskResult.riskLevel,
      clientSecret,
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* already rolled back */ }
    throw err;
  } finally {
    client.release();
  }
}

// If a pending payment already exists for this order (e.g. user refreshed
// the page mid-flow), resume it instead of creating a duplicate.
async function resumeExistingPayment(payment, userId, orderId, deviceId) {
  if (payment.requires_verification) {
    const { isPaymentVerified } = require('./otp.service');
    const verified = await isPaymentVerified(payment.id);
    if (verified) {
      const orderResult = await query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
      const clientSecret = await createStripeIntentForPayment(payment, orderResult.rows[0]);
      return { paymentId: payment.id, requiresVerification: false, clientSecret, resumed: true };
    }
    return { paymentId: payment.id, requiresVerification: true, resumed: true };
  }

  const orderResult = await query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  const clientSecret = await createStripeIntentForPayment(payment, orderResult.rows[0]);
  return { paymentId: payment.id, requiresVerification: false, clientSecret, resumed: true };
}

// Creates (or reuses) the Stripe PaymentIntent for an already-created payment record
async function createStripeIntentForPayment(payment, order) {
  if (payment.gateway_payment_intent_id) {
    const existingIntent = await stripe.paymentIntents.retrieve(payment.gateway_payment_intent_id);
    return existingIntent.client_secret;
  }

  const amountInSmallestUnit = Math.round(parseFloat(order.total_amount) * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInSmallestUnit,
    currency: 'usd',
    metadata: { order_id: String(order.id), payment_id: String(payment.id) },
    automatic_payment_methods: { enabled: true },
  }, {
    idempotencyKey: payment.idempotency_key, // prevents Stripe-side duplicate charges too
  });

  await query(
    `UPDATE payments SET gateway_payment_intent_id = $1, transaction_reference = $2 WHERE id = $3`,
    [paymentIntent.id, paymentIntent.id, payment.id]
  );

  return paymentIntent.client_secret;
}

// Called once OTP verification succeeds - now safe to create the Stripe intent
async function proceedAfterVerification(paymentId, userId) {
  const paymentResult = await query(
    `SELECT p.*, o.total_amount, o.id AS order_id, o.user_id
     FROM payments p JOIN orders o ON o.id = p.order_id
     WHERE p.id = $1`,
    [paymentId]
  );

  if (paymentResult.rows.length === 0) {
    throw { status: 404, message: 'Payment not found' };
  }
  const payment = paymentResult.rows[0];

  if (payment.user_id !== userId) {
    throw { status: 403, message: 'This payment does not belong to you' };
  }
  if (payment.status === 'completed') {
    throw { status: 409, message: 'This payment has already been completed' };
  }

  const { isPaymentVerified } = require('./otp.service');
  const verified = await isPaymentVerified(paymentId);
  if (!verified) {
    throw { status: 403, message: 'OTP verification has not been completed for this payment' };
  }

  const clientSecret = await createStripeIntentForPayment(payment, {
    id: payment.order_id,
    total_amount: payment.total_amount,
  });

  return clientSecret;
}

module.exports = { initiatePayment, proceedAfterVerification };