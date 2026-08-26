// Year-aware federal tax engine — a deliberately simplified model that captures
// the dynamics that matter for planning: ordinary brackets, LTCG stacking
// on top of ordinary income, and NIIT exposure.
//
// Limitations (intentional for v1):
// - State taxes not modeled
// - AMT not modeled
// - Social Security / Medicare wage base not modeled
// - Standard deduction only (no itemizing)

import { FilingStatus } from "@prisma/client";

// ---------- Brackets ----------

type Bracket = { rate: number; threshold: number };

// 2025 values retained for historical scenarios. 2026 values come from IRS
// Revenue Procedure 2025-32.
const ORDINARY_BRACKETS_2025: Record<string, Bracket[]> = {
  SINGLE: [
    { rate: 0.10, threshold: 0 },
    { rate: 0.12, threshold: 11925 },
    { rate: 0.22, threshold: 48475 },
    { rate: 0.24, threshold: 103350 },
    { rate: 0.32, threshold: 197300 },
    { rate: 0.35, threshold: 250525 },
    { rate: 0.37, threshold: 626350 },
  ],
  MARRIED_FILING_JOINTLY: [
    { rate: 0.10, threshold: 0 },
    { rate: 0.12, threshold: 23850 },
    { rate: 0.22, threshold: 96950 },
    { rate: 0.24, threshold: 206700 },
    { rate: 0.32, threshold: 394600 },
    { rate: 0.35, threshold: 501050 },
    { rate: 0.37, threshold: 751600 },
  ],
};

const ORDINARY_BRACKETS_2026: Record<FilingStatus, Bracket[]> = {
  SINGLE: [
    { rate: 0.10, threshold: 0 }, { rate: 0.12, threshold: 12400 },
    { rate: 0.22, threshold: 50400 }, { rate: 0.24, threshold: 105700 },
    { rate: 0.32, threshold: 201775 }, { rate: 0.35, threshold: 256225 },
    { rate: 0.37, threshold: 640600 },
  ],
  MARRIED_FILING_JOINTLY: [
    { rate: 0.10, threshold: 0 }, { rate: 0.12, threshold: 24800 },
    { rate: 0.22, threshold: 100800 }, { rate: 0.24, threshold: 211400 },
    { rate: 0.32, threshold: 403550 }, { rate: 0.35, threshold: 512450 },
    { rate: 0.37, threshold: 768700 },
  ],
  MARRIED_FILING_SEPARATELY: [
    { rate: 0.10, threshold: 0 }, { rate: 0.12, threshold: 12400 },
    { rate: 0.22, threshold: 50400 }, { rate: 0.24, threshold: 105700 },
    { rate: 0.32, threshold: 201775 }, { rate: 0.35, threshold: 256225 },
    { rate: 0.37, threshold: 384350 },
  ],
  HEAD_OF_HOUSEHOLD: [
    { rate: 0.10, threshold: 0 }, { rate: 0.12, threshold: 17700 },
    { rate: 0.22, threshold: 67450 }, { rate: 0.24, threshold: 105700 },
    { rate: 0.32, threshold: 201750 }, { rate: 0.35, threshold: 256200 },
    { rate: 0.37, threshold: 640600 },
  ],
};

// Long-term capital gains thresholds.
const LTCG_BRACKETS_2025: Record<string, Bracket[]> = {
  SINGLE: [
    { rate: 0, threshold: 0 },
    { rate: 0.15, threshold: 48350 },
    { rate: 0.20, threshold: 533400 },
  ],
  MARRIED_FILING_JOINTLY: [
    { rate: 0, threshold: 0 },
    { rate: 0.15, threshold: 96700 },
    { rate: 0.20, threshold: 600050 },
  ],
};

const LTCG_BRACKETS_2026: Record<FilingStatus, Bracket[]> = {
  SINGLE: [{ rate: 0, threshold: 0 }, { rate: 0.15, threshold: 49450 }, { rate: 0.20, threshold: 545500 }],
  MARRIED_FILING_JOINTLY: [{ rate: 0, threshold: 0 }, { rate: 0.15, threshold: 98900 }, { rate: 0.20, threshold: 613700 }],
  MARRIED_FILING_SEPARATELY: [{ rate: 0, threshold: 0 }, { rate: 0.15, threshold: 49450 }, { rate: 0.20, threshold: 306850 }],
  HEAD_OF_HOUSEHOLD: [{ rate: 0, threshold: 0 }, { rate: 0.15, threshold: 66200 }, { rate: 0.20, threshold: 579600 }],
};

