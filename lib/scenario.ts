// Planned-sale scenario math — lot allocation and incremental tax impact.
//
// A planned sale is evaluated against the user's *projected* income for the
// year: we compute tax with and without the sale and report the delta. Gains
// are classified ST/LT by holding period at the planned sale date (not today),
// so a lot that crosses the 1-year mark before the sale counts as long-term.

import type { AssetLot } from "@prisma/client";
import { FilingStatus } from "@prisma/client";
import { computeTax, type TaxResult } from "./tax";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export type LotSaleStrategy = "FIFO" | "HIFO" | "TAX_OPTIMAL";

export const STRATEGY_LABELS: Record<LotSaleStrategy, string> = {
  FIFO: "First in, first out",
  HIFO: "Highest cost first",
  TAX_OPTIMAL: "Long-term, highest cost first",
};

export function isLongTermAt(lot: AssetLot, saleDate: Date): boolean {
  return (
    (saleDate.getTime() - new Date(lot.acquiredAt).getTime()) / MS_PER_DAY >= 365
  );
}

// Heuristic ordering, not a true optimizer: prefers long-term treatment first,
// then highest basis. A high-basis ST lot can occasionally beat a low-basis LT
// lot, but the comparison table on the scenarios page surfaces that.
export function orderLots(
  lots: AssetLot[],
  strategy: LotSaleStrategy,
  saleDate: Date,
): AssetLot[] {
  const sorted = [...lots];
  switch (strategy) {
    case "FIFO":
      sorted.sort(
        (a, b) => new Date(a.acquiredAt).getTime() - new Date(b.acquiredAt).getTime(),
      );
      break;
    case "HIFO":
      sorted.sort((a, b) => b.costBasisPerShare - a.costBasisPerShare);
      break;
    case "TAX_OPTIMAL":
      sorted.sort((a, b) => {
        const aST = isLongTermAt(a, saleDate) ? 0 : 1;
        const bST = isLongTermAt(b, saleDate) ? 0 : 1;
        if (aST !== bST) return aST - bST;
        return b.costBasisPerShare - a.costBasisPerShare;
      });
      break;
  }
  return sorted;
}

// Resolve a PlannedSale.lotSelection value (JSON array of lot IDs, or null =
// FIFO) into an ordered list of lots to draw from.
export function resolveLotSelection<L extends AssetLot>(
  lots: L[],
  lotSelection: string | null,
  saleDate: Date,
): L[] {
  if (lotSelection) {
    try {
      const ids: string[] = JSON.parse(lotSelection);
      const byId = new Map(lots.map((l) => [l.id, l]));
      const picked = ids.map((id) => byId.get(id)).filter((l): l is L => !!l);
      if (picked.length > 0) return picked;
    } catch {
      // fall through to FIFO on malformed selection
    }
  }
  return orderLots(lots, "FIFO", saleDate) as L[];
}

export type LotAllocation<L extends AssetLot = AssetLot> = {
  lot: L;
  sharesSold: number;
  costBasis: number;
  proceeds: number;
  gain: number;
  isLongTermAtSale: boolean;
};

export type SaleAllocation<L extends AssetLot = AssetLot> = {
  allocations: LotAllocation<L>[];
  sharesRequested: number;
  sharesFilled: number;
  unfilledShares: number;
  proceeds: number;
  costBasis: number;
  shortTermGain: number;
  longTermGain: number;
  totalGain: number;
};

export function allocateSale<L extends AssetLot>(
  orderedLots: L[],
  sharesToSell: number,
  pricePerShare: number,
  saleDate: Date,
): SaleAllocation<L> {
  const allocations: LotAllocation<L>[] = [];
  let remaining = sharesToSell;
  for (const lot of orderedLots) {
    if (remaining <= 0) break;
    const sharesSold = Math.min(remaining, lot.shares);
    if (sharesSold <= 0) continue;
    const costBasis = sharesSold * lot.costBasisPerShare;
    const proceeds = sharesSold * pricePerShare;
    allocations.push({
      lot,
      sharesSold,
      costBasis,
      proceeds,
      gain: proceeds - costBasis,
      isLongTermAtSale: isLongTermAt(lot, saleDate),
    });
    remaining -= sharesSold;
  }

  const proceeds = allocations.reduce((s, a) => s + a.proceeds, 0);
  const costBasis = allocations.reduce((s, a) => s + a.costBasis, 0);
  const shortTermGain = allocations
    .filter((a) => !a.isLongTermAtSale)
    .reduce((s, a) => s + a.gain, 0);
  const longTermGain = allocations
    .filter((a) => a.isLongTermAtSale)
    .reduce((s, a) => s + a.gain, 0);

  return {
    allocations,
    sharesRequested: sharesToSell,
    sharesFilled: sharesToSell - remaining,
    unfilledShares: Math.max(0, remaining),
    proceeds,
    costBasis,
    shortTermGain,
    longTermGain,
    totalGain: shortTermGain + longTermGain,
  };
}

// ---------- Tax impact ----------

export type SaleImpactBaseline = {
  taxYear?: number;
  filingStatus: FilingStatus;
  // Projected ordinary income for the year *before* this sale (includes STCG
  // already realized elsewhere).
  ordinaryIncome: number;
  longTermGains: number;
  pretaxDeductions: number;
};

export type SaleImpact = {
  baseline: TaxResult;
  withSale: TaxResult;
  incrementalTax: number;
  afterTaxProceeds: number;
  // Incremental tax as a share of the gain (0 when there's no gain).
  effectiveRateOnGain: number;
  crossesNiit: boolean;
};

export function computeSaleImpact(
  base: SaleImpactBaseline,
  sale: { shortTermGain: number; longTermGain: number; proceeds: number },
): SaleImpact {
  const baseline = computeTax({
    taxYear: base.taxYear,
    filingStatus: base.filingStatus,
    ordinaryIncome: base.ordinaryIncome,
    longTermGains: base.longTermGains,
    pretaxDeductions: base.pretaxDeductions,
  });
  const withSale = computeTax({
    taxYear: base.taxYear,
    filingStatus: base.filingStatus,
    ordinaryIncome: base.ordinaryIncome + sale.shortTermGain,
    longTermGains: base.longTermGains + sale.longTermGain,
    pretaxDeductions: base.pretaxDeductions,
  });
  const incrementalTax = withSale.totalTax - baseline.totalTax;
  const totalGain = sale.shortTermGain + sale.longTermGain;
  return {
    baseline,
    withSale,
    incrementalTax,
    afterTaxProceeds: sale.proceeds - incrementalTax,
    effectiveRateOnGain: totalGain > 0 ? incrementalTax / totalGain : 0,
    crossesNiit:
      baseline.bracketRoom.niitOver <= 0 && withSale.bracketRoom.niitOver > 0,
  };
}

// Evaluate the same sale under each strategy so the UI can show what lot
// selection is worth in dollars.
export function compareStrategies<L extends AssetLot>(
  lots: L[],
  sharesToSell: number,
  pricePerShare: number,
  saleDate: Date,
  base: SaleImpactBaseline,
): { strategy: LotSaleStrategy; allocation: SaleAllocation<L>; impact: SaleImpact }[] {
  return (Object.keys(STRATEGY_LABELS) as LotSaleStrategy[]).map((strategy) => {
    const allocation = allocateSale(
      orderLots(lots, strategy, saleDate) as L[],
      sharesToSell,
      pricePerShare,
      saleDate,
    );
    return { strategy, allocation, impact: computeSaleImpact(base, allocation) };
  });
}
