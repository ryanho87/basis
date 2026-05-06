import { prisma } from "./prisma";
import { computeNetWorth, projectIncome } from "./finance";
import { computeTax } from "./tax";
import { formatCurrency, formatPercent } from "./utils";

// Build a structured, compact financial snapshot to inject as the LLM's
// system context. This is the single source of truth that the LLM uses
// to reason about the user's situation.
export async function buildFinancialContext(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      paycheckProfile: true,
      sCorpProfile: true,
      accounts: { include: { lots: true, positions: true } },
      manualAssets: true,
      liabilities: true,
      studentLoans: true,
      rsuGrants: { include: { vestEvents: true } },
      w2Snapshots: { orderBy: { snapshotDate: "desc" }, take: 1 },
      plannedSales: true,
    },
  });
  if (!user) return "No user data available.";

  const taxYear = new Date().getFullYear();
  const latestW2 = user.w2Snapshots[0] ?? null;

  const nw = computeNetWorth({
    accounts: user.accounts,
    manualAssets: user.manualAssets,
    liabilities: user.liabilities,
    studentLoans: user.studentLoans,
    filingStatus: user.filingStatus,
  });

  const projection = projectIncome({
    taxYear,
    paycheck: user.paycheckProfile,
    sCorp: user.sCorpProfile,
    latestW2,
    rsuGrants: user.rsuGrants,
    realizedLTCG: 0,
    realizedSTCG: 0,
  });

  const tax = computeTax({
    filingStatus: user.filingStatus,
    ordinaryIncome: projection.totalProjectedOrdinary,
    longTermGains: projection.realizedLTCG,
    pretaxDeductions: projection.estimatedPretax,
  });

  // Lot-level capital gains exposure (taxable accounts only)
  const taxableLots = user.accounts
    .filter((a) => a.type === "TAXABLE_BROKERAGE" || a.type === "CRYPTO")
    .flatMap((a) => a.lots);
  const ltUnrealized = taxableLots
    .filter((l) => Date.now() - new Date(l.acquiredAt).getTime() >= 365 * 86400 * 1000)
    .reduce((s, l) => s + l.shares * l.costBasisPerShare, 0); // basis only; UI typically uses currentPrice
  const stUnrealized = taxableLots
    .filter((l) => Date.now() - new Date(l.acquiredAt).getTime() < 365 * 86400 * 1000)
    .reduce((s, l) => s + l.shares * l.costBasisPerShare, 0);

  // Concentration: any single ticker > 15% of total portfolio?
  const tickerTotals = new Map<string, number>();
  for (const a of user.accounts) {
    for (const l of a.lots) {
      tickerTotals.set(l.ticker, (tickerTotals.get(l.ticker) ?? 0) + l.shares * l.costBasisPerShare);
    }
    for (const p of a.positions) {
      tickerTotals.set(p.ticker, (tickerTotals.get(p.ticker) ?? 0) + p.currentValue);
    }
  }
  const concentrationLines: string[] = [];
  for (const [ticker, value] of tickerTotals) {
    if (nw.totalAssets > 0 && value / nw.totalAssets > 0.15) {
      concentrationLines.push(`  - ${ticker}: ${formatCurrency(value)} (${formatPercent(value / nw.totalAssets)} of portfolio)`);
    }
  }

  // Upcoming RSU vests
  const now = new Date();
  const upcomingVests = user.rsuGrants.flatMap((g) =>
    g.vestEvents
      .filter((v) => v.status === "PENDING" && new Date(v.vestDate) >= now)
      .slice(0, 8)
      .map((v) => ({ ticker: g.ticker, date: v.vestDate, shares: v.shares })),
  );

  const lines: string[] = [];
  lines.push(`# User Financial Snapshot (as of ${new Date().toISOString().slice(0, 10)})`);
  lines.push("");
  lines.push(`## Profile`);
  lines.push(`- Profile type: ${user.profileType}`);
  lines.push(`- Filing status: ${user.filingStatus}`);
  if (user.state) lines.push(`- State: ${user.state}`);
  if (user.primaryConcern) lines.push(`- Primary concern: ${user.primaryConcern}`);
  if (user.onboardingSummary) lines.push(`- Onboarding summary: ${user.onboardingSummary}`);

  lines.push("");
  lines.push(`## Net Worth (${taxYear})`);
  lines.push(`- Total assets: ${formatCurrency(nw.totalAssets)}`);
  lines.push(`- Total liabilities: ${formatCurrency(nw.totalLiabilities)}`);
  lines.push(`- Net worth: ${formatCurrency(nw.netWorth)}`);
  lines.push(`- After-tax net worth: ${formatCurrency(nw.afterTaxNetWorth)}`);
  lines.push(`- Cash: ${formatCurrency(nw.byCategory.cash)}`);
  lines.push(`- Taxable investments: ${formatCurrency(nw.byCategory.taxableInvestments)}`);
  lines.push(`- Retirement: ${formatCurrency(nw.byCategory.retirement)}`);
  lines.push(`- Crypto: ${formatCurrency(nw.byCategory.crypto)}`);
  lines.push(`- Real estate: ${formatCurrency(nw.byCategory.realEstate)}`);
  lines.push(`- Total unrealized gains (taxable + crypto): ${formatCurrency(nw.totalUnrealizedGain)}`);

  lines.push("");
  lines.push(`## Income Projection (${taxYear})`);
  lines.push(`- YTD W-2 wages: ${formatCurrency(projection.ytdW2)}`);
  lines.push(`- Projected remaining W-2: ${formatCurrency(projection.remainingW2)}`);
  lines.push(`- Projected bonus: ${formatCurrency(projection.projectedBonus)}`);
  lines.push(`- YTD RSU vest income: ${formatCurrency(projection.ytdRsuVestIncome)}`);
  lines.push(`- Upcoming RSU vest income: ${formatCurrency(projection.upcomingRsuIncome)}`);
  if (projection.projectedSCorpW2 > 0)
    lines.push(`- S-Corp W-2: ${formatCurrency(projection.projectedSCorpW2)}`);
  if (projection.projectedSCorpDistribution > 0)
    lines.push(`- S-Corp distribution (K-1): ${formatCurrency(projection.projectedSCorpDistribution)}`);
  lines.push(`- Total projected ordinary income: ${formatCurrency(projection.totalProjectedOrdinary)}`);
  lines.push(`- Pre-tax deductions (401k/HSA/etc): ${formatCurrency(projection.estimatedPretax)}`);

  lines.push("");
  lines.push(`## Tax Position (${taxYear})`);
  lines.push(`- Estimated total tax: ${formatCurrency(tax.totalTax)} (${formatPercent(tax.effectiveRate)} effective)`);
  lines.push(`- Marginal ordinary rate: ${formatPercent(tax.marginalOrdinaryRate)}`);
  lines.push(`- Marginal LTCG rate: ${formatPercent(tax.marginalLtcgRate)}`);
  lines.push(`- Room before next ordinary bracket: ${formatCurrency(tax.bracketRoom.nextOrdinaryBracketRoom)} ${tax.bracketRoom.nextOrdinaryBracketRate ? `(then ${formatPercent(tax.bracketRoom.nextOrdinaryBracketRate)})` : ""}`);
  lines.push(`- LTCG room at 15% bracket: ${formatCurrency(tax.bracketRoom.ltcgRoomAt15)}`);
  lines.push(`- NIIT threshold: ${formatCurrency(tax.thresholds.niit)}, currently ${tax.bracketRoom.niitOver > 0 ? `OVER by ${formatCurrency(tax.bracketRoom.niitOver)}` : "under"}`);

  if (concentrationLines.length > 0) {
    lines.push("");
    lines.push(`## Concentration Risk (>15% of portfolio)`);
    lines.push(...concentrationLines);
  }

  if (upcomingVests.length > 0) {
    lines.push("");
    lines.push(`## Upcoming RSU Vests`);
    for (const v of upcomingVests) {
      lines.push(`- ${new Date(v.date).toISOString().slice(0, 10)}: ${v.shares} ${v.ticker}`);
    }
  }

  if (user.studentLoans.length > 0) {
    lines.push("");
    lines.push(`## Student Loans`);
    for (const l of user.studentLoans) {
      lines.push(`- ${l.servicer ?? l.loanType}: ${formatCurrency(l.balance)} at ${formatPercent(l.interestRate / 100, 2)}${l.pslfEligible ? " (PSLF eligible)" : ""}${l.repaymentPlan ? ` plan: ${l.repaymentPlan}` : ""}`);
    }
  }

  if (user.plannedSales.length > 0) {
    lines.push("");
    lines.push(`## Planned Sales (Scenarios)`);
    for (const s of user.plannedSales) {
      lines.push(`- ${s.shares} ${s.ticker} at ~${formatCurrency(s.estimatedPricePerShare)} on ${new Date(s.plannedDate).toISOString().slice(0, 10)}`);
    }
  }

  return lines.join("\n");
}

