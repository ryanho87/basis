import assert from "node:assert/strict";
import type { PaycheckProfile, SCorpProfile } from "@prisma/client";
import { projectIncome } from "../lib/finance";
import { buildPhysicianMoneyPlan, estimateEmployerPayrollTaxes } from "../lib/physician-planning";

const taxYear = 2026;
const plan = buildPhysicianMoneyPlan({
  taxYear,
  annualRevenue: 500_000,
  operatingExpenses: 50_000,
  ownerW2Salary: 200_000,
  plannedRetirementContribution: 72_000,
  plannedCashDistribution: 150_000,
});

assert.equal(estimateEmployerPayrollTaxes(200_000, taxYear), 14_339);
assert.equal(plan.employeeRetirementContribution, 24_500);
assert.equal(plan.employerRetirementContribution, 47_500);
assert.equal(plan.illustrativeRetirementCeiling, 72_000);
assert.equal(plan.estimatedPassThroughIncome, 188_161);
assert.equal(plan.retirementHeadroom, 0);

const sCorp = {
  id: "s-corp",
  userId: "user",
  corpName: "Medical Corp",
  annualRevenue: 500_000,
  operatingExpenses: 50_000,
  w2SalaryFromCorp: 200_000,
  projectedDistribution: 150_000,
  solo401kContribution: 72_000,
  sepIraContribution: null,
  updatedAt: new Date(),
} satisfies SCorpProfile;

const paycheck = {
  id: "paycheck",
  userId: "user",
  annualSalary: 200_000,
  payFrequency: "BIWEEKLY",
  expectedBonus: null,
  bonusMonth: null,
  k401Contribution: null,
  hsaContribution: null,
  otherPretax: null,
  notes: null,
  updatedAt: new Date(),
} satisfies PaycheckProfile;

const withPayroll = projectIncome({
  taxYear,
  paycheck,
  sCorp,
  latestW2: null,
  rsuGrants: [],
  asOfDate: new Date("2026-08-25T12:00:00.000Z"),
});
assert.equal(withPayroll.projectedSCorpW2, 0, "Owner wages must not be added again when a payroll profile already projects them");
assert.equal(withPayroll.projectedSCorpPassThrough, 188_161, "Taxable pass-through profit must be based on operations, not cash distributions");
assert.equal(withPayroll.projectedSCorpDistribution, 150_000, "Cash distributions remain visible but separate from taxable income");

const withoutPayroll = projectIncome({
  taxYear,
  paycheck: null,
  sCorp,
  latestW2: null,
  rsuGrants: [],
  asOfDate: new Date("2026-08-25T12:00:00.000Z"),
});
assert.equal(withoutPayroll.projectedSCorpW2, 200_000, "S-corp salary remains a fallback when no payroll source exists");

console.info("Physician planning eval passed: payroll taxes, retirement split, pass-through profit, and W-2 deduplication.");
