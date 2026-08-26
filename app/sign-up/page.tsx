import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { InviteBootstrap } from "@/components/invite-bootstrap";
import { getInvitePreview } from "@/lib/auth-invite";
import { INVITE_COOKIE } from "@/lib/auth-shared";
import { getCurrentAuthSession } from "@/lib/user";

export default async function SignUpPage() {
  if (await getCurrentAuthSession()) redirect("/");
  const token = (await cookies()).get(INVITE_COOKIE)?.value.trim() ?? "";
  const preview = token ? await getInvitePreview(token) : null;
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
  const passwordEnabled = process.env.NODE_ENV !== "production" || process.env.ENABLE_PASSWORD_AUTH === "true";

  if (!preview) {
    return (
      <AuthShell eyebrow="Invite required" title="That door is locked" description="This invite is missing, expired, or already used. Ask the person who invited you for a fresh link. Yes, financial privacy occasionally involves being a buzzkill.">
        <InviteBootstrap />
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Private beta" title={`Create ${preview.name ? `${preview.name}'s` : "your"} account`} description={`This invitation is for ${preview.email}. It creates a separate financial profile; sharing can be added explicitly later.`}>
      <AuthForm mode="sign-up" googleEnabled={googleEnabled} passwordEnabled={passwordEnabled} invite={{ email: preview.email, name: preview.name, expiresAt: preview.expiresAt.toISOString() }} />
    </AuthShell>
  );
}