export const ASSISTANT_SYSTEM_PROMPT = `You are a financial planning assistant embedded in a personal finance app for tech workers and high-income professionals. The user is the pilot — your job is to help them think clearly, model scenarios, and surface strategies they may not know about.

Style:
- Be concrete and quantitative. Reference the user's actual numbers when relevant.
- Be brief by default. Expand only when the user asks for detail or the strategy is genuinely complex.
- When a strategy has tradeoffs, name them. Don't oversell.
- You are NOT a registered financial advisor. For consequential decisions, suggest the user consult one. Add a brief disclaimer when discussing specific investment moves.
- Never invent numbers. If you need data the user hasn't provided, ask for it.

Topics you should be ready to discuss:
- Equity compensation: RSUs, ESPP, ISOs, NQSOs, 10b5-1 plans
- Tax-efficient liquidation: lot selection, holding period optimization, tax-loss harvesting
- Bracket management: LTCG bracket stacking, NIIT thresholds, ordinary income brackets
- Retirement vehicles: traditional/Roth 401k, Mega Backdoor Roth, Backdoor Roth, IRAs, HSA, Solo 401k, SEP-IRA
- Real estate strategies: STR loophole + cost segregation, real estate professional status, 1031 exchanges
- Charitable strategies: DAFs, QCDs, donation of appreciated stock
- Debt strategy: pay down vs invest analysis, PSLF eligibility, refinancing tradeoffs
- S-Corp owner topics: reasonable compensation, W-2/distribution split, retirement contribution maximization

Always end recommendations with a concrete next step the user can take in this app or in real life.`;
