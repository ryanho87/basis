# Basis

> Your real financial picture.

Personal finance for tech workers and high-income professionals. Tracks lot-level cost basis, projects income against tax thresholds, and uses an AI planning partner routed through Vercel AI Gateway.

## What it does today

- **Net worth dashboard** with after-tax discounting (taxable, traditional, Roth, real estate handled differently)
- **Accounts**: taxable brokerage, 401k (traditional + Roth), IRAs, HSA, crypto, cash, real estate, liabilities, student loans
- **Plaid connections** with per-profile developer credentials, keeping each household member on their own Trial or paid Item quota
- **Lot-level cost basis** for taxable + crypto accounts; holding-period (LT/ST) classification
- **RSU grants** with auto-generated vest schedules; mark-as-vested locks FMV as cost basis and creates a linked AssetLot
- **Income projection** for the year — paycheck profile + W-2 YTD snapshots + RSU vests + S-Corp distributions
- **Tax projection** with federal brackets, LTCG stacking, NIIT exposure, and threshold tracker UI
- **Planned-sale scenarios** — model a sale before you make it: ST/LT gain split at the planned date, incremental tax vs. your projected year, lot selection (FIFO / HIFO / tax-aware / specific lots), and a hint showing what smarter lot selection would save
- **LLM onboarding** — chat-driven profile setup that recommends strategies tailored to the user's situation
- **LLM chat** — the configured Gateway model knows your full financial snapshot and can reason about tax-efficient liquidation, debt strategy, etc.

## Stack

- Next.js 16 (App Router) + Turbopack
- TypeScript, Tailwind v4
- Prisma 7 + Neon serverless PostgreSQL in production; isolated SQLite remains available for local-only development
- Vercel AI Gateway (Claude Sonnet 4.6 by default), Anthropic-compatible streaming SSE
- Recharts, lucide-react

## Setup

```bash
# Install Node if needed
brew install node

# Install dependencies
npm install

# Generate both production PostgreSQL and local SQLite clients.
npm run prisma:generate

# Production/shared database: set pooled DATABASE_URL and direct
# DATABASE_URL_UNPOOLED values (the Vercel Neon integration does this), then:
npx prisma migrate deploy

# Local-only database: DATABASE_URL="file:./prisma/dev.db", then:
npm run db:migrate:sqlite

# Configure private, invite-only authentication.
echo "BETTER_AUTH_SECRET=\"$(openssl rand -base64 48)\"" >> .env
echo 'BETTER_AUTH_URL="http://localhost:3000"' >> .env

# Optional Google sign-in. Create a Google OAuth 2.0 Web application and add
# http://localhost:3000/api/auth/callback/google as an authorized redirect URI.
echo 'GOOGLE_CLIENT_ID="...apps.googleusercontent.com"' >> .env
echo 'GOOGLE_CLIENT_SECRET="..."' >> .env

# Create the owner's login invite and claim the existing financial profile.
npm run auth:invite -- --email "you@example.com" --name "Your Name" --claim-existing

# Add your Vercel AI Gateway key to .env
echo 'AI_GATEWAY_API_KEY="..."' >> .env
# Optional: choose any Gateway model ID (defaults to Claude Sonnet 4.6)
echo 'AI_GATEWAY_MODEL="anthropic/claude-sonnet-4.6"' >> .env

# Optional: Coinbase personal portfolio sync. Use an ECDSA key with View permission only
# and bind the server-level key to exactly one financial profile.
echo 'COINBASE_API_KEY_NAME="organizations/.../apiKeys/..."' >> .env
echo 'COINBASE_API_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----\\n...\\n-----END EC PRIVATE KEY-----"' >> .env
echo 'COINBASE_LEGACY_USER_ID="..."' >> .env

# Add Plaid trial credentials and a 32-byte token encryption key.
# See .env.example for every supported setting.
echo 'PLAID_CLIENT_ID="..."' >> .env
echo 'PLAID_SECRET="..."' >> .env
echo 'PLAID_ENV="production"' >> .env
echo "PLAID_TOKEN_ENCRYPTION_KEY=\"$(openssl rand -hex 32)\"" >> .env

# Run the app, then open the invite URL printed above.
npm run dev
```

## SQLite to PostgreSQL cutover

Apply the PostgreSQL baseline to an empty Neon database, then copy and verify the local data:

```bash
npx prisma migrate deploy
POSTGRES_DATABASE_URL="postgresql://..." npm run db:migrate:sqlite-to-postgres
```

The migration refuses a non-empty target and rolls back unless every table count and every numeric financial total reconciles. After it succeeds, make the pooled Neon URL the production `DATABASE_URL`; Prisma migrations use `DATABASE_URL_UNPOOLED`. Production rejects `file:` URLs.

Invite links place their one-time token in the URL fragment. Basis immediately exchanges it for a ten-minute HttpOnly, SameSite=Strict cookie and removes the fragment from browser history before rendering signup details.

## What's next (planned)

- CSV import (Schwab / Fidelity / E*Trade / Coinbase)
- Proactive LLM insights cron
- ESPP, ISO/NQSO support
- State tax brackets
- Real-time market prices

## Notes

- Tax engine is a deliberately simplified federal model — no AMT, no state, no social security wage base. Good for planning, not for filing.
- Invite-only authentication keeps each login attached to a separate financial profile.
