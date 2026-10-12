// controllers/webhookController.js
//
// Every handler here runs behind middleware/verifyWebhook, so the request is
// proven to come from Shopify before any of this executes. Handlers reply 200
// first and do their bookkeeping afterwards -- Shopify retries on anything
// that is slow or non-200.
//
// To handle another topic: add it to TOPICS in services/webhooks.js (so it is
// registered at install), add a route in routes/webhookRoute.js, and write
// its handler here. req.webhookShop and req.webhookPayload are set by the
// verify middleware.
const storeModel = require("../models/storeModel");
const { normalizeShopDomain } = require("../utils/shop");

/* ===================== app/uninstalled ===================== */

exports.appUninstalled = async (req, res) => {
  const shop = normalizeShopDomain(req.webhookShop);

  // Acknowledge first; Shopify does not care about our bookkeeping.
  res.status(200).send("OK");

  if (!shop) {
    console.warn("Uninstall webhook had no usable shop domain");
    return;
  }

  try {
    const store = await storeModel.findByDomain(shop);

    if (!store) {
      console.log("Uninstall webhook for unknown shop:", shop);
      return;
    }

    // Deactivates, stamps uninstalled_at and drops the revoked tokens. The
    // row is kept so a reinstall resumes rather than starting over.
    await storeModel.markUninstalled(shop);

    console.log("App uninstalled for", shop);
  } catch (err) {
    console.error("Uninstall webhook processing failed:", err.message);
  }
};

/* ===================== privacy (mandatory) ===================== */

/**
 * A customer has asked for the data this app holds about them.
 *
 * The boilerplate stores no customer data. If a feature starts storing any,
 * gather it here and send it to the shop owner (Shopify gives 30 days).
 */
exports.customersDataRequest = async (req, res) => {
  res.status(200).send("OK");

  const shop = normalizeShopDomain(req.webhookShop);
  const payload = req.webhookPayload || {};
  const customerId = payload.customer && payload.customer.id;

  if (!shop || !customerId) return;

  console.log(
    `customers/data_request for ${shop}: customer ${customerId} -- no customer data is stored`
  );
};

/**
 * A customer has asked to be erased.
 *
 * The boilerplate stores no customer data. If a feature starts storing any,
 * delete every row about payload.customer.id for this shop here.
 */
exports.customersRedact = async (req, res) => {
  res.status(200).send("OK");

  const shop = normalizeShopDomain(req.webhookShop);
  const payload = req.webhookPayload || {};
  const customerId = payload.customer && payload.customer.id;

  if (!shop || !customerId) return;

  console.log(
    `customers/redact for ${shop}: customer ${customerId} -- no customer data is stored`
  );
};

/**
 * 48 hours after uninstall: erase everything about the shop.
 *
 * Every dependent table is ON DELETE CASCADE, so deleting the store row
 * clears its memberships and payments -- and any feature table that follows
 * the same rule.
 */
exports.shopRedact = async (req, res) => {
  const shop = normalizeShopDomain(req.webhookShop);

  res.status(200).send("OK");

  if (!shop) return;

  try {
    const store = await storeModel.findByDomain(shop);

    if (!store) return;

    await storeModel.deleteStore(shop);

    console.log("shop/redact completed for", shop);
  } catch (err) {
    console.error("shop/redact processing failed:", err.message);
  }
};
