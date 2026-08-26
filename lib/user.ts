import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthenticationRequiredError";
  }
}

export class FinancialProfileMissingError extends Error {
  constructor() {
    super("The authenticated identity is not attached to a financial profile");
    this.name = "FinancialProfileMissingError";
  }
}

export const getCurrentAuthSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

export const getCurrentUser = cache(async () => {
  const session = await getCurrentAuthSession();
  if (!session) throw new AuthenticationRequiredError();

  const identity = await prisma.authUser.findUnique({
    where: { id: session.user.id },
    select: { profile: true },
  });
  if (!identity?.profile) throw new FinancialProfileMissingError();
  return identity.profile;
});

export async function getCurrentUserId() {
  return (await getCurrentUser()).id;
}
