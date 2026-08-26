export const EXPENSE_CATEGORIES = [
  "ADVERTISING",
  "AUTO",
  "EDUCATION",
  "INSURANCE",
  "MEALS",
  "MEDICAL_SUPPLIES",
  "OFFICE",
  "PAYROLL",
  "PROFESSIONAL_FEES",
  "RENT",
  "SOFTWARE",
  "TAXES",
  "TRAVEL",
  "UTILITIES",
  "TRANSFER",
  "OTHER",
] as const;

export const EXPENSE_TREATMENTS = [
  "UNREVIEWED",
  "BUSINESS",
  "PERSONAL",
  "MIXED",
  "EXCLUDED",
] as const;

export type ExpenseCategoryValue = (typeof EXPENSE_CATEGORIES)[number];
export type ExpenseTreatmentValue = (typeof EXPENSE_TREATMENTS)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategoryValue, string> = {
  ADVERTISING: "Advertising",
  AUTO: "Auto",
  EDUCATION: "CME & education",
  INSURANCE: "Insurance",
  MEALS: "Meals",
  MEDICAL_SUPPLIES: "Medical supplies",
  OFFICE: "Office",
  PAYROLL: "Payroll",
  PROFESSIONAL_FEES: "Professional fees",
  RENT: "Rent",
  SOFTWARE: "Software",
  TAXES: "Taxes & licenses",
  TRAVEL: "Travel",
  UTILITIES: "Phone & utilities",
  TRANSFER: "Transfer or payment",
  OTHER: "Other",
};

export function suggestExpenseCategory(primary?: string | null, detailed?: string | null): ExpenseCategoryValue {
  const value = `${primary ?? ""} ${detailed ?? ""}`.toUpperCase();
  if (value.includes("TRANSFER") || value.includes("CREDIT_CARD_PAYMENT")) return "TRANSFER";
  if (value.includes("TRAVEL") || value.includes("HOTEL") || value.includes("FLIGHT")) return "TRAVEL";
  if (value.includes("RESTAURANT") || value.includes("FOOD_AND_DRINK")) return "MEALS";
  if (value.includes("GAS") || value.includes("PARKING") || value.includes("AUTOMOTIVE")) return "AUTO";
  if (value.includes("INSURANCE")) return "INSURANCE";
  if (value.includes("INTERNET") || value.includes("PHONE") || value.includes("TELEPHONE") || value.includes("UTILIT")) return "UTILITIES";
  if (value.includes("RENT")) return "RENT";
  if (value.includes("TAX") || value.includes("GOVERNMENT")) return "TAXES";
  if (value.includes("OFFICE") || value.includes("ELECTRONICS")) return "OFFICE";
  return "OTHER";
}
