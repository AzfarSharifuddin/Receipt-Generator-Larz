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
