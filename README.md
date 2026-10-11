# Larz shared inventory and documents

## Local use

Run `npm install` once, then `npm start`. The local server loads `.env.supabase.local`. Open http://127.0.0.1:4173 and sign in with your Supabase email and password.

## Inventory workflow

1. Inventory > Add product: name, unique SKU, RM/USD prices, opening stock, and low-stock threshold.
2. Select inventory products in document rows. Quantity and price remain editable; stock quantities are whole units.
3. Save document or Save PDF saves a draft without deducting stock.
4. Confirm sale deducts stock in a database transaction. Repeated confirmations cannot deduct twice.
5. Saving edits to a confirmed sale applies the quantity difference. Stale edits are rejected; reopen the current saved record.
6. Cancel sale restores stock. Cancel linked receipts before changing invoice items or cancelling the source invoice.
7. Create receipt from a confirmed invoice to record payment without deducting again. Standalone receipts can be confirmed as their own sales.
8. Adjust stock records restocks or corrections with a reason. Archive products by unchecking Available for new sales.

Use Refresh to see colleagues' stock changes. Validation always uses current database stock, even if the displayed quantity is stale. The movement list shows the latest 100 changes.

## Existing data

Local drafts and records are retained. Existing local documents appear with an Upload historical record action: this uploads a read-only historical record and never deducts stock. Set your actual current opening stock separately. Save Business settings once to share your local business details. Backup management is handled separately through Supabase; the app no longer has browser backup import/export controls.

## Security and storage

Supabase Auth verifies credentials. Only users listed in `larz.members` can access this single shared workspace. There is no public signup route. Session access tokens are held in HttpOnly cookies; sign in again after the token expires (at most one hour). Database tables live in a private `larz` schema with RLS enabled and public access revoked. Server-side queries are parameterized; stock writes use a transaction lock, revision checks, and operation identifiers. HTTPS certificate verification remains enabled.

## Tests

`npm test`: calculations, input validation, and mocked authentication boundary checks.
`npm run test:inventory`: live database integration checks; creates and removes test records and consumes document counter values.
`npm run migrate`: applies the idempotent schema migration. The current Supabase project has already been migrated.

See DEPLOYMENT.md for Vercel configuration.

## Delete and product photos

Inventory and Saved documents now have Delete actions with confirmation. Deletion hides records and retains their database history. Deleting a confirmed standalone sale restores deducted stock once; linked receipts do not restore stock. Delete linked receipts before deleting their invoice. Historical/cancelled/draft document deletion does not adjust stock. Deleted products are unavailable for new sales; old document snapshots and movement history remain intact.

Add/edit a product to upload, replace, or remove its reference photo. PNG, JPEG and WebP inputs up to 5 MB are decoded and resized to a maximum 320 px JPEG thumbnail, with a server-side size/signature check. Thumbnails are stored privately in Supabase and shown only in inventory and product selection, never on invoice/receipt previews or PDFs. No public image bucket is used.

Migration 002-delete-images.sql has been applied to the connected Supabase project. Redeploy updated code to Vercel; no new environment variables are required.

## Revenue

The Revenue page reports RM or US dollar amounts separately for the selected date range. Sales include confirmed invoices and standalone confirmed receipts; drafts, cancelled documents, and historical imports are excluded. Saved receipts linked to invoices count toward collected payments and reduce the invoice balance, but do not count as a second sale. The monthly chart groups sales by document date and collections by payment date. Date ranges are limited to five years for the chart.

## Image upload checks

Product images are resized JPEG data URLs in `larz.products.image`, not Supabase Storage objects. Local image processing uses data URLs permitted by the app security policy. Image and save errors stay visible in the product form; a failed image selection must be replaced or removed before saving.

`npm run test:images` exercises the native picker, PNG/JPEG/WebP conversion, resize, save/reload, removal, invalid input, and save failures against the real server routes and security policy with an in-memory inventory. It never writes to Supabase. This optional browser check requires Playwright and its Chromium browser; `LARZ_PLAYWRIGHT_MODULE` can specify another installed Playwright module path, and `LARZ_TEST_BROWSERS` can list browser executable paths separated by `|`.
