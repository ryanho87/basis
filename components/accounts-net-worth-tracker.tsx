"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { NetWorthAccountBreakdown, type AccountBreakdownRow } from "@/components/net-worth-account-breakdown";
import { formatCurrency } from "@/lib/utils";

type AggregatePoint = { snapshotKey: string; capturedAt: string; value: number };
type AccountPoint = { snapshotKey: string; capturedAt: string; accountKey: string; value: number };

function pointLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric" }).format(new Date(value));
}

export function AccountsNetWorthTracker({ rows, netWorth, totalAssets, totalLiabilities, aggregatePoints, accountPoints }: { rows: AccountBreakdownRow[]; netWorth: number; totalAssets: number; totalLiabilities: number; aggregatePoints: AggregatePoint[]; accountPoints: AccountPoint[] }) {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const selected = rows.find((row) => row.id === selectedAccountId) ?? null;
  const points = useMemo(() => selectedAccountId
    ? accountPoints.filter((point) => point.accountKey === selectedAccountId).map((point) => ({ ...point, chartValue: point.value }))
    : aggregatePoints.map((point) => ({ ...point, chartValue: point.value })), [accountPoints, aggregatePoints, selectedAccountId]);

  return <div className="space-y-5">
    <section aria-labelledby="accounts-net-worth-history" className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <header className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-900 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 id="accounts-net-worth-history" className="text-sm font-semibold">{selected ? `${selected.name} over time` : "Net worth over time"}</h2><p className="mt-1 text-xs text-zinc-500">{selected ? `${selected.institution} · click the selected account again to restore overall net worth` : "Click any account below to isolate its history."}</p></div>
        <label className="sm:hidden"><span className="sr-only">Chart account</span><select value={selectedAccountId ?? ""} onChange={(event) => setSelectedAccountId(event.target.value || null)} className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"><option value="">Overall net worth</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      </header>
      <div className="h-72 px-2 pb-2 pt-5 sm:px-4" role="img" aria-label={`${selected?.name ?? "Net worth"} history chart`}>
        {points.length ? <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 700, height: 288 }}><LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 4 }}><CartesianGrid vertical={false} stroke="currentColor" className="text-zinc-100 dark:text-zinc-900" /><XAxis dataKey="capturedAt" axisLine={false} tickLine={false} tickFormatter={pointLabel} minTickGap={36} tick={{ fill: "currentColor", fontSize: 11 }} className="text-zinc-400" /><YAxis axisLine={false} tickLine={false} width={68} tickFormatter={(value) => formatCurrency(Number(value), { compact: true })} tick={{ fill: "currentColor", fontSize: 11 }} className="text-zinc-400" /><Tooltip labelFormatter={(label) => pointLabel(String(label))} formatter={(value) => [formatCurrency(Number(value)), selected?.kind === "liability" ? "Balance" : selected ? "Account value" : "Net worth"]} contentStyle={{ borderRadius: 8, borderColor: "rgb(228 228 231)", fontSize: 12, boxShadow: "0 8px 24px rgb(0 0 0 / 0.08)" }} /><Line type="monotone" dataKey="chartValue" stroke="rgb(5 150 105)" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: "rgb(5 150 105)" }} activeDot={{ r: 4, strokeWidth: 2 }} /></LineChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-zinc-500">History begins with the next snapshot. Even Basis cannot bully Plaid into inventing yesterday.</div>}
      </div>
      <div className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500 dark:border-zinc-900">Snapshots run at 6 AM Pacific and U.S. market close, plus manual syncs.</div>
    </section>
    <NetWorthAccountBreakdown rows={rows} netWorth={netWorth} totalAssets={totalAssets} totalLiabilities={totalLiabilities} selectedAccountId={selectedAccountId} onSelectAccount={setSelectedAccountId} />
  </div>;
}
