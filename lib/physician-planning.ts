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
};

function annualLimits(taxYear: number): AnnualLimits {
  if (taxYear >= 2026) {
    return {
      socialSecurityWageBase: 184_500,
      employeeDeferral: 24_500,
      definedContribution: 72_000,
    };
  }
  return {
    socialSecurityWageBase: 176_100,
    employeeDeferral: 23_500,
    definedContribution: 70_000,
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
