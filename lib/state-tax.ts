// State income tax and employee-side payroll tax — the pieces the federal
// engine in ./tax.ts deliberately leaves out. California is the only state
// modeled so far; every other state returns `null` rather than a guess, so
// callers can show "unknown" instead of a confident fiction.
//
// Figures and their provenance are tracked per year so the UI can say which
// year's tables are actually in use when a plan year runs ahead of what the
// FTB / SSA / EDD have published.

import type { FilingStatus } from "@prisma/client";

type Bracket = { rate: number; threshold: number };

// ---------- California ----------

// FTB 2025 Form 540 tax rate schedules (Schedules X, Y, Z). The FTB publishes
// each year's schedule the following autumn; until then later years reuse
// the newest published table and the result carries `figuresYear` so the UI
// can disclose the mismatch.
const CA_BRACKETS_2025: Record<FilingStatus, Bracket[]> = {
  SINGLE: [
    { rate: 0.01, threshold: 0 }, { rate: 0.02, threshold: 11079 },
    { rate: 0.04, threshold: 26264 }, { rate: 0.06, threshold: 41452 },
    { rate: 0.08, threshold: 57542 }, { rate: 0.093, threshold: 72724 },
    { rate: 0.103, threshold: 371479 }, { rate: 0.113, threshold: 445771 },
    { rate: 0.123, threshold: 742953 },
  ],
  MARRIED_FILING_SEPARATELY: [
    { rate: 0.01, threshold: 0 }, { rate: 0.02, threshold: 11079 },
    { rate: 0.04, threshold: 26264 }, { rate: 0.06, threshold: 41452 },
    { rate: 0.08, threshold: 57542 }, { rate: 0.093, threshold: 72724 },
    { rate: 0.103, threshold: 371479 }, { rate: 0.113, threshold: 445771 },
    { rate: 0.123, threshold: 742953 },
  ],
  MARRIED_FILING_JOINTLY: [
    { rate: 0.01, threshold: 0 }, { rate: 0.02, threshold: 22158 },
    { rate: 0.04, threshold: 52528 }, { rate: 0.06, threshold: 82904 },
    { rate: 0.08, threshold: 115084 }, { rate: 0.093, threshold: 145448 },
    { rate: 0.103, threshold: 742958 }, { rate: 0.113, threshold: 891542 },
    { rate: 0.123, threshold: 1485906 },
  ],
  HEAD_OF_HOUSEHOLD: [
    { rate: 0.01, threshold: 0 }, { rate: 0.02, threshold: 22173 },
    { rate: 0.04, threshold: 52530 }, { rate: 0.06, threshold: 67716 },
    { rate: 0.08, threshold: 83805 }, { rate: 0.093, threshold: 98990 },
    { rate: 0.103, threshold: 505208 }, { rate: 0.113, threshold: 606251 },
    { rate: 0.123, threshold: 1010417 },
  ],
};

const CA_STANDARD_DEDUCTION_2025: Record<FilingStatus, number> = {
  SINGLE: 5706,
  MARRIED_FILING_SEPARATELY: 5706,
  MARRIED_FILING_JOINTLY: 11412,
  HEAD_OF_HOUSEHOLD: 11412,
};

// Proposition 63 Mental Health Services Tax: 1% of taxable income over $1M,
// not indexed for inflation.
const CA_MENTAL_HEALTH_THRESHOLD = 1_000_000;
const CA_MENTAL_HEALTH_RATE = 0.01;

// EDD SDI employee withholding. No taxable wage limit since 2024-01-01.
const CA_SDI_RATE_BY_YEAR: Record<number, number> = {
  2024: 0.011,
  2025: 0.012,
  2026: 0.013,
};

const CA_FIGURES_YEAR = 2025;

// ---------- Federal payroll (employee side) ----------

const SOCIAL_SECURITY_RATE = 0.062;
const MEDICARE_RATE = 0.0145;
const ADDITIONAL_MEDICARE_RATE = 0.009;