const STANDARD_DEDUCTION_2025: Record<string, number> = {
  SINGLE: 15750,
  MARRIED_FILING_JOINTLY: 31500,
  MARRIED_FILING_SEPARATELY: 15750,
  HEAD_OF_HOUSEHOLD: 23625,
};

const STANDARD_DEDUCTION_2026: Record<FilingStatus, number> = {
  SINGLE: 16100,
  MARRIED_FILING_JOINTLY: 32200,
  MARRIED_FILING_SEPARATELY: 16100,
  HEAD_OF_HOUSEHOLD: 24150,
};

// Net Investment Income Tax thresholds (modified AGI).
const NIIT_THRESHOLD: Record<string, number> = {
  SINGLE: 200000,
  MARRIED_FILING_JOINTLY: 250000,
  MARRIED_FILING_SEPARATELY: 125000,
  HEAD_OF_HOUSEHOLD: 200000,
};
const NIIT_RATE = 0.038;

function legacyBracketKey(status: FilingStatus): "SINGLE" | "MARRIED_FILING_JOINTLY" {
  return status === "MARRIED_FILING_JOINTLY" ? "MARRIED_FILING_JOINTLY" : "SINGLE";
}

// ---------- Bracket math ----------

function taxFromBrackets(taxableIncome: number, brackets: Bracket[]): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const lower = brackets[i].threshold;
    const upper = i + 1 < brackets.length ? brackets[i + 1].threshold : Infinity;
    if (taxableIncome > lower) {
      const slice = Math.min(taxableIncome, upper) - lower;
      tax += slice * brackets[i].rate;
    }
  }
  return tax;
}

// LTCG is "stacked" — it occupies the bracket that begins where ordinary
// taxable income ends. Walk LTCG brackets accordingly.
function ltcgTaxStacked(
  ordinaryTaxable: number,
  ltcgAmount: number,
  brackets: Bracket[],
): number {
  if (ltcgAmount <= 0) return 0;
  let tax = 0;
  let remaining = ltcgAmount;
  let cursor = ordinaryTaxable;
  for (let i = 0; i < brackets.length && remaining > 0; i++) {
    const lower = brackets[i].threshold;
    const upper = i + 1 < brackets.length ? brackets[i + 1].threshold : Infinity;
    if (cursor >= upper) continue;
    const sliceStart = Math.max(cursor, lower);
    const sliceEnd = upper;
    const room = sliceEnd - sliceStart;
    if (room <= 0) continue;
    const taxedHere = Math.min(remaining, room);
    tax += taxedHere * brackets[i].rate;
    remaining -= taxedHere;
    cursor = sliceStart + taxedHere;
  }
  return tax;
}

// ---------- Public API ----------

export type TaxInputs = {
  taxYear?: number;
  filingStatus: FilingStatus;
  ordinaryIncome: number;   // wages, bonus, RSU vest income, STCG, S-Corp pass-through income, interest
  longTermGains: number;    // realized LTCG (- LT losses)
  shortTermGains?: number;  // already folded into ordinaryIncome typically; here for clarity
  pretaxDeductions?: number; // 401k, HSA, etc.
};

export type TaxResult = {
  taxableOrdinary: number;
  taxableLtcg: number;
  ordinaryTax: number;
  ltcgTax: number;
  niitTax: number;
  totalTax: number;
  effectiveRate: number;
  marginalOrdinaryRate: number;
  marginalLtcgRate: number;
  thresholds: {
    ltcg0to15: number;       // taxable income at which 0% LTCG ends
    ltcg15to20: number;      // taxable income at which 15% LTCG ends
    niit: number;            // AGI threshold for NIIT
  };
  bracketRoom: {
    // Dollars of *additional ordinary income* before crossing each ordinary bracket.
    nextOrdinaryBracketRoom: number;
    nextOrdinaryBracketRate: number | null;
    // Dollars of *additional LTCG* before crossing the next LTCG threshold.
    ltcgRoomAt15: number;    // remaining headroom at 15% before 20% kicks in
    ltcgRoomAt0: number;     // remaining headroom at 0% before 15% kicks in (often 0 for tech workers)
    niitOver: number;        // amount over NIIT threshold (0 if under)
  };
};

