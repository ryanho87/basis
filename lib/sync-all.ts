import "server-only";

import { prisma } from "@/lib/prisma";
import { captureNetWorthSnapshot, netWorthDateKey } from "@/lib/net-worth";
import { syncCoinbase, type CoinbaseSyncSummary } from "@/lib/coinbase/sync";
import { syncAllPlaidItems, type PlaidSyncAllSummary } from "@/lib/plaid/sync";
import { pairCreditCardPayments } from "@/lib/transaction-transfers";

export type FullSyncSummary = {
  plaid: PlaidSyncAllSummary;
  coinbase: CoinbaseSyncSummary | null;
  errors: string[];
  snapshotKey: string;
};

export async function syncAllFinancialAccounts(
  userId: string,
  options: { snapshotSlot?: "morning" | "market-close"; capturedAt?: Date } = {},
): Promise<FullSyncSummary> {
  const capturedAt = options.capturedAt ?? new Date();
  const errors: string[] = [];
  const plaid = await syncAllPlaidItems(userId, { captureSnapshot: false });
  for (const failure of plaid.failedConnections) {
    errors.push(`${failure.institutionName}: ${failure.error}`);
  }
  await pairCreditCardPayments(userId);

  const coinbaseConnection = await prisma.coinbaseConnection.findFirst({
    where: { userId, status: { not: "DISCONNECTED" } },
    select: { id: true },
  });
  let coinbase: CoinbaseSyncSummary | null = null;
  if (coinbaseConnection) {
    try {
      coinbase = await syncCoinbase(userId, { captureSnapshot: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Coinbase sync failed";
      errors.push(`Coinbase: ${message}`);
      await prisma.coinbaseConnection.updateMany({
        where: { userId },
        data: { status: "ERROR", errorMessage: message },
      });
    }
  }

  const dayKey = netWorthDateKey(capturedAt);
  const snapshotKey = options.snapshotSlot ? `${dayKey}:${options.snapshotSlot}` : dayKey;
  await captureNetWorthSnapshot(userId, "PLAID_SYNC", { snapshotKey, capturedAt });

  return { plaid, coinbase, errors, snapshotKey };
}
