import { computeNetWorth, projectIncome } from "../lib/finance";
import { calculateUnifiedNetWorth } from "../lib/net-worth";
import { computeTax } from "../lib/tax";
import { prisma } from "../lib/prisma";
import { getRsuPriceEstimates } from "../lib/rsu-pricing";

const TAX_LIMITATIONS = [
  "Federal estimate only; state tax is not modeled.",
  "AMT, itemized deductions, payroll taxes, and wash-sale rules are not modeled.",
  "Results are planning estimates, not tax advice.",
];

const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;
const round = (value: number) => Math.round(value * 100) / 100;

export async function resolveMcpUserId() {
  const configured = process.env.BASIS_MCP_USER_ID?.trim();
  if (configured) {
    const user = await prisma.user.findUnique({ where: { id: configured }, select: { id: true } });
    if (!user) throw new Error("BASIS_MCP_USER_ID does not match a Basis user.");
    return user.id;
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    take: 2,
    select: { id: true },
  });
  if (users.length === 0) throw new Error("No Basis user exists. Open Basis and finish setup first.");
  if (users.length > 1) throw new Error("Multiple Basis users exist. Set BASIS_MCP_USER_ID explicitly.");
  return users[0].id;
}

async function incomeContext(userId: string, taxYear: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      paycheckProfile: true,
      sCorpProfile: true,
      rsuGrants: { include: { vestEvents: true } },
      w2Snapshots: {
        where: { taxYear },
        orderBy: [{ snapshotDate: "desc" }, { createdAt: "desc" }],
        take: 1,
      },
    },
  });
  if (!user) throw new Error("Basis user not found.");
  const latestSnapshot = user.w2Snapshots[0] ?? null;
  const rsuPriceEstimate = await getRsuPriceEstimates(userId, user.rsuGrants.map((grant) => grant.ticker));
  const projection = projectIncome({
    taxYear,
    paycheck: user.paycheckProfile,
    sCorp: user.sCorpProfile,
    latestW2: latestSnapshot,
    rsuGrants: user.rsuGrants,
    rsuPriceEstimate,
  });
  const tax = computeTax({
    taxYear,
    filingStatus: user.filingStatus,
    ordinaryIncome: projection.totalProjectedOrdinary,
    longTermGains: projection.realizedLTCG,
    pretaxDeductions: projection.estimatedPretax,
  });
  return { user, latestSnapshot, projection, tax };
}

export async function getFinancialSummary(boundUserId?: string) {
  const userId = boundUserId ?? await resolveMcpUserId();
  const taxYear = new Date().getFullYear();
  const [worth, income] = await Promise.all([
    calculateUnifiedNetWorth(userId),
    incomeContext(userId, taxYear),
  ]);
  return {
    asOf: new Date().toISOString(),
    currency: "USD",
    netWorth: {
      assets: round(worth.totalAssets),
      liabilities: round(worth.totalLiabilities),
      gross: round(worth.netWorth),
      estimatedEmbeddedTax: round(worth.estimatedTaxLiability),
      afterTax: round(worth.afterTaxNetWorth),
      basisCoverage: worth.basisCoverage,
      connectedAccounts: worth.connectedAccountsCount,
      byCategory: Object.fromEntries(Object.entries(worth.byCategory).map(([key, value]) => [key, round(value)])),
    },
    currentTaxPosition: {
      taxYear,
      filingStatus: income.user.filingStatus,
      incomeSnapshotDate: iso(income.latestSnapshot?.snapshotDate),
      projectedOrdinaryIncome: round(income.projection.totalProjectedOrdinary),
      projectedLongTermGains: round(income.projection.realizedLTCG),
      estimatedPretaxDeductions: round(income.projection.estimatedPretax),
      federalTaxEstimate: round(income.tax.totalTax),
      ltcgZeroPercentRoom: round(income.tax.bracketRoom.ltcgRoomAt0),
      ltcgFifteenPercentRoom: round(income.tax.bracketRoom.ltcgRoomAt15),
      niitExposure: round(income.tax.bracketRoom.niitOver),
    },
    limitations: TAX_LIMITATIONS,
  };
}

