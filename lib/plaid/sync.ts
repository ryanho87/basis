import "server-only";

import { createHash } from "node:crypto";
import type {
  Holding,
  HoldingTaxLot,
  InvestmentsHoldingsGetResponse,
  LiabilitiesGetResponse,
  Security,
  Transaction as PlaidTransaction,
} from "plaid";
import { prisma } from "@/lib/prisma";
import { captureNetWorthSnapshot } from "@/lib/net-worth";
import { getPlaidClient } from "./client";
import { getPlaidConfigForItem } from "./developer-credentials";
import { toSafePlaidError } from "./errors";
import { decryptPlaidAccessToken } from "./token-crypto";

const OPTIONAL_PRODUCT_ERRORS = new Set([
  "ACCESS_NOT_GRANTED",
  "ADDITIONAL_CONSENT_REQUIRED",
  "NO_INVESTMENT_ACCOUNTS",
  "NO_LIABILITY_ACCOUNTS",
  "PRODUCT_NOT_ENABLED",
  "PRODUCT_NOT_READY",
  "PRODUCTS_NOT_SUPPORTED",
]);

export type PlaidSyncSummary = {
  accountsCount: number;
  holdingsCount: number;
  taxLotsCount: number;
  liabilitiesCount: number;
  transactionsCount: number;
  warnings: string[];
};

export class PlaidSyncError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "PlaidSyncError";
  }
}

type PlaidAccountRecord = {
  account_id: string;
  balances: {
    current: number | null;
    available: number | null;
    limit: number | null;
    iso_currency_code: string | null;
    unofficial_currency_code: string | null;
  };
  mask: string | null;
  name: string;
  official_name: string | null;
  type: string;
  subtype: string | null;
  persistent_account_id?: string;
};

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function lotKey(lot: HoldingTaxLot, index: number) {
  if (lot.institution_lot_id) return `institution:${lot.institution_lot_id}`;
  const fingerprint = JSON.stringify([
    lot.original_purchase_datetime,
    lot.quantity,
    lot.purchase_price,
    lot.cost_basis,
    lot.position_type,
    index,
  ]);
  return `derived:${createHash("sha256").update(fingerprint).digest("hex").slice(0, 24)}`;
}

async function optionalProduct<T>(
  label: string,
  loader: () => Promise<T>,
  warnings: string[],
): Promise<T | null> {
  try {
    return await loader();
  } catch (error) {
    const safe = toSafePlaidError(error);
    if (OPTIONAL_PRODUCT_ERRORS.has(safe.code)) {
      warnings.push(`${label}: ${safe.message}`);
      return null;
    }
    throw error;
  }
}

function mergeAccounts(...groups: Array<PlaidAccountRecord[] | undefined>) {
  const accounts = new Map<string, PlaidAccountRecord>();
  for (const group of groups) {
    for (const account of group ?? []) accounts.set(account.account_id, account);
  }
  return [...accounts.values()];
}

function liabilityEntries(response: LiabilitiesGetResponse | null) {
  if (!response) return [];
  const groups: Array<[string, Array<{ account_id?: string | null }> | null | undefined]> = [
    ["credit", response.liabilities.credit],
    ["mortgage", response.liabilities.mortgage],
    ["student", response.liabilities.student],
    ["loan", response.liabilities.loan],
    ["line_of_credit", response.liabilities.line_of_credit],
  ];
  return groups.flatMap(([type, entries]) =>
    (entries ?? [])
      .filter((entry) => Boolean(entry.account_id))
      .map((details) => ({ accountId: details.account_id as string, type, details })),
  );
}

