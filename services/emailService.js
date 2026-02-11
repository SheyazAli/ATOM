const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendOtpMail = async (email, otp) => {
  await transporter.sendMail({
    from: '"ATOM" <no-reply@atom.com>',
    to: email,
    subject: 'ATOM - Email Verification OTP',
    html: `
      <div style="font-family:Segoe UI, sans-serif;">
        <h2>Verify your ATOM account</h2>
        <p>Your OTP is:</p>
        <h1 style="letter-spacing:4px;">${otp}</h1>
        <p>This OTP is valid for <b>5 minutes</b>.</p>
        <p>If you didn’t request this, please ignore this email.</p>
      </div>
    `
  });
};

module.exports = { sendOtpMail };
