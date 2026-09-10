import assert from "node:assert/strict";
import {
  computePayrollTax,
  computeStateTax,
  normalizeStateCode,
} from "../lib/state-tax";
import {
  computeTax,
  estimateOrdinaryWithdrawalRate,
  estimateUnrealizedGainTaxRate,
} from "../lib/tax";

const round = (value: number) => Math.round(value);
const near = (actual: number, expected: number, tolerance: number, label: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ~${expected}, got ${round(actual)}`);

// ---- State code normalization ----
assert.equal(normalizeStateCode("CA"), "CA");
assert.equal(normalizeStateCode(" california "), "CA");
assert.equal(normalizeStateCode("NY"), null);
assert.equal(normalizeStateCode(null), null);

// ---- Reference plan: single California physician, $380,458 after pre-tax ----
// Independent hand-calculated figures for this income:
//   Federal 2026 single, $16,100 standard deduction → taxable $364,358 → $96,295
//   CA 2025 Schedule X, $5,706 standard deduction → taxable $374,752 → $31,323
const reference = computeTax({
  taxYear: 2027,
  filingStatus: "SINGLE",
  ordinaryIncome: 380_458,
  longTermGains: 0,
  stateCode: "CA",
  wages: 380_458,
});
near(reference.totalTax, 96_295, 5, "federal income tax");
assert.ok(reference.state, "California should be modeled");
near(reference.state!.taxableIncome, 374_752, 1, "CA taxable income");
near(reference.state!.totalTax, 31_323, 5, "CA income tax");
assert.equal(reference.state!.surtax, 0);
assert.equal(reference.state!.marginalRate, 0.103);
assert.equal(reference.state!.figuresAreProvisional, true);
assert.equal(reference.state!.figuresYear, 2025);
near(reference.totalTaxWithState, 96_295 + 31_323, 10, "federal + state");
assert.equal(reference.combinedMarginalOrdinaryRate, 0.35 + 0.103);

// Payroll on the same wages, 2027 (uses 2026 wage base + SDI rate, flagged provisional):
//   SS 6.2% × 184,500 = 11,439; Medicare 1.45% × 380,458 = 5,516.64;
//   Additional Medicare 0.9% × 180,458 = 1,624.12; SDI 1.3% × 380,458 = 4,945.95
assert.ok(reference.payroll);
near(reference.payroll!.socialSecurity, 11_439, 1, "social security");
near(reference.payroll!.medicare, 5_517, 1, "medicare");
near(reference.payroll!.additionalMedicare, 1_624, 1, "additional medicare");
near(reference.payroll!.stateDisability, 4_946, 1, "CA SDI");
assert.equal(reference.payroll!.figuresAreProvisional, true);
near(reference.totalTaxWithPayroll, 96_295 + 31_323 + 23_526, 15, "all-in tax");

// ---- Unsupported state stays an honest unknown ----
const texas = computeTax({ taxYear: 2026, filingStatus: "SINGLE", ordinaryIncome: 300_000, longTermGains: 0, stateCode: "TX" });
assert.equal(texas.state, null);
assert.equal(texas.totalTaxWithState, texas.totalTax);
assert.equal(texas.payroll, null);

// ---- Backward compatibility: callers that omit state see federal-only totals ----
const legacy = computeTax({ taxYear: 2026, filingStatus: "SINGLE", ordinaryIncome: 300_000, longTermGains: 0 });
assert.equal(legacy.totalTax, texas.totalTax);
assert.equal(legacy.state, null);

// ---- CA treats capital gains as ordinary income; MHST kicks in over $1M ----
const highEarner = computeStateTax({
  taxYear: 2025,
  stateCode: "CA",
  filingStatus: "MARRIED_FILING_JOINTLY",
  ordinaryIncome: 900_000,
  longTermGains: 300_000,
});
assert.ok(highEarner);
assert.equal(highEarner!.taxableIncome, 1_200_000 - 11_412);
near(highEarner!.surtax, (1_188_588 - 1_000_000) * 0.01, 1, "mental health surtax");
assert.equal(highEarner!.marginalRate, 0.113 + 0.01);
assert.equal(highEarner!.figuresAreProvisional, false);

// ---- Filing-status specific tables ----
const hoh = computeStateTax({ taxYear: 2025, stateCode: "CA", filingStatus: "HEAD_OF_HOUSEHOLD", ordinaryIncome: 100_000, longTermGains: 0 });
// taxable 88,588: 221.73 + 607.14 + 607.44 + 965.34 + 382.64 = 2,784
near(hoh!.totalTax, 2_784, 2, "HoH CA tax");

// ---- Payroll: MFJ additional-Medicare threshold and no SDI outside CA ----
const mfjPayroll = computePayrollTax({ taxYear: 2026, wages: 260_000, filingStatus: "MARRIED_FILING_JOINTLY", stateCode: "WA" });
near(mfjPayroll.additionalMedicare, 10_000 * 0.009, 0.01, "MFJ additional medicare");
assert.equal(mfjPayroll.stateDisability, 0);
assert.equal(mfjPayroll.figuresAreProvisional, false);

// ---- After-tax net worth proxies ----
assert.equal(estimateUnrealizedGainTaxRate(), 0.20);
near(estimateUnrealizedGainTaxRate("CA"), 0.243, 0.0001, "CA LTCG proxy");
assert.equal(estimateOrdinaryWithdrawalRate("SINGLE"), 0.27);
near(estimateOrdinaryWithdrawalRate("SINGLE", "CA"), 0.30, 0.0001, "CA withdrawal proxy");

console.log("State tax evaluation passed", {
  federal: round(reference.totalTax),
  california: round(reference.state!.totalTax),
  payroll: round(reference.payroll!.totalTax),
  allIn: round(reference.totalTaxWithPayroll),
  effectiveWithState: reference.effectiveRateWithState.toFixed(3),
});
