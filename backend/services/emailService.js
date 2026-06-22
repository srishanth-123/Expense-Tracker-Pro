const { Resend } = require('resend');
const logger = require('../utils/logger');
const {
  welcomeEmail,
  passwordResetEmail,
  paymentSuccessEmail,
  splitReminderEmail
} = require('../templates/emailTemplates');

const getClient = () => {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
};

const getFromAddress = () => process.env.EMAIL_FROM || null;

const sendEmail = async ({ to, subject, html }) => {
  const resend = getClient();
  const from = getFromAddress();

  if (!resend || !from) {
    logger.warn('Email skipped: RESEND_API_KEY or EMAIL_FROM is not configured');
    return { skipped: true };
  }

  try {
    return await resend.emails.send({ from, to, subject, html });
  } catch (error) {
    logger.error('Email delivery failed:', error);
    return { failed: true, error: error.message };
  }
};

const sendEmailAsync = (payload) => {
  setImmediate(() => {
    sendEmail(payload).catch((error) => logger.error('Async email failure:', error));
  });
};

const sendWelcomeEmail = (user) => {
  sendEmailAsync({
    to: user.email,
    subject: 'Welcome to ExpenseTracker',
    html: welcomeEmail({ name: user.name })
  });
};

const sendPasswordResetEmail = (user, resetUrl, expiresInMinutes) => {
  logger.info(`[MAILER] Password Reset Link for ${user.email}: ${resetUrl}`);
  sendEmailAsync({
    to: user.email,
    subject: 'Reset your ExpenseTracker password',
    html: passwordResetEmail({ name: user.name, resetUrl, expiresInMinutes })
  });
};

const sendPaymentSuccessEmail = (user, payment) => {
  sendEmailAsync({
    to: user.email,
    subject: 'Wallet top-up successful',
    html: paymentSuccessEmail({
      name: user.name,
      amount: payment.amount,
      walletBalance: payment.walletBalance,
      transactionId: payment.transactionId,
      referenceId: payment.referenceId
    })
  });
};

const sendSplitReminderEmail = (user, split) => {
  sendEmailAsync({
    to: user.email,
    subject: 'Split settlement reminder',
    html: splitReminderEmail({
      name: user.name,
      description: split.description,
      amount: split.amount,
      paidBy: split.paidBy
    })
  });
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPaymentSuccessEmail,
  sendSplitReminderEmail
};
