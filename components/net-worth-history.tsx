"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatPercent } from "@/lib/utils";

type NetWorthPoint = {
  dateKey: string;
  netWorth: number;
  afterTaxNetWorth: number;
};

function shortDate(dateKey: string) {
  const day = dateKey.split(":", 1)[0];
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(`${day}T12:00:00`),
  );
}

function snapshotLabel(dateKey: string) {
  const date = shortDate(dateKey);
  if (dateKey.endsWith(":morning")) return `${date} · 6 AM Pacific`;
  if (dateKey.endsWith(":market-close")) return `${date} · Market close`;
  return date;
}

export function NetWorthHistory({
  points,
  basisCoverage,
}: {
  points: NetWorthPoint[];
  basisCoverage: number | null;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-900 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Net worth over time</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Scheduled at 6 AM Pacific and the U.S. market close, plus manual refreshes.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full bg-zinc-800 dark:bg-zinc-200" aria-hidden="true" />
            Gross
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-600" aria-hidden="true" />
            Estimated after-tax
          </span>
        </div>
      </div>

      <div
        className="h-72 px-2 pb-2 pt-5 sm:px-4"
        role="img"
        aria-label="Line chart comparing gross and estimated after-tax net worth over time"
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 700, height: 288 }}
        >
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="currentColor" className="text-zinc-100 dark:text-zinc-900" />
            <XAxis
              dataKey="dateKey"
              axisLine={false}
              tickLine={false}
              tickFormatter={shortDate}
              minTickGap={32}
              tick={{ fill: "currentColor", fontSize: 11 }}
              className="text-zinc-400"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              domain={["auto", "auto"]}
              width={68}
              tickFormatter={(value) => formatCurrency(Number(value), { compact: true })}
              tick={{ fill: "currentColor", fontSize: 11 }}
              className="text-zinc-400"
            />
            <Tooltip
              labelFormatter={(label) => snapshotLabel(String(label))}
              formatter={(value, name) => [
                formatCurrency(Number(value)),
                name === "netWorth" ? "Gross net worth" : "Estimated after-tax",
              ]}
              contentStyle={{
                borderRadius: 8,
                borderColor: "rgb(228 228 231)",
                fontSize: 12,
                boxShadow: "0 8px 24px rgb(0 0 0 / 0.08)",
              }}
            />
            <Line
              type="monotone"
              dataKey="netWorth"
              stroke="currentColor"
              className="text-zinc-800 dark:text-zinc-200"
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: "currentColor" }}
              activeDot={{ r: 4, strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="afterTaxNetWorth"
              stroke="rgb(5 150 105)"
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: "rgb(5 150 105)" }}
              activeDot={{ r: 4, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-col gap-1 border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500 dark:border-zinc-900 dark:text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {points.length === 1
            ? "History starts today. Time travel remains outside the Plaid trial plan."
            : `${points.length} snapshots recorded.`}
        </span>
        <span>
          {basisCoverage === null
            ? "No taxable positions require basis yet"
            : `${formatPercent(basisCoverage)} of taxable holdings have usable basis`}
        </span>
      </div>
    </section>
  );
}
