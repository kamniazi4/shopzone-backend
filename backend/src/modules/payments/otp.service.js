// Handles payment-specific OTP generation, hashing, and verification.
// Distinct from the registration OTP flow - this one is scoped to a single
// payment record and enforces strict rate limits and attempt caps.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('../../config/db');
const { getRiskConfig } = require('../../config/riskConfig');
const { sendOtpEmail } = require('../../config/email');

function generateSecureOtp() {
  // Cryptographically secure 6-digit code
  return crypto.randomInt(100000, 999999).toString();
}

function maskEmail(email) {
  const [name, domain] = email.split('@');
  if (name.length <= 1) return `*@${domain}`;
  return `${name[0]}${'*'.repeat(Math.max(name.length - 1, 3))}@${domain}`;
}

function maskPhone(phone) {
  if (!phone || phone.length < 4) return '****';
  return `${phone.slice(0, 4)}${'*'.repeat(Math.max(phone.length - 8, 4))}${phone.slice(-4)}`;
}

// Returns masked contact options available for this user, without exposing full details
async function getMaskedContactOptions(userId) {
  const result = await query(`SELECT email, phone FROM users WHERE id = $1`, [userId]);
  if (result.rows.length === 0) return null;

  const user = result.rows[0];
  return {
    email: user.email ? maskEmail(user.email) : null,
    mobile: user.phone ? maskPhone(user.phone) : null,
  };
}

// Generates and sends a new OTP for the given payment, invalidating any
// previous unconsumed OTP for that payment first.
async function sendPaymentOtp(userId, paymentId, deliveryMethod) {
  const config = await getRiskConfig();

  // Enforce rate limiting: max requests per hour for this payment
  const recentRequestsResult = await query(
    `SELECT COUNT(*) AS count FROM payment_otp_verifications
     WHERE payment_id = $1 AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
    [paymentId]
  );
  if (parseInt(recentRequestsResult.rows[0].count, 10) >= config.otp_max_requests_per_hour) {
    throw new Error('Too many verification code requests. Please try again later.');
  }

  // Enforce resend cooldown
  const lastOtpResult = await query(
    `SELECT created_at FROM payment_otp_verifications
     WHERE payment_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [paymentId]
  );
  if (lastOtpResult.rows.length > 0) {
    const secondsSinceLast = (Date.now() - new Date(lastOtpResult.rows[0].created_at).getTime()) / 1000;
    if (secondsSinceLast < config.otp_resend_cooldown_seconds) {
      const waitSeconds = Math.ceil(config.otp_resend_cooldown_seconds - secondsSinceLast);
      throw new Error(`Please wait ${waitSeconds} seconds before requesting a new code.`);
    }
  }

  // Invalidate any previous unconsumed OTP for this payment
  await query(
    `UPDATE payment_otp_verifications SET consumed_at = CURRENT_TIMESTAMP
     WHERE payment_id = $1 AND consumed_at IS NULL AND verified_at IS NULL`,
    [paymentId]
  );

  const otpCode = generateSecureOtp();
  const otpHash = await bcrypt.hash(otpCode, 10);
  const expiresAt = new Date(Date.now() + config.otp_expiry_minutes * 60 * 1000);

  await query(
    `INSERT INTO payment_otp_verifications
     (user_id, payment_id, delivery_method, otp_hash, expires_at, max_attempts)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, paymentId, deliveryMethod, otpHash, expiresAt, config.otp_max_attempts]
  );

  // Deliver the OTP. SMS delivery requires an SMS provider (e.g. Twilio) which
  // is not yet configured in this project - email delivery is fully wired up.
  if (deliveryMethod === 'email') {
    const userResult = await query(`SELECT email FROM users WHERE id = $1`, [userId]);
    await sendOtpEmail(userResult.rows[0].email, otpCode, 'payment');
  } else if (deliveryMethod === 'mobile') {
    // Placeholder: wire up an SMS provider (Twilio, etc.) here before enabling
    // this option in production. Never log the OTP itself.
    throw new Error('SMS delivery is not yet configured. Please choose email verification.');
  }

  // Never return the OTP code itself, and never log it
  return { expiresInMinutes: config.otp_expiry_minutes };
}

// Verifies a submitted OTP code against the most recent unconsumed record for this payment
async function verifyPaymentOtp(paymentId, submittedCode) {
  const result = await query(
    `SELECT * FROM payment_otp_verifications
     WHERE payment_id = $1 AND consumed_at IS NULL AND verified_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [paymentId]
  );

  if (result.rows.length === 0) {
    throw new Error('No active verification code found. Please request a new one.');
  }

  const otpRecord = result.rows[0];

  if (new Date(otpRecord.expires_at) < new Date()) {
    throw new Error('Verification code has expired. Please request a new one.');
  }

  if (otpRecord.attempts >= otpRecord.max_attempts) {
    throw new Error('Maximum verification attempts reached. Please request a new code.');
  }

  const isMatch = await bcrypt.compare(submittedCode, otpRecord.otp_hash);

  // Always increment attempts, whether match or not, to enforce the cap
  await query(
    `UPDATE payment_otp_verifications SET attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [otpRecord.id]
  );

  if (!isMatch) {
    const attemptsLeft = otpRecord.max_attempts - (otpRecord.attempts + 1);
    throw new Error(`Incorrect code. ${Math.max(attemptsLeft, 0)} attempt(s) remaining.`);
  }

  await query(
    `UPDATE payment_otp_verifications SET verified_at = CURRENT_TIMESTAMP, consumed_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [otpRecord.id]
  );

  return true;
}

// Checks whether a given payment has a successfully verified OTP on record
async function isPaymentVerified(paymentId) {
  const result = await query(
    `SELECT 1 FROM payment_otp_verifications WHERE payment_id = $1 AND verified_at IS NOT NULL LIMIT 1`,
    [paymentId]
  );
  return result.rows.length > 0;
}

module.exports = { getMaskedContactOptions, sendPaymentOtp, verifyPaymentOtp, isPaymentVerified };