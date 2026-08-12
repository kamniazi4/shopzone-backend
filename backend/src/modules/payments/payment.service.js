// Orchestrates the full payment initiation flow: server-side amount
// calculation, ownership checks, idempotency, risk assessment, and
// deciding whether to go straight to the gateway or require OTP first.
// Supports multiple gateways (Stripe, JazzCash, EasyPaisa) via a single
// dispatch point (createGatewayCheckout) - Stripe logic is UNCHANGED.
const crypto = require('crypto');
const { query, getClient } = require('../../config/db');
const { assessRisk } = require('./riskAssessment.service');
const stripe = require('../../config/stripe');
const jazzcashService = require('./jazzcash.service');
const easypaisaService = require('./easypaisa.service');

// Maps our internal payment_method value to payment_gateways.code
const GATEWAY_CODE_BY_METHOD = {
  card: 'stripe',
  jazzcash: 'jazzcash',
  easypaisa: 'easypaisa',
};

async function initiatePayment({ userId, orderId, deviceId, paymentMethod }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [orderId, userId]
    );
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw { status: 403, message: 'Order not found or does not belong to you' };
    }
    const order = orderResult.rows[0];

    const orderAmount = parseFloat(order.total_amount);

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
      await client.query('COMMIT');
      return resumeExistingPayment(existing, userId, orderId, deviceId);
    }

    const riskResult = await assessRisk({ userId, orderId, orderAmount, deviceId, client });

    const gatewayCode = GATEWAY_CODE_BY_METHOD[paymentMethod];
    if (!gatewayCode) {
      await client.query('ROLLBACK');
      throw { status: 400, message: 'Unsupported payment method' };
    }
    const gatewayResult = await client.query(`SELECT id FROM payment_gateways WHERE code = $1`, [gatewayCode]);
    const gatewayId = gatewayResult.rows[0]?.id || null;
    const idempotencyKey = crypto.randomUUID();

    const paymentResult = await client.query(
      `INSERT INTO payments (order_id, payment_gateway_id, transaction_reference, amount, status, payment_method, requires_verification, idempotency_key)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
       RETURNING *`,
      [orderId, gatewayId, `PENDING-${idempotencyKey}`, orderAmount, paymentMethod, riskResult.requiresVerification, idempotencyKey]
    );
    const payment = paymentResult.rows[0];

    await client.query('COMMIT');

    if (riskResult.requiresVerification) {
      // High risk: do NOT hit the gateway yet. Wait for OTP first.
      return {
        paymentId: payment.id,
        requiresVerification: true,
        riskLevel: riskResult.riskLevel,
      };
    }

    const gatewayResponse = await createGatewayCheckout(paymentMethod, payment, order);
    return {
      paymentId: payment.id,
      requiresVerification: false,
      riskLevel: riskResult.riskLevel,
      gateway: paymentMethod,
      ...gatewayResponse,
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* already rolled back */ }
    throw err;
  } finally {
    client.release();
  }
}

async function resumeExistingPayment(payment, userId, orderId, deviceId) {
  const orderResult = await query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  const order = orderResult.rows[0];

  if (payment.requires_verification) {
    const { isPaymentVerified } = require('./otp.service');
    const verified = await isPaymentVerified(payment.id);
    if (verified) {
      const gatewayResponse = await createGatewayCheckout(payment.payment_method, payment, order);
      return { paymentId: payment.id, requiresVerification: false, gateway: payment.payment_method, resumed: true, ...gatewayResponse };
    }
    return { paymentId: payment.id, requiresVerification: true, resumed: true };
  }

  const gatewayResponse = await createGatewayCheckout(payment.payment_method, payment, order);
  return { paymentId: payment.id, requiresVerification: false, gateway: payment.payment_method, resumed: true, ...gatewayResponse };
}

// Single dispatch point. Adding a 4th gateway later = one more `if` block
// here + its own service file - nothing else in this file changes.
async function createGatewayCheckout(paymentMethod, payment, order) {
  if (paymentMethod === 'card') {
    const clientSecret = await createStripeIntentForPayment(payment, order);
    return { clientSecret };
  }
  if (paymentMethod === 'jazzcash') {
    const { fields, txnRefNo, actionUrl } = jazzcashService.buildHostedCheckoutFields({ payment, order });
    await query(`UPDATE payments SET transaction_reference = $1 WHERE id = $2`, [txnRefNo, payment.id]);
    return { redirect: { actionUrl, fields } };
  }
  if (paymentMethod === 'easypaisa') {
    const { fields, orderRefNum, actionUrl } = easypaisaService.buildHostedCheckoutFields({ payment, order });
    await query(`UPDATE payments SET transaction_reference = $1 WHERE id = $2`, [orderRefNum, payment.id]);
    return { redirect: { actionUrl, fields } };
  }
  throw { status: 400, message: 'Unsupported payment method' };
}

// UNCHANGED - Stripe logic exactly as before
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
    idempotencyKey: payment.idempotency_key,
  });

  await query(
    `UPDATE payments SET gateway_payment_intent_id = $1, transaction_reference = $2 WHERE id = $3`,
    [paymentIntent.id, paymentIntent.id, payment.id]
  );

  return paymentIntent.client_secret;
}

async function proceedAfterVerification(paymentId, userId) {
  const paymentResult = await query(
    `SELECT p.*, o.total_amount, o.id AS order_id, o.user_id, o.order_number
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

  const order = { id: payment.order_id, total_amount: payment.total_amount, order_number: payment.order_number };
  const gatewayResponse = await createGatewayCheckout(payment.payment_method, payment, order);

  return { gateway: payment.payment_method, ...gatewayResponse };
}

module.exports = { initiatePayment, proceedAfterVerification };