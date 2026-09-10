import assert from "node:assert/strict";
import {
  buildMoneyPlan,
  commitmentAnnualAmount,
  DEFAULT_LEVERS,
  diffPlans,
  leverDefinitions,
  parseCommitment,
  parseLeversJson,
  type MoneyPlanBaseline,
  type PlanCommitmentInput,
} from "../lib/money-plan";

const near = (actual: number, expected: number, tolerance: number, label: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ~${Math.round(expected)}, got ${Math.round(actual)}`);
const rowAnnual = (plan: ReturnType<typeof buildMoneyPlan>, key: string) => {
  for (const section of plan.sections) {
    for (const r of section.rows) if (r.key === key) return r.annual;
    if (section.total?.key === key) return section.total.annual;
  }
  throw new Error(`row ${key} missing`);
};

// ---- Parsing is defensive ----
assert.deepEqual(parseLeversJson(null), DEFAULT_LEVERS);
assert.deepEqual(parseLeversJson("not json"), DEFAULT_LEVERS);
assert.equal(parseLeversJson('{"rsuSellFraction": 7, "k401Employee": -5}').rsuSellFraction, 1);
assert.equal(parseLeversJson('{"rsuSellFraction": 0.5, "k401Employee": -5}').k401Employee, 0);
assert.equal(parseCommitment({ name: "  " }, "x"), null);
assert.equal(parseCommitment({ name: "Rent", amountMode: "PERCENT_OF_AFTER_TAX", amount: 250 }, "x")!.amount, 100);

// ---- Physician with an S-Corp, California, planning next year ----
// Mirrors the reference money plan: $465,960 total comp, $72,000 401(k),
// $4,400 HSA, ~$9,100 medical/dental, → $380,458 income after pre-tax.
const physician: MoneyPlanBaseline = {
  taxYear: 2027,
  filingStatus: "SINGLE",
  stateCode: "CA",
  w2Wages: 0,
  rsuVestValue: 0,
  rsuVestNotInWages: 0,
  otherOrdinaryIncome: 0,
  realizedSTCG: 0,
  realizedLTCG: 0,
  pretax: { k401Employee: 0, hsa: 4_400, other: 0 },
  sCorp: {
    corpName: "Practice PC",
    revenue: 520_000,
    operatingExpenses: 20_000,
    salary: 240_000,
    retirement: 72_000,
    salaryInWages: false,
  },
  withheld: { federal: 0, state: 0 },
  hasPlanRecord: false,
};
const commitments: PlanCommitmentInput[] = [
  { id: "house", name: "House fund", kind: "SAVINGS", amountMode: "ANNUAL", amount: 75_000, active: true },
  { id: "loans", name: "Student loans", kind: "DEBT", amountMode: "MONTHLY", amount: 1_500, active: true },
  { id: "brokerage", name: "Taxable brokerage", kind: "SAVINGS", amountMode: "ANNUAL", amount: 12_000, active: true },
  { id: "roth", name: "Backdoor Roth IRA", kind: "SAVINGS", amountMode: "ANNUAL", amount: 7_500, active: true },
  { id: "rent", name: "My rent", kind: "FIXED_EXPENSE", amountMode: "MONTHLY", amount: 1_325, active: true },
  { id: "brother", name: "Brother's rent", kind: "FIXED_EXPENSE", amountMode: "MONTHLY", amount: 1_400, active: true },
  { id: "tesla", name: "Tesla", kind: "FIXED_EXPENSE", amountMode: "MONTHLY", amount: 650, active: true },
  { id: "old", name: "Cancelled gym", kind: "FIXED_EXPENSE", amountMode: "MONTHLY", amount: 200, active: false },
];

const saved = buildMoneyPlan(physician, { ...DEFAULT_LEVERS, healthPremiums: 9_102 }, commitments);
// Employer payroll taxes on $240k salary (2026 wage base): 184,500×6.2% + 240,000×1.45% = 14,919
// Pass-through = 520,000 − 20,000 − 9,102 − 240,000 − 14,919 − 47,500 = 188,479
// Total comp = 240,000 + 47,500 + 9,102 + 188,479 = 485,081
near(saved.summary.totalCompensation, 485_081, 2, "physician total comp");
near(rowAnnual(saved, "owner-deferral") + rowAnnual(saved, "owner-employer"), 72_000, 0.01, "solo 401k split totals to 72k");
assert.equal(rowAnnual(saved, "owner-deferral"), 24_500);
near(saved.summary.pretaxDeductions, 72_000 + 4_400 + 9_102, 0.01, "pre-tax total");
near(saved.summary.incomeAfterPretax, 485_081 - 85_502, 2, "income after pre-tax");
assert.ok(saved.tax.state, "CA modeled");
assert.ok(saved.tax.payroll, "payroll modeled");
assert.ok(saved.summary.taxes > saved.tax.totalTax + saved.tax.state!.totalTax, "taxes include payroll");
// Commitments: 75,000 + 18,000 + 12,000 + 7,500 + 15,900 + 16,800 + 7,800 = 153,000 (inactive one excluded)
near(saved.summary.commitments, 153_000, 0.01, "commitments total");
near(saved.summary.leftForLife, saved.summary.afterTaxIncome - 153_000, 0.01, "left for life");
assert.equal(saved.summary.retainedCompanyStock, 0);
assert.ok(saved.notes.some((n) => n.includes("2027")), "provisional-year note present");
assert.ok(!saved.warnings.some((w) => w.includes("exceed")), "no overspend warning");

// Draft: house fund down to $50k, everything downstream moves by exactly that.
const draft = buildMoneyPlan(physician, { ...DEFAULT_LEVERS, healthPremiums: 9_102 }, commitments.map((c) => c.id === "house" ? { ...c, amount: 50_000 } : c));
near(draft.summary.leftForLife - saved.summary.leftForLife, 25_000, 0.01, "house fund delta flows to left for life");
const deltas = diffPlans(saved, draft);
near(deltas["commitment:house"], -25_000, 0.01, "delta on the house row");
near(deltas["left-for-life"], 25_000, 0.01, "delta on left for life");
assert.equal(deltas["total-comp"], undefined, "income untouched");

// Draft: raise owner salary → more payroll tax, less pass-through, total comp falls by the extra employer payroll tax only.
const salaried = buildMoneyPlan(physician, { ...DEFAULT_LEVERS, healthPremiums: 9_102, ownerSalary: 300_000 }, commitments);
assert.ok(salaried.tax.payroll!.totalTax > saved.tax.payroll!.totalTax, "payroll tax rises with salary");
near(saved.summary.totalCompensation - salaried.summary.totalCompensation, 60_000 * 0.0145, 1, "only extra employer Medicare leaves comp");

// Over-deferral warning: someone who also defers at a W-2 job.
const overDeferred = buildMoneyPlan({ ...physician, w2Wages: 50_000, pretax: { k401Employee: 24_500, hsa: 0, other: 0 } }, { ...DEFAULT_LEVERS }, []);
assert.ok(overDeferred.warnings.some((w) => w.includes("deferrals")), "over-deferral warning");

// Percent-of-after-tax commitments resolve against the plan's own after-tax number.
const pct = buildMoneyPlan(physician, DEFAULT_LEVERS, [{ id: "p", name: "Save 20%", kind: "SAVINGS", amountMode: "PERCENT_OF_AFTER_TAX", amount: 20, active: true }]);
near(pct.summary.commitments, pct.summary.afterTaxIncome * 0.2, 0.01, "percent commitment");
assert.equal(commitmentAnnualAmount({ id: "m", name: "x", kind: "DEBT", amountMode: "MONTHLY", amount: 100, active: true }, 0), 1_200);

// Physician lever set: S-Corp levers, no W-2 401(k) lever.
const physicianLevers = leverDefinitions(physician).map((d) => d.key);
assert.deepEqual(physicianLevers, ["ownerSalary", "ownerRetirement", "healthPremiums", "hsa"]);

// ---- Tech professional: RSUs, W-2, California ----
const tech: MoneyPlanBaseline = {
  taxYear: 2026,
  filingStatus: "SINGLE",
  stateCode: "CA",
  w2Wages: 260_000,          // salary + bonus, pay stub already includes $40k of vests
  rsuVestValue: 200_000,
  rsuVestNotInWages: 160_000,
  otherOrdinaryIncome: 0,
  realizedSTCG: 0,
  realizedLTCG: 0,
  pretax: { k401Employee: 24_500, hsa: 4_400, other: 3_600 },
  sCorp: null,
  withheld: { federal: 0, state: 0 },
  hasPlanRecord: false,
};
const techCommitments: PlanCommitmentInput[] = [
  { id: "rent", name: "Rent", kind: "FIXED_EXPENSE", amountMode: "MONTHLY", amount: 3_800, active: true },
  { id: "index", name: "Index funds", kind: "SAVINGS", amountMode: "ANNUAL", amount: 30_000, active: true },
];
const holdAll = buildMoneyPlan(tech, DEFAULT_LEVERS, techCommitments);
const sellAll = buildMoneyPlan(tech, { ...DEFAULT_LEVERS, rsuSellFraction: 1 }, techCommitments);
near(holdAll.summary.totalCompensation, 420_000, 0.01, "tech total comp");
assert.equal(holdAll.summary.totalCompensation, sellAll.summary.totalCompensation, "selling does not change comp");
assert.equal(holdAll.summary.taxes, sellAll.summary.taxes, "selling at vest does not change tax");
// Kept stock = 100% × 200,000 × (1 − (0.22 + 0.1023 + 0.0145)) = 132,640
near(holdAll.summary.retainedCompanyStock, 132_640, 1, "retained company stock");
assert.equal(sellAll.summary.retainedCompanyStock, 0);
near(sellAll.summary.leftForLife - holdAll.summary.leftForLife, 132_640, 1, "selling frees the retained value");
assert.ok(holdAll.warnings.some((w) => w.includes("Concentration")), "concentration warning when holding");
assert.ok(!sellAll.warnings.some((w) => w.includes("Concentration")), "no concentration warning when selling");
const half = buildMoneyPlan(tech, { ...DEFAULT_LEVERS, rsuSellFraction: 0.5 }, techCommitments);
near(half.summary.retainedCompanyStock, 66_320, 1, "half sold");
const techLevers = leverDefinitions(tech).map((d) => d.key);
assert.deepEqual(techLevers, ["rsuSellFraction", "k401Employee", "hsa", "otherPretax"]);

// 401(k) lever changes taxes but not comp.
const noDeferral = buildMoneyPlan(tech, { ...DEFAULT_LEVERS, k401Employee: 0 }, techCommitments);
assert.equal(noDeferral.summary.totalCompensation, holdAll.summary.totalCompensation);
assert.ok(noDeferral.summary.taxes > holdAll.summary.taxes, "dropping the deferral raises tax");
assert.ok(noDeferral.summary.afterTaxIncome > holdAll.summary.afterTaxIncome, "and raises after-tax cash");

// Unknown state: honest notes, federal + payroll only.
const texan = buildMoneyPlan({ ...tech, stateCode: "TX" }, DEFAULT_LEVERS, techCommitments);
assert.equal(texan.tax.state, null);
assert.ok(texan.notes.some((n) => n.includes("TX")), "unsupported state note");
assert.ok(texan.summary.taxes < holdAll.summary.taxes);

// Overspend warning.
const broke = buildMoneyPlan(tech, DEFAULT_LEVERS, [{ id: "yacht", name: "Yacht", kind: "FIXED_EXPENSE", amountMode: "MONTHLY", amount: 40_000, active: true }]);
assert.ok(broke.summary.leftForLife < 0);
assert.ok(broke.warnings.some((w) => w.includes("exceed")), "overspend warning");

console.log("Money plan eval passed", {
  physicianLeftForLifeMonthly: Math.round(saved.summary.leftForLifeMonthly),
  physicianEffectiveTax: saved.summary.effectiveTaxRate.toFixed(3),
  techHoldLeftMonthly: Math.round(holdAll.summary.leftForLifeMonthly),
  techSellLeftMonthly: Math.round(sellAll.summary.leftForLifeMonthly),
});
