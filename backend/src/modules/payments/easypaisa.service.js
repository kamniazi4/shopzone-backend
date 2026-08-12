// EasyPaisa Hosted Checkout integration.
// IMPORTANT: field names below follow EasyPaisa's standard Open API HTTP
// Hosted Checkout contract. Confirm exact names against YOUR merchant
// integration guide once EasyPaisa onboarding gives you credentials.
const crypto = require('crypto');
const config = require('./gatewayConfig').easypaisa;

function generateOrderRefNum(paymentId) {
  return `EP${paymentId}${Date.now().toString().slice(-8)}`;
}

function computeHash(fields) {
  const sortedKeys = Object.keys(fields).filter((k) => k !== 'merchantHashedReq').sort();
  const joined = sortedKeys.map((k) => `${k}=${fields[k]}`).join('&');
  return crypto.createHmac('sha256', config.hashKey).update(joined).digest('hex');
}

function buildHostedCheckoutFields({ payment, order }) {
  const orderRefNum = generateOrderRefNum(payment.id);
  const expiry = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const expiryStr = `${expiry.getFullYear()}${pad(expiry.getMonth() + 1)}${pad(expiry.getDate())} ${pad(expiry.getHours())}:${pad(expiry.getMinutes())}:${pad(expiry.getSeconds())}`;

  const fields = {
    storeId: config.storeId,
    amount: parseFloat(order.total_amount).toFixed(2),
    postBackURL: config.returnUrl,
    orderRefNum,
    expiryDate: expiryStr,
    autoRedirect: '1',
    ppmpf_1: String(payment.id), // maps callback back to our payment row
  };

  fields.merchantHashedReq = computeHash(fields);

  return { fields, orderRefNum, actionUrl: config.checkoutUrl };
}

function verifyCallbackHash(payload) {
  if (!payload.merchantHashedReq) return false;
  const expected = computeHash(payload);
  const received = payload.merchantHashedReq;
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

module.exports = { buildHostedCheckoutFields, verifyCallbackHash };