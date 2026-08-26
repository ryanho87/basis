"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IdentityProvider, StytchProvider, createStytchUIClient } from "@stytch/nextjs";

interface StytchOAuthAuthorizeProps {
  projectDomain: string;
  publicToken: string;
  trustedAuthToken: string;
  tokenProfileId: string;
}

export function StytchOAuthAuthorize({ projectDomain, publicToken, trustedAuthToken, tokenProfileId }: StytchOAuthAuthorizeProps) {
  const stytch = useMemo(
    () => createStytchUIClient(publicToken, { customBaseUrl: projectDomain }),
    [projectDomain, publicToken],
  );
  const attestation = useRef<Promise<void> | null>(null);
  const [status, setStatus] = useState<"attesting" | "ready" | "error">("attesting");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    // Stytch's IdentityProvider currently checks for a user before its built-in
    // trusted-token attestation has settled. Perform that bridge explicitly so
    // the consent component never mounts without an active Stytch session.
    attestation.current ??= (async () => {
      if (stytch.user.getSync()) {
        await stytch.session.revoke({ forceClear: true });
      }
      await stytch.session.attest({
        token: trustedAuthToken,
        profile_id: tokenProfileId,
        session_duration_minutes: 60,
      });
    })();

    attestation.current.then(
      () => {
        if (active) setStatus("ready");
      },
      (error: unknown) => {
        if (!active) return;
        const message = error && typeof error === "object" && "error_message" in error
          ? String(error.error_message)
          : error instanceof Error
            ? error.message
            : "Basis could not establish the secure Stytch session.";
        console.error("Stytch trusted-token attestation failed", error);
        setErrorMessage(message);
        setStatus("error");
      },
    );

    return () => {
      active = false;
    };
  }, [stytch, tokenProfileId, trustedAuthToken]);

  if (status === "attesting") {
    return <p className="py-10 text-center text-sm text-zinc-500">Establishing your secure Basis session…</p>;
  }

  if (status === "error") {
    return (
      <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
        <p className="font-medium">Basis could not establish the secure connection.</p>
        <p>{errorMessage}</p>
        <button className="underline underline-offset-4" onClick={() => window.location.reload()} type="button">
          Try again
        </button>
      </div>
    );
  }

  return (
    <StytchProvider stytch={stytch}>
      <IdentityProvider />
    </StytchProvider>
  );
}
