# Shopify embedded app boilerplate

Everything a Shopify app needs before it does anything of its own:

- **Install / OAuth** with CSRF state, HMAC check and frame-escape (`controllers/authController.js`)
- **Session tokens** (App Bridge) on every screen and API call (`middleware/auth.js`, `utils/jwt.js`)
- **Expiring offline tokens** refreshed and rotated automatically (`services/tokens.js`)
- **Admin GraphQL client** with throttling/backoff (`services/shopify.js`)
- **Webhooks**: `app/uninstalled` plus the three mandatory privacy topics (`services/webhooks.js`, `controllers/webhookController.js`)
- **Plans & billing** through Shopify app subscriptions, with test charges for listed dev shops (`controllers/planController.js`, `services/billing.js`, `models/planModel.js`)
- **Setup flow** after install, read from the store's own data (`controllers/setupController.js`)
- **Help & FAQ** seeded into the database so support can edit it (`controllers/helpController.js`)
- **Encrypted tokens at rest** (`utils/crypto.js`), **idempotent schema on boot** (`config/migrate.js`), optional **email** (`services/mailer.js`)

## Run it

```bash
cp .env.example .env     # fill in SHOPIFY_API_KEY, SHOPIFY_API_SECRET, HOST, TOKEN_ENCRYPTION_KEY, DB_*
npm install
npm run dev              # or: npm start
npm test                 # no MySQL needed
```

In the Partner Dashboard set the App URL to `HOST` and the redirect URL to `HOST/api/auth/callback`. Point the three privacy webhooks at `HOST/webhooks/customers/data_request`, `.../customers/redact` and `.../shop/redact`.

## Add a feature

1. **Table**: add a `CREATE_*` constant in `config/migrate.js` with `store_id → stores(id) ON DELETE CASCADE`, and call it in `runMigrations()`. Mirror it in `sql/schema.sql`.
2. **Model** in `models/`, every query scoped by `store_id`.
3. **Controller** in `controllers/`; read `req.store`, `req.storeId`, `req.shop` (set by `requireSession`). Call Shopify with `shopify.forShop(req.shop, { query, variables })`.
4. **Route** in `routes/` with `router.use(requireSession)`, mounted in `server.js` above the dashboard route.
5. **View** in `views/` using `partials/head`, `partials/nav`, `partials/pageError`. Buttons use `data-post` / `data-navigate` (see `public/javascript/app.js`); never a plain `<a href>` inside the admin.
6. **Menu**: add an `<s-link>` in `views/partials/nav.ejs`. **Setup step**: add to `STEPS` in `controllers/setupController.js`.
7. **Scopes**: add to `SHOPIFY_SCOPES` only when the feature needs them (merchants must reinstall).
8. **Webhook**: add the topic to `TOPICS` in `services/webhooks.js`, a route in `routes/webhookRoute.js`, a handler in `controllers/webhookController.js`.
9. **Customer data**: if the feature stores any, handle it in `customersDataRequest` / `customersRedact`.

## Layout

```
server.js            express app, routes, startup
config/              db pool, schema + seeds
middleware/          session auth, security headers, webhook HMAC
controllers/         one per screen group
models/              one per table
routes/              one per controller
services/            shopify, tokens, webhooks, billing, mailer
utils/               crypto, jwt, cookies, html, shop domain, view helpers
views/               EJS screens + partials
public/              css, js (App Bridge helpers), images
tests/               security + token tests (no DB)
```
