import "dotenv/config";

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { prisma } from "../lib/prisma";

const ROLLBACK = new Error("ROLLBACK_TENANT_TEST");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function verifySourceGuards() {
  const checks = [
    ["app/actions/accounts.ts", /deleteMany\(\{ where: \{ id: accountId, userId \} \}\)/, "account deletion"],
    ["app/actions/equity.ts", /deleteMany\(\{ where: \{ id: grantId, userId \} \}\)/, "RSU deletion"],
    ["app/actions/strategies.ts", /where: \{ id, userId \}/, "strategy mutation"],
    ["app/api/chat/route.ts", /where: \{ id: threadId, userId: user\.id \}/, "chat thread lookup"],
    ["lib/coinbase/sync.ts", /findUnique\(\{ where: \{ userId \} \}\)/, "Coinbase credential ownership"],
  ] as const;

  for (const [file, pattern, label] of checks) {
    const source = await readFile(file, "utf8");
    assert(pattern.test(source), `Missing user ownership guard for ${label}`);
  }
}

async function verifyDatabaseIsolation() {
  const marker = randomBytes(8).toString("hex");
  try {
    await prisma.$transaction(async (tx) => {
      const owner = await tx.user.create({ data: { email: `owner-${marker}@example.test`, name: "Owner" } });
      const stranger = await tx.user.create({ data: { email: `stranger-${marker}@example.test`, name: "Stranger" } });
      const account = await tx.account.create({ data: { userId: owner.id, name: "Owner brokerage", type: "TAXABLE_BROKERAGE" } });
      const plaidCredential = await tx.plaidDeveloperCredential.create({
        data: {
          userId: owner.id,
          clientIdEncrypted: "test-client-id-ciphertext",
          secretEncrypted: "test-secret-ciphertext",
          environment: "sandbox",
        },
      });
      const lot = await tx.assetLot.create({ data: { accountId: account.id, ticker: "TEST", shares: 1, costBasisPerShare: 1, acquiredAt: new Date() } });
      const thread = await tx.chatThread.create({ data: { userId: owner.id, title: "Owner thread" } });

      assert(await tx.account.findFirst({ where: { id: account.id, userId: owner.id } }), "Owner cannot read owned account");
      assert(!(await tx.account.findFirst({ where: { id: account.id, userId: stranger.id } })), "Cross-user account read succeeded");
      assert((await tx.account.updateMany({ where: { id: account.id, userId: stranger.id }, data: { name: "Stolen" } })).count === 0, "Cross-user account update succeeded");
      assert((await tx.assetLot.deleteMany({ where: { id: lot.id, account: { userId: stranger.id } } })).count === 0, "Cross-user lot deletion succeeded");
      assert(!(await tx.chatThread.findFirst({ where: { id: thread.id, userId: stranger.id } })), "Cross-user chat read succeeded");
      assert(!(await tx.plaidDeveloperCredential.findFirst({ where: { id: plaidCredential.id, userId: stranger.id } })), "Cross-user Plaid credential read succeeded");

      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

async function main() {
  await verifySourceGuards();
  await verifyDatabaseIsolation();
  console.log("Tenant isolation checks passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
