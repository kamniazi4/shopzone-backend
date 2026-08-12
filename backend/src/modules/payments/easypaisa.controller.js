// Handles the EasyPaisa return/callback endpoint.
const easypaisaService = require('./easypaisa.service');
const { finalizeCallback, logEvent } = require('./localGateway.shared');

async function callback(req, res, next) {
  try {
    const payload = req.body;
    const paymentId = payload.ppmpf_1;

    if (!paymentId) {
      return res.status(400).send('Missing payment reference');
    }

    if (!easypaisaService.verifyCallbackHash(payload)) {
      await logEvent(paymentId, 'easypaisa_invalid_signature', payload);
      return res.status(400).send('Invalid signature');
    }

    // '0000' = success per EasyPaisa's common response-code convention.
    // Confirm the exact success code against your merchant docs.
    const isSuccess = payload.responseCode === '0000' || payload.status === 'SUCCESS';

    const result = await finalizeCallback({
      paymentId,
      isSuccess,
      gatewayTxnRef: payload.transactionId || payload.orderRefNum,
      amountReceived: parseFloat(payload.amount),
      eventName: 'easypaisa',
      rawPayload: payload,
    });

    if (result.outcome === 'not_found') return res.status(404).send('Payment not found');

    return res.redirect(
      `${process.env.FRONTEND_BASE_URL}/payment-return?payment_id=${paymentId}&status=${result.outcome === 'success' ? 'success' : 'failed'}`
    );
  } catch (err) {
    next(err);
  }
}

module.exports = { callback };