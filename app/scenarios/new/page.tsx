import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { isLongTermAt } from "@/lib/scenario";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createPlannedSale } from "@/app/actions/scenarios";

export const dynamic = "force-dynamic";

export default async function NewScenarioPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>;
}) {
  const { ticker } = await searchParams;
  const user = await getCurrentUser();
  const accounts = await prisma.account.findMany({
    where: { userId: user.id, type: { in: ["TAXABLE_BROKERAGE", "CRYPTO"] } },
    include: { lots: { orderBy: { acquiredAt: "asc" } } },
  });
  const lots = accounts.flatMap((a) =>
    a.lots.map((l) => ({ ...l, accountName: a.name })),
  );

  if (lots.length === 0) {
    return (
      <div>
        <PageHeader title="Plan a sale" description="Model the tax impact before you sell" />
        <PageBody>
          <EmptyState
            title="No lots to sell"
            description="Scenario modeling works on lot-level holdings in taxable brokerage or crypto accounts. Add an account with lots first."
            ctaLabel="Go to accounts"
            ctaHref="/accounts"
          />
        </PageBody>
      </div>
    );
  }

  // Step 1 — pick a ticker.
  if (!ticker) {
    const byTicker = new Map<string, { shares: number; costBasis: number; lots: number }>();
    for (const l of lots) {
      const t = byTicker.get(l.ticker) ?? { shares: 0, costBasis: 0, lots: 0 };
      t.shares += l.shares;
      t.costBasis += l.shares * l.costBasisPerShare;
      t.lots += 1;
      byTicker.set(l.ticker, t);
    }
    return (
      <div>
        <PageHeader
          title="Plan a sale"
          description="Which holding are you thinking about selling?"
        />
        <PageBody>
          <div className="grid gap-3 md:grid-cols-3">
            {[...byTicker.entries()].map(([t, agg]) => (
              <Link key={t} href={`/scenarios/new?ticker=${encodeURIComponent(t)}`} className="block">
                <Card className="hover:border-emerald-500/50 transition-colors">
                  <CardContent className="p-5">
                    <div className="text-sm font-semibold">{t}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {agg.shares.toLocaleString()} shares · {agg.lots} lot{agg.lots === 1 ? "" : "s"} ·{" "}
                      {formatCurrency(agg.costBasis, { compact: true })} basis
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </PageBody>
      </div>
    );
  }

  // Step 2 — sale details for the chosen ticker.
  const tickerLots = lots.filter((l) => l.ticker === ticker.toUpperCase());
  const totalShares = tickerLots.reduce((s, l) => s + l.shares, 0);
  const today = new Date();
  const defaultDate = today.toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title={`Plan a sale — ${ticker.toUpperCase()}`}
        description={`${totalShares.toLocaleString()} shares available across ${tickerLots.length} lot${tickerLots.length === 1 ? "" : "s"}`}
        actions={
          <Link href="/scenarios/new" className="text-sm text-zinc-500 hover:underline">
            Change ticker
          </Link>
        }
      />
      <PageBody>
        <form action={createPlannedSale} className="max-w-3xl space-y-6">
          <input type="hidden" name="ticker" value={ticker.toUpperCase()} />
          <Card>
            <CardHeader>
              <CardTitle>Sale details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="shares">Shares to sell</Label>
                  <Input
                    id="shares"
                    name="shares"
                    type="number"
                    step="0.0001"
                    max={totalShares}
                    required
                    defaultValue={totalShares}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="price">Estimated price / share</Label>
                  <Input id="price" name="price" type="number" step="0.01" required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="plannedDate">Planned date</Label>
                  <Input
                    id="plannedDate"
                    name="plannedDate"
                    type="date"
                    required
                    defaultValue={defaultDate}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="strategy">Lot selection strategy</Label>
                <Select id="strategy" name="strategy" className="mt-1" defaultValue="FIFO">
                  <option value="FIFO">FIFO — first in, first out</option>
                  <option value="HIFO">HIFO — highest cost first</option>
                  <option value="TAX_OPTIMAL">Tax-aware — long-term, highest cost first</option>
                </Select>
                <p className="mt-1 text-xs text-zinc-500">
                  Ignored if you check specific lots below.
                </p>
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" className="mt-1" placeholder="Down payment, rebalancing…" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Specific lots (optional)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-zinc-500">
                Check lots to sell from them in order, oldest first. Leave all unchecked to
                use the strategy above.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th className="py-2 pr-4" />
                      <th className="text-left py-2 pr-4">Acquired</th>
                      <th className="text-left py-2 px-4">Account</th>
                      <th className="text-right py-2 px-4">Shares</th>
                      <th className="text-right py-2 px-4">Basis / share</th>
                      <th className="text-left py-2 pl-4">Term today</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickerLots.map((l) => (
                      <tr key={l.id} className="border-b border-zinc-100 dark:border-zinc-900">
                        <td className="py-2 pr-4">
                          <input
                            type="checkbox"
                            name="lotIds"
                            value={l.id}
                            className="size-4 accent-emerald-600"
                          />
                        </td>
                        <td className="py-2 pr-4">{formatDate(l.acquiredAt)}</td>
                        <td className="py-2 px-4 text-zinc-500">{l.accountName}</td>
                        <td className="py-2 px-4 text-right tabular-nums">{l.shares.toFixed(2)}</td>
                        <td className="py-2 px-4 text-right tabular-nums">
                          {formatCurrency(l.costBasisPerShare)}
                        </td>
                        <td className="py-2 pl-4 text-xs">
                          <span className={isLongTermAt(l, today) ? "text-emerald-600" : "text-amber-600"}>
                            {isLongTermAt(l, today) ? "long-term" : "short-term"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Link
              href="/scenarios"
              className="inline-flex h-10 items-center rounded-md border border-zinc-300 dark:border-zinc-700 px-4 text-sm"
            >
              Cancel
            </Link>
            <Button type="submit">Create scenario</Button>
          </div>
        </form>
      </PageBody>
    </div>
  );
}