async function persistSecurity(security: Security) {
  return prisma.plaidSecurity.upsert({
    where: { externalSecurityId: security.security_id },
    update: {
      institutionSecurityId: security.institution_security_id,
      institutionId: security.institution_id,
      tickerSymbol: security.ticker_symbol,
      name: security.name,
      type: security.type,
      subtype: security.subtype,
      isCashEquivalent: security.is_cash_equivalent,
      closePrice: security.close_price,
      closePriceAsOf: parseDate(security.close_price_as_of),
      updateDatetime: parseDate(security.update_datetime),
      isoCurrencyCode: security.iso_currency_code,
      unofficialCurrencyCode: security.unofficial_currency_code,
      marketIdentifierCode: security.market_identifier_code,
      sector: security.sector,
      industry: security.industry,
    },
    create: {
      externalSecurityId: security.security_id,
      institutionSecurityId: security.institution_security_id,
      institutionId: security.institution_id,
      tickerSymbol: security.ticker_symbol,
      name: security.name,
      type: security.type,
      subtype: security.subtype,
      isCashEquivalent: security.is_cash_equivalent,
      closePrice: security.close_price,
      closePriceAsOf: parseDate(security.close_price_as_of),
      updateDatetime: parseDate(security.update_datetime),
      isoCurrencyCode: security.iso_currency_code,
      unofficialCurrencyCode: security.unofficial_currency_code,
      marketIdentifierCode: security.market_identifier_code,
      sector: security.sector,
      industry: security.industry,
    },
  });
}

async function persistHolding(
  holding: Holding,
  accountId: string,
  securityId: string,
  syncedAt: Date,
) {
  const importedLotPrefix = "basis-import:";
  const saved = await prisma.plaidHolding.upsert({
    where: {
      plaidAccountId_plaidSecurityId: {
        plaidAccountId: accountId,
        plaidSecurityId: securityId,
      },
    },
    update: {
      quantity: holding.quantity,
      institutionPrice: holding.institution_price,
      institutionPriceAsOf: parseDate(holding.institution_price_as_of),
      institutionPriceDatetime: parseDate(holding.institution_price_datetime),
      institutionValue: holding.institution_value,
      aggregateCostBasis: holding.cost_basis,
      vestedQuantity: holding.vested_quantity,
      vestedValue: holding.vested_value,
      isoCurrencyCode: holding.iso_currency_code,
      unofficialCurrencyCode: holding.unofficial_currency_code,
      isActive: true,
      lastSyncedAt: syncedAt,
    },
    create: {
      plaidAccountId: accountId,
      plaidSecurityId: securityId,
      quantity: holding.quantity,
      institutionPrice: holding.institution_price,
      institutionPriceAsOf: parseDate(holding.institution_price_as_of),
      institutionPriceDatetime: parseDate(holding.institution_price_datetime),
      institutionValue: holding.institution_value,
      aggregateCostBasis: holding.cost_basis,
      vestedQuantity: holding.vested_quantity,
      vestedValue: holding.vested_value,
      isoCurrencyCode: holding.iso_currency_code,
      unofficialCurrencyCode: holding.unofficial_currency_code,
      lastSyncedAt: syncedAt,
    },
  });

  const taxLots = holding.tax_lots ?? [];
  if (taxLots.length > 0) {
    // Provider lots supersede document-derived fallbacks when they become available.
    await prisma.plaidTaxLot.deleteMany({ where: { plaidHoldingId: saved.id } });
    await prisma.plaidTaxLot.createMany({
      data: taxLots.map((lot, index) => ({
        plaidHoldingId: saved.id,
        lotKey: lotKey(lot, index),
        institutionLotId: lot.institution_lot_id,
        originalPurchaseDatetime: parseDate(lot.original_purchase_datetime),
        quantity: lot.quantity,
        purchasePrice: lot.purchase_price,
        costBasis: lot.cost_basis,
        currentValue: lot.current_value,
        positionType: lot.position_type,
      })),
    });
    return taxLots.length;
  }

  // Shareworks and some other institutions expose holdings but no Plaid tax lots.
  // Preserve explicitly reviewed document imports while clearing stale provider rows.
  await prisma.plaidTaxLot.deleteMany({
    where: {
      plaidHoldingId: saved.id,
      OR: [
        { institutionLotId: null },
        { institutionLotId: { not: { startsWith: importedLotPrefix } } },
      ],
    },
  });
  const importedLots = await prisma.plaidTaxLot.findMany({
    where: { plaidHoldingId: saved.id, institutionLotId: { startsWith: importedLotPrefix } },
    select: { id: true, quantity: true, costBasis: true },
  });
  if (importedLots.length > 0) {
    const importedQuantity = importedLots.reduce((sum, lot) => sum + (lot.quantity ?? 0), 0);
    const importedCostBasis = importedLots.reduce((sum, lot) => sum + (lot.costBasis ?? 0), 0);
    const coversEntireHolding = Math.abs(importedQuantity - holding.quantity) < 0.000001;
    await prisma.$transaction([
      ...importedLots.map((lot) => prisma.plaidTaxLot.update({
        where: { id: lot.id },
        data: { currentValue: (lot.quantity ?? 0) * holding.institution_price },
      })),
      prisma.plaidHolding.update({
        where: { id: saved.id },
        // Only advertise aggregate basis when the imported lots cover every share.
        // Partial document imports remain useful as lots without overstating coverage.
        data: { aggregateCostBasis: coversEntireHolding ? importedCostBasis : null },
      }),
    ]);
  }
  return importedLots.length;
}

