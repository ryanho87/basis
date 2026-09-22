"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { parseRsuGrant, type RsuGrantFormState } from "@/lib/rsu-schedule";

export async function createRsuGrant(_previousState: RsuGrantFormState, formData: FormData): Promise<RsuGrantFormState> {
  const userId = await getCurrentUserId();
  let parsed: ReturnType<typeof parseRsuGrant>;
  try {
    parsed = parseRsuGrant(formData);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Check the grant details and try again." };
  }

  const { vestEvents, ...grant } = parsed;
  try {
    // Nested writes commit the grant and its complete schedule together.
    await prisma.rsuGrant.create({
      data: { userId, ...grant, vestEvents: { create: vestEvents } },
    });
  } catch {
    return { error: "We couldn't save this grant. Your details are still here. Please try again." };
  }

  revalidatePath("/equity");
  revalidatePath("/");
  redirect("/equity");
}

export async function deleteRsuGrant(grantId: string) {
  const userId = await getCurrentUserId();
  await prisma.rsuGrant.deleteMany({ where: { id: grantId, userId } });
  revalidatePath("/equity");
  revalidatePath("/");
}

// Mark a vest event as vested. Locks FMV-at-vest as cost basis. Optionally
// creates a linked AssetLot in a target taxable brokerage account (so post-
// vest holdings show up correctly with cost basis tracking).
export async function markVestVested(
  vestEventId: string,
  formData: FormData,
) {
  const userId = await getCurrentUserId();
  const fmv = parseFloat((formData.get("fmv") as string) || "0");
  const accountId = (formData.get("accountId") as string) || null;

  const vest = await prisma.vestEvent.findFirst({
    where: { id: vestEventId, grant: { userId } },
    include: { grant: true },
  });
  if (!vest) return;

  if (accountId) {
    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) return;
  }

  await prisma.vestEvent.update({
    where: { id: vestEventId },
    data: { fmvAtVest: fmv, status: "VESTED" },
  });

  if (accountId) {
    await prisma.assetLot.create({
      data: {
        accountId,
        ticker: vest.grant.ticker,
        shares: vest.shares,
        costBasisPerShare: fmv,
        acquiredAt: vest.vestDate,
        acquisitionType: "RSU_VEST",
        vestEventId: vest.id,
      },
    });
  }

  revalidatePath("/equity");
  revalidatePath("/");
}
