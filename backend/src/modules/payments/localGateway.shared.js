// Shared "finalize callback" logic for redirect-based local gateways
// (JazzCash, EasyPaisa, and any future one). Keeps the verify -> dedupe ->
// amount-check -> update payment+order -> audit-log flow in ONE place
// instead of duplicating it per gateway controller.
const { getClient, query } = require('../../config/db');

async function finalizeCallback({ paymentId, isSuccess, gatewayTxnRef, amountReceived, eventName, rawPayload }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const paymentResult = await client.query(
      `SELECT p.*, o.id AS order_id FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE p.id = $1 FOR UPDATE`,
      [paymentId]
    );

    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { outcome: 'not_found' };
    }
    const payment = paymentResult.rows[0];

    // Duplicate callback: gateway retried but we already finalized this payment
    if (['completed', 'failed'].includes(payment.status)) {
      await client.query('ROLLBACK');
      await logEvent(paymentId, `${eventName}_duplicate_callback`, rawPayload);
      return { outcome: 'duplicate' };
    }

    // Incorrect amount check - never trust the gateway's amount blindly
    const expectedPaisaEquivalent = Math.round(parseFloat(payment.amount) * 100);
    const receivedPaisaEquivalent = Math.round(amountReceived * 100);
    if (expectedPaisaEquivalent !== receivedPaisaEquivalent) {
      await client.query(
        `UPDATE payments SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [paymentId]
      );
      await client.query('COMMIT');
      await logEvent(paymentId, `${eventName}_amount_mismatch`, rawPayload);
      return { outcome: 'amount_mismatch' };
    }

    await client.query(
      `UPDATE payments SET status = $1, transaction_reference = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [isSuccess ? 'completed' : 'failed', gatewayTxnRef, paymentId]
    );

    if (isSuccess) {
      await client.query(
        `UPDATE orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [payment.order_id]
      );
      await client.query(
        `INSERT INTO order_status_history (order_id, status, notes) VALUES ($1, 'confirmed', $2)`,
        [payment.order_id, `${eventName} payment completed`]
      );
    }

    await client.query(
      `INSERT INTO payment_events (payment_id, event_name, payload) VALUES ($1, $2, $3)`,
      [paymentId, isSuccess ? `${eventName}_completed` : `${eventName}_failed`, JSON.stringify(rawPayload)]
    );

    await client.query('COMMIT');
    return { outcome: isSuccess ? 'success' : 'failed', orderId: payment.order_id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function logEvent(paymentId, eventName, payload) {
  try {
    await query(
      `INSERT INTO payment_events (payment_id, event_name, payload) VALUES ($1, $2, $3)`,
      [paymentId, eventName, JSON.stringify(payload)]
    );
  } catch (_) { /* best-effort audit log, never block the response on this */ }
}

module.exports = { finalizeCallback, logEvent };