// SSA publishes the next year's wage base each October.
const SOCIAL_SECURITY_WAGE_BASE: Record<number, number> = {
  2024: 168_600,
  2025: 176_100,
  2026: 184_500,
};

const ADDITIONAL_MEDICARE_THRESHOLD: Record<FilingStatus, number> = {
  SINGLE: 200_000,
  HEAD_OF_HOUSEHOLD: 200_000,
  MARRIED_FILING_JOINTLY: 250_000,
  MARRIED_FILING_SEPARATELY: 125_000,
};

// ---------- Helpers ----------

function latestPublishedYear(table: Record<number, unknown>, taxYear: number) {
  const years = Object.keys(table).map(Number).filter((year) => year <= taxYear);
  return years.length ? Math.max(...years) : Math.min(...Object.keys(table).map(Number));
}

function taxFromBrackets(taxableIncome: number, brackets: Bracket[]): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const lower = brackets[i].threshold;
    const upper = i + 1 < brackets.length ? brackets[i + 1].threshold : Infinity;
    if (taxableIncome > lower) {
      tax += (Math.min(taxableIncome, upper) - lower) * brackets[i].rate;
    }
  }
  return tax;
}

function marginalRate(taxableIncome: number, brackets: Bracket[]) {
  let rate = 0;
  for (const bracket of brackets) {
    if (taxableIncome >= bracket.threshold) rate = bracket.rate;
  }
  return rate;
}

export const SUPPORTED_STATE_CODES = ["CA"] as const;
export type SupportedStateCode = (typeof SUPPORTED_STATE_CODES)[number];

const STATE_ALIASES: Record<string, SupportedStateCode> = {
  CA: "CA",
  CALIF: "CA",
  CALIFORNIA: "CA",
};

// Users type "CA", "ca", "California". Return a supported code or null.
export function normalizeStateCode(value: string | null | undefined): SupportedStateCode | null {
  if (!value) return null;
  const key = value.trim().toUpperCase().replace(/[^A-Z]/g, "");
  return STATE_ALIASES[key] ?? null;
}

// ---------- State income tax ----------

export type StateTaxInputs = {
  taxYear: number;
  stateCode: string | null | undefined;
  filingStatus: FilingStatus;
  ordinaryIncome: number;
  longTermGains: number;
  pretaxDeductions?: number;
};

export type StateTaxResult = {
  stateCode: SupportedStateCode;
  taxableIncome: number;
  incomeTax: number;
  surtax: number;          // CA Mental Health Services Tax
  totalTax: number;
  marginalRate: number;    // applies to ordinary income AND capital gains — CA has no preferential rate
  effectiveRate: number;
  figuresYear: number;     // which year's published tables produced this number
  figuresAreProvisional: boolean; // true when taxYear > figuresYear
  notes: string[];
};

export function computeStateTax(inputs: StateTaxInputs): StateTaxResult | null {
  const stateCode = normalizeStateCode(inputs.stateCode);
  if (stateCode !== "CA") return null;

  const { taxYear, filingStatus, ordinaryIncome, longTermGains, pretaxDeductions = 0 } = inputs;
  const brackets = CA_BRACKETS_2025[filingStatus];
  const standardDeduction = CA_STANDARD_DEDUCTION_2025[filingStatus];

  // California taxes capital gains as ordinary income.
  const grossIncome = Math.max(0, ordinaryIncome + longTermGains);
  const taxableIncome = Math.max(0, grossIncome - pretaxDeductions - standardDeduction);

  const incomeTax = taxFromBrackets(taxableIncome, brackets);
  const surtax = Math.max(0, taxableIncome - CA_MENTAL_HEALTH_THRESHOLD) * CA_MENTAL_HEALTH_RATE;
  const totalTax = incomeTax + surtax;

  let marginal = marginalRate(taxableIncome, brackets);
  if (taxableIncome > CA_MENTAL_HEALTH_THRESHOLD) marginal += CA_MENTAL_HEALTH_RATE;

  const notes: string[] = [];
  const figuresAreProvisional = taxYear > CA_FIGURES_YEAR;
  if (figuresAreProvisional) {
    notes.push(`California ${taxYear} brackets are not published yet; this uses the ${CA_FIGURES_YEAR} FTB schedule without inflation indexing, which slightly overstates tax.`);
  }
  notes.push("Standard deduction only. The personal exemption credit is omitted because it phases out at the income levels Basis plans for.");
  notes.push("California does not allow the HSA deduction and taxes capital gains as ordinary income.");

  return {
    stateCode,
    taxableIncome,
    incomeTax,
    surtax,
    totalTax,
    marginalRate: marginal,
    effectiveRate: grossIncome > 0 ? totalTax / grossIncome : 0,
    figuresYear: CA_FIGURES_YEAR,
    figuresAreProvisional,
    notes,
  };
}

