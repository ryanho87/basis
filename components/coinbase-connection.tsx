"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bitcoin, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

type CoinbaseState = {
  status: "ACTIVE" | "ERROR" | "DISCONNECTED";
  lastSyncedAt: string | null;
  errorMessage: string | null;
  accountCount: number;
  totalValueUsd: number;
  unpricedCount: number;
} | null;

export function CoinbaseConnection({
  configured,
  profileEnabled,
  connection,
}: {
  configured: boolean;
  profileEnabled: boolean;
  connection: CoinbaseState;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/coinbase/sync", { method: "POST" });
      const body = (await response.json()) as {
        summary?: { accountsCount: number; totalValueUsd: number; warnings: string[] };
        error?: string;
      };
      if (!response.ok || !body.summary) throw new Error(body.error || "Coinbase sync failed");
      setMessage(
        `Synced ${body.summary.accountsCount} Coinbase wallet${body.summary.accountsCount === 1 ? "" : "s"} worth ${formatCurrency(body.summary.totalValueUsd)}. The crypto has been asked to sit with the adults.`,
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Coinbase sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Coinbase from Basis? The API key remains in your local environment until you remove it.")) return;
    setBusy(true);
    try {
      await fetch("/api/coinbase/sync", { method: "DELETE" });
      setMessage("Coinbase disconnected. The coins are unsupervised again.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const active = connection && connection.status !== "DISCONNECTED";

  return (
    <section aria-labelledby="coinbase-heading" className="border-t border-zinc-200 pt-5 dark:border-zinc-800">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            <Bitcoin className="size-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="coinbase-heading" className="text-sm font-semibold">Coinbase</h2>
              <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                <ShieldCheck className="size-3.5" /> View-only key required
              </span>
            </div>
            <p suppressHydrationWarning className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {active
                ? `${connection.accountCount} wallets · ${formatCurrency(connection.totalValueUsd)}${connection.lastSyncedAt ? ` · synced ${new Date(connection.lastSyncedAt).toLocaleString()}` : ""}`
                : configured && profileEnabled
                  ? "Ready to import balances. Cost basis remains unknown until transaction reconstruction lands."
                  : configured
                    ? "Not enabled for this profile. Personal API keys are never shared between members."
                  : "Add a CDP ECDSA API key with View permission only to your local environment."}
            </p>
            {connection?.errorMessage ? <p className="mt-1 text-xs text-red-600">{connection.errorMessage}</p> : null}
            {connection && connection.unpricedCount > 0 ? (
              <p className="mt-1 text-xs text-amber-600">{connection.unpricedCount} non-zero wallets could not be priced in USD.</p>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2 pl-12 sm:pl-0">
          <Button size="sm" variant={active ? "outline" : "primary"} disabled={!configured || !profileEnabled || busy} onClick={sync}>
            <RefreshCw className={busy ? "size-3.5 animate-spin" : "size-3.5"} />
            {busy ? "Syncing…" : active ? "Sync Coinbase" : "Connect Coinbase"}
          </Button>
          {active ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={disconnect} className="text-zinc-500 hover:text-red-600">
              <Unplug className="size-3.5" /> Disconnect
            </Button>
          ) : null}
        </div>
      </div>
      {!configured ? (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Set <code>COINBASE_API_KEY_NAME</code> and <code>COINBASE_API_PRIVATE_KEY</code> in <code>.env</code>. Basis rejects keys with Trade or Transfer permission.
        </div>
      ) : !profileEnabled ? (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Coinbase remains locked until this profile has its own encrypted credentials. Importing another member&apos;s crypto would be a privacy breach with excellent volatility.
        </div>
      ) : null}
      {message ? <p role="status" className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{message}</p> : null}
    </section>
  );
}
