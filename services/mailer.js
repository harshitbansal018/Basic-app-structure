// services/mailer.js
//
// Outbound email. Sends only when SMTP is configured (SMTP_HOST, and usually
// SMTP_USER / SMTP_PASS / MAIL_FROM); otherwise send() quietly returns false,
// so a feature can call it without checking first.
//
//   const mailer = require("../services/mailer");
//   await mailer.send({
//     to: store.email,
//     subject: "Your report is ready",
//     text: "Open the app to see it: " + mailer.appUrl(store),
//     html: "<p>Open the app to see it.</p>",
//   });
//
// Never put a customer's personal data in an email body.
let transport = null;

function getTransport() {
  if (transport !== null) return transport;
  if (!process.env.SMTP_HOST) {
    transport = false;
    return transport;
  }
  // Required lazily: an install without SMTP does not need the package.
  const nodemailer = require("nodemailer");
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST.trim(),
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transport;
}

function isConfigured() {
  return Boolean(getTransport());
}

/** The app's URL inside this store's Shopify admin. */
function appUrl(store) {
  return `https://${store.shop_domain}/admin/apps/${encodeURIComponent(
    process.env.SHOPIFY_API_KEY || ""
  )}`;
}

/**
 * Send one email. Resolves true when sent, false when SMTP is not configured
 * or there is no recipient. Throws on a transport error.
 */
async function send({ to, subject, text, html }) {
  const mail = getTransport();
  if (!mail || !to) return false;

  await mail.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
  });
  return true;
}

module.exports = { send, isConfigured, appUrl };
