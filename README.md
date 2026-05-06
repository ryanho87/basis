# Basis

> Your real financial picture.

Personal finance for tech workers and high-income professionals. Tracks lot-level cost basis, projects income against tax thresholds, and uses Claude as a planning partner.

## What it does today

- **Net worth dashboard** with after-tax discounting (taxable, traditional, Roth, real estate handled differently)
- **Accounts**: taxable brokerage, 401k (traditional + Roth), IRAs, HSA, crypto, cash, real estate, liabilities, student loans
- **Lot-level cost basis** for taxable + crypto accounts; holding-period (LT/ST) classification
- **RSU grants** with auto-generated vest schedules; mark-as-vested locks FMV as cost basis and creates a linked AssetLot
- **Income projection** for the year — paycheck profile + W-2 YTD snapshots + RSU vests + S-Corp distributions
- **Tax projection** with federal brackets, LTCG stacking, NIIT exposure, and threshold tracker UI
- **LLM onboarding** — chat-driven profile setup that recommends strategies tailored to the user's situation
- **LLM chat** — Claude knows your full financial snapshot and can reason about tax-efficient liquidation, debt strategy, etc.

## Stack

- Next.js 16 (App Router) + Turbopack
- TypeScript, Tailwind v4
- Prisma 7 + SQLite (better-sqlite3 driver adapter)
- Claude Sonnet 4.6 (Anthropic SDK), streaming SSE
- Recharts, lucide-react

## Setup

```bash
# Install Node if needed
brew install node

# Install dependencies
npm install

# Run migrations + generate Prisma client
npx prisma migrate dev
npx prisma generate

# Add your Anthropic API key to .env
echo 'ANTHROPIC_API_KEY="sk-ant-..."' >> .env

# Run dev server
npm run dev
```

## What's next (planned)

- CSV import (Schwab / Fidelity / E*Trade / Coinbase)
- Planned-sale scenario modeling (with lot-selection)
- Proactive LLM insights cron
- ESPP, ISO/NQSO support
- State tax brackets
- Real-time market prices

## Notes

- Tax engine is a deliberately simplified federal model — no AMT, no state, no social security wage base. Good for planning, not for filing.
- Single-user MVP — no auth yet. The schema supports multi-user.
