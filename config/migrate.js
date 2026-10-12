// config/migrate.js
//
// Idempotent schema setup, applied on every boot so a fresh checkout and an
// existing database converge on the same shape.
//
// Order matters: a table has to exist before another table can point a foreign
// key at it. Creation runs parents-first, exactly as listed in runMigrations().
//
// To change an existing table, add a safeAlter() call rather than editing the
// CREATE statement -- CREATE TABLE IF NOT EXISTS does nothing to a database
// that already has the table.
//
// To add a feature table: write its CREATE_* constant below, reference
// stores(id) with ON DELETE CASCADE so shop/redact clears it, and add it to
// runMigrations() after CREATE_STORES.
const { query } = require("./db");

const DUPLICATE_COLUMN = "ER_DUP_FIELDNAME";
const DUPLICATE_KEY = "ER_DUP_KEYNAME";

async function safeAlter(label, sql) {
  try {
    await query(sql);
    console.log(`Migration applied: ${label}`);
  } catch (err) {
    if (err.code === DUPLICATE_COLUMN || err.code === DUPLICATE_KEY) {
      return; // already applied
    }
    console.error(`Migration failed (${label}):`, err.message);
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* stores                                                              */
/* ------------------------------------------------------------------ */
const CREATE_STORES = `
  CREATE TABLE IF NOT EXISTS stores (
    id            INT AUTO_INCREMENT PRIMARY KEY,

    shop_domain   VARCHAR(255) NOT NULL,
    store_name    VARCHAR(255) DEFAULT NULL,
    email         VARCHAR(255) DEFAULT NULL,

    -- AES-256-GCM ciphertext, never plaintext. See utils/crypto.js.
    access_token  TEXT DEFAULT NULL,

    -- Shopify issues EXPIRING offline tokens; without these the app cannot
    -- refresh and every store breaks an hour after install.
    access_token_expires_at  DATETIME DEFAULT NULL,
    refresh_token            TEXT DEFAULT NULL,
    refresh_token_expires_at DATETIME DEFAULT NULL,

    api_version   VARCHAR(16) NOT NULL DEFAULT '2025-01',
    currency      VARCHAR(8) DEFAULT NULL,

    is_active     TINYINT(1) NOT NULL DEFAULT 1,
    installed_at  DATETIME DEFAULT NULL,
    uninstalled_at DATETIME DEFAULT NULL,

    -- NULL means the app still opens on the setup screen. A date means it
    -- opens on the dashboard, whether setup was finished or skipped.
    onboarded_at  TIMESTAMP NULL DEFAULT NULL,

    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uniq_shop_domain (shop_domain)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

/* ------------------------------------------------------------------ */
/* faqs                                                                */
/* ------------------------------------------------------------------ */
const CREATE_FAQS = `
  CREATE TABLE IF NOT EXISTS faqs (
    id   INT AUTO_INCREMENT PRIMARY KEY,

    question VARCHAR(512) NOT NULL,
    -- TEXT, not VARCHAR: being truncated mid-sentence is the one failure a
    -- help page cannot afford.
    answer   TEXT NOT NULL,

    -- Counted in tens by the seed, so a question can be slipped between two
    -- others without renumbering everything after it.
    position INT NOT NULL DEFAULT 0,

    -- Hidden rather than deleted: a question being reworked should stop
    -- showing without losing the text it had.
    is_active TINYINT(1) NOT NULL DEFAULT 1,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    KEY idx_faqs_active (is_active, position)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

/* ------------------------------------------------------------------ */
/* plans and billing                                                   */
/* ------------------------------------------------------------------ */
const CREATE_PLANS = `
  CREATE TABLE IF NOT EXISTS plans (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    price         DOUBLE NOT NULL DEFAULT 0,
    is_popular    TINYINT(1) NULL DEFAULT 0,
    is_active     TINYINT(1) NULL DEFAULT 1,
    days          INT NULL,
    -- The card's lines, as a JSON list of strings.
    plan_content  LONGTEXT NULL,
    created_at    DATETIME NULL,
    updated_at    DATETIME NULL,
    UNIQUE KEY uniq_plan_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// Shops listed here (status 1) get Shopify TEST charges: no money moves.
const CREATE_DUMMY_SHOPS = `
  CREATE TABLE IF NOT EXISTS dummy_shops (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    shop_name VARCHAR(255) NULL,
    status    TINYINT(1) NULL DEFAULT 1,
    KEY idx_dummy_shop_active (shop_name, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// user_id is the store id. status 1 = the active plan, 0 = past or pending.
const CREATE_USER_MEMBERSHIPS = `
  CREATE TABLE IF NOT EXISTS user_memberships (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NULL,
    membership_id INT NULL,
    created_at    DATETIME NULL,
    updated_at    DATETIME NULL,
    status        TINYINT(1) NULL DEFAULT 1,
    KEY idx_membership_store (user_id, status),
    CONSTRAINT fk_membership_store FOREIGN KEY (user_id)
      REFERENCES stores(id) ON DELETE CASCADE,
    CONSTRAINT fk_membership_plan FOREIGN KEY (membership_id)
      REFERENCES plans(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// status: 1 = waiting for approval, 2 = paid/active, 0 = declined.
const CREATE_MEMBERSHIP_PAYMENTS = `
  CREATE TABLE IF NOT EXISTS membership_payments (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    membership_id INT NULL,
    user_id       INT NULL,
    api_client_id BIGINT NULL,
    charge_id     BIGINT NULL,
    date_add      DATETIME NULL,
    date_update   DATETIME NULL,
    status        INT NULL,
    KEY idx_payment_membership (membership_id),
    KEY idx_payment_store (user_id),
    CONSTRAINT fk_payment_membership FOREIGN KEY (membership_id)
      REFERENCES user_memberships(id) ON DELETE CASCADE,
    CONSTRAINT fk_payment_store FOREIGN KEY (user_id)
      REFERENCES stores(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

/*
 * The plans. Edit here and restart: this runs on every boot and writes these
 * values into the `plans` table.
 *
 *   price    USD per 30-day billing month. 0 = free, no Shopify charge.
 *   popular  true on ONE plan: its card gets the "Popular" badge.
 *   lines    what the card lists.
 *
 * The name is how a plan is found in the database: renaming one creates a new
 * plan and leaves the old one on sale. Removing a line here does not remove a
 * plan -- set is_active = 0 in the table instead.
 *
 * When the app gains limits to enforce (records, seats, features...), add a
 * column per limit with safeAlter(), seed it here, and read it where the
 * limit is enforced -- so the card and the enforcement cannot disagree.
 */
const PLANS = [
  {
    name: "Free", price: 0, popular: false,
    lines: ["Core features", "Community support"],
  },
  {
    name: "Basic", price: 9, popular: false,
    lines: ["Everything in Free", "Email support"],
  },
  {
    name: "Pro", price: 29, popular: true,
    lines: ["Everything in Basic", "Priority support"],
  },
];

async function seedPlans() {
  for (const plan of PLANS) {
    await query(
      `INSERT INTO plans
        (name, price, is_popular, is_active, days, plan_content, created_at, updated_at)
       VALUES (?, ?, ?, 1, 30, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         price = VALUES(price), is_popular = VALUES(is_popular), is_active = 1,
         days = VALUES(days), plan_content = VALUES(plan_content),
         updated_at = NOW()`,
      [
        plan.name,
        plan.price,
        plan.popular ? 1 : 0,
        JSON.stringify(plan.lines || []),
      ]
    );
  }
}

/**
 * Seed the Help screen's FAQ. Any default question not in the table yet is
 * added at the end, so new questions reach installs that were seeded before.
 * To take one down, set is_active = 0 rather than deleting the row, or the
 * next boot adds it back.
 */
async function seedFaqs() {
  // Required here, not at the top: this is the only thing in the migration
  // that needs it, and it keeps the schema file free of app imports.
  const { DEFAULT_FAQ } = require("../controllers/helpController");

  if (!DEFAULT_FAQ.length) return;

  const existing = await query("SELECT question, position FROM faqs");
  const have = new Set(existing.map((row) => row.question));
  let position = existing.reduce((max, row) => Math.max(max, Number(row.position) || 0), 0);

  // position in tens, so a question can be slipped between two others
  // without renumbering the rest.
  const values = DEFAULT_FAQ.filter((item) => !have.has(item.question)).map((item) => {
    position += 10;
    return [item.question, item.answer, position];
  });

  if (!values.length) return;

  await query("INSERT INTO faqs (question, answer, position) VALUES ?", [values]);

  console.log(`Migration: seeded ${values.length} FAQ entries`);
}

async function runMigrations() {
  // Parents before children -- a foreign key needs its target to exist.
  await query(CREATE_STORES);
  await query(CREATE_DUMMY_SHOPS);
  await query(CREATE_PLANS);
  await query(CREATE_USER_MEMBERSHIPS);
  await query(CREATE_MEMBERSHIP_PAYMENTS);
  await seedPlans();
  await query(CREATE_FAQS);
  await seedFaqs();
  // Feature tables go here, after stores.
}

module.exports = { runMigrations, safeAlter, PLANS };
