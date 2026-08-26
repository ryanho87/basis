"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export type TransactionRow = {
  id: string; date: string; name: string; merchantName: string | null; amount: number;
  pending: boolean; category: string | null; accountName: string; accountMask: string | null; institutionName: string | null;
};

export function TransactionFeed({ transactions }: { transactions: TransactionRow[] }) {
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState("all");
  const accounts = useMemo(() => [...new Set(transactions.map((row) => row.accountName))].sort(), [transactions]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return transactions.filter((row) => (account === "all" || row.accountName === account) && (!normalized || [row.name, row.merchantName, row.category, row.institutionName].some((value) => value?.toLowerCase().includes(normalized))));
  }, [account, query, transactions]);

  return <section aria-labelledby="transactions-heading" className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
    <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 id="transactions-heading" className="text-sm font-semibold">All transactions</h2><p className="mt-1 text-xs text-zinc-500">{filtered.length.toLocaleString()} shown · newest first</p></div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative"><span className="sr-only">Search transactions</span><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-zinc-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transactions" className="h-9 w-full rounded-md border border-zinc-300 bg-transparent pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 sm:w-56" /></label>
        <label><span className="sr-only">Filter by account</span><select value={account} onChange={(event) => setAccount(event.target.value)} className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 sm:w-52"><option value="all">All accounts</option>{accounts.map((name) => <option key={name}>{name}</option>)}</select></label>
      </div>
    </div>
    <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
      {filtered.map((row) => {
        const inflow = row.amount < 0;
        return <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(10rem,0.7fr)_auto] sm:items-center">
          <time className="hidden text-xs text-zinc-500 sm:block" dateTime={row.date}>{new Date(row.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time>
          <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-medium">{row.merchantName || row.name}</p>{row.pending ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">Pending</span> : null}</div><p className="mt-0.5 truncate text-xs text-zinc-500 sm:hidden">{new Date(row.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {row.accountName}</p>{row.category ? <p className="mt-0.5 truncate text-xs text-zinc-500">{pretty(row.category)}</p> : null}</div>
          <p className="hidden truncate text-xs text-zinc-500 sm:block">{row.institutionName || "Institution"} · {row.accountName}{row.accountMask ? ` •${row.accountMask}` : ""}</p>
          <p className={inflow ? "text-right text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400" : "text-right text-sm font-medium tabular-nums"}>{inflow ? "+" : "−"}{formatCurrency(Math.abs(row.amount))}</p>
        </div>;
      })}
      {!filtered.length ? <div className="px-5 py-12 text-center text-sm text-zinc-500">No transactions match. Either the filter works or your wallet finally developed boundaries.</div> : null}
    </div>
  </section>;
}

function pretty(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
