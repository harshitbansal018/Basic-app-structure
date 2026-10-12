// controllers/setupController.js
//
// The screen a store lands on after install, and the app's home until setup
// is finished or skipped.
//
// Nothing about a step's progress is stored. Each step is ticked from the
// store's own data every time the screen is drawn, so a step can never claim
// to be done after the thing it checks has been undone.
//
// The one thing written down is stores.onboarded_at: should the app still
// OPEN here. Finishing sets it, and so does Skip.
//
// To add a step:
//   1. Add an entry to STEPS. `action` is either { label, href } (navigate)
//      or { label, post } (a data-post button -- see public/javascript/app.js).
//      `blockedBy` locks it until another step's key is done.
//   2. Return a boolean for its key from progress(), read from the database,
//      and optionally a `detail` line to show once it is done.
const storeModel = require("../models/storeModel");
const planModel = require("../models/planModel");

const STEPS = [
  {
    key: "plan",
    title: "Choose a plan",
    body: "Start on Free and change any time. Paid plans are billed through Shopify.",
    action: { label: "Go to Plans", href: "/plans" },
  },
];

/** Which steps this store has actually done, read from its own data. */
async function progress(store) {
  const membership = await planModel.activeMembership(store.id);

  return {
    plan: Boolean(membership),
    detail: {
      plan: membership ? `You are on the ${membership.name} plan.` : null,
    },
  };
}

function build(done) {
  const finished = new Set();

  return STEPS.map((step) => {
    const complete = Boolean(done[step.key]);
    if (complete) finished.add(step.key);

    let state = "ready";
    let note = null;
    if (complete) {
      state = "done";
    } else if (step.blockedBy && !finished.has(step.blockedBy) && !done[step.blockedBy]) {
      state = "locked";
      note = `Available once “${STEPS.find((other) => other.key === step.blockedBy).title}” is done.`;
    }

    return {
      ...step,
      state,
      note,
      detail: (done.detail && done.detail[step.key]) || null,
    };
  });
}

async function statusFor(store) {
  const steps = build(await progress(store));
  const done = steps.filter((step) => step.state === "done").length;

  return {
    steps,
    done,
    total: steps.length,
    complete: done === steps.length,
    next: steps.find((step) => step.state === "ready") || null,
  };
}

exports.getSetup = async (req, res) => {
  try {
    const status = await statusFor(req.store);
    if (status.complete) await storeModel.markOnboarded(req.store.id);

    res.render("setup", {
      shop: req.shop,
      apiKey: process.env.SHOPIFY_API_KEY,
      store: req.store,
      ...status,
    });
  } catch (err) {
    console.error("Setup screen failed:", err.message);
    res.status(500).send("Error loading setup");
  }
};

exports.postSkip = async (req, res) => {
  try {
    await storeModel.markOnboarded(req.store.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Skipping setup failed:", err.message);
    return res.status(500).json({ error: "Could not skip setup." });
  }
};

exports.STEPS = STEPS;
exports.statusFor = statusFor;
