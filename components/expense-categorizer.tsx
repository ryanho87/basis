"use client";

import { useMemo, useState } from "react";
import { Check, LoaderCircle, Search } from "lucide-react";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  suggestExpenseCategory,
  type ExpenseCategoryValue,
  type ExpenseTreatmentValue,
} from "@/lib/expenses";
import { formatCurrency } from "@/lib/utils";

export type ExpenseRow = {
  id: string;
  date: string;
  name: string;
  merchantName: string | null;
  amount: number;
  pending: boolean;
  plaidPrimaryCategory: string | null;
  plaidDetailedCategory: string | null;
  expenseTreatment: ExpenseTreatmentValue;
  expenseCategory: ExpenseCategoryValue | null;
  deductiblePercent: number | null;
  accountName: string;
  accountMask: string | null;
  institutionName: string | null;
};

const TREATMENT_LABELS: Record<ExpenseTreatmentValue, string> = {
  UNREVIEWED: "Needs review",
  BUSINESS: "Business",
  PERSONAL: "Personal",
  MIXED: "Mixed use",
  EXCLUDED: "Exclude",
};

type Filter = "ALL" | "UNREVIEWED" | "BUSINESS" | "PERSONAL";

export function ExpenseCategorizer({ initialRows }: { initialRows: ExpenseRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState<Filter>("UNREVIEWED");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => rows.filter((row) => {
    const matchesFilter = filter === "ALL" || row.expenseTreatment === filter;
    const haystack = `${row.merchantName ?? ""} ${row.name} ${row.accountName}`.toLowerCase();
    return matchesFilter && haystack.includes(search.trim().toLowerCase());
  }), [filter, rows, search]);

  const reviewed = rows.filter((row) => row.expenseTreatment !== "UNREVIEWED").length;
  const businessSpend = rows.reduce((sum, row) => {
    if (row.amount <= 0 || (row.expenseTreatment !== "BUSINESS" && row.expenseTreatment !== "MIXED")) return sum;
    return sum + row.amount * ((row.deductiblePercent ?? 100) / 100);
  }, 0);

  async function save(row: ExpenseRow, treatment: ExpenseTreatmentValue, category: ExpenseCategoryValue | null) {
    const suggested = category ?? (treatment === "BUSINESS" || treatment === "MIXED"
      ? suggestExpenseCategory(row.plaidPrimaryCategory, row.plaidDetailedCategory)
      : null);
    const deductiblePercent = treatment === "MIXED" ? row.deductiblePercent ?? 50 : treatment === "BUSINESS" ? 100 : 0;
    const optimistic = { ...row, expenseTreatment: treatment, expenseCategory: suggested, deductiblePercent };
    setRows((current) => current.map((item) => item.id === row.id ? optimistic : item));
    setSaving(row.id);
    setSaved(null);
    setError(null);
    try {
      const response = await fetch(`/api/expenses/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ treatment, category: suggested, deductiblePercent }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save this expense");
      setSaved(row.id);
      window.setTimeout(() => setSaved((id) => id === row.id ? null : id), 1200);
    } catch (saveError) {
      setRows((current) => current.map((item) => item.id === row.id ? row : item));
      setError(saveError instanceof Error ? saveError.message : "Could not save this expense");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <div className="grid gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800 sm:grid-cols-3">
        <Summary label="Imported" value={rows.length.toLocaleString()} detail="credit card transactions" />
        <Summary label="Reviewed" value={`${reviewed} / ${rows.length}`} detail={rows.length ? `${Math.round((reviewed / rows.length) * 100)}% sorted` : "Nothing to review"} />
        <Summary label="Potential business spend" value={formatCurrency(businessSpend)} detail="based on your classifications" />
      </div>

      <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1" aria-label="Transaction filters">
          {(["UNREVIEWED", "ALL", "BUSINESS", "PERSONAL"] as Filter[]).map((value) => (
            <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-md px-3 py-1.5 text-sm transition-colors ${filter === value ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}>
              {value === "ALL" ? "All" : TREATMENT_LABELS[value]}
            </button>
          ))}
        </div>
        <label className="relative block sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-zinc-400" aria-hidden="true" />
          <span className="sr-only">Search expenses</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search merchant or account" className="h-9 w-full rounded-md border border-zinc-200 bg-transparent pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-800" />
        </label>
      </div>

      {error ? <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p> : null}

      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <div className="hidden grid-cols-[100px_minmax(220px,1fr)_150px_160px_160px_36px] gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 md:grid">
          <span>Date</span><span>Transaction</span><span>Amount</span><span>Treatment</span><span>Category</span><span />
        </div>
        {visible.length === 0 ? (
          <div className="px-5 py-14 text-center"><p className="text-sm font-medium">No transactions match</p><p className="mt-1 text-sm text-zinc-500">Either the filter is doing its job or the credit card briefly discovered restraint.</p></div>
        ) : visible.map((row) => {
          const suggested = suggestExpenseCategory(row.plaidPrimaryCategory, row.plaidDetailedCategory);
          return (
            <div key={row.id} className="grid gap-3 border-b border-zinc-200 px-4 py-4 last:border-0 dark:border-zinc-800 md:grid-cols-[100px_minmax(220px,1fr)_150px_160px_160px_36px] md:items-center md:gap-4">
              <div className="text-sm text-zinc-500">{new Date(row.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" })}</div>
              <div className="min-w-0"><p className="truncate text-sm font-medium">{row.merchantName || row.name}</p><p className="mt-0.5 truncate text-xs text-zinc-500">{row.institutionName || row.accountName}{row.accountMask ? ` •••• ${row.accountMask}` : ""}{row.pending ? " · Pending" : ""}</p></div>
              <div className={`text-sm font-medium tabular-nums ${row.amount < 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{formatCurrency(row.amount)}</div>
              <label><span className="sr-only">Treatment for {row.merchantName || row.name}</span><select value={row.expenseTreatment} disabled={saving === row.id} onChange={(event) => save(row, event.target.value as ExpenseTreatmentValue, row.expenseCategory)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">{Object.entries(TREATMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span className="sr-only">Category for {row.merchantName || row.name}</span><select value={row.expenseCategory ?? ""} disabled={saving === row.id || !["BUSINESS", "MIXED"].includes(row.expenseTreatment)} onChange={(event) => save(row, row.expenseTreatment, event.target.value as ExpenseCategoryValue)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm outline-none focus:border-emerald-500 disabled:opacity-45 dark:border-zinc-700 dark:bg-zinc-950"><option value="">Suggested: {EXPENSE_CATEGORY_LABELS[suggested]}</option>{EXPENSE_CATEGORIES.map((value) => <option key={value} value={value}>{EXPENSE_CATEGORY_LABELS[value]}</option>)}</select></label>
              <div className="flex size-8 items-center justify-center text-zinc-400">{saving === row.id ? <LoaderCircle className="size-4 animate-spin" aria-label="Saving" /> : saved === row.id ? <Check className="size-4 text-emerald-600" aria-label="Saved" /> : null}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Summary({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div><p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-1 text-xs text-zinc-500">{detail}</p></div>;
}
