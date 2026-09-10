#!/usr/bin/env node
// First step of `npm run build`. Applies pending Prisma migrations to the
// shared PostgreSQL database so a push to main migrates Neon before the new
// code goes live. Vercel keeps the previous deployment serving if this fails.
//
// Skips when:
//   - DATABASE_URL is SQLite or unset (local development builds)
//   - not running on Vercel and MIGRATE_ON_BUILD is not "1" (protects against
//     a local `npm run build` silently migrating production)
//   - a Vercel preview build, which shares the production database, unless
//     MIGRATE_ON_PREVIEW is "1"
//
// Prisma itself prefers DIRECT_URL, then DATABASE_URL_UNPOOLED, then
// DATABASE_URL (see prisma.config.ts), so the direct Neon connection is used
// for schema changes without any remapping here.
import { spawnSync } from "node:child_process";

const url =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.DATABASE_URL ??
  "";
const onVercel = process.env.VERCEL === "1";
const vercelEnv = process.env.VERCEL_ENV;

const log = (message) => console.log(`[migrate-deploy] ${message}`);
const skip = (reason) => {
  log(`Skipping: ${reason}`);
  process.exit(0);
};

if (!/^postgres(?:ql)?:\/\//.test(url)) {
  skip(
    url.startsWith("file:")
      ? "SQLite DATABASE_URL detected. Use `npm run db:migrate:sqlite` locally."
      : "no PostgreSQL DATABASE_URL is configured.",
  );
}
if (!onVercel && process.env.MIGRATE_ON_BUILD !== "1") {
  skip("not a Vercel build. Run `npx prisma migrate deploy` yourself or set MIGRATE_ON_BUILD=1.");
}
if (onVercel && vercelEnv !== "production" && process.env.MIGRATE_ON_PREVIEW !== "1") {
  skip(`Vercel ${vercelEnv} builds share the production database. Set MIGRATE_ON_PREVIEW=1 to override.`);
}

let host = "the configured database";
try {
  host = new URL(url).host;
} catch {
  // Leave the generic label; never print the raw URL since it carries credentials.
}
log(`Applying pending migrations to ${host} …`);

const result = spawnSync(
  "npx",
  ["--no-install", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"],
  { stdio: "inherit", env: process.env, shell: process.platform === "win32" },
);

if (result.error) {
  log(`Could not start Prisma: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  log("Migration failed. Aborting the build so the previous deployment stays live.");
  process.exit(result.status ?? 1);
}
log("Database schema is up to date.");
