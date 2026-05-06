// Net worth, lot-level gains, and projection math.

import type {
  Account,
  AssetLot,
  HoldingPosition,
  Liability,
  ManualAsset,
  StudentLoan,
  W2Snapshot,
  RsuGrant,
  VestEvent,
  PaycheckProfile,
  SCorpProfile,
} from "@prisma/client";
import {
  estimateOrdinaryWithdrawalRate,
  estimateUnrealizedGainTaxRate,
} from "./tax";
import { FilingStatus } from "@prisma/client";

const TAXABLE_TYPES = new Set([
  "TAXABLE_BROKERAGE",
  "CRYPTO",
]);

const TRADITIONAL_TYPES = new Set([
  "K401_TRADITIONAL",
  "IRA_TRADITIONAL",
]);

const ROTH_TYPES = new Set([
  "K401_ROTH",
  "IRA_ROTH",
  "HSA",
]);

export type LotWithMarket = AssetLot & {
  currentPrice?: number;
  currentValue: number;
  costBasisTotal: number;
  unrealizedGain: number;
  holdingDays: number;
  isLongTerm: boolean;
};

export function priceLot(lot: AssetLot, currentPrice?: number): LotWithMarket {
  const price = currentPrice ?? lot.costBasisPerShare;
  const currentValue = lot.shares * price;
  const costBasisTotal = lot.shares * lot.costBasisPerShare;
  const unrealizedGain = currentValue - costBasisTotal;
  const holdingDays = Math.floor(
    (Date.now() - new Date(lot.acquiredAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  return {
    ...lot,
    currentPrice: price,
    currentValue,
    costBasisTotal,
    unrealizedGain,
    holdingDays,
    isLongTerm: holdingDays >= 365,
  };
}

export type AccountWithValuation = Account & {
  totalValue: number;
  unrealizedGain: number;
  afterTaxValue: number;
  lots: LotWithMarket[];
  positions: HoldingPosition[];
};

// Without market data we treat current price = cost basis per share for lots
// (so unrealized gain is 0 by default), and use HoldingPosition.currentValue
// directly. The user can override prices later with a price-set form.
export function valuateAccount(
  account: Account & { lots: AssetLot[]; positions: HoldingPosition[] },
  prices?: Record<string, number>,
  filingStatus: FilingStatus = "SINGLE",
): AccountWithValuation {
  const pricedLots = account.lots.map((l) => priceLot(l, prices?.[l.ticker]));
  const lotValue = pricedLots.reduce((s, l) => s + l.currentValue, 0);
  const lotGain = pricedLots.reduce((s, l) => s + l.unrealizedGain, 0);
  const positionValue = account.positions.reduce((s, p) => s + p.currentValue, 0);
  const totalValue = lotValue + positionValue + account.cashBalance;

  let afterTaxValue = totalValue;
  if (TAXABLE_TYPES.has(account.type)) {
    afterTaxValue = totalValue - lotGain * estimateUnrealizedGainTaxRate();
  } else if (TRADITIONAL_TYPES.has(account.type)) {
    afterTaxValue = totalValue * (1 - estimateOrdinaryWithdrawalRate(filingStatus));
  } else if (ROTH_TYPES.has(account.type)) {
    afterTaxValue = totalValue;
  }

  return {
    ...account,
    totalValue,
    unrealizedGain: lotGain,
    afterTaxValue,
    lots: pricedLots,
    positions: account.positions,
  };
}

export type NetWorthInputs = {
  accounts: (Account & { lots: AssetLot[]; positions: HoldingPosition[] })[];
  manualAssets: ManualAsset[];
  liabilities: Liability[];
  studentLoans: StudentLoan[];
  filingStatus?: FilingStatus;
  prices?: Record<string, number>;
};

export type NetWorthBreakdown = {
  accounts: AccountWithValuation[];
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  afterTaxAssets: number;
  afterTaxNetWorth: number;
  byCategory: {
    cash: number;
    taxableInvestments: number;
    retirement: number;
    crypto: number;
    realEstate: number;
    other: number;
  };
  totalUnrealizedGain: number;
};

export function computeNetWorth(inputs: NetWorthInputs): NetWorthBreakdown {
  const filingStatus = inputs.filingStatus ?? "SINGLE";
  const valuated = inputs.accounts.map((a) =>
    valuateAccount(a, inputs.prices, filingStatus),
  );

  const cash = valuated
    .filter((a) => a.type === "CHECKING" || a.type === "SAVINGS")
    .reduce((s, a) => s + a.totalValue, 0);
  const taxableInvestments = valuated
    .filter((a) => a.type === "TAXABLE_BROKERAGE")
    .reduce((s, a) => s + a.totalValue, 0);
  const retirement = valuated
    .filter((a) => TRADITIONAL_TYPES.has(a.type) || ROTH_TYPES.has(a.type))
    .reduce((s, a) => s + a.totalValue, 0);
  const crypto = valuated
    .filter((a) => a.type === "CRYPTO")
    .reduce((s, a) => s + a.totalValue, 0);
  const realEstate = inputs.manualAssets
    .filter((a) => a.type === "REAL_ESTATE")
    .reduce((s, a) => s + a.currentValue, 0);
  const otherManual = inputs.manualAssets
    .filter((a) => a.type !== "REAL_ESTATE")
    .reduce((s, a) => s + a.currentValue, 0);

  const accountAssets = valuated.reduce((s, a) => s + a.totalValue, 0);
  const totalAssets =
    accountAssets + realEstate + otherManual;
  const totalLiabilities =
    inputs.liabilities.reduce((s, l) => s + l.currentBalance, 0) +
    inputs.studentLoans.reduce((s, l) => s + l.balance, 0);

  const afterTaxAccountAssets = valuated.reduce((s, a) => s + a.afterTaxValue, 0);
  const afterTaxAssets = afterTaxAccountAssets + realEstate + otherManual;

  const totalUnrealizedGain = valuated.reduce((s, a) => s + a.unrealizedGain, 0);

  return {
    accounts: valuated,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    afterTaxAssets,
    afterTaxNetWorth: afterTaxAssets - totalLiabilities,
    byCategory: {
      cash,
      taxableInvestments,
      retirement,
      crypto,
      realEstate,
      other: otherManual,
    },
    totalUnrealizedGain,
  };
}

// ---------- Income projection ----------

export type IncomeProjectionInputs = {
  taxYear: number;
  paycheck?: PaycheckProfile | null;
  sCorp?: SCorpProfile | null;
  latestW2?: W2Snapshot | null;
  rsuGrants: (RsuGrant & { vestEvents: VestEvent[] })[];
  rsuPriceEstimate?: Record<string, number>; // ticker → estimated price for upcoming vests
  additionalOrdinaryIncome?: number;
  realizedSTCG?: number;
  realizedLTCG?: number;
};

export type IncomeProjection = {
  ytdW2: number;
  remainingW2: number;
  projectedW2: number;
  projectedBonus: number;
  ytdRsuVestIncome: number;
  upcomingRsuIncome: number;
  projectedSCorpDistribution: number;
  projectedSCorpW2: number;
  totalProjectedOrdinary: number;
  realizedSTCG: number;
  realizedLTCG: number;
  estimatedPretax: number;
};

export function projectIncome(inputs: IncomeProjectionInputs): IncomeProjection {
  const {
    taxYear,
    paycheck,
    sCorp,
    latestW2,
    rsuGrants,
    rsuPriceEstimate = {},
    additionalOrdinaryIncome = 0,
    realizedSTCG = 0,
    realizedLTCG = 0,
  } = inputs;

  const ytdW2 = latestW2?.ytdWages ?? 0;
  const ytdRsuVestIncome = latestW2?.ytdRsuVestIncome ?? 0;
  const ytdBonuses = latestW2?.ytdBonuses ?? 0;

  // Project remaining W-2 from paycheck profile.
  let remainingW2 = 0;
  let projectedBonus = 0;
  if (paycheck) {
    const snapshotDate = latestW2?.snapshotDate
      ? new Date(latestW2.snapshotDate)
      : new Date(taxYear, 0, 1);
    const yearEnd = new Date(taxYear, 11, 31);
    const daysRemaining = Math.max(
      0,
      (yearEnd.getTime() - snapshotDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const dailyRate = paycheck.annualSalary / 365;
    remainingW2 = Math.max(0, dailyRate * daysRemaining);
    if (paycheck.expectedBonus) {
      const bonusMonth = paycheck.bonusMonth ?? 12;
      const snapshotMonth = snapshotDate.getMonth() + 1;
      if (bonusMonth >= snapshotMonth && ytdBonuses < paycheck.expectedBonus) {
        projectedBonus = paycheck.expectedBonus - ytdBonuses;
      }
    }
  }

  // Project upcoming RSU vests this year.
  let upcomingRsuIncome = 0;
  const now = new Date();
  for (const grant of rsuGrants) {
    for (const v of grant.vestEvents) {
      const vDate = new Date(v.vestDate);
      if (
        v.status === "PENDING" &&
        vDate.getFullYear() === taxYear &&
        vDate >= now
      ) {
        const price = rsuPriceEstimate[grant.ticker] ?? v.fmvAtVest ?? 0;
        upcomingRsuIncome += v.shares * price;
      }
    }
  }

  const projectedSCorpW2 = sCorp?.w2SalaryFromCorp ?? 0;
  const projectedSCorpDistribution = sCorp?.projectedDistribution ?? 0;

  const projectedW2 = ytdW2 + remainingW2;

  const totalProjectedOrdinary =
    projectedW2 +
    projectedBonus +
    ytdRsuVestIncome +
    upcomingRsuIncome +
    projectedSCorpW2 +
    projectedSCorpDistribution +
    additionalOrdinaryIncome +
    realizedSTCG;

  const estimatedPretax =
    (paycheck?.k401Contribution ?? 0) +
    (paycheck?.hsaContribution ?? 0) +
    (paycheck?.otherPretax ?? 0) +
    (sCorp?.solo401kContribution ?? 0) +
    (sCorp?.sepIraContribution ?? 0);

  return {
    ytdW2,
    remainingW2,
    projectedW2,
    projectedBonus,
    ytdRsuVestIncome,
    upcomingRsuIncome,
    projectedSCorpDistribution,
    projectedSCorpW2,
    totalProjectedOrdinary,
    realizedSTCG,
    realizedLTCG,
    estimatedPretax,
  };
}
