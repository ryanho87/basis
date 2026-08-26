import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { projectIncome } from "@/lib/finance";
import { getRsuPriceEstimates } from "@/lib/rsu-pricing";
import { computeTax } from "@/lib/tax";
import { calculateUnifiedNetWorth } from "@/lib/net-worth";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { ArrowRight, AlertTriangle, Sparkles } from "lucide-react";
import { NetWorthHistory } from "@/components/net-worth-history";
import { derivePersona } from "@/lib/profile-capabilities";
import { buildPhysicianMoneyPlan } from "@/lib/physician-planning";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const taxYear = new Date().getFullYear();
  const data = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      accounts: { include: { lots: true, positions: true } },
      manualAssets: true,
      liabilities: true,
      studentLoans: true,
      rsuGrants: { include: { vestEvents: true } },
      paycheckProfile: true,
      sCorpProfile: true,
      w2Snapshots: { where: { taxYear }, orderBy: { snapshotDate: "desc" }, take: 1 },
      strategySuggestions: { where: { status: "NEW" }, take: 5 },
    },
  });
  if (!data) return null;

  const onboarded = !!data.onboardedAt;
  const persona = derivePersona(data.primaryPersona, data.profileType);
  const physicianMode = persona === "PHYSICIAN";
  const nw = await calculateUnifiedNetWorth(user.id);
  const hasAnyData =
    nw.connectedAccountsCount > 0 ||
    data.accounts.length > 0 ||
    data.manualAssets.length > 0 ||
    data.rsuGrants.length > 0;

  const rsuPriceEstimate = await getRsuPriceEstimates(user.id, data.rsuGrants.map((grant) => grant.ticker));
  const projection = projectIncome({
    taxYear,
    paycheck: data.paycheckProfile,
    sCorp: data.sCorpProfile,
    latestW2: data.w2Snapshots[0] ?? null,
    rsuGrants: data.rsuGrants,
    rsuPriceEstimate,
  });

  const tax = computeTax({
    taxYear,
    filingStatus: data.filingStatus,
    ordinaryIncome: projection.totalProjectedOrdinary,
    longTermGains: projection.realizedLTCG,
    pretaxDeductions: projection.estimatedPretax,
  });

  const taxImplied = nw.estimatedTaxLiability;
  const physicianPlan = physicianMode && data.sCorpProfile
    ? buildPhysicianMoneyPlan({
        taxYear,
        annualRevenue: data.sCorpProfile.annualRevenue,
        operatingExpenses: data.sCorpProfile.operatingExpenses,
        ownerW2Salary: data.sCorpProfile.w2SalaryFromCorp,
        plannedRetirementContribution: data.sCorpProfile.solo401kContribution,
        plannedCashDistribution: data.sCorpProfile.projectedDistribution,
      })
    : null;
  const physicianFederalReserve = Math.max(0, tax.totalTax - (data.w2Snapshots[0]?.ytdFederalWithheld ?? 0));

  return (
    <div>
      <PageHeader
        title={`Welcome${data.name ? ", " + data.name : ""}`}
        description={physicianMode ? "Personal wealth and practice cash flow, without the spreadsheet residency" : "Your unified financial picture"}
        actions={
          !onboarded ? (
            <Link
              href="/onboarding"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <Sparkles className="size-4" /> Start onboarding
            </Link>
          ) : null
        }
      />
      <PageBody>
        {!hasAnyData ? (
          <div className="space-y-6">
            <EmptyState
              title="Let’s get you set up"
              description={physicianMode
                ? "Connect personal and practice accounts, then add payroll and expected clinical income. Basis will turn the mess into a money plan."
                : "Start with onboarding. The assistant will ask about your situation and recommend a profile. Or jump straight to adding accounts."}
              ctaLabel="Start onboarding"
              ctaHref="/onboarding"
            />
            <div className="grid gap-3 md:grid-cols-3">
              <Link href="/accounts" className="block">
                <Card className="hover:border-emerald-500/50 transition-colors">
                  <CardContent className="p-5">
                    <div className="text-sm font-medium">Add accounts manually</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Brokerage, 401k, crypto, real estate
                    </div>
                  </CardContent>
                </Card>
              </Link>
              <Link href={physicianMode ? "/tax#income-snapshot" : "/equity"} className="block">
                <Card className="hover:border-emerald-500/50 transition-colors">
                  <CardContent className="p-5">
                    <div className="text-sm font-medium">{physicianMode ? "Import a Gusto pay stub" : "Add RSU grants"}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {physicianMode ? "Use current payroll and withholding" : "Track vesting and cost basis"}
                    </div>
                  </CardContent>
                </Card>
              </Link>
              <Link href={physicianMode ? "/tax#s-corp-profile" : "/tax"} className="block">
                <Card className="hover:border-emerald-500/50 transition-colors">
                  <CardContent className="p-5">
                    <div className="text-sm font-medium">{physicianMode ? "Add practice income" : "Set up income profile"}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {physicianMode ? "Revenue, expenses, payroll, retirement" : "Project this year’s tax bill"}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <Suspense fallback={<NetWorthHistoryFallback />}>
              <DashboardNetWorthHistory userId={user.id} basisCoverage={nw.basisCoverage} />
            </Suspense>

            <div className="grid gap-4 md:grid-cols-3">
              <Stat
                label="Gross net worth"
                value={formatCurrency(nw.netWorth, { compact: true })}
                hint={`${formatCurrency(nw.totalAssets, { compact: true })} assets · ${formatCurrency(nw.totalLiabilities, { compact: true })} liab.`}
              />
              <Stat
                label="Estimated after-tax net worth"
                value={formatCurrency(nw.afterTaxNetWorth, { compact: true })}
                hint={
                  taxImplied > 0
                    ? `${formatCurrency(taxImplied, { compact: true })} of implied taxes`
                    : "No taxable gains yet"
                }
              />
              <Stat
                label={`${new Date().getFullYear()} Projected Tax`}
                value={formatCurrency(tax.totalTax, { compact: true })}
                hint={`${formatPercent(tax.effectiveRate)} effective · ${formatPercent(tax.marginalOrdinaryRate)} marginal`}
              />
            </div>

            {physicianMode ? (
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">Practice money plan</p>
                      {physicianPlan ? (
                        <>
                          <p className="mt-2 text-xl font-semibold tracking-tight">
                            {formatCurrency(physicianPlan.estimatedCashBeforeOwnerDistribution - physicianFederalReserve, { compact: true })} estimated after known commitments
                          </p>
                          <p className="mt-2 max-w-[70ch] text-sm leading-6 text-zinc-500">
                            Includes operating costs, owner payroll, employer payroll taxes, retirement, and estimated federal income tax before payments already made.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="mt-2 text-lg font-semibold">Add practice income to unlock your allocation</p>
                          <p className="mt-2 text-sm text-zinc-500">Basis needs revenue, expenses, and owner payroll before it starts bossing your cash around.</p>
                        </>
                      )}
                    </div>
                    <Link href={physicianPlan ? "/plan" : "/tax#s-corp-profile"} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                      {physicianPlan ? "Review money plan" : "Add practice income"} <ArrowRight className="size-4" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Asset Mix</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2.5">
                    <CategoryRow label="Cash" value={nw.byCategory.cash} total={nw.totalAssets} />
                    <CategoryRow label="Taxable investments" value={nw.byCategory.taxableInvestments} total={nw.totalAssets} />
                    <CategoryRow label="Retirement" value={nw.byCategory.retirement} total={nw.totalAssets} />
                    <CategoryRow label="Crypto" value={nw.byCategory.crypto} total={nw.totalAssets} />
                    <CategoryRow label="Real estate" value={nw.byCategory.realEstate} total={nw.totalAssets} />
                    <CategoryRow label="Other" value={nw.byCategory.other} total={nw.totalAssets} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{new Date().getFullYear()} Income Projection</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <Row label="YTD W-2" value={formatCurrency(projection.ytdW2)} />
                    <Row label="Projected remaining W-2" value={formatCurrency(projection.remainingW2)} />
                    <Row label="Projected bonus" value={formatCurrency(projection.projectedBonus)} />
                    <Row label="YTD RSU vest income" value={formatCurrency(projection.ytdRsuVestIncome)} />
                    <Row label="Upcoming RSU income" value={formatCurrency(projection.upcomingRsuIncome)} />
                    {projection.projectedSCorpDistribution > 0 && (
                      <Row label="Planned cash distribution" value={formatCurrency(projection.projectedSCorpDistribution)} />
                    )}
                    {projection.projectedSCorpPassThrough > 0 && (
                      <Row label="S-Corp pass-through income" value={formatCurrency(projection.projectedSCorpPassThrough)} />
                    )}
                    <div className="border-t border-zinc-200 dark:border-zinc-800 pt-2 mt-2 flex justify-between font-medium">
                      <span>Total projected ordinary</span>
                      <span className="tabular-nums">{formatCurrency(projection.totalProjectedOrdinary)}</span>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Link
                      href="/tax"
                      className="text-xs text-emerald-600 hover:underline inline-flex items-center gap-1"
                    >
                      Tax projection details <ArrowRight className="size-3" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>

            {data.strategySuggestions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="size-4 text-emerald-500" />
                    Strategies for you
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {data.strategySuggestions.map((s) => (
                      <Link
                        key={s.id}
                        href={`/strategies#${s.id}`}
                        className="block rounded-md border border-zinc-200 dark:border-zinc-800 p-3 hover:border-emerald-500/50"
                      >
                        <div className="text-sm font-medium">{s.title}</div>
                        <div className="mt-1 text-xs text-zinc-500">{s.summary}</div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {tax.bracketRoom.niitOver > 0 && (
              <Card className="border-amber-300 dark:border-amber-700">
                <CardContent className="p-4 flex items-start gap-3">
                  <AlertTriangle className="size-5 text-amber-500 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium">NIIT threshold crossed</div>
                    <div className="mt-1 text-zinc-600 dark:text-zinc-400">
                      You’re {formatCurrency(tax.bracketRoom.niitOver)} over the {formatCurrency(tax.thresholds.niit)} NIIT threshold. Investment income above this point pays an additional 3.8% on top of LTCG/dividends.
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </PageBody>
    </div>
  );
}

async function DashboardNetWorthHistory({ userId, basisCoverage }: { userId: string; basisCoverage: number | null }) {
  const snapshotRows = await prisma.netWorthSnapshot.findMany({
    where: { userId },
    select: { dateKey: true, netWorth: true, afterTaxNetWorth: true },
    orderBy: { capturedAt: "desc" },
    take: 365,
  });
  return <NetWorthHistory points={snapshotRows.reverse()} basisCoverage={basisCoverage} />;
}

function NetWorthHistoryFallback() {
  return (
    <div aria-label="Loading net worth history" className="h-80 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40" />
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function CategoryRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? value / total : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
        <span className="tabular-nums">
          {formatCurrency(value, { compact: true })}{" "}
          <span className="text-zinc-400">{formatPercent(pct)}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full"
          style={{ width: `${Math.min(100, pct * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}
