import assert from "node:assert/strict";
import { reconcileRsuIncome } from "../lib/finance";

const date = (value: string) => new Date(`${value}T12:00:00.000Z`);
const grants = [{
  ticker: "NVDA",
  vestEvents: [
    { vestDate: date("2026-03-18"), shares: 10, fmvAtVest: 180, status: "VESTED" },
    { vestDate: date("2026-06-18"), shares: 10, fmvAtVest: 190, status: "VESTED" },
    { vestDate: date("2026-09-18"), shares: 10, fmvAtVest: null, status: "PENDING" },
    { vestDate: date("2026-12-18"), shares: 10, fmvAtVest: null, status: "PENDING" },
  ],
}];

const reconciled = reconcileRsuIncome({
  taxYear: 2026,
  asOfDate: date("2026-08-25"),
  snapshotCoverageDate: date("2026-05-31"),
  grants,
  priceEstimates: { NVDA: 200 },
});
assert.equal(reconciled.rsuIncomeAfterSnapshot, 1_900, "Only the vested event after the pay-stub cutoff should be added as actual income");
assert.equal(reconciled.upcomingRsuIncome, 4_000, "Future estimated vests should be added once");
assert.equal(reconciled.unpricedRsuEvents, 0);

const coveredByPayroll = reconcileRsuIncome({
  taxYear: 2026,
  asOfDate: date("2026-08-25"),
  snapshotCoverageDate: date("2026-06-30"),
  grants,
  priceEstimates: { NVDA: 200 },
});
assert.equal(coveredByPayroll.rsuIncomeAfterSnapshot, 0, "A vest already covered by payroll must not be counted twice");

const missingPrice = reconcileRsuIncome({
  taxYear: 2026,
  asOfDate: date("2026-08-25"),
  snapshotCoverageDate: date("2026-06-30"),
  grants,
});
assert.equal(missingPrice.upcomingRsuIncome, 0, "Unpriced vests must not become fictional income");
assert.equal(missingPrice.unpricedRsuEvents, 2);
assert.equal(missingPrice.unpricedRsuShares, 20);

console.info("Income reconciliation eval passed: payroll cutoff, post-stub actuals, forecasts, and missing-FMV handling.");
