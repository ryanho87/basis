"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { orderLots, type LotSaleStrategy } from "@/lib/scenario";

export async function createPlannedSale(formData: FormData) {
  const userId = await getCurrentUserId();
  const ticker = String(formData.get("ticker") ?? "").toUpperCase();
  const shares = parseFloat((formData.get("shares") as string) || "0");
  const estimatedPricePerShare = parseFloat((formData.get("price") as string) || "0");
  const plannedDate = new Date(String(formData.get("plannedDate")));
  const strategy = String(formData.get("strategy") ?? "FIFO") as LotSaleStrategy;
  const pickedLotIds = formData.getAll("lotIds").map(String).filter(Boolean);
  const notes = (formData.get("notes") as string) || null;

  if (!ticker || shares <= 0 || estimatedPricePerShare <= 0) {
    redirect("/scenarios/new");
  }

  // Checked lots win over the strategy dropdown; FIFO is stored as null so
  // the scenario stays live against future lot changes. HIFO/TAX_OPTIMAL are
  // snapshotted to an explicit lot order at creation time.
  let lotSelection: string | null = null;
  if (pickedLotIds.length > 0) {
    lotSelection = JSON.stringify(pickedLotIds);
  } else if (strategy !== "FIFO") {
    const lots = await prisma.assetLot.findMany({
      where: {
        ticker,
        account: { userId, type: { in: ["TAXABLE_BROKERAGE", "CRYPTO"] } },
      },
    });
    const ordered = orderLots(lots, strategy, plannedDate);
    lotSelection = JSON.stringify(ordered.map((l) => l.id));
  }

  await prisma.plannedSale.create({
    data: {
      userId,
      ticker,
      shares,
      estimatedPricePerShare,
      plannedDate,
      lotSelection,
      notes,
    },
  });

  revalidatePath("/scenarios");
  revalidatePath("/");
  redirect("/scenarios");
}

export async function deletePlannedSale(id: string) {
  const userId = await getCurrentUserId();
  await prisma.plannedSale.deleteMany({ where: { id, userId } });
  revalidatePath("/scenarios");
  revalidatePath("/");
}
