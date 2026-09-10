// Money plan engine — the full-year waterfall from total compensation down to
// "left for life", with persona-specific levers layered over live data.
//
// This module is deliberately pure and browser-safe: no Prisma, no server
// imports. The planner page runs it on every slider move so a draft plan can
// be previewed against the saved one without a round trip. The server builds
// a `MoneyPlanBaseline` from real records (income projection, S-Corp profile,
// pay stubs), the browser layers `PlanLevers` and commitments on top.

import type { FilingStatus } from "@prisma/client";
import { buildPhysicianMoneyPlan, annualLimits } from "./physician-planning";
import { normalizeStateCode } from "./state-tax";
import { computeTax, type TaxResult } from "./tax";

// ---------- Levers ----------

// Every lever is "null = use the live/profile value". The UI shows the live
// value as the default and the user drags away from it.
export type PlanLevers = {
  rsuSellFraction: number;        // 0..1 — share of this year's vesting RSU value sold (rest stays in company stock)
  k401Employee: number | null;    // annual employee 401(k) deferral through a W-2 employer
  hsa: number | null;             // annual HSA contribution
  otherPretax: number | null;     // other payroll pre-tax (medical/dental premiums, commuter, etc.)
  ownerSalary: number | null;     // S-Corp: W-2 salary the corporation pays the owner
  ownerRetirement: number | null; // S-Corp: total Solo 401(k) (employee deferral + employer contribution)
  healthPremiums: number | null;  // S-Corp: medical + dental premiums paid through the corporation
};

export const DEFAULT_LEVERS: PlanLevers = {
  rsuSellFraction: 0,
  k401Employee: null,
  hsa: null,
  otherPretax: null,
  ownerSalary: null,
  ownerRetirement: null,
  healthPremiums: null,
};

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null;
}

export function parseLevers(value: unknown): PlanLevers {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const fraction = typeof raw.rsuSellFraction === "number" && Number.isFinite(raw.rsuSellFraction)
    ? Math.min(1, Math.max(0, raw.rsuSellFraction))
    : DEFAULT_LEVERS.rsuSellFraction;
  return {
    rsuSellFraction: fraction,
    k401Employee: finiteOrNull(raw.k401Employee),
    hsa: finiteOrNull(raw.hsa),
    otherPretax: finiteOrNull(raw.otherPretax),
    ownerSalary: finiteOrNull(raw.ownerSalary),
    ownerRetirement: finiteOrNull(raw.ownerRetirement),
    healthPremiums: finiteOrNull(raw.healthPremiums),
  };
}

export function parseLeversJson(value: string | null | undefined): PlanLevers {
  if (!value) return { ...DEFAULT_LEVERS };
  try {
    return parseLevers(JSON.parse(value));
  } catch {
    return { ...DEFAULT_LEVERS };
  }
}

// ---------- Commitments ----------

export const PLAN_COMMITMENT_KINDS = ["SAVINGS", "DEBT", "FIXED_EXPENSE", "GIVING"] as const;
export const PLAN_AMOUNT_MODES = ["ANNUAL", "MONTHLY", "PERCENT_OF_AFTER_TAX"] as const;
export type PlanCommitmentKind = (typeof PLAN_COMMITMENT_KINDS)[number];
export type PlanAmountMode = (typeof PLAN_AMOUNT_MODES)[number];

export const PLAN_COMMITMENT_KIND_LABELS: Record<PlanCommitmentKind, string> = {
  SAVINGS: "Savings & investing",
  DEBT: "Debt payments",
  FIXED_EXPENSE: "Fixed expenses",
  GIVING: "Giving",
};

export const PLAN_AMOUNT_MODE_LABELS: Record<PlanAmountMode, string> = {
  ANNUAL: "per year",
  MONTHLY: "per month",
  PERCENT_OF_AFTER_TAX: "% of after-tax income",
};