function transactionData(transaction: PlaidTransaction, plaidAccountId: string, syncedAt: Date) {
  const category = transaction.personal_finance_category;
  return {
    plaidAccountId,
    pendingTransactionId: transaction.pending_transaction_id,
    date: parseDate(transaction.date) ?? syncedAt,
    authorizedDate: parseDate(transaction.authorized_date),
    datetime: parseDate(transaction.datetime),
    name: transaction.name,
    merchantName: transaction.merchant_name,
    amount: transaction.amount,
    isoCurrencyCode: transaction.iso_currency_code,
    unofficialCurrencyCode: transaction.unofficial_currency_code,
    paymentChannel: transaction.payment_channel,
    pending: transaction.pending,
    plaidPrimaryCategory: category?.primary,
    plaidDetailedCategory: category?.detailed,
    plaidConfidenceLevel: category?.confidence_level,
    originalDescription: transaction.original_description,
    logoUrl: transaction.logo_url,
    website: transaction.website,
    isRemoved: false,
    lastSyncedAt: syncedAt,
  };
}

async function syncTransactions(
  plaid: ReturnType<typeof getPlaidClient>,
  accessToken: string,
  cursor: string | null,
  accountIds: Map<string, string>,
  syncedAt: Date,
) {
  const startingCursor = cursor || undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let nextCursor = startingCursor;
    const added: PlaidTransaction[] = [];
    const modified: PlaidTransaction[] = [];
    const removed: string[] = [];
    try {
      do {
        const response = await plaid.transactionsSync({
          access_token: accessToken,
          cursor: nextCursor,
          count: 500,
          options: {
            include_original_description: true,
            include_personal_finance_category: true,
          },
        });
        added.push(...response.data.added);
        modified.push(...response.data.modified);
        removed.push(...response.data.removed.map((entry) => entry.transaction_id));
        nextCursor = response.data.next_cursor;
        if (!response.data.has_more) break;
      } while (true);

      for (const transaction of [...added, ...modified]) {
        const plaidAccountId = accountIds.get(transaction.account_id);
        if (!plaidAccountId) continue;
        const data = transactionData(transaction, plaidAccountId, syncedAt);
        await prisma.plaidTransaction.upsert({
          where: { externalTransactionId: transaction.transaction_id },
          update: data,
          create: { externalTransactionId: transaction.transaction_id, ...data },
        });
      }
      if (removed.length > 0) {
        const ownedAccountIds = [...accountIds.values()];
        await prisma.plaidTransaction.updateMany({
          where: {
            externalTransactionId: { in: removed },
            plaidAccountId: { in: ownedAccountIds },
          },
          data: { isRemoved: true, lastSyncedAt: syncedAt },
        });
      }
      return {
        cursor: nextCursor ?? cursor,
        count: added.length + modified.length + removed.length,
      };
    } catch (error) {
      const safe = toSafePlaidError(error);
      if (safe.code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" && attempt === 0) continue;
      throw error;
    }
  }
  return { cursor, count: 0 };
}

