import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { getCurrentAuthSession } from "@/lib/user";

function safeReturnTo(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  const { error, returnTo } = await searchParams;
  const destination = safeReturnTo(returnTo);
  if (await getCurrentAuthSession()) redirect(destination);
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
  const passwordEnabled = process.env.NODE_ENV !== "production" || process.env.ENABLE_PASSWORD_AUTH === "true";

  return (
    <AuthShell eyebrow="Welcome back" title="Sign in to your financial life" description="One private profile, one session, zero opportunities for strangers to critique your NVIDIA exposure.">
      <AuthForm mode="sign-in" googleEnabled={googleEnabled} passwordEnabled={passwordEnabled} oauthError={Boolean(error)} returnTo={destination} />
    </AuthShell>
  );
}
