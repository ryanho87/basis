// Run against a disposable SQLite database. Providers and Next's request context
// are replaced at module boundaries; the production functions and DB writes run.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { NextRequest } from "next/server";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../app/generated/prisma-sqlite");
function load(source, imports = {}) {
  const filename = resolve(source);
  const loaded = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports: loaded.exports, Date, URLSearchParams, Request, Response, Buffer,
    require: (name) => {
      if (Object.hasOwn(imports, name)) return imports[name];
      if (name === "server-only") return {};
      if (name.startsWith("@/") || name.startsWith(".")) throw new Error(`Missing test boundary: ${name}`);
      return require(name);
    },
  }, { filename });
  return loaded.exports;
}
const directory = mkdtempSync(join(tmpdir(), "basis-review-regressions-"));
const databaseUrl = `file:${join(directory, "test.db")}`;
new Database(join(directory, "test.db")).close();
let prisma;
try {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--config", "prisma.sqlite.config.ts"], {
    env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe",
  });
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
  const user = await prisma.user.create({ data: { name: "Regression fixture", email: "review@example.test" } });

  const schedule = load("lib/rsu-schedule.ts");
  const form = (overrides = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ ticker: "TEST", grantDate: "2026-01-31", vestStartDate: "", totalShares: "4800", cliffMonths: "12", totalMonths: "48", cadence: "QUARTERLY", ...overrides })) data.set(key, value);
    return data;
  };
  const parsed = schedule.parseRsuGrant(form());
  assert.equal(parsed.vestEvents.length, 13);
  assert.equal(parsed.vestEvents[0].shares, 1200);
  assert.ok(parsed.vestEvents.slice(1).every((event) => event.shares === 300));
  assert.equal(parsed.vestEvents[0].vestDate.toISOString().slice(0, 10), "2027-01-31");
  const monthly = schedule.parseRsuGrant(form({ cliffMonths: "0", totalMonths: "5", cadence: "MONTHLY", totalShares: "100" }));
  assert.equal(monthly.vestEvents[0].vestDate.toISOString().slice(0, 10), "2026-02-28");
  assert.equal(monthly.vestEvents[1].vestDate.toISOString().slice(0, 10), "2026-03-31");
  const partial = schedule.parseRsuGrant(form({ cliffMonths: "0", totalMonths: "5", totalShares: "100" }));
  assert.equal(partial.vestEvents.length, 2);
  assert.equal(partial.vestEvents[0].shares, 60);
  assert.equal(partial.vestEvents[1].shares, 40);
  assert.equal(partial.vestEvents[1].vestDate.toISOString().slice(0, 10), "2026-06-30");
  assert.equal(schedule.parseRsuGrant(form({ cliffMonths: "48" })).vestEvents[0].shares, 4800);
  for (const values of [{ totalShares: "NaN" }, { totalShares: "-1" }, { cliffMonths: "49" }, { totalMonths: "0" }, { totalMonths: "2.5" }, { grantDate: "2026-02-30" }, { vestStartDate: "invalid" }, { cadence: "DAILY" }]) {
    assert.throws(() => schedule.parseRsuGrant(form(values)));
  }

  const redirected = new Error("TEST_REDIRECT");
  const { createRsuGrant } = load("app/actions/equity.ts", {
    "@/lib/prisma": { prisma }, "@/lib/user": { getCurrentUserId: async () => user.id },
    "@/lib/rsu-schedule": schedule, "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect() { throw redirected; } },
  });
  await assert.rejects(createRsuGrant({ error: null }, form()), (error) => error === redirected);
  const saved = await prisma.rsuGrant.findFirst({ include: { vestEvents: true } });
  assert.equal(saved.vestEvents.length, 13);
  assert.equal(saved.vestEvents.reduce((sum, event) => sum + event.shares, 0), 4800);
  assert.ok((await createRsuGrant({ error: null }, form({ grantDate: "invalid" }))).error);
  assert.equal(await prisma.rsuGrant.count(), 1);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_vest BEFORE INSERT ON VestEvent BEGIN SELECT RAISE(ABORT, 'forced vest failure'); END`);
  assert.ok((await createRsuGrant({ error: null }, form())).error);
  assert.equal(await prisma.rsuGrant.count(), 1, "An event write failure rolls back its grant");
  await prisma.$executeRawUnsafe("DROP TRIGGER fail_vest");
  console.log("RSUs: cliff allocation, blank start, month boundaries, partial periods, validation, and rollback passed");

  const { ensureTransactionCategories } = load("lib/transaction-categorization.ts", { "@/lib/prisma": { prisma } });
  const categories = await ensureTransactionCategories(user.id);
  assert.equal(categories.length, 15);
  await prisma.transactionCategory.update({ where: { id: categories[0].id }, data: { name: "My custom label", color: "#123456" } });
  await ensureTransactionCategories(user.id);
  assert.equal(await prisma.transactionCategory.count(), 15);
  assert.equal((await prisma.transactionCategory.findUnique({ where: { id: categories[0].id } })).name, "My custom label");
  console.log("Categories: SQLite initialization, repeat calls, and preserved edits passed");

  const connection = await prisma.coinbaseConnection.create({ data: { userId: user.id, status: "ACTIVE" } });
  await prisma.coinbaseAccount.create({ data: { coinbaseConnectionId: connection.id, externalAccountId: "old", name: "Old wallet", accountType: "CRYPTO", currency: "BTC", quantity: 1, priceUsd: 100, valueUsd: 100, lastSyncedAt: new Date("2026-01-01") } });
  const before = await prisma.coinbaseAccount.findMany();
  let failPrice = true;
  let missingPrice = false;
  let snapshots = 0;
  const { syncCoinbase } = load("lib/coinbase/sync.ts", {
    "@/lib/prisma": { prisma }, "@/lib/net-worth": { captureNetWorthSnapshot: async () => { snapshots++; } },
    "./client": {
      coinbaseRequest: async (_user, path) => path.includes("key_permissions") ? { can_view: true } : { accounts: [
        { uuid: "new", name: "New wallet", currency: "BTC", available_balance: { value: "2" } },
        { uuid: "fail", name: "Second wallet", currency: "ETH", available_balance: { value: "1" } },
      ] },
      getUsdPrice: async () => { if (failPrice) throw new Error("price timeout"); return missingPrice ? null : 200; },
    },
  });
  await assert.rejects(syncCoinbase(user.id), /price timeout/);
  assert.deepEqual(await prisma.coinbaseAccount.findMany(), before);
  assert.equal(snapshots, 0);
  failPrice = false;
  missingPrice = true;
  await assert.rejects(syncCoinbase(user.id), /Could not price/);
  assert.deepEqual(await prisma.coinbaseAccount.findMany(), before);
  missingPrice = false;
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_balance BEFORE INSERT ON CoinbaseAccount WHEN NEW.externalAccountId = 'fail' BEGIN SELECT RAISE(ABORT, 'forced balance failure'); END`);
  await assert.rejects(syncCoinbase(user.id));
  assert.deepEqual(await prisma.coinbaseAccount.findMany(), before, "A failure after the first new balance rolls back the whole portfolio");
  assert.equal(snapshots, 0);
  await prisma.$executeRawUnsafe("DROP TRIGGER fail_balance");
  const summary = await syncCoinbase(user.id);
  assert.equal(summary.totalValueUsd, 600);
  assert.equal(await prisma.coinbaseAccount.count({ where: { isActive: true } }), 2);
  assert.equal(snapshots, 1);
  console.log("Coinbase: timeout preserves cache; DB failures roll back; successful sync publishes all balances");

  const { proxy } = load("proxy.ts");
  assert.equal(proxy(new NextRequest("https://basis.example/api/plaid/webhook", { method: "POST" })).headers.get("x-middleware-next"), "1");
  for (const path of ["/api/plaid/sync", "/api/plaid/webhook/extra", "/api/plaid/exchange"]) {
    assert.equal(proxy(new NextRequest(`https://basis.example${path}`, { method: "POST" })).status, 401);
  }
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const key = await exportJWK(publicKey);
  let webhookSyncs = 0;
  const work = [];
  const { POST } = load("app/api/plaid/webhook/route.ts", {
    "next/server": { after: (fn) => { work.push(fn()); } },
    "@/lib/prisma": { prisma: { plaidItem: { findUnique: async () => ({ id: "connection", userId: user.id }) } } },
    "@/lib/plaid/client": { getPlaidClient: () => ({ webhookVerificationKeyGet: async () => ({ data: { key } }) }) },
    "@/lib/plaid/developer-credentials": { getPlaidConfigForItem: async () => ({}) },
    "@/lib/plaid/sync": { syncPlaidItem: async () => { webhookSyncs++; } },
  });
  const body = JSON.stringify({ item_id: "item", webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE" });
  const token = await new SignJWT({ request_body_sha256: createHash("sha256").update(body).digest("hex") }).setProtectedHeader({ alg: "ES256", kid: "key" }).setIssuedAt().sign(privateKey);
  const request = (signature, rawBody = body) => new Request("https://basis.example/api/plaid/webhook", { method: "POST", body: rawBody, headers: signature ? { "plaid-verification": signature } : {} });
  assert.equal((await POST(request())).status, 401);
  assert.equal((await POST(request("invalid"))).status, 401);
  assert.equal((await POST(request(token, body + " "))).status, 401);
  assert.equal(webhookSyncs, 0);
  assert.equal((await POST(request(token))).status, 200);
  await Promise.all(work);
  assert.equal(webhookSyncs, 1);
  console.log("Plaid: exact public path; missing/invalid/tampered signatures rejected; valid callback syncs");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma?.$disconnect();
  rmSync(directory, { recursive: true, force: true });
}