export async function listAccounts(boundUserId?: string) {
  const userId = boundUserId ?? await resolveMcpUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      accounts: { include: { lots: true, positions: true } },
      manualAssets: true,
      liabilities: true,
      studentLoans: true,
      plaidItems: {
        where: { status: { not: "DISCONNECTED" } },
        include: { accounts: { where: { isActive: true }, include: { holdings: true } } },
      },
      coinbaseConnection: { include: { accounts: { where: { isActive: true } } } },
    },
  });
  if (!user) throw new Error("Basis user not found.");

  const manualValuations = computeNetWorth({
    accounts: user.accounts,
    manualAssets: [],
    liabilities: [],
    studentLoans: [],
    filingStatus: user.filingStatus,
  }).accounts;
  const manual = manualValuations.map((account) => ({
    accountId: `manual:${account.id}`,
    source: "manual",
    institution: account.institution,
    name: account.name,
    type: account.type,
    subtype: null,
    mask: null,
    value: round(account.totalValue),
    contributionToNetWorth: round(account.totalValue),
    role: "asset",
    currency: "USD",
    lastSyncedAt: iso(account.updatedAt),
    hasHoldings: account.lots.length + account.positions.length > 0,
  }));
  const plaid = user.plaidItems.flatMap((item) => item.accounts.map((account) => ({
    accountId: `plaid:${account.id}`,
    source: "plaid",
    institution: item.institutionName,
    name: account.name,
    type: account.type,
    subtype: account.subtype,
    mask: account.mask,
    value: round(account.currentBalance ?? 0),
    contributionToNetWorth: round(["credit", "loan"].includes(account.type.toLowerCase()) ? -(account.currentBalance ?? 0) : (account.currentBalance ?? 0)),
    role: ["credit", "loan"].includes(account.type.toLowerCase()) ? "liability" : "asset",
    currency: account.isoCurrencyCode ?? account.unofficialCurrencyCode ?? "USD",
    lastSyncedAt: iso(account.lastSyncedAt ?? item.lastSyncedAt),
    hasHoldings: account.holdings.length > 0,
  })));
  const coinbase = user.coinbaseConnection?.status === "DISCONNECTED" ? [] :
    (user.coinbaseConnection?.accounts ?? []).map((account) => ({
      accountId: `coinbase:${account.id}`,
      source: "coinbase",
      institution: "Coinbase",
      name: account.name,
      type: "crypto",
      subtype: account.accountType,
      mask: null,
      value: round(account.valueUsd ?? 0),
      contributionToNetWorth: round(account.valueUsd ?? 0),
      role: "asset",
      currency: "USD",
      lastSyncedAt: iso(account.lastSyncedAt),
      hasHoldings: true,
    }));
  const manualAssets = user.manualAssets.map((asset) => ({
    accountId: `asset:${asset.id}`, source: "manual", institution: null, name: asset.name,
    type: "manual_asset", subtype: asset.type, mask: null, value: round(asset.currentValue),
    contributionToNetWorth: round(asset.currentValue), role: "asset", currency: "USD",
    lastSyncedAt: iso(asset.updatedAt), hasHoldings: false,
  }));
  const liabilities = user.liabilities.map((liability) => ({
    accountId: `liability:${liability.id}`, source: "manual", institution: null, name: liability.name,
    type: "liability", subtype: liability.type, mask: null, value: round(liability.currentBalance),
    contributionToNetWorth: round(-liability.currentBalance), role: "liability", currency: "USD",
    lastSyncedAt: iso(liability.updatedAt), hasHoldings: false,
  }));
  const studentLoans = user.studentLoans.map((loan) => ({
    accountId: `student-loan:${loan.id}`, source: "manual", institution: loan.servicer, name: loan.servicer ?? "Student loan",
    type: "liability", subtype: loan.loanType, mask: null, value: round(loan.balance),
    contributionToNetWorth: round(-loan.balance), role: "liability", currency: "USD",
    lastSyncedAt: iso(loan.updatedAt), hasHoldings: false,
  }));
  return { asOf: new Date().toISOString(), accounts: [...manual, ...plaid, ...coinbase, ...manualAssets, ...liabilities, ...studentLoans] };
}

