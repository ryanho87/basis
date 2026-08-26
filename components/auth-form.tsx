"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

type AuthMode = "sign-in" | "sign-up";

interface AuthFormProps {
  mode: AuthMode;
  googleEnabled?: boolean;
  passwordEnabled?: boolean;
  oauthError?: boolean;
  returnTo?: string;
  invite?: {
    email: string;
    name: string | null;
    expiresAt: string;
  };
}

function errorMessage(body: unknown) {
  if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
    return body.message;
  }
  return "Basis could not verify those details. Try again.";
}

export function AuthForm({ mode, invite, googleEnabled = false, passwordEnabled = true, oauthError = false, returnTo = "/" }: AuthFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    oauthError ? "Google sign-in failed. Make sure you chose the email address on your Basis invite." : null,
  );
  const isSignUp = mode === "sign-up";

  async function signInWithGoogle() {
    setError(null);
    setPending(true);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: returnTo,
        errorCallbackURL: `/sign-in?error=oauth&returnTo=${encodeURIComponent(returnTo)}`,
        ...(invite?.email ? { additionalParams: { login_hint: invite.email } } : {}),
      });
      if (result.error) setError(result.error.message || "Google sign-in failed.");
    } catch {
      setError("Basis could not start Google sign-in. Even OAuth occasionally needs adult supervision.");
    } finally {
      setPending(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("passwordConfirmation") ?? "");

    if (isSignUp && password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setPending(true);
    try {
      const endpoint = isSignUp ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email";
      const payload = isSignUp
        ? { email: invite?.email, name: String(data.get("name") ?? ""), password }
        : { email: String(data.get("email") ?? ""), password, rememberMe: true };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        setError(errorMessage(body));
        return;
      }

      router.push(returnTo);
      router.refresh();
    } catch {
      setError("Basis could not reach the login service. Your money is still there, being emotionally unavailable.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
      {googleEnabled && (
        <>
          <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={signInWithGoogle}>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
              <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
              <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.05v2.62A10 10 0 0 0 12 22Z" />
              <path fill="#FBBC05" d="M6.39 13.93A6.02 6.02 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.45H3.05A10 10 0 0 0 2 12c0 1.61.39 3.14 1.05 4.55l3.34-2.62Z" />
              <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.95 5.45l3.34 2.62C7.18 7.7 9.39 5.94 12 5.94Z" />
            </svg>
            Continue with Google
          </Button>
          {passwordEnabled && (
            <div className="flex items-center gap-3" aria-hidden="true">
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              <span className="text-xs uppercase tracking-wider text-zinc-400">or</span>
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            </div>
          )}
        </>
      )}
      {passwordEnabled && (isSignUp ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" autoComplete="name" defaultValue={invite?.name ?? ""} required minLength={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" value={invite?.email ?? ""} readOnly aria-describedby="email-help" />
            <p id="email-help" className="text-xs text-zinc-500">Locked to this invitation.</p>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </div>
      ))}

      {passwordEnabled && <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          minLength={12}
          maxLength={128}
          required
          autoFocus={isSignUp}
          aria-describedby={isSignUp ? "password-help" : undefined}
        />
        {isSignUp && <p id="password-help" className="text-xs text-zinc-500">At least 12 characters. Your pet&apos;s name plus “123” has suffered enough.</p>}
      </div>}

      {passwordEnabled && isSignUp && (
        <div className="space-y-2">
          <Label htmlFor="passwordConfirmation">Confirm password</Label>
          <Input id="passwordConfirmation" name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {passwordEnabled && (
        <Button type="submit" className="w-full" disabled={pending || (isSignUp && !invite)}>
          {pending ? "Verifying…" : isSignUp ? "Create private account" : "Sign in"}
          {!pending && <ArrowRight className="size-4" aria-hidden="true" />}
        </Button>
      )}

      {!googleEnabled && !passwordEnabled && (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          No production sign-in provider is configured.
        </div>
      )}

      <div className="flex items-start gap-2 text-xs leading-5 text-zinc-500">
        <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <p>Financial profiles stay separate. Joining Basis does not expose another member&apos;s accounts.</p>
      </div>

      <p className="text-center text-sm text-zinc-500">
        {isSignUp ? "Already joined?" : "Invited but not set up?"}{" "}
        <Link href={isSignUp ? "/sign-in" : "/sign-up"} className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100">
          {isSignUp ? "Sign in" : "Use your invite link"}
        </Link>
      </p>
    </form>
  );
}
