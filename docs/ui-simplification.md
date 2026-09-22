# A simpler everyday Basis

The first usability pass addresses difficulty finding the right page and too many
features competing for attention. The intended user wants to understand balances,
track spending, and plan savings without knowing the app's financial terminology.

## Main destinations

- **Home:** current net worth, history, and clear next steps.
- **Accounts:** connected and manual balances, investments, and debts.
- **Spending:** incoming money, spending patterns, and transactions.
- **Money plan:** income after taxes, savings goals, and bills.

Desktop navigation shows these four destinations first. Additional financial tools
are collapsed under **More tools** and open automatically when visiting one of
those pages. On phones, the same four destinations are always visible, with
**More** opening the remaining tools and settings in a keyboard-accessible dialog.

No financial tools were removed. Income and taxes, stock grants, sale scenarios,
suggestions, and business expenses still use their existing routes. Profile setup,
settings, and Ask Basis remain accessible. Home keeps detailed asset, income, tax,
and strategy information in an expandable section below the overview.

## Follow-up usability check

Ask a first-time user to find an account balance, explain last month's spending,
and change a savings goal without guidance. Record where they hesitate. Use those
observations for the next pass through Accounts, Spending, and Money plan instead
of introducing more dashboards or navigation choices.

The existing system theme and visual vocabulary are retained. This is an
information architecture and clarity pass, not a new visual identity.

## Connecting accounts

Accounts now starts with the connection flow, ahead of charts. **Connect accounts**
jumps to that section; manual entry is labeled separately. The first-time setup
explains the existing per-profile Plaid credential requirement with direct links
to Plaid and a short walkthrough. Production access is required for real accounts.
Once credentials are verified, setup collapses into **Plaid settings**.

Choose **Banks & credit cards**, **Investments & retirement**, or **Loans**, then
continue to Plaid to find an institution and select accounts. Each choice requires
only its relevant Plaid product, so investment-only providers are not excluded by
a Transactions requirement. Other supported products remain additional consent.
Plaid availability and the user's enabled products still determine coverage.

Connected institutions list their imported account names and masked numbers.
**Add or change accounts** opens Plaid update mode with account selection enabled.
**Sign in again** handles expired access; **Update balances** retries imports.
Canceling or failing to load Link releases the controls for retry. Disconnect is
under **Connection options**, with an accurate warning about removing imported
accounts and transactions. Coinbase remains available in **Other connections**.

Credentials remain scoped to each user; this change does not give other profiles
access to the legacy owner's server credentials. Switching Plaid accounts or
switching between Sandbox and Production is blocked while connections exist,
because their tokens are tied to the original account and environment.

Validation: route regression tests cover account-type product selection, update
mode, malformed requests, cross-user access, and safe credential rotation. The
local preview uses synthetic data to check setup, connected accounts, responsive
layout, and retry after a failed start. Live bank authorization still requires the
account holder and working Plaid credentials.
