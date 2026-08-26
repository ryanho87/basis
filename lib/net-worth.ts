import type { FilingStatus, NetWorthSnapshotSource } from "@prisma/client";
import { prisma } from "./prisma";
import { computeNetWorth } from "./finance";
import {
  estimateOrdinaryWithdrawalRate,
  estimateUnrealizedGainTaxRate,
} from "./tax";

const LIABILITY_ACCOUNT_TYPES = new Set(["credit", "loan"]);
const CASH_ACCOUNT_TYPES = new Set(["depository"]);

function isRothSubtype(subtype: string) {
  return subtype.includes("roth") || subtype.includes("hsa");
}

function isTraditionalSubtype(subtype: string) {
  return ["401k", "401a", "403b", "457", "traditional", "pension", "ira", "sep", "simple", "thrift"]
    .some((label) => subtype.includes(label));
}

export function netWorthDateKey(date: Date, timeZone = process.env.APP_TIME_ZONE?.trim() || "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export type UnifiedNetWorth = {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  afterTaxAssets: number;
  afterTaxNetWorth: number;
  estimatedTaxLiability: number;
  plaidAssets: number;
  plaidLiabilities: number;
  coinbaseAssets: number;
  manualAssets: number;
  manualLiabilities: number;
  basisCoverage: number | null;
  connectedAccountsCount: number;
  byCategory: {
    cash: number;
    taxableInvestments: number;
    retirement: number;
    crypto: number;
    realEstate: number;
    other: number;
  };
};

export async function calculateUnifiedNetWorth(userId: string): Promise<UnifiedNetWorth> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      accounts: { include: { lots: true, positions: true } },
      manualAssets: true,
      liabilities: true,
      studentLoans: true,
      plaidItems: {
        where: { status: { not: "DISCONNECTED" } },
        include: {
          accounts: {
            where: { isActive: true },
            include: {
              holdings: {
                where: { isActive: true },
                include: { plaidSecurity: true, taxLots: true },
              },
            },
          },
        },
      },
      coinbaseConnection: {
        include: { accounts: { where: { isActive: true } } },
      },
    },
  });
  if (!user) throw new Error("User not found");

  const manual = computeNetWorth({
    accounts: user.accounts,
    manualAssets: user.manualAssets,
    liabilities: user.liabilities,
    studentLoans: user.studentLoans,
    filingStatus: user.filingStatus,
  });

  let plaidAssets = 0;
  let plaidLiabilities = 0;
  let plaidEstimatedTax = 0;
  let taxableValueRequiringBasis = 0;
  let taxableValueWithBasis = 0;
  let plaidCash = 0;
  let plaidTaxableInvestments = 0;
  let plaidRetirement = 0;
  let plaidOther = 0;
  let connectedAccountsCount = 0;

  for (const item of user.plaidItems) {
    for (const account of item.accounts) {
      connectedAccountsCount += 1;
      const type = account.type.toLowerCase();
      const subtype = (account.subtype ?? "").toLowerCase();
      const balance = account.currentBalance ?? 0;

      if (LIABILITY_ACCOUNT_TYPES.has(type)) {
        plaidLiabilities += Math.max(0, balance);
        continue;
      }

      plaidAssets += balance;
      if (CASH_ACCOUNT_TYPES.has(type)) {
        plaidCash += balance;
        continue;
      }
      if (type !== "investment") {
        plaidOther += balance;
        continue;
      }

      if (isRothSubtype(subtype)) {
        plaidRetirement += balance;
        continue;
      }
      if (isTraditionalSubtype(subtype)) {
        plaidRetirement += balance;
        plaidEstimatedTax += Math.max(
          0,
          balance * estimateOrdinaryWithdrawalRate(user.filingStatus as FilingStatus),
        );
        continue;
      }

      plaidTaxableInvestments += balance;
      for (const holding of account.holdings) {
        if (holding.plaidSecurity.isCashEquivalent) continue;
        const holdingValue = Math.max(0, holding.institutionValue);
        taxableValueRequiringBasis += holdingValue;

        let coveredValue: number | null = null;
        let knownCostBasis: number | null = null;
        if (holding.aggregateCostBasis !== null) {
          coveredValue = holdingValue;
          knownCostBasis = holding.aggregateCostBasis;
        } else {
          const completeLots = holding.taxLots.filter(
            (lot) => lot.costBasis !== null && lot.currentValue !== null,
          );
          if (completeLots.length > 0) {
            coveredValue = completeLots.reduce((sum, lot) => sum + (lot.currentValue ?? 0), 0);
            knownCostBasis = completeLots.reduce((sum, lot) => sum + (lot.costBasis ?? 0), 0);
          }
        }

        if (coveredValue !== null && knownCostBasis !== null) {
          taxableValueWithBasis += Math.min(holdingValue, Math.max(0, coveredValue));
          plaidEstimatedTax +=
            Math.max(0, coveredValue - knownCostBasis) * estimateUnrealizedGainTaxRate();
        }
      }
    }
  }

  const coinbaseAccounts = user.coinbaseConnection?.status === "DISCONNECTED"
    ? []
    : (user.coinbaseConnection?.accounts ?? []);
  const coinbaseAssets = coinbaseAccounts.reduce(
    (sum, account) => sum + (account.valueUsd ?? 0),
    0,
  );
  const coinbaseTaxableValue = coinbaseAccounts
    .filter((account) => !["USD", "USDC"].includes(account.currency))
    .reduce((sum, account) => sum + (account.valueUsd ?? 0), 0);
  taxableValueRequiringBasis += coinbaseTaxableValue;
  connectedAccountsCount += coinbaseAccounts.length;

  const manualEstimatedTax = manual.totalAssets - manual.afterTaxAssets;
  const estimatedTaxLiability = manualEstimatedTax + plaidEstimatedTax;
  const totalAssets = manual.totalAssets + plaidAssets + coinbaseAssets;
  const totalLiabilities = manual.totalLiabilities + plaidLiabilities;
  const netWorth = totalAssets - totalLiabilities;

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    afterTaxAssets: totalAssets - estimatedTaxLiability,
    afterTaxNetWorth: netWorth - estimatedTaxLiability,
    estimatedTaxLiability,
    plaidAssets,
    plaidLiabilities,
    coinbaseAssets,
    manualAssets: manual.totalAssets,
    manualLiabilities: manual.totalLiabilities,
    basisCoverage:
      taxableValueRequiringBasis > 0
        ? taxableValueWithBasis / taxableValueRequiringBasis
        : null,
    connectedAccountsCount,
    byCategory: {
      cash: manual.byCategory.cash + plaidCash,
      taxableInvestments:
        manual.byCategory.taxableInvestments + plaidTaxableInvestments,
      retirement: manual.byCategory.retirement + plaidRetirement,
      crypto: manual.byCategory.crypto + coinbaseAssets,
      realEstate: manual.byCategory.realEstate,
      other: manual.byCategory.other + plaidOther,
    },
  };
}

