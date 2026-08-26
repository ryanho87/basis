import "server-only";

import { prisma } from "@/lib/prisma";

export class ResourceNotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} was not found`);
    this.name = "ResourceNotFoundError";
  }
}

export async function requireOwnedAccount(accountId: string, userId: string) {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new ResourceNotFoundError("Account");
  return account;
}
