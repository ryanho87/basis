"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function InviteBootstrap() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function exchangeInvite() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const token = params.get("invite")?.trim() ?? "";
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

      if (token.length < 32 || token.length > 256) {
        throw new Error("This invite is missing or malformed. Ask for a fresh invitation.");
      }

      const response = await fetch("/api/auth/invite-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        credentials: "same-origin",
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Basis could not verify this invitation.");
      }

      window.location.replace("/sign-up");
    }

    void exchangeInvite().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Basis could not verify this invitation.");
    });
  }, []);

  return (
    <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      {error ? (
        <>
          <p role="alert" className="text-sm leading-6 text-red-700 dark:text-red-300">{error}</p>
          <Link href="/sign-in" className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-100 px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700">
            Go to sign in
          </Link>
        </>
      ) : (
        <p role="status" className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">Verifying the invitation…</p>
      )}
    </div>
  );
}
