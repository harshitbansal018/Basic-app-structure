// controllers/dashboardController.js
//
// The app's home once setup is finished or skipped.
//
// In the boilerplate it shows the store, its plan and what is left of setup.
// Replace the "Getting started" card in views/dashboard.ejs with the app's
// own numbers and screens; load them here, scoped to req.storeId.
const planModel = require("../models/planModel");
const setupController = require("./setupController");

exports.getDashboard = async (req, res) => {
  try {
    // Straight from install to setup, and here once it is finished or
    // skipped. Rendered in place: a redirect would drop the id_token.
    if (!req.store.onboarded_at) {
      return setupController.getSetup(req, res);
    }

    const [setup, current] = await Promise.all([
      setupController.statusFor(req.store),
      planModel.effectivePlan(req.storeId),
    ]);

    res.render("dashboard", {
      shop: req.shop,
      apiKey: process.env.SHOPIFY_API_KEY,
      store: req.store,
      setup: setup.complete ? null : setup,
      plan: current.plan,
      planChosen: current.chosen,
    });
  } catch (err) {
    console.error("Dashboard load failed:", err.message);
    res.status(500).send("Error loading dashboard");
  }
};
