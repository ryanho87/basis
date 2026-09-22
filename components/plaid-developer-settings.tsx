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

export function PlaidDeveloperSettings({ initialStatus, onConfigured }: { initialStatus: PlaidCredentialStatus; onConfigured?: (status: PlaidCredentialStatus) => void }) {
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
      const nextStatus: PlaidCredentialStatus = {
        configured: true,
        source: "profile",
        environment: body.environment,
        clientIdHint: body.clientIdHint ?? "Configured",
      };
      setStatus(nextStatus);
      onConfigured?.(nextStatus);
      formElement.reset();
      setEditing(false);
      setMessage("Setup complete. You can now choose an account type and connect your first bank.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Plaid credentials could not be saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="plaid-developer-heading" className="">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-900">
            <KeyRound className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h2 id="plaid-developer-heading" className="text-sm font-semibold">{status.configured ? "Plaid settings" : "One-time Plaid setup"}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {status.configured
                ? `${status.source === "profile" ? status.clientIdHint : "Managed by your Basis administrator"} · ${status.environment === "production" ? "Real accounts" : "Test accounts"}`
                : "This version of Basis uses your own Plaid account. Set it up once, then use Plaid to sign in to each bank."}
            </p>
          </div>
        </div>
        {status.configured && !editing ? (
          <Button size="sm" variant="outline" onClick={() => { setEditing(true); setMessage(null); setError(null); }}>
            {status.source === "profile" ? "Update credentials" : "Use my own Plaid account"}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-4 grid gap-4 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900/70 sm:grid-cols-2">
          {!status.configured ? <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-600 dark:text-zinc-400 sm:col-span-2">
            <li><a href="https://dashboard.plaid.com/signup" target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700 underline dark:text-emerald-400">Create or sign in to your Plaid account</a>. You need Production access for real banks; Plaid may require approval.</li>
            <li>Open <a href="https://dashboard.plaid.com/developers/keys" target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700 underline dark:text-emerald-400">Plaid’s API keys</a> and copy your Client ID and Production secret below.</li>
            <li>Select <strong>Save and continue</strong>. Next, you’ll choose your bank and the accounts to share.</li>
          </ol> : null}
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <ShieldCheck className="size-3.5 text-emerald-600" aria-hidden="true" />
              These are Plaid setup keys, not your bank password. Basis stores them encrypted.
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="plaid-client-id">Client ID</Label>
            <Input id="plaid-client-id" name="clientId" autoComplete="off" required minLength={8} maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plaid-secret">Plaid secret</Label>
            <Input id="plaid-secret" name="secret" type="password" autoComplete="new-password" required minLength={8} maxLength={500} />
          </div>
          <details className="space-y-2 sm:col-span-2">
            <summary className="cursor-pointer text-xs text-zinc-500">Advanced: use test accounts</summary>
            <Label htmlFor="plaid-environment">Account environment</Label>
            <select
              id="plaid-environment"
              name="environment"
              defaultValue={status.environment}
              className="flex h-10 w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700"
            >
              <option value="production">Real accounts (Production)</option>
              <option value="sandbox">Sandbox (test data)</option>
            </select>
          </details>
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm" disabled={busy}>{busy ? "Verifying…" : "Save and continue"}</Button>
            {status.configured ? <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button> : null}
          </div>
        </form>
      ) : null}

      {error ? <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      {message ? <p role="status" className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{message}</p> : null}
    </section>
  );
}