export type PlanCommitmentInput = {
  id: string;
  name: string;
  kind: PlanCommitmentKind;
  amountMode: PlanAmountMode;
  amount: number;
  active: boolean;
};

const KIND_SET = new Set<string>(PLAN_COMMITMENT_KINDS);
const MODE_SET = new Set<string>(PLAN_AMOUNT_MODES);

export function parseCommitment(value: unknown, fallbackId: string): PlanCommitmentInput | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 80) : "";
  const kind = typeof raw.kind === "string" && KIND_SET.has(raw.kind) ? raw.kind as PlanCommitmentKind : "FIXED_EXPENSE";
  const amountMode = typeof raw.amountMode === "string" && MODE_SET.has(raw.amountMode) ? raw.amountMode as PlanAmountMode : "ANNUAL";
  const amountRaw = typeof raw.amount === "number" ? raw.amount : Number(raw.amount);
  const amount = Number.isFinite(amountRaw) ? Math.max(0, amountRaw) : 0;
  if (!name) return null;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : fallbackId,
    name,
    kind,
    amountMode,
    amount: amountMode === "PERCENT_OF_AFTER_TAX" ? Math.min(100, amount) : amount,
    active: raw.active !== false,
  };
}

export function commitmentAnnualAmount(commitment: PlanCommitmentInput, afterTaxIncome: number) {
  if (!commitment.active) return 0;
  switch (commitment.amountMode) {
    case "MONTHLY": return commitment.amount * 12;
    case "PERCENT_OF_AFTER_TAX": return Math.max(0, afterTaxIncome) * (commitment.amount / 100);
    default: return commitment.amount;
  }
}

// ---------- Baseline (built server-side from live data) ----------

export type MoneyPlanBaseline = {
  taxYear: number;
  filingStatus: FilingStatus;
  stateCode: string | null;
  // W-2 employment outside any owner corporation. Includes bonus and any RSU
  // income a pay stub has already reported.
  w2Wages: number;
  // RSU vest value for the year (inside and outside pay-stub wages). Drives the
  // sell lever; only `rsuVestNotInWages` is added to income.
  rsuVestValue: number;
  rsuVestNotInWages: number;
  otherOrdinaryIncome: number;
  realizedSTCG: number;
  realizedLTCG: number;
  // Live pre-tax figures from the paycheck profile or annualized pay stub.
  pretax: { k401Employee: number; hsa: number; other: number };
  sCorp: null | {
    corpName: string | null;
    revenue: number;
    operatingExpenses: number;
    salary: number;
    retirement: number;
    // True when the W-2 wages above already carry the owner's corporate salary
    // (a pay stub or paycheck profile exists), so it must not be double counted.
    salaryInWages: boolean;
  };
  withheld: { federal: number; state: number };
  hasPlanRecord: boolean;
};

// ---------- Result ----------

export type PlanRowKind = "income" | "deduction" | "tax" | "subtotal" | "commitment" | "result";

export type PlanRow = {
  key: string;
  label: string;
  annual: number;
  monthly: number;
  pctOfComp: number;
  kind: PlanRowKind;
  note?: string;
};

export type PlanSection = {
  key: string;
  title: string;
  rows: PlanRow[];
  total?: PlanRow;
};

export type MoneyPlanResult = {
  taxYear: number;
  sections: PlanSection[];
  summary: {
    totalCompensation: number;
    pretaxDeductions: number;
    incomeAfterPretax: number;
    taxes: number;
    afterTaxIncome: number;
    commitments: number;
    retainedCompanyStock: number;
    leftForLife: number;
    leftForLifeMonthly: number;
    savingsRate: number;       // savings-kind commitments + retirement + retained stock, over total comp
    effectiveTaxRate: number;  // all taxes over income after pre-tax
  };
  tax: TaxResult;
  warnings: string[];
  notes: string[];
};

