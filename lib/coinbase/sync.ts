import "server-only";

import { prisma } from "@/lib/prisma";
import { captureNetWorthSnapshot } from "@/lib/net-worth";
import { coinbaseRequest, getUsdPrice } from "./client";

type CoinbasePermissions = {
  can_view?: boolean;
  can_trade?: boolean;
  can_transfer?: boolean;
};

type CoinbaseAccountResponse = {
  accounts?: Array<{
    uuid: string;
    name: string;
    currency: string;
    available_balance?: { value?: string };
    hold?: { value?: string };
    active?: boolean;
    deleted_at?: string | null;
    type?: string;
  }>;
  has_next?: boolean;
  cursor?: string;
};

export type CoinbaseSyncSummary = {
  accountsCount: number;
  pricedAccountsCount: number;
  totalValueUsd: number;
  warnings: string[];
};

function number(value: string | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function syncCoinbase(
  userId: string,
  options: { captureSnapshot?: boolean } = {},
): Promise<CoinbaseSyncSummary> {
  // Coinbase still uses a personal environment key. Until credentials are
  // stored per profile, never let a newly authenticated user bootstrap a
  // connection with somebody else's key.
  const existingConnection = await prisma.coinbaseConnection.findUnique({ where: { userId } });
  if (!existingConnection) {
    throw new Error("Coinbase is not configured for this financial profile");
  }

  const permissions = await coinbaseRequest<CoinbasePermissions>(
    userId,
    "/api/v3/brokerage/key_permissions",
  );
  if (!permissions.can_view) {
    throw new Error("Coinbase API key is missing View permission");
  }
  if (permissions.can_trade || permissions.can_transfer) {
    throw new Error(
      "Basis refuses Coinbase keys with Trade or Transfer permission. Create a View-only key.",
    );
  }

  const fetchedAccounts: NonNullable<CoinbaseAccountResponse["accounts"]> = [];
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ limit: "250" });
    if (cursor) query.set("cursor", cursor);
    const response = await coinbaseRequest<CoinbaseAccountResponse>(
      userId,
      `/api/v3/brokerage/accounts?${query}`,
    );
    fetchedAccounts.push(...(response.accounts ?? []));
    cursor = response.has_next ? response.cursor : undefined;
    if (response.has_next && !cursor) {
      throw new Error("Coinbase indicated more accounts but did not return a pagination cursor");
    }
  } while (cursor);

  const accounts = fetchedAccounts.filter(
    (account) => account.active !== false && !account.deleted_at,
  );
  const warnings: string[] = [];

  const connection = await prisma.coinbaseConnection.update({
    where: { id: existingConnection.id },
    data: { status: "ACTIVE", errorMessage: null },
  });
  const syncedAt = new Date();
  await prisma.coinbaseAccount.updateMany({
    where: { coinbaseConnectionId: connection.id },
    data: { isActive: false },
  });

  const currencies = [...new Set(accounts.map((account) => account.currency.toUpperCase()))];
  const prices = new Map(
    await Promise.all(
      currencies.map(async (currency) => [currency, await getUsdPrice(currency)] as const),
    ),
  );

  let pricedAccountsCount = 0;
  let totalValueUsd = 0;
  for (const account of accounts) {
    const currency = account.currency.toUpperCase();
    const available = number(account.available_balance?.value);
    const hold = number(account.hold?.value);
    const quantity = available + hold;
    const priceUsd = prices.get(currency) ?? null;
    const valueUsd = priceUsd === null ? null : quantity * priceUsd;
    if (valueUsd !== null) {
      pricedAccountsCount += 1;
      totalValueUsd += valueUsd;
    } else if (quantity !== 0) {
      warnings.push(`${currency} could not be priced in USD and is excluded from net worth`);
    }

    await prisma.coinbaseAccount.upsert({
      where: {
        coinbaseConnectionId_externalAccountId: {
          coinbaseConnectionId: connection.id,
          externalAccountId: account.uuid,
        },
      },
      update: {
        coinbaseConnectionId: connection.id,
        name: account.name || `${currency} Wallet`,
        currency,
        accountType: account.type ?? "UNKNOWN",
        quantity,
        holdQuantity: hold,
        priceUsd,
        valueUsd,
        isActive: true,
        lastSyncedAt: syncedAt,
      },
      create: {
        coinbaseConnectionId: connection.id,
        externalAccountId: account.uuid,
        name: account.name || `${currency} Wallet`,
        currency,
        accountType: account.type ?? "UNKNOWN",
        quantity,
        holdQuantity: hold,
        priceUsd,
        valueUsd,
        lastSyncedAt: syncedAt,
      },
    });
  }

  await prisma.coinbaseConnection.update({
    where: { id: connection.id },
    data: { status: "ACTIVE", lastSyncedAt: syncedAt, errorMessage: null },
  });
  if (options.captureSnapshot !== false) {
    await captureNetWorthSnapshot(userId, "COINBASE_SYNC");
  }

  return { accountsCount: accounts.length, pricedAccountsCount, totalValueUsd, warnings };
}
