import Link from "next/link";
import {
  Bitcoin,
  Boxes,
  ChartNoAxesCombined,
  CreditCard,
  House,
  Landmark,
  WalletCards,
} from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/utils";

export type AccountBreakdownCategory =
  | "cash"
  | "investments"
  | "retirement"
  | "crypto"
  | "real-estate"
  | "other"
  | "debt";

export type AccountBreakdownRow = {
  id: string;
  name: string;
  institution: string;
  detail: string;
  value: number;
  kind: "asset" | "liability";
  category: AccountBreakdownCategory;
  href?: string;
  freshness?: string;
  basis?: "complete" | "partial" | "missing";
};

const CATEGORY_STYLES: Record<AccountBreakdownCategory, {
  label: string;
  icon: typeof Landmark;
  iconClass: string;
  barClass: string;
}> = {
  cash: {
    label: "Cash",
    icon: WalletCards,
    iconClass: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
    barClass: "bg-sky-500",
  },
  investments: {
    label: "Investments",
    icon: ChartNoAxesCombined,
    iconClass: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
    barClass: "bg-violet-500",
  },
  retirement: {
    label: "Retirement",
    icon: Landmark,
    iconClass: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    barClass: "bg-emerald-500",
  },
  crypto: {
    label: "Crypto",
    icon: Bitcoin,
    iconClass: "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
    barClass: "bg-orange-500",
  },
  "real-estate": {
    label: "Real estate",
    icon: House,
    iconClass: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    barClass: "bg-amber-500",
  },
  other: {
    label: "Other",
    icon: Boxes,
    iconClass: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
    barClass: "bg-zinc-500",
  },
  debt: {
    label: "Debt",
    icon: CreditCard,
    iconClass: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
    barClass: "bg-rose-500",
  },
};

export function NetWorthAccountBreakdown({
  rows,
  netWorth,
  totalAssets,
  totalLiabilities,
}: {
  rows: AccountBreakdownRow[];
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
}) {
  const assets = rows
    .filter((row) => row.kind === "asset" && Math.abs(row.value) >= 0.01)
    .sort((a, b) => b.value - a.value);
  const liabilities = rows
    .filter((row) => row.kind === "liability" && Math.abs(row.value) >= 0.01)
    .sort((a, b) => b.value - a.value);

  return (
    <section aria-labelledby="net-worth-breakdown-heading" className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <header className="grid gap-5 border-b border-zinc-200 px-5 py-5 dark:border-zinc-800 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end lg:px-6">
        <div>
          <h2 id="net-worth-breakdown-heading" className="sr-only">Net worth by account</h2>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Current net worth</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
            {formatCurrency(netWorth)}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
            Every account gets a line item. Every missing cost basis gets a small public shaming.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 sm:min-w-64">
          <SummaryValue label="Assets" value={totalAssets} />
          <SummaryValue label="Debt" value={-totalLiabilities} negative />
        </dl>
      </header>

      <div>
        <AccountGroup title="Assets" rows={assets} total={totalAssets} />
        <AccountGroup title="Liabilities" rows={liabilities} total={totalLiabilities} liabilities />
      </div>
    </section>
  );
}

function SummaryValue({ label, value, negative = false }: { label: string; value: number; negative?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={`mt-0.5 text-base font-semibold tabular-nums ${negative ? "text-rose-600 dark:text-rose-400" : ""}`}>
        {formatCurrency(value)}
      </dd>
    </div>
  );
}

function AccountGroup({
  title,
  rows,
  total,
  liabilities = false,
}: {
  title: string;
  rows: AccountBreakdownRow[];
  total: number;
  liabilities?: boolean;
}) {
  return (
    <section aria-labelledby={`breakdown-${title.toLowerCase()}`} className="border-b border-zinc-200 last:border-b-0 dark:border-zinc-800">
      <div className="flex items-baseline justify-between bg-zinc-50/70 px-5 py-3 dark:bg-zinc-900/50 lg:px-6">
        <h3 id={`breakdown-${title.toLowerCase()}`} className="text-sm font-semibold">{title}</h3>
        <span className={`text-sm font-semibold tabular-nums ${liabilities ? "text-rose-600 dark:text-rose-400" : ""}`}>
          {formatCurrency(liabilities ? -total : total)}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-5 text-sm text-zinc-500 lg:px-6">
          {liabilities ? "No debt tracked. Either excellent work or suspiciously selective data entry." : "No assets tracked yet."}
        </p>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {rows.map((row) => (
            <AccountRow key={row.id} row={row} total={total} liabilities={liabilities} />
          ))}
        </div>
      )}
    </section>
  );
}

function AccountRow({ row, total, liabilities }: { row: AccountBreakdownRow; total: number; liabilities: boolean }) {
  const style = CATEGORY_STYLES[row.category];
  const Icon = style.icon;
  const share = total > 0 ? Math.max(0, row.value) / total : 0;
  const width = `${Math.min(100, Math.max(share > 0 ? 1.5 : 0, share * 100))}%`;

  const content = (
    <div className="grid min-h-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-3.5 transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40 sm:grid-cols-[minmax(0,1fr)_9rem_9rem] lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${style.iconClass}`}>
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-medium">{row.name}</span>
            {row.basis ? <BasisBadge status={row.basis} /> : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {row.institution} · {row.detail}{row.freshness ? ` · ${row.freshness}` : ""}
          </p>
        </div>
      </div>

      <div className="hidden sm:block">
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <span>{style.label}</span>
          <span className="tabular-nums">{formatPercent(share)}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden="true">
          <div className={`h-full rounded-full ${style.barClass}`} style={{ width }} />
        </div>
      </div>

      <div className={`text-right text-sm font-semibold tabular-nums sm:text-base ${liabilities ? "text-rose-600 dark:text-rose-400" : ""}`}>
        {formatCurrency(liabilities ? -row.value : row.value)}
        <div className="mt-0.5 text-[11px] font-normal text-zinc-500 sm:hidden">{formatPercent(share)} of {liabilities ? "debt" : "assets"}</div>
      </div>
    </div>
  );

  return row.href ? (
    <Link href={row.href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500">
      {content}
    </Link>
  ) : content;
}

function BasisBadge({ status }: { status: NonNullable<AccountBreakdownRow["basis"]> }) {
  const copy = status === "complete" ? "Basis complete" : status === "partial" ? "Basis partial" : "Basis missing";
  const classes = status === "complete"
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
    : status === "partial"
      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
      : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${classes}`}>{copy}</span>;
}
