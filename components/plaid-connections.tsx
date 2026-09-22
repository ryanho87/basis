"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  usePlaidLink,
  type PlaidLinkOnExit,
  type PlaidLinkOnSuccess,
} from "react-plaid-link";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlaidDeveloperSettings, type PlaidCredentialStatus } from "@/components/plaid-developer-settings";
import { isAccountConnectionKind, type AccountConnectionKind } from "@/lib/account-connection";

type Connection = {
  id: string;
  institutionName: string | null;
  status: "ACTIVE" | "LOGIN_REQUIRED" | "ERROR" | "DISCONNECTED";
  lastSyncedAt: string | null;
  errorMessage: string | null;
  accounts: { id: string; name: string; mask: string | null }[];
};

type FlowRequest = {
  connectionId?: string;
  accountKind?: AccountConnectionKind;
};

type SyncSummary = {
  accountsCount: number;
  holdingsCount: number;
  taxLotsCount: number;
  liabilitiesCount: number;
  transactionsCount: number;
  warnings: string[];
};

const OAUTH_TOKEN_KEY = "basis_plaid_link_token";
const OAUTH_REQUEST_KEY = "basis_plaid_link_request";

function readOAuthResume(): { token: string; request: FlowRequest } | null {
  if (typeof window === "undefined" || !window.location.search.includes("oauth_state_id")) {
    return null;
  }
  try {
    const token = window.sessionStorage.getItem(OAUTH_TOKEN_KEY);
    const storedRequest = window.sessionStorage.getItem(OAUTH_REQUEST_KEY);
    if (!token || !storedRequest) return null;
    const request = JSON.parse(storedRequest) as FlowRequest;
    if (!request || (request.connectionId !== undefined && typeof request.connectionId !== "string")
      || (request.accountKind !== undefined && !isAccountConnectionKind(request.accountKind))) return null;
    return { token, request };
  } catch {
    return null;
  }
}

// Mount the Plaid SDK only while connecting, and leave a usable retry path if it fails to load.
function PlaidLinkSession({ token, onSuccess, onExit, onFailure }: {
  token: string;
  onSuccess: PlaidLinkOnSuccess;
  onExit: PlaidLinkOnExit;
  onFailure: (message: string) => void;
}) {
  const opened = useRef(false);
  const { open, ready, error } = usePlaidLink({
    token, onSuccess, onExit,
    receivedRedirectUri: window.location.search.includes("oauth_state_id") ? window.location.href : undefined,
  });
  useEffect(() => {
    if (error) onFailure("Plaid could not open. Check your connection and try again.");
    else if (ready && !opened.current) {
      opened.current = true;
      open();
    }
  }, [error, ready, open, onFailure]);
  useEffect(() => {
    if (ready || error) return;
    const timeout = window.setTimeout(() => onFailure("Plaid is taking too long to open. Check your connection and try again."), 20000);
    return () => window.clearTimeout(timeout);
  }, [ready, error, onFailure]);
  return null;
}