function parseAccountId(accountId: string) {
  const match = /^(manual|plaid|coinbase|asset|liability|student-loan):(.+)$/.exec(accountId);
  if (!match) throw new Error("Invalid accountId. Use an opaque ID returned by list_accounts.");
  return { source: match[1], id: match[2] };
}

export async function getAccountHoldings(accountId: string, boundUserId?: string) {
  const userId = boundUserId ?? await resolveMcpUserId();
  const { source, id } = parseAccountId(accountId);
  if (source === "manual") {
    const account = await prisma.account.findFirst({
      where: { id, userId }, include: { lots: true, positions: true },
    });
    if (!account) throw new Error("Account not found for this Basis user.");
    const grouped = new Map<string, { ticker: string; name: string | null; quantity: number; value: number; basis: number }>();
    for (const lot of account.lots) {
      const row = grouped.get(lot.ticker) ?? { ticker: lot.ticker, name: lot.name, quantity: 0, value: 0, basis: 0 };
      row.quantity += lot.shares; row.value += lot.shares * lot.costBasisPerShare; row.basis += lot.shares * lot.costBasisPerShare;
      grouped.set(lot.ticker, row);
    }
    for (const position of account.positions) {
      const row = grouped.get(position.ticker) ?? { ticker: position.ticker, name: position.name, quantity: 0, value: 0, basis: 0 };
      row.quantity += position.shares; row.value += position.currentValue;
      grouped.set(position.ticker, row);
    }
    return { accountId, asOf: iso(account.updatedAt), holdings: [...grouped.values()].map((row) => ({
      ticker: row.ticker, name: row.name, quantity: round(row.quantity), currentValue: round(row.value),
      costBasis: row.basis > 0 ? round(row.basis) : null,
      unrealizedGain: row.basis > 0 ? round(row.value - row.basis) : null,
    })) };
  }
  if (source === "plaid") {
    const account = await prisma.plaidAccount.findFirst({
      where: { id, plaidItem: { userId } },
      include: { holdings: { where: { isActive: true }, include: { plaidSecurity: true, taxLots: true } } },
    });
    if (!account) throw new Error("Account not found for this Basis user.");
    return { accountId, asOf: iso(account.lastSyncedAt), holdings: account.holdings.slice(0, 200).map((holding) => ({
      ticker: holding.plaidSecurity.tickerSymbol,
      name: holding.plaidSecurity.name,
      quantity: round(holding.quantity),
      price: round(holding.institutionPrice),
      currentValue: round(holding.institutionValue),
      costBasis: holding.aggregateCostBasis === null ? null : round(holding.aggregateCostBasis),
      unrealizedGain: holding.aggregateCostBasis === null ? null : round(holding.institutionValue - holding.aggregateCostBasis),
      taxLotCount: holding.taxLots.length,
    })) };
  }
  if (source === "asset") {
    const asset = await prisma.manualAsset.findFirst({ where: { id, userId } });
    if (!asset) throw new Error("Account not found for this Basis user.");
    return { accountId, asOf: iso(asset.updatedAt), holdings: [], item: { name: asset.name, type: asset.type, currentValue: round(asset.currentValue), purchasePrice: asset.purchasePrice, purchaseDate: iso(asset.purchaseDate) } };
  }
  if (source === "liability") {
    const liability = await prisma.liability.findFirst({ where: { id, userId } });
    if (!liability) throw new Error("Account not found for this Basis user.");
    return { accountId, asOf: iso(liability.updatedAt), holdings: [], item: { name: liability.name, type: liability.type, currentBalance: round(liability.currentBalance), interestRate: liability.interestRate, monthlyPayment: liability.monthlyPayment } };
  }
  if (source === "student-loan") {
    const loan = await prisma.studentLoan.findFirst({ where: { id, userId } });
    if (!loan) throw new Error("Account not found for this Basis user.");
    return { accountId, asOf: iso(loan.updatedAt), holdings: [], item: { name: loan.servicer ?? "Student loan", type: loan.loanType, currentBalance: round(loan.balance), interestRate: loan.interestRate, monthlyPayment: loan.monthlyPayment } };
  }
  const account = await prisma.coinbaseAccount.findFirst({
    where: { id, coinbaseConnection: { userId } },
  });
  if (!account) throw new Error("Account not found for this Basis user.");
  return { accountId, asOf: iso(account.lastSyncedAt), holdings: [{
    ticker: account.currency, name: account.name, quantity: round(account.quantity), price: account.priceUsd,
    currentValue: round(account.valueUsd ?? 0), costBasis: null, unrealizedGain: null,
  }] };
}