// Supplemental withholding at vest, used only to estimate how much of a kept
// RSU vest survives as shares: 22% federal (37% above $1M), state supplemental
// where modeled, plus Medicare.
function rsuWithholdingRate(vestValue: number, stateCode: string | null) {
  const federal = vestValue > 1_000_000 ? 0.37 : 0.22;
  const state = normalizeStateCode(stateCode) === "CA" ? 0.1023 : 0;
  return federal + state + 0.0145;
}

function row(
  key: string,
  label: string,
  annual: number,
  totalComp: number,
  kind: PlanRowKind,
  note?: string,
): PlanRow {
  return {
    key,
    label,
    annual,
    monthly: annual / 12,
    pctOfComp: totalComp > 0 ? annual / totalComp : 0,
    kind,
    note,
  };
}

export function buildMoneyPlan(
  baseline: MoneyPlanBaseline,
  levers: PlanLevers,
  commitments: PlanCommitmentInput[],
): MoneyPlanResult {
  const limits = annualLimits(baseline.taxYear);
  const warnings: string[] = [];
  const notes: string[] = [];

  // ----- Owner corporation -----
  const sCorp = baseline.sCorp;
  const ownerSalary = sCorp ? (levers.ownerSalary ?? (sCorp.salaryInWages ? baseline.w2Wages : sCorp.salary)) : 0;
  const ownerRetirement = sCorp ? (levers.ownerRetirement ?? sCorp.retirement) : 0;
  const healthPremiums = sCorp ? (levers.healthPremiums ?? 0) : 0;
  const corp = sCorp
    ? buildPhysicianMoneyPlan({
        taxYear: baseline.taxYear,
        annualRevenue: sCorp.revenue,
        operatingExpenses: sCorp.operatingExpenses + healthPremiums,
        ownerW2Salary: ownerSalary,
        plannedRetirementContribution: ownerRetirement,
        plannedCashDistribution: null,
      })
    : null;
  const ownerEmployeeDeferral = corp?.employeeRetirementContribution ?? 0;
  const ownerEmployerContribution = corp?.employerRetirementContribution ?? 0;
  const passThrough = corp?.estimatedPassThroughIncome ?? 0;

  // ----- Outside W-2 employment -----
  const outsideWages = sCorp?.salaryInWages ? 0 : baseline.w2Wages;
  const k401Employee = outsideWages > 0 || !sCorp ? (levers.k401Employee ?? baseline.pretax.k401Employee) : 0;
  const hsa = levers.hsa ?? baseline.pretax.hsa;
  const otherPretax = levers.otherPretax ?? baseline.pretax.other;

  // ----- Total compensation -----
  // Owner comp is what the corporation spends on the owner (salary, employer
  // retirement, health premiums) plus what is left as pass-through profit.
  // Employer payroll taxes are a corporate cost and stay out, matching how
  // a W-2 employee never sees the employer half either.
  const ownerCompensation = ownerSalary + ownerEmployerContribution + healthPremiums + passThrough;
  const rsuIncome = baseline.rsuVestNotInWages;
  const totalComp = outsideWages + rsuIncome + ownerCompensation + baseline.otherOrdinaryIncome;

  const incomeRows: PlanRow[] = [];
  if (outsideWages > 0) incomeRows.push(row("w2", "Salary, bonus, and reported RSU income", outsideWages, totalComp, "income"));
  if (rsuIncome > 0) incomeRows.push(row("rsu", "RSU vests not yet in payroll", rsuIncome, totalComp, "income"));
  if (sCorp) {
    incomeRows.push(row("owner-salary", "Owner W-2 salary", ownerSalary, totalComp, "income"));
    if (ownerEmployerContribution > 0) incomeRows.push(row("owner-employer-retirement", "Employer retirement contribution", ownerEmployerContribution, totalComp, "income"));
    if (healthPremiums > 0) incomeRows.push(row("owner-health", "Health & dental through the corporation", healthPremiums, totalComp, "income"));
    incomeRows.push(row("owner-pass-through", "Pass-through profit", passThrough, totalComp, "income", "Revenue minus operating expenses, owner payroll, employer payroll taxes, and employer retirement"));
  }
  if (baseline.otherOrdinaryIncome > 0) incomeRows.push(row("other", "Other ordinary income", baseline.otherOrdinaryIncome, totalComp, "income"));

  // ----- Pre-tax -----
  const deductionRows: PlanRow[] = [];
  const totalEmployeeDeferral = k401Employee + ownerEmployeeDeferral;
  if (k401Employee > 0) deductionRows.push(row("k401", "401(k) employee deferral", k401Employee, totalComp, "deduction"));
  if (ownerEmployeeDeferral > 0) deductionRows.push(row("owner-deferral", "Solo 401(k) employee deferral", ownerEmployeeDeferral, totalComp, "deduction"));
  if (ownerEmployerContribution > 0) deductionRows.push(row("owner-employer", "Solo 401(k) employer contribution", ownerEmployerContribution, totalComp, "deduction"));
  if (hsa > 0) deductionRows.push(row("hsa", "HSA", hsa, totalComp, "deduction"));
  if (healthPremiums > 0) deductionRows.push(row("health", "Medical & dental premiums", healthPremiums, totalComp, "deduction"));
  if (otherPretax > 0) deductionRows.push(row("other-pretax", "Other pre-tax deductions", otherPretax, totalComp, "deduction"));
  const pretaxTotal = deductionRows.reduce((sum, r) => sum + r.annual, 0);
  const incomeAfterPretax = totalComp - pretaxTotal;

  if (totalEmployeeDeferral > limits.employeeDeferral) {
    warnings.push(`Employee 401(k) deferrals total ${Math.round(totalEmployeeDeferral).toLocaleString()} across employers, above the ${limits.figuresYear} limit of ${limits.employeeDeferral.toLocaleString()}. The excess is taxable and has to come back out.`);
  }
  if (limits.figuresAreProvisional) {
    notes.push(`${baseline.taxYear} contribution limits are not published yet; ${limits.figuresYear} limits are used.`);
  }

  // ----- Taxes -----
  const medicareWages = outsideWages + rsuIncome + ownerSalary;
  const tax = computeTax({
    taxYear: baseline.taxYear,
    filingStatus: baseline.filingStatus,
    stateCode: baseline.stateCode,
    wages: medicareWages,
    ordinaryIncome: totalComp + baseline.realizedSTCG,
    longTermGains: baseline.realizedLTCG,
    pretaxDeductions: pretaxTotal,
  });
  const taxRows: PlanRow[] = [row("federal", "Federal income tax", tax.totalTax, totalComp, "tax")];
  if (tax.state) {
    taxRows.push(row("state", `${tax.state.stateCode === "CA" ? "California" : tax.state.stateCode} income tax`, tax.state.totalTax, totalComp, "tax", tax.state.figuresAreProvisional ? `Using ${tax.state.figuresYear} brackets` : undefined));
  } else {
    notes.push(baseline.stateCode
      ? `State income tax for ${baseline.stateCode} is not modeled, so taxes below are federal and payroll only.`
      : "No state set, so taxes below are federal and payroll only. Add your state on the Tax page.");
  }
  if (tax.payroll) {
    const parts = ["Social Security", "Medicare"];
    if (tax.payroll.stateDisability > 0) parts.push("SDI");
    taxRows.push(row("payroll", `Payroll taxes (${parts.join(", ")})`, tax.payroll.totalTax, totalComp, "tax"));
  }
  const taxesTotal = taxRows.reduce((sum, r) => sum + r.annual, 0);
  const afterTaxIncome = incomeAfterPretax - taxesTotal;
  if (tax.state?.figuresAreProvisional) notes.push(tax.state.notes[0]);
  if (tax.payroll?.figuresAreProvisional) notes.push(tax.payroll.notes[0]);

  // ----- Commitments -----
  const commitmentRows: PlanRow[] = [];
  let retainedCompanyStock = 0;
  if (baseline.rsuVestValue > 0) {
    const keepFraction = 1 - levers.rsuSellFraction;
    const withholding = rsuWithholdingRate(baseline.rsuVestValue, baseline.stateCode);
    retainedCompanyStock = keepFraction * baseline.rsuVestValue * (1 - withholding);
    if (retainedCompanyStock > 0) {
      commitmentRows.push(row(
        "rsu-retained",
        `RSU shares kept, not sold (${Math.round(keepFraction * 100)}% of vests)`,
        retainedCompanyStock,
        totalComp,
        "commitment",
        `After an estimated ${Math.round(withholding * 100)}% share withholding at vest`,
      ));
    }
    if (levers.rsuSellFraction < 1 && keepFraction * baseline.rsuVestValue > 0.15 * totalComp) {
      warnings.push("More than 15% of this year's compensation stays in one company's stock. Concentration is a choice, but it should be a deliberate one.");
    }
  }
  const ordered = [...commitments].filter((c) => c.active);
  for (const commitment of ordered) {
    const annual = commitmentAnnualAmount(commitment, afterTaxIncome);
    commitmentRows.push(row(
      `commitment:${commitment.id}`,
      commitment.name,
      annual,
      totalComp,
      "commitment",
      commitment.amountMode === "PERCENT_OF_AFTER_TAX"
        ? `${commitment.amount}% of after-tax income`
        : commitment.amountMode === "MONTHLY"
          ? `${commitment.amount.toLocaleString()} per month`
          : undefined,
    ));
  }
  const commitmentsTotal = commitmentRows.reduce((sum, r) => sum + r.annual, 0);
  const leftForLife = afterTaxIncome - commitmentsTotal;

  if (leftForLife < 0) {
    warnings.push(`Commitments exceed after-tax income by ${Math.round(-leftForLife).toLocaleString()}. Something on this list is being funded by debt or by last year's cash.`);
  }
  if (afterTaxIncome > 0 && leftForLife >= 0 && leftForLife / afterTaxIncome < 0.1) {
    warnings.push("Less than 10% of after-tax income is left unallocated. Any surprise expense lands on a commitment.");
  }

  const savingsCommitments = ordered
    .filter((c) => c.kind === "SAVINGS")
    .reduce((sum, c) => sum + commitmentAnnualAmount(c, afterTaxIncome), 0);
  const retirementTotal = k401Employee + ownerEmployeeDeferral + ownerEmployerContribution + hsa;
  const savingsRate = totalComp > 0 ? (savingsCommitments + retirementTotal + retainedCompanyStock) / totalComp : 0;

  const sections: PlanSection[] = [
    {
      key: "income",
      title: "Starting point",
      rows: incomeRows,
      total: row("total-comp", "Total compensation", totalComp, totalComp, "subtotal"),
    },
    {
      key: "pretax",
      title: "Pre-tax deductions",
      rows: deductionRows,
      total: row("pretax-total", "Income after pre-tax", incomeAfterPretax, totalComp, "subtotal"),
    },
    {
      key: "taxes",
      title: "Taxes",
      rows: taxRows,
      total: row("after-tax", "After-tax income", afterTaxIncome, totalComp, "subtotal"),
    },
    {
      key: "commitments",
      title: "Savings, debt, and fixed commitments",
      rows: commitmentRows,
      total: row("left-for-life", "Left for life", leftForLife, totalComp, "result"),
    },
  ];

  return {
    taxYear: baseline.taxYear,
    sections,
    summary: {
      totalCompensation: totalComp,
      pretaxDeductions: pretaxTotal,
      incomeAfterPretax,
      taxes: taxesTotal,
      afterTaxIncome,
      commitments: commitmentsTotal,
      retainedCompanyStock,
      leftForLife,
      leftForLifeMonthly: leftForLife / 12,
      savingsRate,
      effectiveTaxRate: incomeAfterPretax > 0 ? taxesTotal / incomeAfterPretax : 0,
    },
    tax,
    warnings,
    notes,
  };
}

