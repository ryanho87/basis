---
name: verify
description: Build, run, and drive the Basis app (Next.js 16 + Prisma/SQLite) to verify changes end-to-end.
---

# Verifying Basis

## Build & launch

```bash
npx prisma generate            # required after npm install / schema change
npm run build                  # includes the TypeScript gate
npm run dev -- -p 3105         # dev server on an isolated port (background)
```

Data lives in `prisma/dev.db` (SQLite). Inspect with `sqlite3 prisma/dev.db`.
DateTime columns are ISO-8601 strings, not epoch ms.

## Driving server-action forms without a browser

All mutations are Next server actions behind plain `<form>`s, which are
progressively enhanced — a multipart POST to the page URL works like a no-JS
browser:

1. GET the page, save the HTML.
2. Extract every hidden input of the target form: `$ACTION_ID_…` (module-level
   actions) or `$ACTION_REF_N` + `$ACTION_N:0/1/2` (inline-bound actions), and
   html-unescape their values.
3. POST with `curl --form-string` for each hidden field plus the visible
   fields. **Must** use `--form-string` (plain `-F` mangles the encrypted
   bound-args payloads → 500 "Unexpected non-whitespace character") and send
   `-H "Origin: http://localhost:<port>"`.
4. Success is `303 See Other` (actions that redirect) or `200` (actions that
   re-render). Confirm the mutation in sqlite3.

## Gotchas

- Corrupted npm installs have happened here (missing .d.ts in @prisma/client,
  missing lucide-react icon files, missing better-sqlite3 binding). Fix:
  `rm -rf node_modules/<pkg> && npm install`, `npm rebuild better-sqlite3`,
  then `npx prisma generate`.
- Raw `npx tsc --noEmit` mirrors the build's TS gate; both fail if the Prisma
  client types are missing.
- LLM features (chat, onboarding) need `ANTHROPIC_API_KEY` in `.env`.

## Flows worth driving

- Dashboard `/` — empty state vs. populated stats.
- `/accounts/new` → account detail → add lot form (inline-bound action).
- `/tax` — four forms: filing status, paycheck profile, S-Corp, W-2 snapshot.
- `/scenarios/new?ticker=X` → create planned sale → `/scenarios` shows
  ST/LT gain split, incremental tax, strategy-savings hint, lot table.
