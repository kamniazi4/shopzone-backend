// Handles the JazzCash return/callback endpoint. JazzCash redirects the
// customer's browser here (POST) after they complete/cancel the hosted checkout.
const jazzcashService = require('./jazzcash.service');
const { finalizeCallback, logEvent } = require('./localGateway.shared');

async function callback(req, res, next) {
  try {
    const payload = req.body;
    const paymentId = payload.ppmpf_1;

    if (!paymentId) {
      return res.status(400).send('Missing payment reference');
    }

    // 1. Invalid signature check - MUST happen before trusting anything else
    if (!jazzcashService.verifyCallbackHash(payload)) {
      await logEvent(paymentId, 'jazzcash_invalid_signature', payload);
      return res.status(400).send('Invalid signature');
    }

    // 2. pp_ResponseCode '000' = success per JazzCash spec.
    //    Anything else = failed/declined/cancelled by customer or bank.
    const isSuccess = payload.pp_ResponseCode === '000';

    const result = await finalizeCallback({
      paymentId,
      isSuccess,
      gatewayTxnRef: payload.pp_TxnRefNo,
      amountReceived: parseInt(payload.pp_Amount, 10) / 100,
      eventName: 'jazzcash',
      rawPayload: payload,
    });

    if (result.outcome === 'not_found') return res.status(404).send('Payment not found');

    // Redirect the customer's browser back to our frontend result page
    return res.redirect(
      `${process.env.FRONTEND_BASE_URL}/payment-return?payment_id=${paymentId}&status=${result.outcome === 'success' ? 'success' : 'failed'}`
    );
  } catch (err) {
    next(err);
  }
}

module.exports = { callback };