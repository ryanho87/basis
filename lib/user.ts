import { prisma } from "./prisma";

// Single-user MVP — get-or-create the one user.
const DEFAULT_EMAIL = "you@basis.local";

export async function getCurrentUser() {
  const existing = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      email: DEFAULT_EMAIL,
      name: "You",
    },
  });
}

export async function getCurrentUserId() {
  return (await getCurrentUser()).id;
}
