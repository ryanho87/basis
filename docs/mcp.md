# Basis private finance MCP

Basis now exposes a local, read-only MCP server for Codex and Claude. It binds only to the loopback interface and returns curated financial records—not provider tokens, raw Plaid payloads, uploaded documents, hashes, notes, or external account identifiers.

## Start it

From the repository root:

```bash
npm run mcp:token
# Add the printed BASIS_MCP_BEARER_TOKEN line to .env, then export the same
# variable in the shell that launches Codex or Claude.
npm run mcp
```

The endpoint is `http://127.0.0.1:3001/mcp`; every request to it requires `Authorization: Bearer <BASIS_MCP_BEARER_TOKEN>`. The server refuses to start if the token is missing, too short, or contains whitespace. `http://127.0.0.1:3001/health` remains a non-sensitive, unauthenticated health check.

Project-local configuration is included for Codex in `.codex/config.toml` and Claude Code in `.mcp.json`; both read the token from `BASIS_MCP_BEARER_TOKEN`, so the secret is never committed. `.env` is loaded by the MCP server and evaluation script, but Codex and Claude must inherit the variable from their launch environment. Restart the client after exporting it so the project MCP configuration is reloaded.

If the database ever contains more than one user, set `BASIS_MCP_USER_ID` to the exact user ID. The server fails closed instead of choosing one. It also refuses any non-loopback `BASIS_MCP_HOST`.

## Tools

- `get_financial_summary`
- `list_accounts`
- `get_account_holdings`
- `get_tax_lots`
- `get_net_worth_history`
- `get_income_tax_position`
- `get_equity_compensation`
- `get_data_quality`
- `model_stock_sale`

Every tool is declared read-only, non-destructive, idempotent, and closed-world. Stock-sale modeling is hypothetical and never saves a scenario or places a trade.

## Verify it

With the server running in another terminal:

```bash
npm run mcp:eval
```

The evaluation first proves an unauthenticated request receives `401`, then connects through the actual authenticated Streamable HTTP client, checks the complete tool inventory and safety annotations, calls the six no-argument tools, requires structured output, and scans responses for forbidden secret-bearing fields. The pure bearer-token checks can also run without a server:

```bash
npm run test:mcp-auth
```

## Deployed ChatGPT and Claude connection

The deployed endpoint is `https://YOUR_BASIS_DOMAIN/api/mcp`. It uses Stytch Consumer Connected Apps for OAuth 2.1, Dynamic Client Registration, PKCE, consent, refresh-token rotation, and revocation. Better Auth remains the Basis login system; a five-minute signed JWT attests the existing session to Stytch during consent.

### One-time Stytch setup

1. Create a **Consumer Authentication** project in Stytch.
2. In **Connected Apps**, enable Dynamic Client Registration and set the Authorization URL to `https://YOUR_BASIS_DOMAIN/oauth/authorize`.
3. Add the custom scope `basis:read`. This is the only Basis financial-data scope currently accepted by the MCP server.
4. Create a **Trusted Auth Token Profile** for the existing Basis identity provider:
   - Issuer: `https://YOUR_BASIS_DOMAIN/api/auth`
   - Audience: `https://YOUR_BASIS_DOMAIN`
   - JWKS URL: `https://YOUR_BASIS_DOMAIN/api/auth/jwks`
   - Email claim: `email`
   - External user ID claim: `sub`
   - Token ID claim: `jti`
5. Copy the project values into Vercel:
   - `NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN`
   - `NEXT_PUBLIC_STYTCH_PROJECT_DOMAIN` (copy the default project domain from Stytch)
   - `STYTCH_PROJECT_ID`
   - `STYTCH_SECRET`
   - `STYTCH_TRUSTED_AUTH_TOKEN_PROFILE_ID`
6. Apply the production migration with `npx prisma migrate deploy`, then redeploy Basis.

Add `https://YOUR_BASIS_DOMAIN/api/mcp` as the remote MCP URL in ChatGPT or Claude. The client discovers Stytch through Basis's RFC 9728 protected-resource metadata and opens the Basis consent page. No repository clone, local server, or manually shared bearer token is needed.

Access tokens are checked on every request. Their Stytch subject is resolved to a server-side `external_id`, then to one `AuthUser.profileUserId`; MCP callers never choose a financial profile. The endpoint exposes read-only tools and never returns Plaid/Coinbase credentials, raw uploaded documents, provider tokens, or external provider IDs.

The loopback bearer-token server described above remains available for local development.

## Boundaries

Tax calculations are federal planning estimates. They currently omit state tax, AMT, itemized deductions, payroll taxes, and wash-sale rules. Coinbase provides balances but not usable tax lots through the current integration. Call `get_data_quality` before relying on basis, balance freshness, or income completeness.
