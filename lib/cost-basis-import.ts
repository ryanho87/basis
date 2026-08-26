export type CostBasisImportRow = {
  ticker: string | null;
  securityName: string | null;
  acquiredAt: string | null;
  quantity: number | null;
  costBasisPerShare: number | null;
  costBasisTotal: number | null;
  currentValue: number | null;
};

export type CostBasisExtraction = {
  institution: string | null;
  accountName: string | null;
  accountLast4: string | null;
  statementDate: string | null;
  documentType: string | null;
  rows: CostBasisImportRow[];
  confidence: number;
  warnings: string[];
  documentHash: string;
};

const nullableText = (value: unknown, max = 200) =>
  typeof value === "string" ? value.trim().slice(0, max) || null : null;

const nullableMoney = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) < 10_000_000_000 ? number : null;
};

const nullableDate = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isNaN(new Date(`${value}T12:00:00.000Z`).getTime()) ? null : value;
};

export function normalizeCostBasisExtraction(raw: unknown, documentHash: string): CostBasisExtraction {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rows = Array.isArray(value.rows) ? value.rows.slice(0, 500).map((candidate) => {
    const row = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : {};
    return {
      ticker: nullableText(row.ticker, 30)?.toUpperCase() ?? null,
      securityName: nullableText(row.securityName),
      acquiredAt: nullableDate(row.acquiredAt),
      quantity: nullableMoney(row.quantity),
      costBasisPerShare: nullableMoney(row.costBasisPerShare),
      costBasisTotal: nullableMoney(row.costBasisTotal),
      currentValue: nullableMoney(row.currentValue),
    };
  }).filter((row) => row.ticker || row.securityName) : [];
  const confidence = Number(value.confidence);
  return {
    institution: nullableText(value.institution),
    accountName: nullableText(value.accountName),
    accountLast4: typeof value.accountLast4 === "string" && /^\d{4}$/.test(value.accountLast4.trim()) ? value.accountLast4.trim() : null,
    statementDate: nullableDate(value.statementDate),
    documentType: nullableText(value.documentType, 80),
    rows,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    warnings: Array.isArray(value.warnings) ? value.warnings.filter((warning): warning is string => typeof warning === "string").map((warning) => warning.slice(0, 300)).slice(0, 20) : [],
    documentHash,
  };
}

export const COST_BASIS_EXTRACTION_PROMPT = `Extract lot-level cost-basis data from this brokerage statement or export.

Return exactly one JSON object with these keys:
institution, accountName, accountLast4, statementDate, documentType, rows, confidence, warnings.

Each rows item must contain exactly:
ticker, securityName, acquiredAt, quantity, costBasisPerShare, costBasisTotal, currentValue.

Dates must be YYYY-MM-DD. Monetary and quantity values must be numbers without symbols or commas. Use null when a field is absent or ambiguous. Preserve one row per tax lot; do not combine acquisition dates. Do not infer missing basis, acquisition dates, quantities, or tickers. If the document only contains aggregate position basis, return that row with acquiredAt null and explain the limitation in warnings. Exclude cash, account totals, realized sales, dividends, and transactions that do not represent currently held lots.

confidence must be 0 to 1. warnings must identify missing pages, aggregate-only basis, covered/noncovered ambiguity, quantity mismatches, unreadable columns, statement staleness, or rows excluded from the result.

Never return full account numbers, names of people, addresses, tax IDs, login information, or any other personal identifiers. accountLast4 may contain only the final four digits. Do not wrap JSON in Markdown.`;
