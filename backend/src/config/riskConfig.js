// Loads risk/OTP configuration from the risk_config table, with sane fallback
// defaults if a key is missing. Never hardcode thresholds elsewhere - always
// read them through this module so admins can change behavior without a deploy.
const { query } = require('./db');

const DEFAULTS = {
  low_risk_max_score: 30,
  medium_risk_max_score: 60,
  medium_requires_verification: false,
  high_value_threshold: 500,
  new_account_days: 3,
  otp_expiry_minutes: 5,
  otp_resend_cooldown_seconds: 60,
  otp_max_attempts: 5,
  otp_max_requests_per_hour: 5,
  trusted_device_days: 30,
  recent_failed_attempts_window_hours: 24,
  recent_failed_attempts_threshold: 2,
};

async function getRiskConfig() {
  const result = await query(`SELECT key_name, value_data FROM risk_config`);
  const config = { ...DEFAULTS };

  for (const row of result.rows) {
    const raw = row.value_data;
    if (raw === 'true' || raw === 'false') {
      config[row.key_name] = raw === 'true';
    } else if (!isNaN(Number(raw))) {
      config[row.key_name] = Number(raw);
    } else {
      config[row.key_name] = raw;
    }
  }

  return config;
}

module.exports = { getRiskConfig, DEFAULTS };