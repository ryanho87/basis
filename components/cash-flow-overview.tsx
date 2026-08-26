"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

export type CashFlowMonth = { month: string; label: string; income: number; spending: number };
export type SpendingCategory = { category: string; amount: number };
export type CashFlowInsights = {
  savingsRate: number | null;
  projectedSpending: number;
  spendingVsPreviousPercent: number | null;
  spendingVsYearPercent: number | null;
  recurring: Array<{ merchant: string; amount: number }>;
  anomalies: Array<{ category: string; amount: number; baseline: number }>;
};

export function CashFlowOverview({ months, categories, insights }: { months: CashFlowMonth[]; categories: SpendingCategory[]; insights: CashFlowInsights }) {
  const totalIncome = months.reduce((sum, month) => sum + month.income, 0);
  const totalSpending = months.reduce((sum, month) => sum + month.spending, 0);
  const latest = months.at(-1);

  return (
    <section aria-labelledby="cash-flow-heading" className="space-y-4">
      <div className="grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-800 sm:grid-cols-3">
        <Metric label="Latest income" value={latest?.income ?? 0} detail={latest?.label ?? "No data"} tone="income" />
        <Metric label="Projected month-end spending" value={insights.projectedSpending} detail={[insights.spendingVsPreviousPercent === null ? null : `${Math.abs(insights.spendingVsPreviousPercent).toFixed(0)}% ${insights.spendingVsPreviousPercent > 0 ? "above" : "below"} last month`, insights.spendingVsYearPercent === null ? null : `${Math.abs(insights.spendingVsYearPercent).toFixed(0)}% ${insights.spendingVsYearPercent > 0 ? "above" : "below"} last year`].filter(Boolean).join(" · ") || latest?.label || "No data"} tone="spending" />
        <Metric label="Savings rate" value={insights.savingsRate ?? 0} detail={insights.savingsRate === null ? "Income data needed" : `${formatCurrency(totalIncome - totalSpending)} 12-month cash flow`} tone={(insights.savingsRate ?? 0) >= 0 ? "income" : "spending"} percent />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
          <div>
            <h2 id="cash-flow-heading" className="text-sm font-semibold">Income vs. spending</h2>
            <p className="mt-1 text-xs text-zinc-500">Transfers are excluded so paying a credit card does not cosplay as a second expense.</p>
          </div>
          <div className="mt-5 h-72" role="img" aria-label="Monthly income and spending bar chart">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 700, height: 288 }}>
              <BarChart data={months} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="currentColor" className="text-zinc-100 dark:text-zinc-900" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "currentColor", fontSize: 11 }} className="text-zinc-400" minTickGap={20} />
                <YAxis axisLine={false} tickLine={false} width={66} tickFormatter={(value) => formatCurrency(Number(value), { compact: true })} tick={{ fill: "currentColor", fontSize: 11 }} className="text-zinc-400" />
                <Tooltip formatter={(value, name) => [formatCurrency(Number(value)), name === "income" ? "Income" : "Spending"]} contentStyle={{ borderRadius: 8, borderColor: "rgb(228 228 231)", fontSize: 12 }} />
                <Bar dataKey="income" fill="rgb(5 150 105)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="spending" fill="rgb(244 63 94)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold">Top spending categories</h2>
          <p className="mt-1 text-xs text-zinc-500">Last 12 months, using Plaid&apos;s current labels.</p>
          <div className="mt-5 space-y-4">
            {categories.length ? categories.map((item) => {
              const max = categories[0]?.amount || 1;
              return <div key={item.category}>
                <div className="flex items-center justify-between gap-3 text-xs"><Link href={`/transactions?category=${encodeURIComponent(item.category)}`} className="truncate font-medium underline-offset-4 hover:underline" title={`Show ${item.category} transactions`}>{item.category}</Link><span className="tabular-nums text-zinc-500">{formatCurrency(item.amount)}</span></div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900"><div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.max(3, item.amount / max * 100)}%` }} /></div>
              </div>;
            }) : <p className="text-sm text-zinc-500">No spending data yet.</p>}
          </div>
        </div>
      </div>

      {(insights.recurring.length > 0 || insights.anomalies.length > 0) ? <div className="grid gap-4 lg:grid-cols-2">
        <InsightList title="Recurring bills" description="Likely monthly charges detected from timing and amount consistency" empty="No recurring charges detected yet." items={insights.recurring.map((item) => ({ label: item.merchant, value: `${formatCurrency(item.amount)}/mo` }))} />
        <InsightList title="Spending watchlist" description="Categories running materially above their recent three-month baseline" empty="Nothing unusual. Your spending has chosen peace for once." items={insights.anomalies.map((item) => ({ label: item.category, value: `${formatCurrency(item.amount)} vs ${formatCurrency(item.baseline)}` }))} />
      </div> : null}
    </section>
  );
}

function Metric({ label, value, detail, tone, percent = false }: { label: string; value: number; detail: string; tone: "income" | "spending"; percent?: boolean }) {
  return <div className="bg-white p-4 dark:bg-zinc-950 sm:p-5"><p className="text-xs font-medium text-zinc-500">{label}</p><p className={tone === "income" ? "mt-1 text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400" : "mt-1 text-xl font-semibold tabular-nums text-rose-600 dark:text-rose-400"}>{percent ? `${value.toFixed(1)}%` : formatCurrency(value)}</p><p className="mt-1 text-[11px] text-zinc-500">{detail}</p></div>;
}

function InsightList({ title, description, items, empty }: { title: string; description: string; items: Array<{ label: string; value: string }>; empty: string }) {
  return <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs text-zinc-500">{description}</p><div className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-900">{items.length ? items.map((item) => <div key={`${item.label}-${item.value}`} className="flex items-center justify-between gap-4 py-2.5 text-sm"><span className="truncate">{item.label}</span><span className="shrink-0 text-xs tabular-nums text-zinc-500">{item.value}</span></div>) : <p className="py-3 text-sm text-zinc-500">{empty}</p>}</div></section>;
}