export async function getTaxLots(input: { accountId?: string; ticker?: string; limit?: number }, boundUserId?: string) {
  const userId = boundUserId ?? await resolveMcpUserId();
  const limit = Math.min(200, Math.max(1, input.limit ?? 100));
  const account = input.accountId ? parseAccountId(input.accountId) : null;
  if (account && !["manual", "plaid"].includes(account.source)) return { asOf: new Date().toISOString(), lots: [], warning: `${account.source} does not have tax-lot data.` };
  const ticker = input.ticker?.trim().toUpperCase();
  const manual = (!account || account.source === "manual") ? await prisma.assetLot.findMany({
    where: {
      account: { userId },
      ...(account ? { accountId: account.id } : {}),
      ...(ticker ? { ticker: { equals: ticker } } : {}),
    }, include: { account: { select: { name: true } } }, orderBy: { acquiredAt: "asc" }, take: limit,
  }) : [];
  const remaining = Math.max(0, limit - manual.length);
  const plaid = remaining > 0 && (!account || account.source === "plaid") ? await prisma.plaidTaxLot.findMany({
    where: {
      plaidHolding: {
        plaidAccount: { plaidItem: { userId }, ...(account ? { id: account.id } : {}) },
        ...(ticker ? { plaidSecurity: { tickerSymbol: { equals: ticker } } } : {}),
      },
    },
    include: { plaidHolding: { include: { plaidSecurity: true, plaidAccount: { select: { name: true } } } } },
    orderBy: { originalPurchaseDatetime: "asc" }, take: remaining,
  }) : [];
  const now = new Date();
  const rows = [
    ...manual.map((lot) => ({
      lotId: `manual:${lot.id}`, source: "manual", accountName: lot.account.name, ticker: lot.ticker,
      acquiredAt: iso(lot.acquiredAt), quantity: round(lot.shares), costBasisPerShare: round(lot.costBasisPerShare),
      costBasis: round(lot.shares * lot.costBasisPerShare), currentValue: null, unrealizedGain: null,
      longTerm: now.getTime() - lot.acquiredAt.getTime() >= 365 * 86400000,
    })),
    ...plaid.map((lot) => ({
      lotId: `plaid:${lot.id}`, source: "plaid", accountName: lot.plaidHolding.plaidAccount.name,
      ticker: lot.plaidHolding.plaidSecurity.tickerSymbol, acquiredAt: iso(lot.originalPurchaseDatetime),
      quantity: lot.quantity === null ? null : round(lot.quantity),
      costBasisPerShare: lot.purchasePrice === null ? null : round(lot.purchasePrice),
      costBasis: lot.costBasis === null ? null : round(lot.costBasis),
      currentValue: lot.currentValue === null ? null : round(lot.currentValue),
      unrealizedGain: lot.currentValue === null || lot.costBasis === null ? null : round(lot.currentValue - lot.costBasis),
      longTerm: lot.originalPurchaseDatetime ? now.getTime() - lot.originalPurchaseDatetime.getTime() >= 365 * 86400000 : null,
    })),
  ];
  return { asOf: new Date().toISOString(), count: rows.length, truncated: rows.length >= limit, lots: rows };
}

