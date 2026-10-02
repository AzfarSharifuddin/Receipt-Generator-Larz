# Deploy to Vercel

This repository routes all requests through a Node function. Do not deploy index.html as a static-only site.

1. Push the repository to a private GitHub repository. `.auth.json` and `.env.vercel.local` must remain untracked.
2. In Vercel, choose Add New Project and import the repository. Choose framework preset Other and leave build/output overrides unset. `vercel.json` explicitly configures the Node function and its bundled UI files.
3. In the project's Environment Variables, add the four values from your local `.env.vercel.local`: AUTH_USERNAME, AUTH_PASSWORD_SALT, AUTH_PASSWORD_HASH, SESSION_SECRET. Add them to Production, and Preview only if you want preview deployments to work. Never use PUBLIC or NEXT_PUBLIC prefixes.
4. Deploy. Test the HTTPS URL: unauthenticated visits must show the login page; sign in, create a test document, print, and sign out.
5. Verify `/.auth.json`, `/.env.vercel.local`, and `/server.cjs` return 404. Verify `/src/app.js` redirects to login when signed out.

The local environment file contains the existing login configuration and a randomly generated session secret. It is ignored by both Git and Vercel upload rules. Enter its values using Vercel's private environment settings; do not commit or share the file.

Sessions use signed HttpOnly, SameSite cookies and expire after eight hours. Vercel cookies are Secure. Logging out clears the browser cookie; stateless sessions cannot revoke a previously copied cookie individually. Rotate SESSION_SECRET and redeploy to invalidate all sessions. Login throttling in the function is best-effort per instance: configure a shared login rate limit in Vercel Firewall before sharing publicly.

There is no shared invoice database. Each browser retains its own settings, drafts, numbering, and documents. Export a backup from localhost and import it on the deployed URL to transfer your data. Sharing login credentials does not synchronize documents.

## Local use

Run `npm start`; the local server reads `.auth.json`. Run `npm test` for calculation and authentication checks. Environment variables take precedence over the local credentials file.

## Deployment status

Configuration and local tests are prepared. An actual Vercel deployment and hosted smoke test are still required.

Input validation rejects unexpected/duplicate login fields, non-form payloads, oversized requests and credentials, invalid numeric ranges, unsupported currencies, impossible dates, malformed emails, unsafe import IDs, and unsupported logo data. Backups are limited to 2,000 documents and 200 items each; text fields have size limits. Browser validation protects local workflows; invoice data is not submitted to a server. Keep the shared Vercel Firewall login rate limit configured as described above.
