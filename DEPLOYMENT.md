# Vercel deployment — Supabase edition

1. Commit and push application code, package.json, supabase-ca.crt, lib/, src/cloud.js, and the updated vercel.json. Never commit .env files, .auth.json, or node_modules.
2. In Vercel project settings, add/update these server-only environment variables from the ignored .env.vercel.local file:
   - SUPABASE_URL
   - SUPABASE_SECRET_KEY
   - DATABASE_URL
3. The previous AUTH_USERNAME, AUTH_PASSWORD_SALT, AUTH_PASSWORD_HASH, and SESSION_SECRET variables are no longer used and can be removed.
4. Redeploy. The existing Other preset and vercel.json route all requests through the Node function. The certificate and lib files are bundled. PostgreSQL uses TLS verification, a single connection per instance, and disabled prepared statements for transaction pooling.
5. Test sign-in, inventory loading, a product/draft, PDF export, and sign-out at the deployed HTTPS URL. The current production inventory must not be adjusted merely to test deployment.

The Supabase tables and initial member account have already been created. Production and Preview deployments using these same variables share the SAME database; use a separate Supabase project for isolated preview testing.

Passwords are managed by Supabase Auth. Existing app users are not automatically workspace members: add trusted Supabase user IDs to larz.members using an admin database connection. There is one shared workspace and one permissions level in this version. The original shared login ID is retired.

Login requests use Supabase Auth plus a best-effort per-instance limiter. Configure Vercel Firewall login rate limits before broad public sharing. Database migrations/admin maintenance currently use the supplied database account; retain its connection string only in private server settings.

Deployment has not been performed by this chat. Local browser login and live database stock tests have passed.
# Public customer orders

The customer form is served at `/order`. Employee pages and order records still require a workspace login.

1. Apply `supabase/003-orders.sql` to an existing database before deploying this version. The schema has already been applied to the configured project during implementation. New projects can use `node scripts/migrate.cjs` to apply all migrations.
2. In Inventory, edit each product you want customers to order, add a photo, and enable **Show on public order form**. Existing products default to private. Publishing includes the product name, photo, RM price and available/unavailable status; exact stock and staff fields remain private.
3. Commit and push the app changes so Vercel deploys the new code. The Vercel function bundle includes `order.html`, `order.css` and `order.js`.
4. Open **Pending Order → Open form** to check it, or use **Copy form link** to distribute the production URL.

Submissions are pending and do not reserve stock. Employees review the order and choose **Create invoice** to prefill the existing editor. **Confirm** saves the invoice, deducts stock and approves the order in one transaction, then opens Save PDF / Share PDF. The shipping charge is entered by the employee. Rejection does not affect stock. Cancelled/deleted invoices retain the source order's approval history.

The public form uses server-calculated prices, server validation, origin checks, a signed expiring form token, a honeypot, bounded requests, Cloudflare Turnstile and database-backed rate limits. Public submissions are limited to 20 attempts per IP per 15 minutes; catalogue requests are limited to 120. Rate-limit addresses are HMAC-hashed. `ORDER_RATE_SECRET` remains optional; its existing fallback is unchanged. No Vercel edge firewall rules were added: that change was cancelled.

## Cloudflare Turnstile

1. In Cloudflare Dashboard, open Turnstile and create a **Managed** widget named **LARZ Orders**. Add `receipt-generator-larz.vercel.app` as a hostname (without `https://` or `/order`). Add any custom hostname used for the form too. Leave pre-clearance off.
2. Add the following variables to the ignored `.env.vercel.local` for local configuration and separately to Vercel Project Settings → Environment Variables for the deployments that use these hostnames:

| Variable | Value | Vercel type |
| --- | --- | --- |
| `TURNSTILE_SITE_KEY` | Widget site key | Config |
| `TURNSTILE_SECRET_KEY` | Widget secret key | Secret |
| `TURNSTILE_HOSTNAMES` | `receipt-generator-larz.vercel.app` (comma-separated if multiple) | Config |

3. Deploy the code and redeploy after changing Vercel variables. Local `.env` edits are not automatically copied to Vercel. If you use a preview hostname, register that exact hostname with both Cloudflare and `TURNSTILE_HOSTNAMES`.

Only the site key is sent to the browser. The server verifies the challenge with Cloudflare and checks the hostname and `public_order` action before entering the order transaction. Tokens from another hostname/action, expired or invalid tokens, missing configuration, and verification outages block submission. The form preserves entered details and offers a fresh security check after errors. Verification retries use a deterministic Cloudflare idempotency key per submission/token, while the existing order idempotency identifier still prevents duplicate orders.

Loopback development (`localhost`, `127.0.0.1`, `[::1]`) uses Cloudflare's documented dummy keys when neither `VERCEL` nor production `NODE_ENV` is set. That exception is unavailable on Vercel or any production runtime, and dummy keys are rejected there. Test keys are not production protection. No secret values are embedded in source or HTML.

Run `node scripts/turnstile-test.cjs` for verification and widget-lifecycle tests. Order integration tests mock only Cloudflare's response and continue testing the actual database transactions. References: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ and https://developers.cloudflare.com/turnstile/troubleshooting/testing/.

Public submissions use an idempotency identifier. On an uncertain connection failure, the form locks the submitted fields and offers **Retry submission** using the same identifier, avoiding duplicate orders. Customer details are not saved in browser storage.

Run `node scripts/order-route-test.cjs` for isolated HTTP boundary tests. `node scripts/orders-test.cjs` uses the configured database, creates labelled TEST records, and cleans them up without using real products or consuming invoice numbers.

## Document confirmation recovery