export function computeTax(inputs: TaxInputs): TaxResult {
  const { taxYear = new Date().getFullYear(), filingStatus, ordinaryIncome, longTermGains, pretaxDeductions = 0 } = inputs;
  const use2026 = taxYear >= 2026;
  const stdDeduction = use2026
    ? STANDARD_DEDUCTION_2026[filingStatus]
    : STANDARD_DEDUCTION_2025[filingStatus] ?? STANDARD_DEDUCTION_2025.SINGLE;

  const taxableOrdinary = Math.max(0, ordinaryIncome - pretaxDeductions - stdDeduction);
  const taxableLtcg = Math.max(0, longTermGains);

  const key = legacyBracketKey(filingStatus);
  const ordBrackets = use2026 ? ORDINARY_BRACKETS_2026[filingStatus] : ORDINARY_BRACKETS_2025[key];
  const ltcgBrackets = use2026 ? LTCG_BRACKETS_2026[filingStatus] : LTCG_BRACKETS_2025[key];

  const ordinaryTax = taxFromBrackets(taxableOrdinary, ordBrackets);
  const ltcgTax = ltcgTaxStacked(taxableOrdinary, taxableLtcg, ltcgBrackets);

  // NIIT is on the lesser of net investment income and (MAGI - threshold).
  // MAGI ~ taxableOrdinary + standardDeduction + pretaxDeductions + LTCG; we'll use a
  // simpler proxy: ordinaryIncome + longTermGains.
  const magiProxy = ordinaryIncome + longTermGains;
  const niitThreshold = NIIT_THRESHOLD[filingStatus] ?? NIIT_THRESHOLD.SINGLE;
  const niitOver = Math.max(0, magiProxy - niitThreshold);
  const niitBase = Math.min(longTermGains, niitOver);
  const niitTax = niitBase * NIIT_RATE;

  const totalTax = ordinaryTax + ltcgTax + niitTax;
  const totalIncome = ordinaryIncome + longTermGains;
  const effectiveRate = totalIncome > 0 ? totalTax / totalIncome : 0;

  // Marginal rates
  let marginalOrdinaryRate = 0;
  for (const b of ordBrackets) {
    if (taxableOrdinary >= b.threshold) marginalOrdinaryRate = b.rate;
  }
  let marginalLtcgRate = 0;
  const ltcgPosition = taxableOrdinary + taxableLtcg;
  for (const b of ltcgBrackets) {
    if (ltcgPosition >= b.threshold) marginalLtcgRate = b.rate;
  }
  if (niitOver > 0 && longTermGains > 0) marginalLtcgRate += NIIT_RATE;

  // Bracket room computations
  const nextOrdBracket = ordBrackets.find((b) => b.threshold > taxableOrdinary);
  const nextOrdinaryBracketRoom = nextOrdBracket
    ? nextOrdBracket.threshold - taxableOrdinary
    : 0;
  const nextOrdinaryBracketRate = nextOrdBracket?.rate ?? null;

  const ltcg15Threshold = ltcgBrackets[1]?.threshold ?? 0;
  const ltcg20Threshold = ltcgBrackets[2]?.threshold ?? 0;
  const ltcgRoomAt0 = Math.max(0, ltcg15Threshold - ltcgPosition);
  // Total additional LTCG before any portion enters the 20% federal band.
  const ltcgRoomAt15 = Math.max(0, ltcg20Threshold - ltcgPosition);

  return {
    taxableOrdinary,
    taxableLtcg,
    ordinaryTax,
    ltcgTax,
    niitTax,
    totalTax,
    effectiveRate,
    marginalOrdinaryRate,
    marginalLtcgRate,
    thresholds: {
      ltcg0to15: ltcg15Threshold,
      ltcg15to20: ltcg20Threshold,
      niit: niitThreshold,
    },
    bracketRoom: {
      nextOrdinaryBracketRoom,
      nextOrdinaryBracketRate,
      ltcgRoomAt15,
      ltcgRoomAt0,
      niitOver,
    },
  };
}

// Estimate effective tax rate that should be applied to discount unrealized
// gains for "after-tax net worth" — simplified: use 15% LTCG + 5% state proxy.
export function estimateUnrealizedGainTaxRate() {
  return 0.20; // 15% federal LTCG + ~5% blended state
}

// Estimate ordinary income rate at withdrawal (used for traditional 401k discount).
export function estimateOrdinaryWithdrawalRate(filingStatus: FilingStatus) {
  void filingStatus;
  // Conservative: assume 22% federal + 5% state at retirement.
  return 0.27;
}
