"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type CancelState = "idle" | "confirm" | "pending" | "error";

export function AdminInviteCancelButton({ inviteId }: { inviteId: string }) {
  const router = useRouter();
  const [state, setState] = useState<CancelState>("idle");
  const [error, setError] = useState("");

  async function cancelInvite() {
    setState("pending");
    setError("");
    try {
      const response = await fetch(`/api/admin/invites/${encodeURIComponent(inviteId)}`, {
        method: "DELETE",
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setError(result?.message || "Basis could not cancel the invitation.");
        setState("error");
        return;
      }
      router.refresh();
    } catch {
      setError("Basis could not reach the server. Try again.");
      setState("error");
    }
  }

  if (state === "confirm" || state === "pending" || state === "error") {
    return (
      <div className="flex min-w-[190px] flex-col items-end gap-2">
        <p role={state === "error" ? "alert" : undefined} className="text-xs text-zinc-600 dark:text-zinc-400">
          {state === "error" ? error : "Cancel this invitation?"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={state === "pending"}
            onClick={() => {
              setError("");
              setState("idle");
            }}
          >
            Keep
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={state === "pending"}
            onClick={cancelInvite}
          >
            {state === "pending" ? "Canceling…" : "Cancel invite"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button type="button" size="sm" variant="ghost" onClick={() => setState("confirm")}>
      <X className="size-3.5" aria-hidden="true" />
      Cancel
    </Button>
  );
}
