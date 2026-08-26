import "server-only";

import { getCurrentAuthSession } from "@/lib/user";

function configuredAdminEmails() {
  return new Set(
    (process.env.BASIS_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined) {
  return Boolean(email && configuredAdminEmails().has(email.trim().toLowerCase()));
}

export async function getCurrentAdminSession() {
  const session = await getCurrentAuthSession();
  return session && isAdminEmail(session.user.email) ? session : null;
}
