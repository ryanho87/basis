"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";

type Connection = {
  id: string;
  institutionName: string | null;
  status: "ACTIVE" | "LOGIN_REQUIRED" | "ERROR" | "DISCONNECTED";
  lastSyncedAt: string | null;
  errorMessage: string | null;
};

type FlowRequest = {
  connectionId?: string;
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
  const storedToken = window.sessionStorage.getItem(OAUTH_TOKEN_KEY);
  const storedRequest = window.sessionStorage.getItem(OAUTH_REQUEST_KEY);
  if (!storedToken || !storedRequest) return null;
  try {
    return { token: storedToken, request: JSON.parse(storedRequest) as FlowRequest };
  } catch {
    window.sessionStorage.removeItem(OAUTH_TOKEN_KEY);
    window.sessionStorage.removeItem(OAUTH_REQUEST_KEY);
    return null;
  }
}

export function PlaidConnections({
  configured,
  connections,
}: {
  configured: boolean;
  connections: Connection[];
}) {
  const router = useRouter();
  const [oauthResume] = useState(readOAuthResume);
  const [linkToken, setLinkToken] = useState<string | null>(oauthResume?.token ?? null);
  const [flowRequest, setFlowRequest] = useState<FlowRequest | null>(oauthResume?.request ?? null);
  const shouldOpenRef = useRef(Boolean(oauthResume));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);

  const clearOAuthState = useCallback(() => {
    window.sessionStorage.removeItem(OAUTH_TOKEN_KEY);
    window.sessionStorage.removeItem(OAUTH_REQUEST_KEY);
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
        if (!connectionId) throw new Error("Connection saved, but its sync ID went missing");
        clearOAuthState();
        try {
          const summary = await syncConnection(connectionId);
          const warning = summary.warnings[0];
          setMessage(
            `Synced ${summary.accountsCount} account${summary.accountsCount === 1 ? "" : "s"}, ${summary.transactionsCount} transaction update${summary.transactionsCount === 1 ? "" : "s"}, and ${summary.holdingsCount} holding${summary.holdingsCount === 1 ? "" : "s"}. Your spreadsheets may begin packing their things.${warning ? ` Note: ${warning}` : ""}`,
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
        setBusy(null);
        setLinkToken(null);
        setFlowRequest(null);
      }
    },
    [clearOAuthState, flowRequest, router, syncConnection],
  );

  const onExit = useCallback<PlaidLinkOnExit>((error) => {
    if (error) {
      setMessageIsError(true);
      setMessage(error.display_message || error.error_message || "Plaid Link closed with an error");
    }
    setBusy(null);
    setLinkToken(null);
    setFlowRequest(null);
  }, []);

  const plaidConfig = useMemo(
    () => ({
      token: linkToken,
      onSuccess,
      onExit,
      receivedRedirectUri:
        typeof window !== "undefined" && window.location.search.includes("oauth_state_id")
          ? window.location.href
          : undefined,
    }),
    [linkToken, onExit, onSuccess],
  );
  const { open, ready, error: linkError } = usePlaidLink(plaidConfig);

  useEffect(() => {
    if (shouldOpenRef.current && ready) {
      shouldOpenRef.current = false;
      open();
    }
  }, [open, ready]);

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
      shouldOpenRef.current = true;
    } catch (error) {
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : "Plaid Link could not start");
      setBusy(null);
    }
  }

  async function disconnect(connection: Connection) {
    const name = connection.institutionName || "this institution";
    if (!window.confirm(`Disconnect ${name}? Its imported data will be handled in the sync phase.`)) {
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
      setMessage(`${name} disconnected. The financial group chat has one fewer member.`);
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
        `Freshened ${summary.accountsCount} account${summary.accountsCount === 1 ? "" : "s"}, ${summary.transactionsCount} transaction update${summary.transactionsCount === 1 ? "" : "s"}, and ${summary.holdingsCount} holding${summary.holdingsCount === 1 ? "" : "s"}. The numbers have been forced to testify.${warning ? ` Note: ${warning}` : ""}`,
      );
      router.refresh();
    } catch (error) {
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : "Plaid sync could not finish");
    } finally {
      setBusy(null);
    }
  }

  const flowError = linkError?.message || (messageIsError ? message : null);
  const successMessage = message && !messageIsError ? message : null;

  return (
    <section aria-labelledby="connected-institutions-heading">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
            <h2 id="connected-institutions-heading" className="text-sm font-semibold">
              Connected institutions
            </h2>
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {connections.length === 0
              ? "Your accounts are still freelancing as separate spreadsheets. Let’s unionize the data."
              : `${connections.length} institution${connections.length === 1 ? "" : "s"} connected. The money is finally in one group chat.`}
          </p>
        </div>
        <div>
          <Button
            size="sm"
            disabled={!configured || busy !== null}
            onClick={() => startFlow({})}
          >
            <Plus className="size-4" />
            {busy === "connect" ? "Opening Plaid…" : "Connect an institution"}
          </Button>
        </div>
      </div>

      {!configured && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div>
            <div className="font-medium">Plaid is dressed for work but missing its badge.</div>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Add and verify your Plaid developer credentials above. Basis will keep your connection quota politely separated from everyone else&apos;s.
            </p>
          </div>
        </div>
      )}

      {flowError && (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950/30">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
          <div>
            <div className="font-medium">Plaid tripped over its own shoelaces.</div>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">{flowError}</p>
          </div>
        </div>
      )}

      {successMessage && (
        <div role="status" className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          <p className="text-zinc-700 dark:text-zinc-300">{successMessage}</p>
        </div>
      )}

      {connections.length > 0 && (
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {connections.map((connection) => {
            const healthy = connection.status === "ACTIVE";
            const loginRequired = connection.status === "LOGIN_REQUIRED";
            return (
              <div key={connection.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-900">
                    <Building2 className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {connection.institutionName || "Connected institution"}
                      </span>
                      <span className={healthy ? "inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400" : "inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"}>
                        {healthy ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
                        {healthy ? "Connected" : "Needs attention"}
                      </span>
                    </div>
                    <p suppressHydrationWarning className="mt-0.5 text-xs text-zinc-500">
                      {connection.errorMessage ||
                        (connection.lastSyncedAt
                          ? `Last synced ${new Date(connection.lastSyncedAt).toLocaleString()}`
                          : "Ready for its first sync")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-12 sm:pl-0">
                  {healthy || !loginRequired ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => sync(connection)}
                    >
                      <RefreshCw className={busy === connection.id ? "size-3.5 animate-spin" : "size-3.5"} />
                      {busy === connection.id ? "Syncing…" : healthy ? "Sync" : "Retry sync"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => startFlow({ connectionId: connection.id })}
                    >
                      <RefreshCw className="size-3.5" /> Repair
                    </Button>
                  )}
                  {healthy ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => startFlow({ connectionId: connection.id })}
                      title="Grant new Plaid permissions or refresh account access"
                    >
                      <ShieldCheck className="size-3.5" /> Access
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() => disconnect(connection)}
                    className="text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                  >
                    <Unplug className="size-3.5" /> Disconnect
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