The editor starts with a fresh invoice on every page load. Unfinished documents and pending requests are held only in memory and are not restored after refresh or sign-in. Create document and New document start a fresh invoice, asking before discarding unfinished changes. Saved documents remain available from the saved list. Confirm retains its request identifier in memory until the server acknowledges the save, so retrying in the same open tab checks the same operation. After a refresh following an uncertain save, check Saved documents before creating the same sale again. Acknowledged documents are cached before refreshing the workspace list, and PDFs use the acknowledged snapshot. A matching saved document is recovered without another stock deduction; different contents open a review dialog instead of overwriting the saved version. Keep as new draft is available only for documents without a source order or invoice and creates a separate sale only after a subsequent Confirm.

No schema migration or environment changes are needed for this fix. Run `node scripts/document-save-test.cjs` for isolated client tests and `node scripts/document-recovery-test.cjs` for database recovery/concurrency tests. The database test creates labelled TEST rows, preserves invoice counters and cleans up its records.

## Compact mobile navigation

At 650 px and below, a compact logo/Menu header opens the existing sidebar inside a native modal drawer. All six pages and the original CSRF-protected Sign out form are retained, with one active-page indicator. Page selection, Close, Escape and tapping the backdrop dismiss the drawer. Focus returns to Menu on dismissal and to the page heading after navigation. Resizing to desktop closes the drawer, releases scroll locking and returns the same sidebar to its original position. Mobile Create document navigation returns to the current in-memory document; New document explicitly starts a fresh invoice. Refresh still starts fresh as before.

Private assets `src/navigation.js` and `src/navigation.css` need no schema or environment changes. Run `npm run test:navigation` for navigation behavior, resize/focus cleanup, the single shared sign-out form, private assets and CSRF checks. The desktop sidebar and document/PDF rendering are unchanged.

## Create document split workspace

The editor uses the shared chocolate palette, a compact business profile and Customer, Document details, Items and Payment sections. Desktop keeps the form beside the monochrome preview. At 1,050 px and below the preview follows the form; mobile controls use larger targets and readable input text. Confirm remains below the preview with a live total, then opens the existing Save PDF / Share PDF options. Optional disclosure state stays in memory for the current document and resets for a new document. Inventory availability labels refresh after workspace sync without replacing quoted item prices.

Private assets `src/editor.js` and `src/editor.css` are included by the existing Vercel configuration. No database migration or environment changes are needed. Run `npm run test:editor` for live totals, stock-label refresh, quoted-price protection, disclosure state, private assets and the existing save/retry checks. Invoice and receipt confirmation, both currencies, adjustments and 320/390 px layouts can be checked against the isolated sample-data preview without writing to Supabase.

## Revenue section tabs

Revenue keeps Sales, Collected and Outstanding above Overview, Payments and Outstanding tabs. Period presets and custom dates share the same currency filter across all views. Payments use payment dates (or issue dates when absent); outstanding invoices use issue dates and their current balance after all confirmed linked receipts. Draft, cancelled, legacy and local-only records are excluded. Linked receipts add collections, not another sale. Lists show twenty records per page and open the existing saved document with protection for unfinished edits. The chart also offers an exact monthly totals table.

The new private asset `src/revenue.css` is included by the existing Vercel configuration. No database migration or environment changes are needed. Run `npm run test:revenue` for isolated calculations, filtering, tabs, pagination, refresh failures, document navigation and private-asset checks. These checks do not write to Supabase.

## Business settings tabs

Business details, Logo and Document defaults share one Save changes action. Tab switching and page navigation preserve unsaved edits in memory; a browser refresh clears them. Logo selection/removal is staged until Save changes succeeds. Validation opens the section containing the invalid field. Shared settings use revision checks, preserve edits on failure and reuse the request identifier for an unchanged retry. Saved invoices/receipts keep their original business snapshot, and linked orders keep their quoted setup rate.

The new private assets are `src/settings.js` and `src/settings.css`. No database migration or environment changes are required. Run `npm run test:settings` for isolated save, validation, conflict and retry checks; these tests do not write to Supabase.

## Inventory workspace

Inventory uses a selectable product list and detail panel, with the selected product's paginated stock history. Stock movements provides the full ledger, grouped by date and filtered by additions/removals. History uses product IDs, includes deleted products, and is served by the authenticated `/api/movements` endpoint. Product history shows five movements per page; the full ledger shows twenty. Add/edit, image preparation, stock adjustment and soft deletion use the existing authenticated mutations. The stock form previews the resulting quantity and reuses its operation identifier for retries of an unchanged request.

No schema migration or environment variables are needed. Push the updated code to deploy the new private inventory assets. Run `npm run test:workspace` for filtering/validation, auth boundaries, client history races and database pagination checks. Database tests create and remove their own labelled TEST rows without consuming invoice numbers.

## Expandable Pending Order reviews

Order cards now expand inline, with one review open at a time. Search, status counts, oldest/newest sorting, product photos, stock warnings and the choice to use current prices remain available. Automatic refresh updates only the pending badge while an order is expanded, so it does not replace an active review or its price choice. Refresh explicitly rechecks the review. Creating an invoice rechecks the order revision, prefills the existing generator and keeps the order pending. Confirm still approves the order and deducts stock atomically; reopening the same unfinished order invoice keeps its existing document ID. Rejection uses a confirmation dialog and an idempotent request.

The new private asset `src/orders.css` is included by the existing Vercel configuration. No database migration or environment changes are needed. `npm run test:orders` includes isolated client review tests and TEST-only database sorting/count checks, in addition to the existing submission, security and approval tests.
