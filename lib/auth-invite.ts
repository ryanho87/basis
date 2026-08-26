import "server-only";

import { hashInviteToken } from "@/lib/invite-token";
import { prisma } from "@/lib/prisma";

export async function getValidInvite(token: string) {
  if (token.length < 32 || token.length > 256) return null;

  return prisma.authInvite.findFirst({
    where: {
      tokenHash: hashInviteToken(token),
      acceptedAt: null,
      canceledAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      email: true,
      name: true,
      profileUserId: true,
      expiresAt: true,
    },
  });
}

export async function getValidInviteForEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) return null;

  return prisma.authInvite.findFirst({
    where: {
      email: normalizedEmail,
      acceptedAt: null,
      canceledAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      profileUserId: true,
      expiresAt: true,
    },
  });
}

export async function getInvitePreview(token: string) {
  const invite = await getValidInvite(token);
  if (!invite) return null;
  return {
    email: invite.email,
    name: invite.name,
    expiresAt: invite.expiresAt,
  };
}