// ---------- Lever definitions for the UI ----------

export type LeverDefinition = {
  key: keyof PlanLevers;
  label: string;
  description: string;
  format: "percent" | "currency";
  min: number;
  max: number;
  step: number;
  liveValue: number; // what the lever resolves to when unset
};

export function leverDefinitions(baseline: MoneyPlanBaseline): LeverDefinition[] {
  const limits = annualLimits(baseline.taxYear);
  const defs: LeverDefinition[] = [];
  if (baseline.rsuVestValue > 0) {
    defs.push({
      key: "rsuSellFraction",
      label: "RSUs sold at vest",
      description: "Share of this year's vests converted to cash instead of held as company stock.",
      format: "percent",
      min: 0,
      max: 1,
      step: 0.05,
      liveValue: 0,
    });
  }
  if (baseline.sCorp) {
    const salaryLive = baseline.sCorp.salaryInWages ? baseline.w2Wages : baseline.sCorp.salary;
    const available = Math.max(salaryLive, baseline.sCorp.revenue - baseline.sCorp.operatingExpenses);
    defs.push({
      key: "ownerSalary",
      label: "Owner W-2 salary",
      description: "Moves money between payroll (payroll-taxed) and pass-through profit. Reasonable compensation still applies.",
      format: "currency",
      min: 0,
      max: Math.max(50_000, Math.ceil(available / 10_000) * 10_000),
      step: 5_000,
      liveValue: salaryLive,
    });
    defs.push({
      key: "ownerRetirement",
      label: "Solo 401(k) total",
      description: "Employee deferral plus employer contribution through the corporation.",
      format: "currency",
      min: 0,
      max: limits.definedContribution,
      step: 1_000,
      liveValue: baseline.sCorp.retirement,
    });
    defs.push({
      key: "healthPremiums",
      label: "Health & dental through the corporation",
      description: "Annual premiums the corporation pays for you; deductible as a 2%-shareholder benefit.",
      format: "currency",
      min: 0,
      max: 40_000,
      step: 500,
      liveValue: 0,
    });
  } else {
    defs.push({
      key: "k401Employee",
      label: "401(k) employee deferral",
      description: "Annual amount deferred through payroll.",
      format: "currency",
      min: 0,
      max: limits.employeeDeferral,
      step: 500,
      liveValue: baseline.pretax.k401Employee,
    });
  }
  defs.push({
    key: "hsa",
    label: "HSA contribution",
    description: "Annual HSA contribution, if you are on a qualifying high-deductible plan.",
    format: "currency",
    min: 0,
    max: 10_000,
    step: 100,
    liveValue: baseline.pretax.hsa,
  });
  if (!baseline.sCorp) {
    defs.push({
      key: "otherPretax",
      label: "Other pre-tax payroll deductions",
      description: "Medical and dental premiums, commuter benefits, and similar.",
      format: "currency",
      min: 0,
      max: 40_000,
      step: 100,
      liveValue: baseline.pretax.other,
    });
  }
  return defs;
}

export function resolveLever(levers: PlanLevers, definition: LeverDefinition): number {
  const value = levers[definition.key];
  return value ?? definition.liveValue;
}

// Rows that differ between a saved plan and a draft, keyed for delta chips.
export function diffPlans(saved: MoneyPlanResult, draft: MoneyPlanResult): Record<string, number> {
  const savedRows = new Map<string, number>();
  for (const section of saved.sections) {
    for (const r of section.rows) savedRows.set(r.key, r.annual);
    if (section.total) savedRows.set(section.total.key, section.total.annual);
  }
  const deltas: Record<string, number> = {};
  for (const section of draft.sections) {
    const rows = section.total ? [...section.rows, section.total] : section.rows;
    for (const r of rows) {
      const before = savedRows.get(r.key) ?? 0;
      if (Math.abs(r.annual - before) >= 1) deltas[r.key] = r.annual - before;
    }
  }
  return deltas;
}
