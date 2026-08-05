// Nodemailer transporter for sending OTP emails via Gmail SMTP
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

async function sendOtpEmail(toEmail, otpCode, purpose) {
  const subjects = {
    registration: 'Verify Your ShopZone Account',
    login: 'Your ShopZone Login Code',
    payment: 'Verify Your Payment - ShopZone',
  };
  const subject = subjects[purpose] || 'Your ShopZone Verification Code';

  await transporter.sendMail({
    from: `"ShopZone" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 400px; margin: auto;">
        <h2 style="color: #ff9900;">ShopZone</h2>
        <p>Your one-time verification code is:</p>
        <h1 style="letter-spacing: 4px; color: #131921;">${otpCode}</h1>
        <p>This code expires shortly. Do not share it with anyone.</p>
      </div>
    `,
  });
}

module.exports = { sendOtpEmail };