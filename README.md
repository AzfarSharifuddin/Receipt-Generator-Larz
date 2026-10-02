# Larz Invoice & Receipt Generator

Browser interface for MYR/USD invoices and receipts, with a Node login server.

Run `npm start`, then open http://127.0.0.1:4173. Local login configuration lives in Git-ignored `.auth.json`. Node 24 is supported; Python and a database server are not required.

See DEPLOYMENT.md for Vercel setup, environment variables, security limitations, and data migration. Run `npm test` for automated checks.

Business settings, logos, drafts and saved documents are stored in this browser. Export backups regularly. Clearing browser storage removes local records. Settings and documents do not synchronize between colleagues or devices. Currency switches change denomination, not exchange rates. Print / Save PDF uses the browser print dialog.
