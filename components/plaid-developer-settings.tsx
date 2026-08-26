"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export type PlaidCredentialStatus = {
  configured: boolean;
  source: "profile" | "server" | "none";
  environment: "sandbox" | "production";
  clientIdHint: string | null;
};

export function PlaidDeveloperSettings({ initialStatus }: { initialStatus: PlaidCredentialStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [editing, setEditing] = useState(!initialStatus.configured);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/plaid/developer-credentials", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: form.get("clientId"),
          secret: form.get("secret"),
          environment: form.get("environment"),
        }),
      });
      const body = (await response.json()) as {
        configured?: boolean;
        environment?: "sandbox" | "production";
        clientIdHint?: string;
        error?: string;
      };
      if (!response.ok || !body.configured || !body.environment) {
        throw new Error(body.error || "Plaid credentials could not be saved");
      }
      setStatus({
        configured: true,
        source: "profile",
        environment: body.environment,
        clientIdHint: body.clientIdHint ?? "Configured",
      });
      formElement.reset();
      setEditing(false);
      setMessage("Credentials verified and encrypted. Your Plaid quota is now your own problem, congratulations.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Plaid credentials could not be saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="plaid-developer-heading" className="border-b border-zinc-200 pb-5 dark:border-zinc-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-900">
            <KeyRound className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h2 id="plaid-developer-heading" className="text-sm font-semibold">Plaid developer account</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {status.configured
                ? `${status.source === "profile" ? status.clientIdHint : "Legacy server credentials"} · ${status.environment === "production" ? "Production / Trial" : "Sandbox"}`
                : "Add your own Plaid credentials so connected institutions count against your Plaid plan, not somebody else’s exhausted free sample."}
            </p>
          </div>
        </div>
        {status.configured && !editing ? (
          <Button size="sm" variant="outline" onClick={() => { setEditing(true); setMessage(null); setError(null); }}>
            {status.source === "profile" ? "Rotate credentials" : "Move to this profile"}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-4 grid gap-4 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900/70 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <ShieldCheck className="size-3.5 text-emerald-600" aria-hidden="true" />
              Credentials are verified with Plaid, encrypted on the server, and never returned to the browser.
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="plaid-client-id">Client ID</Label>
            <Input id="plaid-client-id" name="clientId" autoComplete="off" required minLength={8} maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plaid-secret">Secret</Label>
            <Input id="plaid-secret" name="secret" type="password" autoComplete="new-password" required minLength={8} maxLength={500} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plaid-environment">Plaid environment</Label>
            <select
              id="plaid-environment"
              name="environment"
              defaultValue={status.environment}
              className="flex h-10 w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700"
            >
              <option value="production">Production / Trial (real institutions)</option>
              <option value="sandbox">Sandbox (test data)</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm" disabled={busy}>{busy ? "Verifying…" : "Verify and save"}</Button>
            {status.configured ? <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button> : null}
          </div>
        </form>
      ) : null}

      {error ? <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      {message ? <p role="status" className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{message}</p> : null}
    </section>
  );
}