export async function getNetWorthHistory(days = 90, boundUserId?: string) {
  const userId = boundUserId ?? await resolveMcpUserId();
  const safeDays = Math.min(3650, Math.max(1, days));
  const since = new Date(Date.now() - safeDays * 86400000);
  const snapshots = await prisma.netWorthSnapshot.findMany({
    where: { userId, capturedAt: { gte: since } }, orderBy: { capturedAt: "asc" }, take: 1000,
  });
  return { days: safeDays, currency: "USD", snapshots: snapshots.map((row) => ({
    date: row.dateKey, capturedAt: iso(row.capturedAt), source: row.source,
    assets: round(row.grossAssets), liabilities: round(row.totalLiabilities), netWorth: round(row.netWorth),
    afterTaxNetWorth: round(row.afterTaxNetWorth), basisCoverage: row.basisCoverage,
  })) };
}

export async function getIncomeTaxPosition(taxYear = new Date().getFullYear(), boundUserId?: string) {
  const userId = boundUserId ?? await resolveMcpUserId();
  const { user, latestSnapshot, projection, tax } = await incomeContext(userId, taxYear);
  return {
    asOf: new Date().toISOString(), taxYear, filingStatus: user.filingStatus, state: user.state,
    sourceSnapshot: latestSnapshot ? {
      date: iso(latestSnapshot.snapshotDate), source: latestSnapshot.source, employer: latestSnapshot.employerName,
      ytdWages: round(latestSnapshot.ytdWages), ytdFederalWithheld: round(latestSnapshot.ytdFederalWithheld),
      ytdStateWithheld: round(latestSnapshot.ytdStateWithheld), ytdPretaxDeductions: round(latestSnapshot.ytdPretaxDeductions),
    } : null,
    projection: Object.fromEntries(Object.entries(projection).map(([key, value]) => [key, round(value)])),
    federalEstimate: {
      taxableOrdinary: round(tax.taxableOrdinary), taxableLongTermGains: round(tax.taxableLtcg),
      totalTax: round(tax.totalTax), effectiveRate: tax.effectiveRate,
      marginalOrdinaryRate: tax.marginalOrdinaryRate, marginalLongTermGainsRate: tax.marginalLtcgRate,
      thresholds: tax.thresholds,
      bracketRoom: Object.fromEntries(Object.entries(tax.bracketRoom).map(([key, value]) => [key, value === null ? null : round(value)])),
    },
    limitations: TAX_LIMITATIONS,
  };
}

export async function getEquityCompensation(upcomingOnly = false, boundUserId?: string) {
  const userId = boundUserId ?? await resolveMcpUserId();
  const now = new Date();
  const grants = await prisma.rsuGrant.findMany({
    where: { userId }, include: { vestEvents: { orderBy: { vestDate: "asc" } } }, orderBy: { grantDate: "desc" }, take: 100,
  });
  return { asOf: now.toISOString(), grants: grants.map((grant) => ({
    grantId: grant.id, ticker: grant.ticker, company: grant.company, grantDate: iso(grant.grantDate), totalShares: round(grant.totalShares),
    vestEvents: grant.vestEvents.filter((event) => !upcomingOnly || (event.status === "PENDING" && event.vestDate >= now)).map((event) => ({
      vestDate: iso(event.vestDate), shares: round(event.shares), status: event.status, fmvAtVest: event.fmvAtVest,
    })),
  })).filter((grant) => !upcomingOnly || grant.vestEvents.length > 0) };
}

