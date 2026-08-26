import type { ProfileType } from "@prisma/client";

export const PRIMARY_PERSONAS = [
  "TECH_PROFESSIONAL",
  "PHYSICIAN",
  "OWNER_OPERATOR",
  "HIGH_EARNING_PROFESSIONAL",
] as const;

export type PrimaryPersona = (typeof PRIMARY_PERSONAS)[number];

export const FINANCIAL_CAPABILITIES = [
  "W2_INCOME",
  "EQUITY_COMPENSATION",
  "CONCENTRATED_STOCK",
  "SELF_EMPLOYMENT_INCOME",
  "S_CORP",
  "OWNER_PAYROLL",
  "QUARTERLY_ESTIMATED_TAXES",
  "BUSINESS_RETIREMENT_PLAN",
  "STUDENT_LOANS",
  "REAL_ESTATE",
  "TAXABLE_INVESTING",
] as const;

export type FinancialCapability = (typeof FINANCIAL_CAPABILITIES)[number];

const PERSONA_SET = new Set<string>(PRIMARY_PERSONAS);
const CAPABILITY_SET = new Set<string>(FINANCIAL_CAPABILITIES);

export const CAPABILITY_LABELS: Record<FinancialCapability, string> = {
  W2_INCOME: "W-2 income",
  EQUITY_COMPENSATION: "Equity compensation",
  CONCENTRATED_STOCK: "Concentrated stock",
  SELF_EMPLOYMENT_INCOME: "1099 income",
  S_CORP: "S-corp",
  OWNER_PAYROLL: "Owner payroll",
  QUARTERLY_ESTIMATED_TAXES: "Quarterly taxes",
  BUSINESS_RETIREMENT_PLAN: "Business retirement plan",
  STUDENT_LOANS: "Student loans",
  REAL_ESTATE: "Real estate",
  TAXABLE_INVESTING: "Taxable investing",
};

export function parsePrimaryPersona(value: unknown): PrimaryPersona | null {
  return typeof value === "string" && PERSONA_SET.has(value)
    ? value as PrimaryPersona
    : null;
}

export function parseFinancialCapabilities(value: unknown): FinancialCapability[] {
  const candidates = Array.isArray(value) ? value : [];
  return [...new Set(
    candidates.filter(
      (capability): capability is FinancialCapability =>
        typeof capability === "string" && CAPABILITY_SET.has(capability),
    ),
  )];
}

export function parseFinancialCapabilitiesJson(value: string | null | undefined) {
  if (!value) return [];
  try {
    return parseFinancialCapabilities(JSON.parse(value));
  } catch {
    return [];
  }
}

export function derivePersona(
  primaryPersona: string | null | undefined,
  profileType: ProfileType,
): PrimaryPersona {
  const parsed = parsePrimaryPersona(primaryPersona);
  if (parsed) return parsed;
  if (profileType === "TECH_EMPLOYEE") return "TECH_PROFESSIONAL";
  if (profileType === "S_CORP_OWNER" || profileType === "SELF_EMPLOYED") return "OWNER_OPERATOR";
  return "HIGH_EARNING_PROFESSIONAL";
}

export function deriveCapabilities(
  capabilitiesJson: string | null | undefined,
  profileType: ProfileType,
): FinancialCapability[] {
  const stored = parseFinancialCapabilitiesJson(capabilitiesJson);
  if (stored.length > 0) return stored;

  switch (profileType) {
    case "TECH_EMPLOYEE":
      return ["W2_INCOME", "EQUITY_COMPENSATION", "CONCENTRATED_STOCK", "TAXABLE_INVESTING"];
    case "S_CORP_OWNER":
      return ["W2_INCOME", "SELF_EMPLOYMENT_INCOME", "S_CORP", "OWNER_PAYROLL", "QUARTERLY_ESTIMATED_TAXES", "BUSINESS_RETIREMENT_PLAN"];
    case "SELF_EMPLOYED":
      return ["SELF_EMPLOYMENT_INCOME", "QUARTERLY_ESTIMATED_TAXES", "BUSINESS_RETIREMENT_PLAN"];
    case "MIXED":
      return ["W2_INCOME", "SELF_EMPLOYMENT_INCOME", "QUARTERLY_ESTIMATED_TAXES"];
    case "W2_PROFESSIONAL":
      return ["W2_INCOME"];
    default:
      return [];
  }
}

export function personaLabel(persona: PrimaryPersona) {
  switch (persona) {
    case "TECH_PROFESSIONAL": return "Tech professional";
    case "PHYSICIAN": return "Physician";
    case "OWNER_OPERATOR": return "Business owner";
    default: return "High-earning professional";
  }
}
