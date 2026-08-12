// JazzCash Hosted Checkout Page (HCP) integration.
// IMPORTANT: field names below follow JazzCash's standard HCP contract.
// Confirm exact field names/lengths against YOUR merchant integration guide
// once JazzCash onboarding gives you sandbox credentials.
const crypto = require('crypto');
const config = require('./gatewayConfig').jazzcash;

function formatDateTime(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function generateTxnRefNo(paymentId) {
  return `T${paymentId}${Date.now().toString().slice(-8)}`;
}

// JazzCash requires: sort all fields alphabetically, join values with '&',
// prefix with the Integrity Salt, then HMAC-SHA256 it.
function computeSecureHash(fields) {
  const sortedKeys = Object.keys(fields).filter((k) => k !== 'pp_SecureHash').sort();
  const joined = sortedKeys.map((k) => fields[k]).join('&');
  const hashString = `${config.integritySalt}&${joined}`;
  return crypto.createHmac('sha256', config.integritySalt).update(hashString).digest('hex').toUpperCase();
}

function buildHostedCheckoutFields({ payment, order }) {
  const now = new Date();
  const expiry = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour expiry
  const amountInPaisa = Math.round(parseFloat(order.total_amount) * 100);
  const txnRefNo = generateTxnRefNo(payment.id);

  const fields = {
    pp_Version: '1.1',
    pp_TxnType: 'MWALLET',
    pp_Language: 'EN',
    pp_MerchantID: config.merchantId,
    pp_Password: config.password,
    pp_TxnRefNo: txnRefNo,
    pp_Amount: String(amountInPaisa),
    pp_TxnCurrency: 'PKR',
    pp_TxnDateTime: formatDateTime(now),
    pp_BillReference: `ORDER${order.id}`,
    pp_Description: `Payment for order ${order.order_number || order.id}`,
    pp_TxnExpiryDateTime: formatDateTime(expiry),
    pp_ReturnURL: config.returnUrl,
    ppmpf_1: String(payment.id), // custom field: maps callback back to our payment row
  };

  fields.pp_SecureHash = computeSecureHash(fields);

  return { fields, txnRefNo, actionUrl: config.hostedCheckoutUrl };
}

// Verifies the pp_SecureHash JazzCash sends back on the return callback.
function verifyCallbackHash(payload) {
  if (!payload.pp_SecureHash) return false;
  const expected = computeSecureHash(payload);
  const received = payload.pp_SecureHash.toUpperCase();
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

module.exports = { buildHostedCheckoutFields, verifyCallbackHash };