export async function getDataQuality(boundUserId?: string) {
  const userId = boundUserId ?? await resolveMcpUserId();
  const currentTaxYear = new Date().getFullYear();
  const [worth, items, coinbase, missingPlaidLots, manualLots, income, incomePosition] = await Promise.all([
    calculateUnifiedNetWorth(userId),
    prisma.plaidItem.findMany({ where: { userId }, select: { institutionName: true, status: true, errorCode: true, lastSyncedAt: true, accounts: { where: { isActive: true }, select: { holdings: { where: { isActive: true }, select: { aggregateCostBasis: true, taxLots: { select: { costBasis: true } } } } } } } }),
    prisma.coinbaseConnection.findUnique({ where: { userId }, select: { status: true, lastSyncedAt: true } }),
    prisma.plaidHolding.count({ where: { plaidAccount: { plaidItem: { userId } }, isActive: true, plaidSecurity: { isCashEquivalent: { not: true } }, aggregateCostBasis: null, taxLots: { none: { costBasis: { not: null } } } } }),
    prisma.assetLot.count({ where: { account: { userId } } }),
    prisma.w2Snapshot.findFirst({ where: { userId, taxYear: currentTaxYear }, orderBy: [{ snapshotDate: "desc" }, { createdAt: "desc" }], select: { snapshotDate: true, source: true } }),
    incomeContext(userId, currentTaxYear),
  ]);
  const issues: { severity: string; source: string; message: string }[] = [];
  for (const item of items) {
    if (item.status !== "ACTIVE") issues.push({ severity: "warning", source: item.institutionName ?? "Plaid institution", message: `Connection status is ${item.status}${item.errorCode ? ` (${item.errorCode})` : ""}.` });
  }
  if (missingPlaidLots > 0) issues.push({ severity: "warning", source: "Plaid", message: `${missingPlaidLots} investment positions lack usable cost basis.` });
  if (coinbase?.status === "ACTIVE") issues.push({ severity: "warning", source: "Coinbase", message: "Balances are connected, but tax-lot cost basis is unavailable." });
  if (!income) issues.push({ severity: "warning", source: "Income", message: "No pay-stub snapshot is available for current tax planning." });
  if (incomePosition.projection.unpricedRsuEvents > 0) issues.push({
    severity: "warning",
    source: "Equity compensation",
    message: `${incomePosition.projection.unpricedRsuEvents} post-payroll RSU event(s), totaling ${round(incomePosition.projection.unpricedRsuShares)} shares, are excluded from income because no FMV or planning price is available.`,
  });
  return {
    asOf: new Date().toISOString(), basisCoverage: worth.basisCoverage, manualTaxLotCount: manualLots,
    connections: {
      plaid: items.map((item) => ({ institution: item.institutionName, status: item.status, lastSyncedAt: iso(item.lastSyncedAt) })),
      coinbase: coinbase ? { status: coinbase.status, lastSyncedAt: iso(coinbase.lastSyncedAt) } : null,
      income: income ? { snapshotDate: iso(income.snapshotDate), source: income.source } : null,
    },
    issues,
  };
}

type SaleLot = { id: string; source: string; accountName: string; ticker: string; shares: number; basisPerShare: number; acquiredAt: Date };

function orderSaleLots(lots: SaleLot[], strategy: "FIFO" | "HIFO" | "TAX_OPTIMAL", saleDate: Date) {
  const isLt = (lot: SaleLot) => saleDate.getTime() - lot.acquiredAt.getTime() >= 365 * 86400000;
  return [...lots].sort((a, b) => strategy === "FIFO" ? a.acquiredAt.getTime() - b.acquiredAt.getTime() :
    strategy === "HIFO" ? b.basisPerShare - a.basisPerShare :
      Number(isLt(b)) - Number(isLt(a)) || b.basisPerShare - a.basisPerShare);
}

function allocate(lots: SaleLot[], shares: number, price: number, saleDate: Date) {
  let remaining = shares;
  const allocations = [];
  for (const lot of lots) {
    if (remaining <= 0) break;
    const sharesSold = Math.min(remaining, lot.shares);
    const proceeds = sharesSold * price;
    const costBasis = sharesSold * lot.basisPerShare;
    const longTerm = saleDate.getTime() - lot.acquiredAt.getTime() >= 365 * 86400000;
    allocations.push({ lotId: lot.id, source: lot.source, accountName: lot.accountName, acquiredAt: iso(lot.acquiredAt), sharesSold, proceeds, costBasis, gain: proceeds - costBasis, longTerm });
    remaining -= sharesSold;
  }
  return {
    allocations,
    sharesFilled: shares - remaining,
    unfilledShares: remaining,
    proceeds: allocations.reduce((sum, row) => sum + row.proceeds, 0),
    costBasis: allocations.reduce((sum, row) => sum + row.costBasis, 0),
    shortTermGain: allocations.filter((row) => !row.longTerm).reduce((sum, row) => sum + row.gain, 0),
    longTermGain: allocations.filter((row) => row.longTerm).reduce((sum, row) => sum + row.gain, 0),
  };
}

