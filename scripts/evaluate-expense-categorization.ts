import assert from "node:assert/strict";
import { suggestExpenseCategory } from "../lib/expenses";

const cases = [
  ["FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANTS", "MEALS"],
  ["TRAVEL", "TRAVEL_FLIGHTS", "TRAVEL"],
  ["TRANSPORTATION", "TRANSPORTATION_GAS", "AUTO"],
  ["LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", "TRANSFER"],
  ["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_TELEPHONE", "UTILITIES"],
  ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE", "OTHER"],
] as const;

for (const [primary, detailed, expected] of cases) {
  assert.equal(suggestExpenseCategory(primary, detailed), expected, `${detailed} should map to ${expected}`);
}

console.log(`Expense category suggestions: ${cases.length} checks passed`);
