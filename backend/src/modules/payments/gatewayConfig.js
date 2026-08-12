// Central config for local (Pakistani) payment gateways.
// Mirrors the existing config/stripe.js pattern.
module.exports = {
  jazzcash: {
    merchantId: process.env.JAZZCASH_MERCHANT_ID,
    password: process.env.JAZZCASH_PASSWORD,
    integritySalt: process.env.JAZZCASH_INTEGRITY_SALT,
    hostedCheckoutUrl: process.env.JAZZCASH_HOSTED_CHECKOUT_URL,
    returnUrl: process.env.JAZZCASH_RETURN_URL,
  },
  easypaisa: {
    storeId: process.env.EASYPAISA_STORE_ID,
    hashKey: process.env.EASYPAISA_HASH_KEY,
    checkoutUrl: process.env.EASYPAISA_CHECKOUT_URL,
    returnUrl: process.env.EASYPAISA_RETURN_URL,
  },
};