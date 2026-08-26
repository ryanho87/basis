import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { markVestVested, deleteRsuGrant } from "@/app/actions/equity";
import { Input, Select } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default async function EquityPage() {
  const user = await getCurrentUser();
  const grants = await prisma.rsuGrant.findMany({
    where: { userId: user.id },
    include: { vestEvents: { orderBy: { vestDate: "asc" } } },
    orderBy: { grantDate: "desc" },
  });

  const taxableAccounts = await prisma.account.findMany({
    where: { userId: user.id, type: { in: ["TAXABLE_BROKERAGE", "CRYPTO"] } },
    orderBy: { name: "asc" },
  });

  // Aggregate vested lots from RSUs (those with linked AssetLots).
  const vestedLots = await prisma.assetLot.findMany({
    where: {
      acquisitionType: "RSU_VEST",
      account: { userId: user.id },
    },
    include: { account: true },
    orderBy: { acquiredAt: "desc" },
  });

  const totalVestedValue = vestedLots.reduce((s, l) => s + l.shares * l.costBasisPerShare, 0);
  const upcomingShares = grants.flatMap((g) =>
    g.vestEvents.filter((v) => v.status === "PENDING" && new Date(v.vestDate) >= new Date()),
  );
  const upcomingCount = upcomingShares.reduce((s, v) => s + v.shares, 0);

  return (
    <div>
      <PageHeader
        title="Equity & RSUs"
        description="Track grants, vesting, and cost basis"
        actions={
          <Link
            href="/equity/new"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Plus className="size-4" /> Add grant
          </Link>
        }
      />
      <PageBody>
        {grants.length === 0 ? (
          <EmptyState
            title="No RSU grants yet"
            description="Add your first RSU grant. We'll generate the vest schedule and let you mark each vest with the FMV to lock cost basis."
            ctaLabel="Add grant"
            ctaHref="/equity/new"
          />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="p-5">
                  <div className="text-xs text-zinc-500">Total grants</div>
                  <div className="text-2xl font-semibold mt-1 tabular-nums">{grants.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="text-xs text-zinc-500">Vested value (at FMV-at-vest)</div>
                  <div className="text-2xl font-semibold mt-1 tabular-nums">{formatCurrency(totalVestedValue, { compact: true })}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="text-xs text-zinc-500">Upcoming vests (shares)</div>
                  <div className="text-2xl font-semibold mt-1 tabular-nums">{upcomingCount.toFixed(0)}</div>
                </CardContent>
              </Card>
            </div>

            {grants.map((g) => {
              const vested = g.vestEvents.filter((v) => v.status === "VESTED");
              const vestedShares = vested.reduce((s, v) => s + v.shares, 0);
              const pct = g.totalShares > 0 ? vestedShares / g.totalShares : 0;
              return (
                <Card key={g.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base text-zinc-900 dark:text-zinc-100">
                          {g.ticker}
                          {g.company ? <span className="text-zinc-500 font-normal"> · {g.company}</span> : null}
                        </CardTitle>
                        <div className="mt-1 text-xs text-zinc-500">
                          Granted {formatDate(g.grantDate)} · {g.totalShares} shares · {formatPercent(pct)} vested
                        </div>
                      </div>
                      <form action={async () => { "use server"; await deleteRsuGrant(g.id); }}>
                        <button className="text-xs text-zinc-400 hover:text-red-500">Delete</button>
                      </form>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${(pct * 100).toFixed(1)}%` }} />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-zinc-500">
                          <tr className="border-b border-zinc-200 dark:border-zinc-800">
                            <th className="text-left py-2 pr-4">Vest date</th>
                            <th className="text-right py-2 px-4">Shares</th>
                            <th className="text-right py-2 px-4">FMV at vest</th>
                            <th className="text-left py-2 px-4">Status</th>
                            <th className="text-right py-2 px-4">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.vestEvents.map((v) => (
                            <tr key={v.id} className="border-b border-zinc-100 dark:border-zinc-900 align-middle">
                              <td className="py-2 pr-4">{formatDate(v.vestDate)}</td>
                              <td className="py-2 px-4 text-right tabular-nums">{v.shares.toFixed(2)}</td>
                              <td className="py-2 px-4 text-right tabular-nums">
                                {v.fmvAtVest != null ? formatCurrency(v.fmvAtVest) : "—"}
                              </td>
                              <td className="py-2 px-4 text-xs">
                                <span className={
                                  v.status === "VESTED"
                                    ? "text-emerald-600"
                                    : v.status === "CANCELED"
                                    ? "text-zinc-400"
                                    : "text-amber-600"
                                }>
                                  {v.status.toLowerCase()}
                                </span>
                              </td>
                              <td className="py-2 px-4 text-right">
                                {v.status === "PENDING" && (
                                  <form
                                    action={async (fd) => { "use server"; await markVestVested(v.id, fd); }}
                                    className="inline-flex items-center gap-1"
                                  >
                                    <Input
                                      name="fmv"
                                      placeholder="FMV"
                                      type="number"
                                      step="0.01"
                                      className="h-8 w-20 text-xs"
                                    />
                                    <Select name="accountId" className="h-8 w-32 text-xs">
                                      <option value="">No lot</option>
                                      {taxableAccounts.map((a) => (
                                        <option key={a.id} value={a.id}>{a.name}</option>
                                      ))}
                                    </Select>
                                    <Button size="sm" type="submit">Vest</Button>
                                  </form>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </PageBody>
    </div>
  );
}
