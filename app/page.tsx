import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { computeNetWorth, projectIncome } from "@/lib/finance";
import { computeTax } from "@/lib/tax";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ArrowRight, AlertTriangle, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
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
      w2Snapshots: { orderBy: { snapshotDate: "desc" }, take: 1 },
      strategySuggestions: { where: { status: "NEW" }, take: 5 },
    },
  });
  if (!data) return null;

  const onboarded = !!data.onboardedAt;
  const hasAnyData =
    data.accounts.length > 0 ||
    data.manualAssets.length > 0 ||
    data.rsuGrants.length > 0;

  const nw = computeNetWorth({
    accounts: data.accounts,
    manualAssets: data.manualAssets,
    liabilities: data.liabilities,
    studentLoans: data.studentLoans,
    filingStatus: data.filingStatus,
  });

  const projection = projectIncome({
    taxYear: new Date().getFullYear(),
    paycheck: data.paycheckProfile,
    sCorp: data.sCorpProfile,
    latestW2: data.w2Snapshots[0] ?? null,
    rsuGrants: data.rsuGrants,
  });

  const tax = computeTax({
    filingStatus: data.filingStatus,
    ordinaryIncome: projection.totalProjectedOrdinary,
    longTermGains: projection.realizedLTCG,
    pretaxDeductions: projection.estimatedPretax,
  });

  const taxImplied = nw.netWorth - nw.afterTaxNetWorth;

  return (
    <div>
      <PageHeader
        title={`Welcome${data.name ? ", " + data.name : ""}`}
        description="Your unified financial picture"
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
              title="Let's get you set up"
              description="Start with onboarding — the assistant will ask about your situation and recommend a profile. Or jump straight to adding accounts."
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
              <Link href="/equity" className="block">
                <Card className="hover:border-emerald-500/50 transition-colors">
                  <CardContent className="p-5">
                    <div className="text-sm font-medium">Add RSU grants</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Track vesting & cost basis
                    </div>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/tax" className="block">
                <Card className="hover:border-emerald-500/50 transition-colors">
                  <CardContent className="p-5">
                    <div className="text-sm font-medium">Set up income profile</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Project this year's tax bill
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Stat
                label="Net Worth"
                value={formatCurrency(nw.netWorth, { compact: true })}
                hint={`${formatCurrency(nw.totalAssets, { compact: true })} assets · ${formatCurrency(nw.totalLiabilities, { compact: true })} liab.`}
              />
              <Stat
                label="After-Tax Net Worth"
                tone={taxImplied > 0 ? "warning" : "default"}
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
                      <Row label="S-Corp distribution" value={formatCurrency(projection.projectedSCorpDistribution)} />
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
                      You're {formatCurrency(tax.bracketRoom.niitOver)} over the {formatCurrency(tax.thresholds.niit)} NIIT threshold. Investment income above this point pays an additional 3.8% on top of LTCG/dividends.
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
