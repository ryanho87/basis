import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { projectIncome } from "@/lib/finance";
import { getRsuPriceEstimates } from "@/lib/rsu-pricing";
import {
  allocateSale,
  compareStrategies,
  computeSaleImpact,
  resolveLotSelection,
  STRATEGY_LABELS,
  type SaleImpactBaseline,
} from "@/lib/scenario";
import { formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { deletePlannedSale } from "@/app/actions/scenarios";
import { Plus, AlertTriangle, Lightbulb } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ScenariosPage() {
  const user = await getCurrentUser();
  const taxYear = new Date().getFullYear();
  const data = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      plannedSales: { orderBy: { plannedDate: "asc" } },
      accounts: {
        where: { type: { in: ["TAXABLE_BROKERAGE", "CRYPTO"] } },
        include: { lots: true },
      },
      paycheckProfile: true,
      sCorpProfile: true,
      w2Snapshots: { where: { taxYear }, orderBy: { snapshotDate: "desc" }, take: 1 },
      rsuGrants: { include: { vestEvents: true } },
    },
  });
  if (!data) return null;

  const rsuPriceEstimate = await getRsuPriceEstimates(user.id, data.rsuGrants.map((grant) => grant.ticker));
  const projection = projectIncome({
    taxYear,
    paycheck: data.paycheckProfile,
    sCorp: data.sCorpProfile,
    latestW2: data.w2Snapshots[0] ?? null,
    rsuGrants: data.rsuGrants,
    rsuPriceEstimate,
  });

  const baseline: SaleImpactBaseline = {
    filingStatus: data.filingStatus,
    ordinaryIncome: projection.totalProjectedOrdinary,
    longTermGains: projection.realizedLTCG,
    pretaxDeductions: projection.estimatedPretax,
  };

  const lotsWithAccount = data.accounts.flatMap((a) =>
    a.lots.map((l) => ({ ...l, accountName: a.name })),
  );

  const evaluated = data.plannedSales.map((sale) => {
    const saleDate = new Date(sale.plannedDate);
    const tickerLots = lotsWithAccount.filter((l) => l.ticker === sale.ticker);
    const ordered = resolveLotSelection(tickerLots, sale.lotSelection, saleDate);
    const allocation = allocateSale(
      ordered,
      sale.shares,
      sale.estimatedPricePerShare,
      saleDate,
    );
    // Each sale is evaluated against the same baseline (independent scenarios);
    // the combined card below stacks them together.
    const impact = computeSaleImpact(baseline, allocation);
    const strategies = compareStrategies(
      tickerLots,
      sale.shares,
      sale.estimatedPricePerShare,
      saleDate,
      baseline,
    );
    const cheapest = strategies.reduce((min, s) =>
      s.impact.incrementalTax < min.impact.incrementalTax ? s : min,
    );
    const savingsVsCurrent = impact.incrementalTax - cheapest.impact.incrementalTax;
    return { sale, allocation, impact, cheapest, savingsVsCurrent };
  });

  // Combined impact: stack all sales into one tax computation, since gains
  // from one sale push the next into higher brackets.
  const combined = computeSaleImpact(baseline, {
    shortTermGain: evaluated.reduce((s, e) => s + e.allocation.shortTermGain, 0),
    longTermGain: evaluated.reduce((s, e) => s + e.allocation.longTermGain, 0),
    proceeds: evaluated.reduce((s, e) => s + e.allocation.proceeds, 0),
  });
  const combinedProceeds = evaluated.reduce((s, e) => s + e.allocation.proceeds, 0);

  return (
    <div>
      <PageHeader
        title="Scenarios"
        description="Model planned sales and see the tax hit before you sell"
        actions={
          <Link
            href="/scenarios/new"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Plus className="size-4" /> Plan a sale
          </Link>
        }
      />
      <PageBody>
        {data.plannedSales.length === 0 ? (
          <EmptyState
            title="No planned sales yet"
            description="Pick a holding, set a price and date, and see the short/long-term gain split, the incremental tax, and what smarter lot selection would save."
            ctaLabel="Plan a sale"
            ctaHref="/scenarios/new"
          />
        ) : (
          <div className="space-y-6">
            {evaluated.length > 1 && (
              <div className="grid gap-4 md:grid-cols-3">
                <Stat
                  label="Combined proceeds"
                  value={formatCurrency(combinedProceeds, { compact: true })}
                  hint={`${evaluated.length} planned sales`}
                />
                <Stat
                  label="Combined incremental tax"
                  tone={combined.incrementalTax > 0 ? "warning" : "default"}
                  value={formatCurrency(combined.incrementalTax, { compact: true })}
                  hint="All sales stacked in one tax year"
                />
                <Stat
                  label="Combined after-tax proceeds"
                  value={formatCurrency(combined.afterTaxProceeds, { compact: true })}
                />
              </div>
            )}

            {evaluated.map(({ sale, allocation, impact, cheapest, savingsVsCurrent }) => (
              <Card key={sale.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base text-zinc-900 dark:text-zinc-100">
                        Sell {sale.shares.toLocaleString()} {sale.ticker} at ~
                        {formatCurrency(sale.estimatedPricePerShare)}
                      </CardTitle>
                      <div className="mt-1 text-xs text-zinc-500">
                        {formatDate(sale.plannedDate)} ·{" "}
                        {sale.lotSelection ? "specific lots" : "FIFO"}
                        {sale.notes ? ` · ${sale.notes}` : ""}
                      </div>
                    </div>
                    <form action={async () => { "use server"; await deletePlannedSale(sale.id); }}>
                      <button className="text-xs text-zinc-400 hover:text-red-500">Delete</button>
                    </form>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-4 mb-4">
                    <MiniStat label="Proceeds" value={formatCurrency(allocation.proceeds)} />
                    <MiniStat
                      label="Gain (ST / LT)"
                      value={`${formatCurrency(allocation.shortTermGain)} / ${formatCurrency(allocation.longTermGain)}`}
                    />
                    <MiniStat
                      label="Incremental tax"
                      value={formatCurrency(impact.incrementalTax)}
                      sub={
                        allocation.totalGain > 0
                          ? `${formatPercent(impact.effectiveRateOnGain)} of gain`
                          : undefined
                      }
                    />
                    <MiniStat
                      label="After-tax proceeds"
                      value={formatCurrency(impact.afterTaxProceeds)}
                      emphasize
                    />
                  </div>

                  {allocation.unfilledShares > 0 && (
                    <Warning>
                      Only {allocation.sharesFilled.toLocaleString()} of{" "}
                      {allocation.sharesRequested.toLocaleString()} shares are covered by
                      tracked lots — add lots or reduce the sale size.
                    </Warning>
                  )}
                  {impact.crossesNiit && (
                    <Warning>
                      This sale pushes you over the{" "}
                      {formatCurrency(impact.withSale.thresholds.niit)} NIIT threshold —
                      investment income above it pays an extra 3.8%.
                    </Warning>
                  )}
                  {savingsVsCurrent > 100 && (
                    <div className="mb-3 flex items-start gap-2 rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-sm">
                      <Lightbulb className="size-4 text-emerald-600 mt-0.5 shrink-0" />
                      <span>
                        Selling {STRATEGY_LABELS[cheapest.strategy].toLowerCase()} instead
                        would save about{" "}
                        <span className="font-medium">{formatCurrency(savingsVsCurrent)}</span>{" "}
                        in tax on this sale.
                      </span>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-zinc-500">
                        <tr className="border-b border-zinc-200 dark:border-zinc-800">
                          <th className="text-left py-2 pr-4">Lot acquired</th>
                          <th className="text-left py-2 px-4">Account</th>
                          <th className="text-right py-2 px-4">Shares sold</th>
                          <th className="text-right py-2 px-4">Basis / share</th>
                          <th className="text-right py-2 px-4">Gain</th>
                          <th className="text-left py-2 pl-4">Term at sale</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allocation.allocations.map((a) => (
                          <tr
                            key={a.lot.id}
                            className="border-b border-zinc-100 dark:border-zinc-900"
                          >
                            <td className="py-2 pr-4">{formatDate(a.lot.acquiredAt)}</td>
                            <td className="py-2 px-4 text-zinc-500">{a.lot.accountName}</td>
                            <td className="py-2 px-4 text-right tabular-nums">
                              {a.sharesSold.toFixed(2)}
                            </td>
                            <td className="py-2 px-4 text-right tabular-nums">
                              {formatCurrency(a.lot.costBasisPerShare)}
                            </td>
                            <td
                              className={`py-2 px-4 text-right tabular-nums ${a.gain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                            >
                              {formatCurrency(a.gain)}
                            </td>
                            <td className="py-2 pl-4 text-xs">
                              <span
                                className={
                                  a.isLongTermAtSale ? "text-emerald-600" : "text-amber-600"
                                }
                              >
                                {a.isLongTermAtSale ? "long-term" : "short-term"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </PageBody>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
  emphasize,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasize?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div
        className={`mt-0.5 tabular-nums ${emphasize ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-medium"}`}
      >
        {value}
      </div>
      {sub ? <div className="text-[11px] text-zinc-400">{sub}</div> : null}
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm">
      <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