// ---------- Employee-side payroll tax ----------

export type PayrollTaxInputs = {
  taxYear: number;
  wages: number;                 // W-2 Medicare wages for the year (includes employee 401k deferrals)
  filingStatus: FilingStatus;
  stateCode?: string | null;
};

export type PayrollTaxResult = {
  wages: number;
  socialSecurity: number;
  medicare: number;
  additionalMedicare: number;
  stateDisability: number;       // CA SDI; 0 for other states
  totalTax: number;
  socialSecurityWageBase: number;
  figuresYear: number;
  figuresAreProvisional: boolean;
  notes: string[];
};

export function computePayrollTax(inputs: PayrollTaxInputs): PayrollTaxResult {
  const wages = Number.isFinite(inputs.wages) ? Math.max(0, inputs.wages) : 0;
  const wageBaseYear = latestPublishedYear(SOCIAL_SECURITY_WAGE_BASE, inputs.taxYear);
  const socialSecurityWageBase = SOCIAL_SECURITY_WAGE_BASE[wageBaseYear];

  const socialSecurity = Math.min(wages, socialSecurityWageBase) * SOCIAL_SECURITY_RATE;
  const medicare = wages * MEDICARE_RATE;
  const additionalMedicare = Math.max(0, wages - ADDITIONAL_MEDICARE_THRESHOLD[inputs.filingStatus]) * ADDITIONAL_MEDICARE_RATE;

  const stateCode = normalizeStateCode(inputs.stateCode);
  let stateDisability = 0;
  let sdiYear = wageBaseYear;
  if (stateCode === "CA") {
    sdiYear = latestPublishedYear(CA_SDI_RATE_BY_YEAR, inputs.taxYear);
    stateDisability = wages * CA_SDI_RATE_BY_YEAR[sdiYear];
  }

  const figuresYear = Math.min(wageBaseYear, sdiYear);
  const figuresAreProvisional = inputs.taxYear > figuresYear;
  const notes: string[] = [];
  if (figuresAreProvisional) {
    notes.push(`${inputs.taxYear} payroll figures are not published yet; using the ${figuresYear} Social Security wage base${stateCode === "CA" ? " and SDI rate" : ""}.`);
  }
  if (additionalMedicare > 0) {
    notes.push("Additional Medicare tax is withheld per employer above $200,000 regardless of filing status, so the amount withheld can differ from the amount owed.");
  }

  return {
    wages,
    socialSecurity,
    medicare,
    additionalMedicare,
    stateDisability,
    totalTax: socialSecurity + medicare + additionalMedicare + stateDisability,
    socialSecurityWageBase,
    figuresYear,
    figuresAreProvisional,
    notes,
  };
}

// ---------- Blended-rate proxies for after-tax net worth ----------

// Long-term capital gains: federal 15% plus the state's typical marginal
// rate for a high earner. Unknown state keeps the historical 5% proxy.
export function stateLongTermGainRateProxy(stateCode: string | null | undefined) {
  return normalizeStateCode(stateCode) === "CA" ? 0.093 : 0.05;
}

// Ordinary income at retirement withdrawal: pairs with a 22% federal
// assumption. CA retirees drawing large balances sit around the 8–9.3% band.
export function stateOrdinaryWithdrawalRateProxy(stateCode: string | null | undefined) {
  return normalizeStateCode(stateCode) === "CA" ? 0.08 : 0.05;
}
