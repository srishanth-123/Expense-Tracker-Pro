const baseTemplate = ({ title, previewText, body }) => `
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${previewText}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f172a;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 20px 45px rgba(15,23,42,0.25);">
          <tr>
            <td style="padding:28px 32px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;">
              <div style="font-size:14px;letter-spacing:1.8px;text-transform:uppercase;opacity:0.9;">ExpenseTracker</div>
              <h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;">${title}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#f8fafc;color:#64748b;font-size:13px;line-height:1.6;">
              This email was sent by ExpenseTracker. If you did not request this, you can safely ignore it.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const button = (href, label) => `
  <a href="${href}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:700;margin:18px 0;">${label}</a>
`;

const welcomeEmail = ({ name }) => baseTemplate({
  title: 'Welcome to ExpenseTracker',
  previewText: 'Your ExpenseTracker account is ready.',
  body: `
    <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">Hi ${name || 'there'},</p>
    <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">Welcome to ExpenseTracker. You can now track income, expenses, wallet balance, split expenses, budgets, analytics, and notifications from one secure dashboard.</p>
    <p style="font-size:16px;line-height:1.7;margin:0;">We are excited to help you manage your money smarter.</p>
  `
});

const passwordResetEmail = ({ name, resetUrl, expiresInMinutes }) => baseTemplate({
  title: 'Reset your password',
  previewText: 'Use this secure link to reset your ExpenseTracker password.',
  body: `
    <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">Hi ${name || 'there'},</p>
    <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">We received a request to reset your ExpenseTracker password. This link expires in ${expiresInMinutes} minutes.</p>
    ${button(resetUrl, 'Reset Password')}
    <p style="font-size:14px;line-height:1.7;color:#64748b;margin:8px 0 0;">If the button does not work, copy and paste this link into your browser:</p>
    <p style="font-size:13px;line-height:1.6;word-break:break-all;color:#475569;margin:8px 0 0;">${resetUrl}</p>
  `
});

const paymentSuccessEmail = ({ name, amount, walletBalance, transactionId, referenceId }) => baseTemplate({
  title: 'Wallet top-up successful',
  previewText: `Your wallet was credited with ₹${amount}.`,
  body: `
    <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">Hi ${name || 'there'},</p>
    <p style="font-size:16px;line-height:1.7;margin:0 0 20px;">Your wallet top-up was successful.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f8fafc;border-radius:14px;overflow:hidden;">
      <tr><td style="padding:14px 16px;color:#64748b;">Amount credited</td><td style="padding:14px 16px;text-align:right;font-weight:700;">₹${amount}</td></tr>
      <tr><td style="padding:14px 16px;color:#64748b;border-top:1px solid #e2e8f0;">Wallet balance</td><td style="padding:14px 16px;text-align:right;font-weight:700;border-top:1px solid #e2e8f0;">₹${walletBalance}</td></tr>
      <tr><td style="padding:14px 16px;color:#64748b;border-top:1px solid #e2e8f0;">Transaction ID</td><td style="padding:14px 16px;text-align:right;font-size:13px;border-top:1px solid #e2e8f0;">${transactionId || '-'}</td></tr>
      <tr><td style="padding:14px 16px;color:#64748b;border-top:1px solid #e2e8f0;">Reference</td><td style="padding:14px 16px;text-align:right;font-size:13px;border-top:1px solid #e2e8f0;">${referenceId || '-'}</td></tr>
    </table>
  `
});

const splitReminderEmail = ({ name, description, amount, paidBy }) => baseTemplate({
  title: 'Split settlement reminder',
  previewText: `Reminder: ₹${amount} is pending for a split expense.`,
  body: `
    <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">Hi ${name || 'there'},</p>
    <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">This is a friendly reminder to settle your pending split expense.</p>
    <p style="font-size:16px;line-height:1.7;margin:0;"><strong>${description}</strong> — ₹${amount}${paidBy ? `, paid by ${paidBy}` : ''}.</p>
  `
});

module.exports = {
  welcomeEmail,
  passwordResetEmail,
  paymentSuccessEmail,
  splitReminderEmail
};
