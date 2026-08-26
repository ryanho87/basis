"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

type InviteFormState = {
  status: "idle" | "error" | "success";
  message: string;
  inviteUrl?: string;
  invitedEmail?: string;
  expiresAt?: string;
  fieldErrors?: {
    name?: string;
    email?: string;
    hours?: string;
  };
};

const initialInviteFormState: InviteFormState = {
  status: "idle",
  message: "",
};

export function AdminInviteForm() {
  const router = useRouter();
  const [state, setState] = useState<InviteFormState>(initialInviteFormState);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setState(initialInviteFormState);

    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          hours: formData.get("hours"),
        }),
      });
      const result = (await response.json().catch(() => null)) as Omit<InviteFormState, "status"> | null;

      if (!response.ok || !result) {
        setState({
          status: "error",
          message: result?.message || "Basis could not create the invitation. Try again.",
          fieldErrors: result?.fieldErrors,
        });
        return;
      }

      setState({ status: "success", ...result });
      formRef.current?.reset();
      router.refresh();
    } catch {
      setState({
        status: "error",
        message: "Basis could not reach the server. Check your connection and try again.",
      });
    } finally {
      setPending(false);
    }
  }

  async function copyInvite() {
    if (!state.inviteUrl) return;
    await navigator.clipboard.writeText(state.inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <UserPlus className="size-4" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">Invite someone</h2>
          <p className="mt-1 max-w-[62ch] text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            They receive a separate financial profile. Your questionable portfolio decisions remain exclusively yours.
          </p>
        </div>
      </div>

      <form ref={formRef} onSubmit={createInvite} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="invite-name">Name</Label>
          <Input
            id="invite-name"
            name="name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="off"
            placeholder="Alex Smith"
            aria-describedby={state.fieldErrors?.name ? "invite-name-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.name)}
            className="mt-1.5"
          />
          {state.fieldErrors?.name ? (
            <p id="invite-name-error" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
              {state.fieldErrors.name}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="invite-email">Google email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoCapitalize="none"
            autoComplete="off"
            placeholder="alex@example.com"
            aria-describedby={state.fieldErrors?.email ? "invite-email-error" : "invite-email-help"}
            aria-invalid={Boolean(state.fieldErrors?.email)}
            className="mt-1.5"
          />
          {state.fieldErrors?.email ? (
            <p id="invite-email-error" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
              {state.fieldErrors.email}
            </p>
          ) : (
            <p id="invite-email-help" className="mt-1.5 text-xs text-zinc-500">
              This must match the Google account used at sign-in.
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="invite-hours">Link expires</Label>
          <Select id="invite-hours" name="hours" defaultValue="72" className="mt-1.5">
            <option value="24">In 24 hours</option>
            <option value="72">In 3 days</option>
            <option value="168">In 7 days</option>
          </Select>
        </div>

        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Creating invite…" : "Create invite link"}
        </Button>
      </form>

      {state.status === "error" ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {state.message}
        </p>
      ) : null}

      {state.status === "success" && state.inviteUrl ? (
        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
          <div className="flex items-start gap-2 text-sm font-medium text-emerald-900 dark:text-emerald-100">
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>Invite ready for {state.invitedEmail}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-emerald-800 dark:text-emerald-200">{state.message}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={state.inviteUrl} aria-label="Generated invitation link" className="font-mono text-xs" />
            <Button type="button" variant="outline" onClick={copyInvite} className="shrink-0">
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          {state.expiresAt ? (
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
              Expires {new Date(state.expiresAt).toLocaleString()}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
