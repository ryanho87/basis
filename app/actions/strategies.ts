"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";

export async function setStrategyStatus(
  id: string,
  status: "NEW" | "ACKNOWLEDGED" | "DISMISSED" | "ACTIONED",
) {
  const userId = await getCurrentUserId();
  await prisma.strategySuggestion.updateMany({
    where: { id, userId },
    data: { status },
  });
  revalidatePath("/strategies");
  revalidatePath("/");
}

export async function deleteStrategy(id: string) {
  const userId = await getCurrentUserId();
  await prisma.strategySuggestion.deleteMany({ where: { id, userId } });
  revalidatePath("/strategies");
  revalidatePath("/");
}