export function PlaidConnections({
  initialStatus,
  connections,
}: {
  initialStatus: PlaidCredentialStatus;
  connections: Connection[];
}) {
  const router = useRouter();
  const [oauthResume] = useState(readOAuthResume);
  const [linkToken, setLinkToken] = useState<string | null>(oauthResume?.token ?? null);
  const [flowRequest, setFlowRequest] = useState<FlowRequest | null>(oauthResume?.request ?? null);
  const [credentialStatus, setCredentialStatus] = useState(initialStatus);
  const [accountKind, setAccountKind] = useState<AccountConnectionKind>("banking");
  const [busy, setBusy] = useState<string | null>(oauthResume ? "connect" : null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);

  const clearOAuthState = useCallback(() => {
    try {
      window.sessionStorage.removeItem(OAUTH_TOKEN_KEY);
      window.sessionStorage.removeItem(OAUTH_REQUEST_KEY);
    } catch { /* Storage may be unavailable in a private browser. */ }
    if (window.location.search.includes("oauth_state_id")) {
      router.replace("/accounts");
    }
  }, [router]);

  const syncConnection = useCallback(async (connectionId: string) => {
    const response = await fetch("/api/plaid/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId }),
    });
    const data = (await response.json()) as {
      summary?: SyncSummary;
      error?: string;
    };
    if (!response.ok || !data.summary) {
      throw new Error(data.error || "Plaid sync could not finish");
    }
    return data.summary;
  }, []);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      setBusy("exchange");
      setMessage(null);
      try {
        setMessageIsError(false);
        const endpoint = flowRequest?.connectionId
          ? "/api/plaid/connection"
          : "/api/plaid/exchange";
        const response = await fetch(endpoint, {
          method: flowRequest?.connectionId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            flowRequest?.connectionId
              ? { connectionId: flowRequest.connectionId }
              : {
                  publicToken,
                  institution: metadata.institution
                    ? {
                        id: metadata.institution.institution_id,
                        name: metadata.institution.name,
                      }
                    : null,
                },
          ),
        });
        const data = (await response.json()) as {
          connection?: { id: string };
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "Connection could not be saved");
        const connectionId = flowRequest?.connectionId || data.connection?.id;
        if (!connectionId) throw new Error("The connection could not be identified. Refresh the page and try again.");
        clearOAuthState();
        try {
          const summary = await syncConnection(connectionId);
          const warning = summary.warnings[0];
          setMessage(
            `${metadata.institution?.name || "Your institution"} is connected. ${summary.accountsCount} account${summary.accountsCount === 1 ? "" : "s"} added. Connect another institution below, or view your balances.${warning ? ` Some data needs attention: ${warning}` : ""}`,
          );
        } catch (syncError) {
          setMessageIsError(true);
          setMessage(
            `Connected, but the first sync needs attention: ${syncError instanceof Error ? syncError.message : "unknown sync error"}`,
          );
        }
        router.refresh();
      } catch (error) {
        setMessageIsError(true);
        setMessage(error instanceof Error ? error.message : "Connection could not be saved");
      } finally {
        clearOAuthState();
        setBusy(null);
        setLinkToken(null);
        setFlowRequest(null);
      }
    },
    [clearOAuthState, flowRequest, router, syncConnection],
  );

  const onFailure = useCallback((error: string) => {
    clearOAuthState();
    setMessageIsError(true);
    setMessage(error);
    setBusy(null);
    setLinkToken(null);
    setFlowRequest(null);
  }, [clearOAuthState]);

  const onExit = useCallback<PlaidLinkOnExit>((error) => {
    clearOAuthState();
    setMessageIsError(Boolean(error));
    setMessage(error
      ? error.display_message || error.error_message || "The connection could not finish. Please try again."
      : "Connection canceled. You can try again whenever you’re ready.");
    setBusy(null);
    setLinkToken(null);
    setFlowRequest(null);
  }, [clearOAuthState]);

  async function startFlow(request: FlowRequest) {
    setBusy(request.connectionId || "connect");
    setMessage(null);
    setMessageIsError(false);
    try {
      const response = await fetch("/api/plaid/link-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = (await response.json()) as { linkToken?: string; error?: string };
      if (!response.ok || !data.linkToken) {
        throw new Error(data.error || "Plaid Link could not start");
      }
      window.sessionStorage.setItem(OAUTH_TOKEN_KEY, data.linkToken);
      window.sessionStorage.setItem(OAUTH_REQUEST_KEY, JSON.stringify(request));
      setFlowRequest(request);
      setLinkToken(data.linkToken);

    } catch (error) {
      clearOAuthState();
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : "Plaid Link could not start");
      setBusy(null);
    }
  }

  async function disconnect(connection: Connection) {
    const name = connection.institutionName || "this institution";
    if (!window.confirm(`Disconnect ${name}? This removes its imported accounts and transactions from Basis. Your accounts at the institution will stay open.`)) {
      return;
    }
    setBusy(connection.id);
    setMessage(null);
    setMessageIsError(false);
    try {
      const response = await fetch("/api/plaid/connection", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not disconnect institution");
      setMessage(`${name} disconnected.`);
      router.refresh();
    } catch (error) {
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : "Could not disconnect institution");
    } finally {
      setBusy(null);
    }
  }

  async function sync(connection: Connection) {
    setBusy(connection.id);
    setMessage(null);
    setMessageIsError(false);
    try {
      const summary = await syncConnection(connection.id);
      const warning = summary.warnings[0];
      setMessage(
        `Updated ${summary.accountsCount} account${summary.accountsCount === 1 ? "" : "s"} at ${connection.institutionName || "your institution"}.${warning ? ` Some data needs attention: ${warning}` : ""}`,
      );
      router.refresh();
    } catch (error) {
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : "Plaid sync could not finish");
    } finally {
      setBusy(null);
    }
  }

  const flowError = messageIsError ? message : null;
  const successMessage = message && !messageIsError ? message : null;

  return (
    <section id="connect-accounts" aria-labelledby="connect-accounts-heading" className="scroll-mt-6">
      {linkToken ? <PlaidLinkSession token={linkToken} onSuccess={onSuccess} onExit={onExit} onFailure={onFailure} /> : null}
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <div>
          <h2 id="connect-accounts-heading" className="text-lg font-semibold">{connections.length ? "Connect another institution" : "Bring your accounts together"}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">Connect one bank or provider at a time. Sign in through Plaid and select every account you want to see in Basis.</p>
        </div>
      </div>

      {!credentialStatus.configured ? <div className="mt-5 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900/60"><PlaidDeveloperSettings initialStatus={credentialStatus} onConfigured={setCredentialStatus} /></div> : (
        <div className="mt-5">
          {credentialStatus.environment === "sandbox" ? <p className="mb-4 text-sm text-amber-700 dark:text-amber-300">Test mode: these connections use sample data. Switch to real accounts in Plaid settings below to connect your own banks.</p> : null}
          <fieldset disabled={busy !== null}>
            <legend className="mb-2 text-sm font-medium">What would you like to connect?</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ["banking", "Banks & credit cards", "Checking, savings, credit cards"],
                ["investments", "Investments & retirement", "Brokerage, 401(k), IRA"],
                ["loans", "Loans", "Mortgages and student loans"],
              ] as const).map(([value, label, description]) => (
                <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500 ${accountKind === value ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" : "border-zinc-200 dark:border-zinc-800"}`}>
                  <input type="radio" name="account-kind" value={value} checked={accountKind === value} onChange={() => setAccountKind(value)} className="mt-1 accent-emerald-600" />
                  <span><span className="block text-sm font-medium">{label}</span><span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{description}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Button disabled={busy !== null} onClick={() => startFlow({ accountKind })} className="w-full sm:w-auto">
              <Plus className="size-4" aria-hidden="true" />{busy === "connect" ? "Opening Plaid…" : "Continue to Plaid"}
            </Button>
            <p className="text-xs leading-5 text-zinc-500">Next: search for your bank or provider.</p>
          </div>
        </div>
      )}
      <p className="mt-4 text-sm leading-6 text-zinc-500 dark:text-zinc-400">Can’t find an institution, or prefer to enter a balance? <Link href="/accounts/new" className="font-medium text-emerald-700 underline dark:text-emerald-400">Add an account manually</Link>.</p>

      {busy === "exchange" ? <p role="status" className="mt-4 text-sm text-zinc-500">Connected to Plaid. Adding your accounts and balances…</p> : null}
      {flowError ? <div role="alert" className="mt-4 flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950/30">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden="true" />
        <div><p className="font-medium">Your connection needs attention</p><p className="mt-1 text-zinc-600 dark:text-zinc-400">{flowError}</p></div>
      </div> : null}
      {successMessage ? <div role="status" className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" /><p>{successMessage}</p>
      </div> : null}

      {connections.length > 0 ? <div className="mt-6 border-t border-zinc-200 pt-5 dark:border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Your connections ({connections.length})</h3>
          <a href="#account-balances" className="text-sm font-medium text-emerald-700 underline dark:text-emerald-400">View balances</a>
        </div>
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {connections.map((connection) => {
            const healthy = connection.status === "ACTIVE";
            const loginRequired = connection.status === "LOGIN_REQUIRED";
            return <div key={connection.id} className="py-4">
              <div className="flex items-start gap-3">
                <Building2 className="mt-1 size-4 shrink-0 text-zinc-500" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{connection.institutionName || "Connected institution"}</span><span className={`text-xs ${healthy ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>{healthy ? "Connected" : "Needs attention"}</span></div>
                  <p suppressHydrationWarning className="mt-1 text-xs leading-5 text-zinc-500">{connection.errorMessage || (connection.lastSyncedAt ? `Last updated ${new Date(connection.lastSyncedAt).toLocaleString()}` : "Waiting for the first balance update")}</p>
                  {connection.accounts.length ? <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">{connection.accounts.map((account) => <li key={account.id}>{account.name}{account.mask ? ` ••${account.mask}` : ""}</li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">No accounts imported yet. Try updating balances or choose accounts below.</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant={loginRequired ? "primary" : "outline"} disabled={busy !== null} onClick={() => startFlow({ connectionId: connection.id })}>{loginRequired ? "Sign in again" : "Add or change accounts"}</Button>
                    {!loginRequired ? <Button variant="ghost" disabled={busy !== null} onClick={() => sync(connection)}><RefreshCw className="size-3.5" aria-hidden="true" />{busy === connection.id ? "Working…" : healthy ? "Update balances" : "Try updating again"}</Button> : null}
                  </div>
                  <details className="mt-3"><summary className="w-fit cursor-pointer text-xs text-zinc-500">Connection options</summary><Button variant="ghost" disabled={busy !== null} onClick={() => disconnect(connection)} className="mt-2 text-zinc-500 hover:text-red-600"><Unplug className="size-3.5" aria-hidden="true" />Disconnect</Button></details>
                </div>
              </div>
            </div>;
          })}
        </div>
      </div> : null}
      {credentialStatus.configured ? <details className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800"><summary className="cursor-pointer text-xs text-zinc-500">Plaid settings</summary><div className="mt-4"><PlaidDeveloperSettings initialStatus={credentialStatus} onConfigured={setCredentialStatus} /></div></details> : null}
    </section>
  );
}