export async function captureNetWorthSnapshot(
  userId: string,
  source: NetWorthSnapshotSource,
  options: { snapshotKey?: string; capturedAt?: Date } = {},
) {
  const value = await calculateUnifiedNetWorth(userId);
  const capturedAt = options.capturedAt ?? new Date();
  const snapshotKey = options.snapshotKey ?? netWorthDateKey(capturedAt);
  const snapshot = await prisma.netWorthSnapshot.upsert({
    where: { userId_dateKey: { userId, dateKey: snapshotKey } },
    update: {
      capturedAt,
      source,
      grossAssets: value.totalAssets,
      totalLiabilities: value.totalLiabilities,
      netWorth: value.netWorth,
      estimatedTaxLiability: value.estimatedTaxLiability,
      afterTaxNetWorth: value.afterTaxNetWorth,
      plaidAssets: value.plaidAssets,
      plaidLiabilities: value.plaidLiabilities,
      coinbaseAssets: value.coinbaseAssets,
      manualAssets: value.manualAssets,
      manualLiabilities: value.manualLiabilities,
      basisCoverage: value.basisCoverage,
    },
    create: {
      userId,
      dateKey: snapshotKey,
      capturedAt,
      source,
      grossAssets: value.totalAssets,
      totalLiabilities: value.totalLiabilities,
      netWorth: value.netWorth,
      estimatedTaxLiability: value.estimatedTaxLiability,
      afterTaxNetWorth: value.afterTaxNetWorth,
      plaidAssets: value.plaidAssets,
      plaidLiabilities: value.plaidLiabilities,
      coinbaseAssets: value.coinbaseAssets,
      manualAssets: value.manualAssets,
      manualLiabilities: value.manualLiabilities,
      basisCoverage: value.basisCoverage,
    },
  });
  return { value, snapshot };
}