export async function syncPlaidItem(connectionId: string, userId: string): Promise<PlaidSyncSummary> {
  const connection = await prisma.plaidItem.findFirst({
    where: { id: connectionId, userId, status: { not: "DISCONNECTED" } },
    include: { developerCredential: true },
  });
  if (!connection) throw new PlaidSyncError("Connection not found", "CONNECTION_NOT_FOUND");

  const syncRun = await prisma.plaidSyncRun.create({
    data: { plaidItemId: connection.id },
  });
  const warnings: string[] = [];
  const syncedAt = new Date();

  try {
    const accessToken = decryptPlaidAccessToken(connection.accessTokenEncrypted);
    const config = await getPlaidConfigForItem(connection);
    const plaid = getPlaidClient(config);
    const applicationUrl = process.env.BETTER_AUTH_URL?.trim().replace(/\/$/, "");
    const webhookUrl = config.webhookUrl ?? (applicationUrl ? `${applicationUrl}/api/plaid/webhook` : undefined);
    if (webhookUrl) {
      await optionalProduct(
        "Webhook registration unavailable",
        () => plaid.itemWebhookUpdate({ access_token: accessToken, webhook: webhookUrl }),
        warnings,
      );
    }
    const accountsResponse = await plaid.accountsGet({ access_token: accessToken });
    const baseAccounts = accountsResponse.data.accounts;
    const hasInvestmentAccounts = baseAccounts.some((account) => account.type === "investment");
    const hasLiabilityAccounts = baseAccounts.some(
      (account) => account.type === "credit" || account.type === "loan",
    );
    const investments = hasInvestmentAccounts
      ? await optionalProduct<InvestmentsHoldingsGetResponse>(
          "Investments unavailable",
          async () => (await plaid.investmentsHoldingsGet({ access_token: accessToken })).data,
          warnings,
        )
      : null;
    const liabilities = hasLiabilityAccounts
      ? await optionalProduct<LiabilitiesGetResponse>(
          "Liabilities unavailable",
          async () => (await plaid.liabilitiesGet({ access_token: accessToken })).data,
          warnings,
        )
      : null;

    const accounts = mergeAccounts(
      baseAccounts,
      investments?.accounts,
      liabilities?.accounts,
    );
    await prisma.plaidAccount.updateMany({
      where: { plaidItemId: connection.id },
      data: { isActive: false },
    });

    const accountIds = new Map<string, string>();
    for (const account of accounts) {
      const saved = await prisma.plaidAccount.upsert({
        where: { externalAccountId: account.account_id },
        update: {
          plaidItemId: connection.id,
          persistentAccountId: account.persistent_account_id,
          name: account.name,
          officialName: account.official_name,
          mask: account.mask,
          type: account.type,
          subtype: account.subtype,
          currentBalance: account.balances.current,
          availableBalance: account.balances.available,
          creditLimit: account.balances.limit,
          isoCurrencyCode: account.balances.iso_currency_code,
          unofficialCurrencyCode: account.balances.unofficial_currency_code,
          isActive: true,
          lastSyncedAt: syncedAt,
        },
        create: {
          plaidItemId: connection.id,
          externalAccountId: account.account_id,
          persistentAccountId: account.persistent_account_id,
          name: account.name,
          officialName: account.official_name,
          mask: account.mask,
          type: account.type,
          subtype: account.subtype,
          currentBalance: account.balances.current,
          availableBalance: account.balances.available,
          creditLimit: account.balances.limit,
          isoCurrencyCode: account.balances.iso_currency_code,
          unofficialCurrencyCode: account.balances.unofficial_currency_code,
          lastSyncedAt: syncedAt,
        },
      });
      accountIds.set(account.account_id, saved.id);
    }

    const supportsTransactions = baseAccounts.some(
      (account) => account.type === "credit" || account.type === "depository",
    );
    const transactionSync = supportsTransactions
      ? await optionalProduct(
          "Transactions unavailable",
          () => syncTransactions(
            plaid,
            accessToken,
            connection.transactionsCursor,
            accountIds,
            syncedAt,
          ),
          warnings,
        )
      : null;

    await prisma.plaidHolding.updateMany({
      where: { plaidAccount: { plaidItemId: connection.id } },
      data: { isActive: false },
    });

    const securityIds = new Map<string, string>();
    for (const security of investments?.securities ?? []) {
      const saved = await persistSecurity(security);
      securityIds.set(security.security_id, saved.id);
    }

    let taxLotsCount = 0;
    for (const holding of investments?.holdings ?? []) {
      const accountId = accountIds.get(holding.account_id);
      const securityId = securityIds.get(holding.security_id);
      if (!accountId || !securityId) {
        warnings.push(`Skipped holding ${holding.security_id}: account or security metadata was missing`);
        continue;
      }
      taxLotsCount += await persistHolding(holding, accountId, securityId, syncedAt);
    }

    const entries = liabilityEntries(liabilities);
    if (liabilities) {
      await prisma.plaidLiability.deleteMany({
        where: { plaidAccount: { plaidItemId: connection.id } },
      });
      for (const entry of entries) {
        const plaidAccountId = accountIds.get(entry.accountId);
        if (!plaidAccountId) continue;
        await prisma.plaidLiability.create({
          data: {
            plaidAccountId,
            type: entry.type,
            detailsJson: JSON.stringify(entry.details),
            lastSyncedAt: syncedAt,
          },
        });
      }
    }

    try {
      await captureNetWorthSnapshot(userId, "PLAID_SYNC");
    } catch {
      warnings.push("Net worth history could not be updated after this sync");
    }

    const summary: PlaidSyncSummary = {
      accountsCount: accounts.length,
      holdingsCount: investments?.holdings.length ?? 0,
      taxLotsCount,
      liabilitiesCount: entries.length,
      transactionsCount: transactionSync?.count ?? 0,
      warnings,
    };
    if (transactionSync?.cursor && transactionSync.cursor !== connection.transactionsCursor) {
      await prisma.plaidItem.updateMany({
        where: { id: connection.id, transactionsCursor: connection.transactionsCursor },
        data: { transactionsCursor: transactionSync.cursor },
      });
    }
    await prisma.$transaction([
      prisma.plaidItem.update({
        where: { id: connection.id },
        data: {
          status: "ACTIVE",
          lastSyncedAt: syncedAt,
          errorCode: null,
          errorMessage: null,
        },
      }),
      prisma.plaidSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status: "SUCCEEDED",
          accountsCount: summary.accountsCount,
          holdingsCount: summary.holdingsCount,
          taxLotsCount: summary.taxLotsCount,
          liabilitiesCount: summary.liabilitiesCount,
          transactionsCount: summary.transactionsCount,
          warningsJson: warnings.length ? JSON.stringify(warnings) : null,
          completedAt: new Date(),
        },
      }),
    ]);
    return summary;
  } catch (error) {
    const safe = toSafePlaidError(error);
    const status = safe.code === "ITEM_LOGIN_REQUIRED" ? "LOGIN_REQUIRED" : "ERROR";
    await prisma.$transaction([
      prisma.plaidItem.update({
        where: { id: connection.id },
        data: { status, errorCode: safe.code, errorMessage: safe.message },
      }),
      prisma.plaidSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status: "FAILED",
          errorCode: safe.code,
          errorMessage: safe.message,
          completedAt: new Date(),
        },
      }),
    ]);
    throw new PlaidSyncError(safe.message, safe.code);
  }
}
