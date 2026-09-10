export type PhysicianPlanInputs = {
  taxYear: number;
  annualRevenue: number;
  operatingExpenses: number;
  ownerW2Salary: number;
  plannedRetirementContribution?: number | null;
  plannedCashDistribution?: number | null;
};

export type PhysicianMoneyPlan = {
  annualRevenue: number;
  operatingExpenses: number;
  ownerW2Salary: number;
  employerPayrollTaxes: number;
  employeeRetirementContribution: number;
  employerRetirementContribution: number;
  totalRetirementContribution: number;
  illustrativeRetirementCeiling: number;
  retirementHeadroom: number;
  estimatedPassThroughIncome: number;
  plannedCashDistribution: number;
  estimatedCashBeforeOwnerDistribution: number;
  monthly: {
    revenue: number;
    operatingExpenses: number;
    ownerPayroll: number;
    employerPayrollTaxes: number;
    retirement: number;
    passThroughIncome: number;
  };
  warnings: string[];
};

type AnnualLimits = {
  socialSecurityWageBase: number;
  employeeDeferral: number;
  definedContribution: number;
  figuresYear: number;            // year whose published limits are in use
  figuresAreProvisional: boolean; // true when taxYear runs ahead of published limits
};

// Latest published IRS / SSA limits. Add a row each autumn when the IRS
// notice and SSA COLA announcement land; later years reuse the newest row
// and flag themselves as provisional instead of silently guessing.
const PUBLISHED_LIMITS: Record<number, Omit<AnnualLimits, "figuresYear" | "figuresAreProvisional">> = {
  2025: { socialSecurityWageBase: 176_100, employeeDeferral: 23_500, definedContribution: 70_000 },
  2026: { socialSecurityWageBase: 184_500, employeeDeferral: 24_500, definedContribution: 72_000 },
};

export function annualLimits(taxYear: number): AnnualLimits {
  const years = Object.keys(PUBLISHED_LIMITS).map(Number);
  const eligible = years.filter((year) => year <= taxYear);
  const figuresYear = eligible.length ? Math.max(...eligible) : Math.min(...years);
  return {
    ...PUBLISHED_LIMITS[figuresYear],
    figuresYear,
    figuresAreProvisional: taxYear > figuresYear,
  };
}

function nonnegative(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

export function estimateEmployerPayrollTaxes(ownerW2Salary: number, taxYear: number) {
  const salary = nonnegative(ownerW2Salary);
  const limits = annualLimits(taxYear);
  const socialSecurity = Math.min(salary, limits.socialSecurityWageBase) * 0.062;
  const medicare = salary * 0.0145;
  return socialSecurity + medicare;
}

export function buildPhysicianMoneyPlan(inputs: PhysicianPlanInputs): PhysicianMoneyPlan {
  const limits = annualLimits(inputs.taxYear);
  const annualRevenue = nonnegative(inputs.annualRevenue);
  const operatingExpenses = nonnegative(inputs.operatingExpenses);
  const ownerW2Salary = nonnegative(inputs.ownerW2Salary);
  const totalRetirementContribution = nonnegative(inputs.plannedRetirementContribution);
  const plannedCashDistribution = nonnegative(inputs.plannedCashDistribution);
  const employerPayrollTaxes = estimateEmployerPayrollTaxes(ownerW2Salary, inputs.taxYear);

  // Existing Basis data stores a combined Solo 401(k) contribution. Employee
  // deferrals are already part of gross W-2 salary, while employer contributions
  // are a separate corporate expense. Split them conservatively for cash planning.
  const employeeRetirementContribution = Math.min(
    totalRetirementContribution,
    limits.employeeDeferral,
  );
  const employerRetirementContribution = Math.max(
    0,
    totalRetirementContribution - employeeRetirementContribution,
  );
  const illustrativeRetirementCeiling = Math.min(
    limits.definedContribution,
    limits.employeeDeferral + ownerW2Salary * 0.25,
  );

  const estimatedPassThroughIncome = Math.max(
    0,
    annualRevenue
      - operatingExpenses
      - ownerW2Salary
      - employerPayrollTaxes
      - employerRetirementContribution,
  );
  const estimatedCashBeforeOwnerDistribution = estimatedPassThroughIncome;
  const warnings: string[] = [];

  if (limits.figuresAreProvisional) {
    warnings.push(`${inputs.taxYear} contribution limits and the Social Security wage base are not published yet, so this plan uses ${limits.figuresYear} figures. Expect small upward revisions.`);
  }
  if (annualRevenue <= 0) {
    warnings.push("Add expected annual practice revenue before treating this as an allocation plan.");
  }
  if (ownerW2Salary <= 0 && annualRevenue > 0) {
    warnings.push("Owner payroll is missing. Basis cannot evaluate a distribution plan without the salary your corporation pays you.");
  }
  if (plannedCashDistribution > estimatedCashBeforeOwnerDistribution) {
    warnings.push("Planned distributions exceed this year's estimated operating cash. Prior-year retained cash and shareholder basis may change what is available.");
  }
  if (totalRetirementContribution > illustrativeRetirementCeiling) {
    warnings.push("The entered retirement contribution is above the illustrative ceiling from this payroll alone. Contributions through every employer must be reconciled.");
  }
  if (ownerW2Salary > 0) {
    warnings.push("Basis does not declare a salary 'reasonable.' Confirm compensation using specialty, duties, hours, geography, and comparable employment data.");
  }

  return {
    annualRevenue,
    operatingExpenses,
    ownerW2Salary,
    employerPayrollTaxes,
    employeeRetirementContribution,
    employerRetirementContribution,
    totalRetirementContribution,
    illustrativeRetirementCeiling,
    retirementHeadroom: Math.max(0, illustrativeRetirementCeiling - totalRetirementContribution),
    estimatedPassThroughIncome,
    plannedCashDistribution,
    estimatedCashBeforeOwnerDistribution,
    monthly: {
      revenue: annualRevenue / 12,
      operatingExpenses: operatingExpenses / 12,
      ownerPayroll: ownerW2Salary / 12,
      employerPayrollTaxes: employerPayrollTaxes / 12,
      retirement: totalRetirementContribution / 12,
      passThroughIncome: estimatedPassThroughIncome / 12,
    },
    warnings,
  };
}
