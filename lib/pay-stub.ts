export type PayStubExtraction = {
  payDate: string | null;
  payPeriodStart: string | null;
  payPeriodEnd: string | null;
  employerName: string | null;
  payFrequency: string | null;
  currentGrossPay: number | null;
  currentNetPay: number | null;
  ytdGrossPay: number | null;
  ytdNetPay: number | null;
  ytdFederalWithheld: number | null;
  ytdStateWithheld: number | null;
  ytdSocialSecurity: number | null;
  ytdMedicare: number | null;
  ytdPretaxDeductions: number | null;
  ytdRetirement: number | null;
  ytdHsa: number | null;
  ytdBonuses: number | null;
  ytdRsuVestIncome: number | null;
  stateCode: string | null;
  confidence: number;
  warnings: string[];
  documentHash: string;
};

const MONEY_FIELDS = [
  "currentGrossPay",
  "currentNetPay",
  "ytdGrossPay",
  "ytdNetPay",
  "ytdFederalWithheld",
  "ytdStateWithheld",
  "ytdSocialSecurity",
  "ytdMedicare",
  "ytdPretaxDeductions",
  "ytdRetirement",
  "ytdHsa",
  "ytdBonuses",
  "ytdRsuVestIncome",
] as const;

function nullableMoney(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number < 1_000_000_000
    ? number
    : null;
}

function dateOnly(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : value;
}

export function normalizePayStubExtraction(
  raw: unknown,
  documentHash: string,
): PayStubExtraction {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const result = {} as PayStubExtraction;
  for (const field of MONEY_FIELDS) result[field] = nullableMoney(value[field]);

  result.payDate = dateOnly(value.payDate);
  result.payPeriodStart = dateOnly(value.payPeriodStart);
  result.payPeriodEnd = dateOnly(value.payPeriodEnd);
  result.employerName = typeof value.employerName === "string"
    ? value.employerName.trim().slice(0, 200) || null
    : null;
  result.payFrequency = typeof value.payFrequency === "string"
    ? value.payFrequency.trim().toUpperCase().slice(0, 30) || null
    : null;
  result.stateCode = typeof value.stateCode === "string"
    ? value.stateCode.trim().toUpperCase().slice(0, 2) || null
    : null;
  const confidence = Number(value.confidence);
  result.confidence = Number.isFinite(confidence)
    ? Math.max(0, Math.min(1, confidence))
    : 0;
  result.warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((warning): warning is string => typeof warning === "string").slice(0, 12)
    : [];
  result.documentHash = documentHash;
  return result;
}

export const PAY_STUB_EXTRACTION_PROMPT = `Extract year-to-date payroll data from this employee pay stub.

Return exactly one JSON object with these keys:
payDate, payPeriodStart, payPeriodEnd, employerName, payFrequency,
currentGrossPay, currentNetPay, ytdGrossPay, ytdNetPay,
ytdFederalWithheld, ytdStateWithheld, ytdSocialSecurity, ytdMedicare,
ytdPretaxDeductions, ytdRetirement, ytdHsa, ytdBonuses,
ytdRsuVestIncome, stateCode, confidence, warnings.

Dates must be YYYY-MM-DD. Monetary values must be numbers without currency symbols.
Use the pay stub's explicit YTD column; do not annualize current-period values. ytdGrossPay
means total year-to-date taxable/gross earnings, including bonuses and stock compensation
when the stub includes them. ytdPretaxDeductions means total YTD pre-tax deductions;
do not double-count ytdRetirement or ytdHsa inside it if a separate total is unavailable—in
that case return null for ytdPretaxDeductions and return the component amounts.

Use null for unreadable or absent fields. confidence must be from 0 to 1. warnings must
identify ambiguity, inconsistent YTD totals, missing pay date or gross YTD, cropped fields,
or stock compensation that may be included but cannot be isolated.

Stock compensation may appear as RSU, restricted stock, stock award, stock offset, equity,
or imputed income. ytdRsuVestIncome is an informational component of ytdGrossPay, never an
additional amount. Return it only when the pay stub explicitly isolates a YTD stock-comp
amount; otherwise return null and add a warning that stock compensation may be included.

Never return employee IDs, SSNs, employer tax IDs, addresses, bank account or routing
numbers, or any other identifiers. Do not calculate missing values. Do not wrap JSON in Markdown.`;
