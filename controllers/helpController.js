// controllers/helpController.js
//
// Help & support: getting-started steps and the FAQ.
//
// The steps live here rather than in the template so a test can prove they
// are all present. The FAQ shown on screen comes from the `faqs` table
// (support can edit it without a deploy); DEFAULT_FAQ only seeds it. Keep all
// of it describing what the app REALLY does.
const faqModel = require("../models/faqModel");

const INSTALL_STEPS = [
  {
    title: "Add the app from the Shopify App Store",
    detail: "Approve the permissions Shopify lists. Nothing in your store changes at this point.",
  },
  {
    title: "Choose a plan",
    detail: "Start on Free and upgrade whenever you need more. Paid plans are approved and billed through Shopify.",
  },
  {
    title: "Open the app from Apps in your Shopify admin",
    detail: "The dashboard is the home screen. Everything the app does starts there.",
  },
];

const DEFAULT_FAQ = [
  {
    question: "How am I billed?",
    answer: "Through Shopify. A paid plan is a recurring Shopify app charge that you approve in your admin, and it appears on your Shopify invoice. You can change or cancel your plan at any time from the Plans screen.",
  },
  {
    question: "What happens when I uninstall the app?",
    answer: "Your Shopify subscription ends automatically and the app loses access to your store straight away. 48 hours later Shopify asks us to erase everything we hold about your store, and we do.",
  },
  {
    question: "What data does the app store?",
    answer: "Your store's address, name and an encrypted access token so the app can talk to Shopify on your behalf, plus your plan history. Nothing about your customers.",
  },
];

function tabFrom(query) {
  const tab = (query || {}).tab;
  return ["install", "faq"].includes(tab) ? tab : "install";
}

exports.getHelp = async (req, res) => {
  try {
    const tab = tabFrom(req.query);
    const faq = tab === "faq" ? await faqModel.listActive() : [];

    res.render("help", {
      shop: req.shop,
      apiKey: process.env.SHOPIFY_API_KEY,
      store: req.store,
      tab,
      steps: INSTALL_STEPS,
      faq,
      supportEmail: process.env.SUPPORT_EMAIL || null,
    });
  } catch (err) {
    console.error("Help screen failed:", err.message);
    res.status(500).send("Error loading help");
  }
};

exports.INSTALL_STEPS = INSTALL_STEPS;
exports.tabFrom = tabFrom;
exports.DEFAULT_FAQ = DEFAULT_FAQ;
