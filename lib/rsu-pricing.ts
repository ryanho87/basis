import { prisma } from "./prisma";

// Use the freshest institution-reported holding price as a planning estimate
// for pending RSU vests. Actual FMV-at-vest and payroll data supersede it.
export async function getRsuPriceEstimates(userId: string, tickers: string[]) {
  const wanted = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
  if (wanted.length === 0) return {};
  const holdings = await prisma.plaidHolding.findMany({
    where: {
      isActive: true,
      plaidAccount: { plaidItem: { userId, status: { not: "DISCONNECTED" } } },
      plaidSecurity: { tickerSymbol: { in: wanted } },
    },
    include: { plaidSecurity: { select: { tickerSymbol: true } } },
    orderBy: [{ institutionPriceAsOf: "desc" }, { lastSyncedAt: "desc" }],
  });
  const estimates: Record<string, number> = {};
  for (const holding of holdings) {
    const ticker = holding.plaidSecurity.tickerSymbol?.toUpperCase();
    if (ticker && estimates[ticker] === undefined && holding.institutionPrice > 0) {
      estimates[ticker] = holding.institutionPrice;
    }
  }
  return estimates;
}