export async function modelStockSale(input: { ticker: string; shares: number; pricePerShare: number; saleDate: string; strategy?: "FIFO" | "HIFO" | "TAX_OPTIMAL" }, boundUserId?: string) {
  const userId = boundUserId ?? await resolveMcpUserId();
  const ticker = input.ticker.trim().toUpperCase();
  const saleDate = new Date(`${input.saleDate}T12:00:00.000Z`);
  if (Number.isNaN(saleDate.getTime())) throw new Error("saleDate must be YYYY-MM-DD.");
  const [manual, plaid, income] = await Promise.all([
    prisma.assetLot.findMany({ where: { ticker: { equals: ticker }, account: { userId } }, include: { account: { select: { name: true } } } }),
    prisma.plaidTaxLot.findMany({ where: { quantity: { gt: 0 }, purchasePrice: { not: null }, originalPurchaseDatetime: { not: null }, plaidHolding: { plaidSecurity: { tickerSymbol: { equals: ticker } }, plaidAccount: { plaidItem: { userId } } } }, include: { plaidHolding: { include: { plaidAccount: { select: { name: true } } } } } }),
    incomeContext(userId, saleDate.getUTCFullYear()),
  ]);
  const lots: SaleLot[] = [
    ...manual.map((lot) => ({ id: `manual:${lot.id}`, source: "manual", accountName: lot.account.name, ticker, shares: lot.shares, basisPerShare: lot.costBasisPerShare, acquiredAt: lot.acquiredAt })),
    ...plaid.map((lot) => ({ id: `plaid:${lot.id}`, source: "plaid", accountName: lot.plaidHolding.plaidAccount.name, ticker, shares: lot.quantity!, basisPerShare: lot.purchasePrice!, acquiredAt: lot.originalPurchaseDatetime! })),
  ];
  if (lots.length === 0) throw new Error(`No usable ${ticker} tax lots were found.`);
  const strategies = input.strategy ? [input.strategy] : ["FIFO", "HIFO", "TAX_OPTIMAL"] as const;
  const baselineInput = { taxYear: saleDate.getUTCFullYear(), filingStatus: income.user.filingStatus, ordinaryIncome: income.projection.totalProjectedOrdinary, longTermGains: income.projection.realizedLTCG, pretaxDeductions: income.projection.estimatedPretax };
  const baselineTax = computeTax(baselineInput);
  const results = strategies.map((strategy) => {
    const sale = allocate(orderSaleLots(lots, strategy, saleDate), input.shares, input.pricePerShare, saleDate);
    const withSale = computeTax({ ...baselineInput, ordinaryIncome: baselineInput.ordinaryIncome + sale.shortTermGain, longTermGains: baselineInput.longTermGains + sale.longTermGain });
    const incrementalTax = withSale.totalTax - baselineTax.totalTax;
    return {
      strategy, sharesFilled: round(sale.sharesFilled), unfilledShares: round(sale.unfilledShares), proceeds: round(sale.proceeds),
      costBasis: round(sale.costBasis), shortTermGain: round(sale.shortTermGain), longTermGain: round(sale.longTermGain),
      incrementalFederalTax: round(incrementalTax), afterTaxProceeds: round(sale.proceeds - incrementalTax),
      crossesNiit: baselineTax.bracketRoom.niitOver <= 0 && withSale.bracketRoom.niitOver > 0,
      allocations: sale.allocations.map((row) => ({ ...row, sharesSold: round(row.sharesSold), proceeds: round(row.proceeds), costBasis: round(row.costBasis), gain: round(row.gain) })),
    };
  });
  const recommended = [...results].sort((a, b) => b.afterTaxProceeds - a.afterTaxProceeds)[0]?.strategy ?? null;
  return { asOf: new Date().toISOString(), ticker, requestedShares: input.shares, pricePerShare: input.pricePerShare, saleDate: input.saleDate, recommendedStrategy: recommended, strategies: results, limitations: TAX_LIMITATIONS };
}
