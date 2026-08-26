# Plaid MVP implementation plan

## Product target

Connect a user's banks and brokerages, keep their balances and holdings current, import institution-provided tax lots when available, and calculate gross and estimated after-tax net worth with explicit data coverage and freshness.

The MVP is a personal, local-first beta. Authentication and hosted multi-user hardening are required before inviting unrelated users.

## Phase 1: Connection foundation

Status: in progress

- Configure Plaid development, sandbox, and production environments.
- Store Plaid Items with encrypted access tokens.
- Create Link tokens for bank and investment connection flows.
- Exchange public tokens and persist connection metadata.
- Track consent expiration, connection health, and last successful sync.
- Provide setup documentation without committing credentials.

Exit criteria: a development Item can be linked and its encrypted access token is stored locally.

## Phase 2: Connection experience

- Add a connected-institutions section to Accounts.
- Offer separate "Connect a bank" and "Connect a brokerage" actions.
- Integrate Plaid Link in a client component.
- Show connecting, connected, error, expired-consent, and reconnect states.
- Support disconnecting an Item and removing it from Plaid.

Exit criteria: Chase and at least one brokerage can be linked, inspected, repaired, and disconnected from the app.

## Phase 3: Financial data ingestion

- Add external IDs and source metadata to accounts.
- Add normalized securities, holdings, tax lots, and liability records.
- Import Accounts and cached balances.
- Import Investments holdings, securities, aggregate basis, and tax lots.
- Import Liabilities for supported credit cards, mortgages, and loans.
- Use idempotent upserts and mark missing upstream records without silently deleting manual data.

Exit criteria: repeated syncs do not duplicate values, and connected data is kept separate from manually entered data.

## Phase 4: Synchronization and reliability

- Process Holdings, Investments Transactions, Liabilities, Transactions Sync, and Item error webhooks.
- Record sync runs, cursors, counts, errors, and timestamps.
- Add manual refresh for development and a scheduled refresh strategy for hosted environments.
- Implement Link update mode for login and consent repair.
- Prevent duplicate Items for the same user and institution.

Exit criteria: connection failures are visible and recoverable, and updates can be replayed safely.

## Phase 5: True net worth

- Separate current holding value from tax-lot basis to prevent double counting.
- Use institution-reported market value as the primary valuation source.
- Calculate gross net worth from assets minus liabilities.
- Calculate estimated after-tax net worth from account tax treatment and taxable gains.
- Display cost-basis coverage, unknown-basis value, source, and last-updated time.
- Preserve CSV and manual fallback paths when Plaid returns no tax lots.

Exit criteria: every net-worth number explains its valuation date, source, and cost-basis completeness.

## Phase 6: Correctness and beta hardening

- Fix the tax-year, NIIT, RSU, and holding-period issues found in the repository review.
- Add deterministic tests for valuation, tax lots, liability signs, duplicate syncs, and missing-basis behavior.
- Test with Chase and multiple brokerages in Plaid development.
- Add data deletion, token rotation, structured logs, rate limits, and deployment secrets.
- Document known institution-specific limitations.

Exit criteria: the beta can survive reconnects, partial data, repeated webhooks, and institution discrepancies without showing misleading net worth.

## Deliberately deferred

- Budgeting and full Mint-style transaction categorization
- Household sharing
- Automated tax filing outputs
- Intraday portfolio pricing
- Automatic reconstruction of missing lifetime tax lots from limited transaction history
- Production multi-user launch until authentication and security review are complete
