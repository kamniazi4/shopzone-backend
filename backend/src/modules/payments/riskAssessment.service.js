// Computes a risk score for a payment attempt based on multiple non-sensitive
// signals available in the existing schema. Higher score = higher risk.
// This never replaces the payment gateway's own fraud checks (e.g. 3DS) -
// it only decides whether OUR system additionally requires an OTP step.
const { query } = require('../../config/db');
const { getRiskConfig } = require('../../config/riskConfig');

// IMPORTANT: accepts an optional `client` (the same pg client/transaction
// used by payment.service.js). If provided, ALL queries here run on that
// same connection instead of grabbing a new one from the pool. This avoids
// a self-lock: payment.service.js already holds a `FOR UPDATE` lock on the
// orders row on its own connection, and payment_risk_assessments.order_id
// has a foreign key to orders, so an INSERT here (on a different pooled
// connection) would otherwise have to wait for a lock that the very same
// logical request is holding open on another connection - a deadlock that
// only resolves via statement_timeout.
async function assessRisk({ userId, orderId, orderAmount, deviceId, client }) {
  const db = client || { query };

  const config = await getRiskConfig();
  const reasons = [];
  let score = 0;

  // Signal 1: New account (created recently)
  const userResult = await db.query(`SELECT created_at FROM users WHERE id = $1`, [userId]);
  const accountAgeDays = userResult.rows.length
    ? (Date.now() - new Date(userResult.rows[0].created_at).getTime()) / (1000 * 60 * 60 * 24)
    : 999;
  if (accountAgeDays < config.new_account_days) {
    score += 20;
    reasons.push('new_account');
  }

  // Signal 2: High order value (absolute threshold)
  if (orderAmount >= config.high_value_threshold) {
    score += 20;
    reasons.push('high_order_value');
  }

  // Signal 3: Order value compared to customer's historical average
  const historyResult = await db.query(
    `SELECT AVG(total_amount) AS avg_amount, COUNT(*) AS completed_count
     FROM orders WHERE user_id = $1 AND status IN ('confirmed', 'delivered')`,
    [userId]
  );
  const avgAmount = parseFloat(historyResult.rows[0].avg_amount) || 0;
  const completedCount = parseInt(historyResult.rows[0].completed_count, 10) || 0;

  if (completedCount === 0) {
    // No purchase history at all - treat as new/unproven customer
    score += 15;
    reasons.push('no_purchase_history');
  } else if (avgAmount > 0 && orderAmount > avgAmount * 3) {
    score += 15;
    reasons.push('amount_far_above_average');
  }

  // Signal 4: New/unrecognized device
  if (deviceId) {
    const deviceTrustResult = await db.query(
      `SELECT 1 FROM payment_trusted_devices
       WHERE user_id = $1 AND device_id = $2 AND trusted_until > CURRENT_TIMESTAMP`,
      [userId, deviceId]
    );
    if (deviceTrustResult.rows.length === 0) {
      score += 15;
      reasons.push('new_or_untrusted_device');
    }
  } else {
    score += 10;
    reasons.push('missing_device_id');
  }

  // Signal 5: Recent failed payment attempts (velocity/fraud signal)
  const failedResult = await db.query(
    `SELECT COUNT(*) AS failed_count FROM payments
     WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)
       AND status = 'failed'
       AND created_at >= CURRENT_TIMESTAMP - ($2 || ' hours')::INTERVAL`,
    [userId, config.recent_failed_attempts_window_hours]
  );
  const failedCount = parseInt(failedResult.rows[0].failed_count, 10) || 0;
  if (failedCount >= config.recent_failed_attempts_threshold) {
    score += 20;
    reasons.push('recent_failed_attempts');
  }

  // Signal 6: Unusual transaction frequency (many payment attempts in a short time)
  const frequencyResult = await db.query(
    `SELECT COUNT(*) AS recent_count FROM payments
     WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)
       AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
    [userId]
  );
  const recentCount = parseInt(frequencyResult.rows[0].recent_count, 10) || 0;
  if (recentCount >= 3) {
    score += 15;
    reasons.push('high_transaction_frequency');
  }

  // Determine risk level from the configured thresholds
  let riskLevel;
  if (score <= config.low_risk_max_score) {
    riskLevel = 'low';
  } else if (score <= config.medium_risk_max_score) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'high';
  }

  const requiresVerification =
    riskLevel === 'high' || (riskLevel === 'medium' && config.medium_requires_verification === true);

  // Log the assessment for audit purposes (no sensitive data stored).
  // Runs on `db` (the same transaction client when one is passed in) so it
  // never fights the outer transaction's lock on the orders row.
  await db.query(
    `INSERT INTO payment_risk_assessments (order_id, user_id, risk_score, risk_level, reasons, device_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orderId, userId, score, riskLevel, JSON.stringify(reasons), deviceId || null]
  );

  return { score, riskLevel, requiresVerification, reasons };
}

// Marks a device as trusted for a configured number of days after a successful payment.
// This runs AFTER the payment transaction has committed (called elsewhere, outside
// payment.service.js's transaction), so it's safe to keep using the plain pool `query`.
async function markDeviceTrusted(userId, deviceId) {
  if (!deviceId) return;
  const config = await getRiskConfig();

  await query(
    `INSERT INTO payment_trusted_devices (user_id, device_id, trusted_until)
     VALUES ($1, $2, CURRENT_TIMESTAMP + ($3 || ' days')::INTERVAL)
     ON CONFLICT (user_id, device_id)
     DO UPDATE SET trusted_until = CURRENT_TIMESTAMP + ($3 || ' days')::INTERVAL`,
    [userId, deviceId, config.trusted_device_days]
  );
}

module.exports = { assessRisk, markDeviceTrusted };