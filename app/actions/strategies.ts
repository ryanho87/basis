"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function setStrategyStatus(
  id: string,
  status: "NEW" | "ACKNOWLEDGED" | "DISMISSED" | "ACTIONED",
) {
  await prisma.strategySuggestion.update({
    where: { id },
    data: { status },
  });
  revalidatePath("/strategies");
  revalidatePath("/");
}

export async function deleteStrategy(id: string) {
  await prisma.strategySuggestion.delete({ where: { id } });
  revalidatePath("/strategies");
  revalidatePath("/");
}
