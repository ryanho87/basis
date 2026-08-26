# Private beta deployment gate

Basis now has invite-only authentication and per-profile authorization, but it is not ready for an internet deployment until the remaining gates below are complete.

## Implemented

- Better Auth database sessions with 12-character minimum passwords
- One-time, email-bound invitations
- Admin-only invitation management configured by `BASIS_ADMIN_EMAILS`
- Separate authentication identities and financial profiles
- Optimistic route protection plus database-backed checks at financial data access
- Ownership filters for accounts, lots, holdings, RSUs, strategies, chats, Plaid Items, and scenarios
- Tenant-isolation regression test (`npm run test:tenant`)
- Personal Coinbase credentials locked to the existing profile until per-user credential storage ships
- Plaid access tokens encrypted with AES-256-GCM and stored per financial profile
- Optional per-profile Plaid developer credentials, verified before storage and encrypted with AES-256-GCM
- PostgreSQL production schema and a rollback-safe SQLite migration with row-count and numeric-total reconciliation
- Production refusal of SQLite and local-only dual-client support
- Security headers including CSP, HSTS, clickjacking protection, MIME protection, and restrictive referrer/permissions policies
- Invite tokens exchanged from a URL fragment into a short-lived HttpOnly, SameSite=Strict cookie
- Coinbase personal credentials bound to one explicit owner profile, with account identity unique inside that connection
- Per-request AI Gateway clients for rotating Vercel OIDC credentials
- Production AI fail-closed gate until Zero Data Retention is explicitly confirmed
- `.vercelignore` exclusions for secrets, local databases, uploads, and the loopback-only MCP server

## Local owner setup

1. Generate a session secret and add it to `.env`:

   ```bash
   openssl rand -base64 48
   ```

2. Set `BETTER_AUTH_SECRET` to that value and `BETTER_AUTH_URL` to `http://localhost:3000`.
3. Create an owner invite that claims the existing financial profile:

   ```bash
   npm run auth:invite -- --email "you@example.com" --name "Your Name" --claim-existing
   ```

4. Start Basis and open the printed invitation URL.

To create a separate profile later, omit `--claim-existing`:

```bash
npm run auth:invite -- --email "invitee@example.com" --name "Invitee"
```

Invites expire after 72 hours by default. Use `--hours` to choose a value from 1 through 168.

## Production cutover checklist

- Keep the Vercel-managed Neon database connected, run `prisma migrate deploy` through `DATABASE_URL_UNPOOLED`, and use the pooled `DATABASE_URL` at runtime. The initial SQLite data migration and reconciliation completed on August 25, 2026.
- Set `COINBASE_LEGACY_USER_ID` to the sole owner profile. Do not create Coinbase connections for other profiles until per-profile credentials or OAuth ships.
- Add durable serverless rate limiting to AI, upload, and financial-sync endpoints.
- Enable Vercel AI Gateway Zero Data Retention and no-prompt-training controls, then set `AI_GATEWAY_ZDR_CONFIRMED=true`. Until then, production AI endpoints return 503.
- Keep `ENABLE_PASSWORD_AUTH=false` in production. Google OAuth is the identity proof until verified-email delivery and password reset are implemented.
- Add durable audit events, data export, account deletion, retention policy, and Plaid Item removal during user deletion.
- Add MFA or passkeys before expanding beyond the private beta.
- Complete a production secrets and authorization review, then test from a clean Vercel preview environment.

The local MCP server remains loopback-only, is excluded by `.vercelignore`, and must never be exposed as a Vercel route or service.

## Dependency audit exceptions

The current npm audit findings are development-toolchain issues rather than deployed application paths:

- Prisma CLI currently brings in `deepmerge-ts` through `@prisma/config`; the reported recursive-merge denial of service is confined to schema generation and migration commands. npm's suggested remediation is an incompatible Prisma downgrade, so Prisma remains pinned until an upstream compatible release is available.
- esbuild's reported local-development file-read issue affects its development server on Windows. Basis development currently runs on macOS, and production is served by Next.js rather than esbuild's development server.

Re-run `npm audit` during each dependency update and remove these exceptions as soon as compatible patched transitive versions are available.
