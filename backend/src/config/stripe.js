// Stripe SDK instance, initialized with the secret key from environment variables
const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Warning: STRIPE_SECRET_KEY is not set in .env');
}

console.log('typeof Stripe:', typeof Stripe);
console.log('STRIPE_SECRET_KEY value:', process.env.STRIPE_SECRET_KEY);

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

console.log('typeof stripe instance:', typeof stripe);
console.log('stripe.paymentIntents exists:', !!stripe.paymentIntents);

module.exports = stripe;