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
    stateCode: data.state,
    wages: projection.projectedWages,
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
  const physicianFederalReserve =
    Math.max(0, tax.totalTax - (data.w2Snapshots[0]?.ytdFederalWithheld ?? 0)) +
    (tax.state ? Math.max(0, tax.state.totalTax - (data.w2Snapshots[0]?.ytdStateWithheld ?? 0)) : 0);

  return (
    <div>
      <PageHeader
        title="Home"
        description={`${data.name ? `Hi, ${data.name}. ` : ""}See where you stand and choose what to do next.`}
        actions={
          !onboarded ? (
            <Link
              href="/onboarding"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <Sparkles className="size-4" /> Set up your profile
            </Link>
          ) : null
        }
      />
      <PageBody>
        {!hasAnyData ? (
          <EmptyState
            title="Start with your accounts"
            description="Connect a bank or add an account manually. Once your balances are here, you can explore your spending and build a money plan."
            ctaLabel="Add your first account"
            ctaHref="/accounts"
          />
        ) : (
          <div className="space-y-6">
            <nav aria-label="What would you like to do?" className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800 sm:flex sm:divide-x sm:divide-y-0">
              {[
                { href: "/accounts", label: "Check my accounts", detail: "Balances, investments, and debts" },
                { href: "/transactions", label: "Understand my spending", detail: "Money coming in and going out" },
                { href: "/plan", label: "Plan my money", detail: "Savings, bills, and what's left" },
              ].map((item) => (
                <Link key={item.href} href={item.href} className="group flex min-h-20 flex-1 items-center justify-between gap-3 px-3 py-4 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-zinc-900 sm:px-4">
                  <span><span className="block text-sm font-medium">{item.label}</span><span className="mt-1 block text-xs text-zinc-500">{item.detail}</span></span>
                  <ArrowRight className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
                </Link>
              ))}
            </nav>

            <div className="grid gap-4 sm:grid-cols-2">
              <Stat
                label="Net worth"
                value={formatCurrency(nw.netWorth, { compact: true })}
                hint={`${formatCurrency(nw.totalAssets, { compact: true })} assets · ${formatCurrency(nw.totalLiabilities, { compact: true })} debts`}
              />
              <Stat
                label="Estimated after-tax net worth"
                value={formatCurrency(nw.afterTaxNetWorth, { compact: true })}
                hint={
                  taxImplied > 0
                    ? `${formatCurrency(taxImplied, { compact: true })} estimated taxes on assets`
                    : "Based on the account data currently available"
                }
              />

            </div>

            <Suspense fallback={<NetWorthHistoryFallback />}>
              <DashboardNetWorthHistory userId={user.id} basisCoverage={nw.basisCoverage} />
            </Suspense>

            <details className="border-t border-zinc-200 pt-5 dark:border-zinc-800">
              <summary className="cursor-pointer rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">Investments, income & tax details</summary>
              <p className="mt-2 text-sm text-zinc-500">Explore your asset mix, projected income, and estimated taxes when you need a closer look.</p>
              <div className="mt-5 space-y-6">
                  <Stat
                    label={`${new Date().getFullYear()} Projected Tax`}
                    value={formatCurrency(tax.totalTaxWithState, { compact: true })}
                    hint={tax.state
                      ? `Federal + ${tax.state.stateCode} · ${formatPercent(tax.effectiveRateWithState)} effective · ${formatPercent(tax.combinedMarginalOrdinaryRate)} marginal`
                      : `Federal only · ${formatPercent(tax.effectiveRate)} effective · ${formatPercent(tax.marginalOrdinaryRate)} marginal`}
                  />

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
                              <p className="mt-2 text-sm text-zinc-500">Add expected revenue, business expenses, and your salary to see how much is available.</p>
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
                      <CardTitle>Where your money is</CardTitle>
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
                      <CardTitle>{new Date().getFullYear()} Expected income</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <Row label="Wages earned so far" value={formatCurrency(projection.ytdW2)} />
                        <Row label="Expected remaining wages" value={formatCurrency(projection.remainingW2)} />
                        <Row label="Projected bonus" value={formatCurrency(projection.projectedBonus)} />
                        <Row label="Stock grants vested this year" value={formatCurrency(projection.ytdRsuVestIncome)} />
                        <Row label="Expected future stock vesting" value={formatCurrency(projection.upcomingRsuIncome)} />
                        {projection.projectedSCorpDistribution > 0 && (
                          <Row label="Planned cash distribution" value={formatCurrency(projection.projectedSCorpDistribution)} />
                        )}
                        {projection.projectedSCorpPassThrough > 0 && (
                          <Row label="S-Corp pass-through income" value={formatCurrency(projection.projectedSCorpPassThrough)} />
                        )}
                        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-2 mt-2 flex justify-between font-medium">
                          <span>Total expected ordinary income</span>
                          <span className="tabular-nums">{formatCurrency(projection.totalProjectedOrdinary)}</span>
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <Link
                          href="/tax"
                          className="text-xs text-emerald-600 hover:underline inline-flex items-center gap-1"
                        >
                          Review income & taxes <ArrowRight className="size-3" />
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
                        <div className="font-medium">Additional investment tax may apply</div>
                        <div className="mt-1 text-zinc-600 dark:text-zinc-400">
                          Your projected income is above the {formatCurrency(tax.thresholds.niit)} threshold for the net investment income tax (NIIT). Some investment income may be subject to an additional 3.8% tax.
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </details>
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
