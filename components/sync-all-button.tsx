"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SyncAllButton({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function refresh() {
    setBusy(true);
    setMessage(null);
    setError(false);
    try {
      const response = await fetch("/api/sync-all", { method: "POST" });
      const body = (await response.json()) as {
        summary?: { plaid: { connectionsCount: number }; coinbase: unknown; errors: string[] };
        error?: string;
      };
      if (!body.summary) throw new Error(body.error || "Account refresh failed");
      const sources = body.summary.plaid.connectionsCount + (body.summary.coinbase ? 1 : 0);
      if (body.summary.errors.length) {
        setError(true);
        setMessage(`Refreshed what cooperated, but ${body.summary.errors.join(" · ")}`);
      } else {
        setMessage(`Refreshed ${sources} connection${sources === 1 ? "" : "s"} and saved a net worth snapshot. Your balances have completed roll call.`);
      }
      router.refresh();
    } catch (caught) {
      setError(true);
      setMessage(caught instanceof Error ? caught.message : "Account refresh failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <Button size="sm" variant="outline" disabled={disabled || busy} onClick={refresh}>
        <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />
        {busy ? "Syncing everything…" : "Sync all accounts"}
      </Button>
      {message ? (
        <p role={error ? "alert" : "status"} className={error ? "max-w-md text-xs text-red-600" : "max-w-md text-xs text-zinc-500"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
