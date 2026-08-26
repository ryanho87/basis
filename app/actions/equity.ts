"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";

export async function createRsuGrant(formData: FormData) {
  const userId = await getCurrentUserId();
  const ticker = String(formData.get("ticker") ?? "").toUpperCase();
  const company = (formData.get("company") as string) || null;
  const grantDate = new Date(String(formData.get("grantDate")));
  const totalShares = parseFloat((formData.get("totalShares") as string) || "0");
  const vestStartDate = new Date(String(formData.get("vestStartDate") ?? formData.get("grantDate")));
  const cliffMonths = parseInt((formData.get("cliffMonths") as string) || "12", 10);
  const totalMonths = parseInt((formData.get("totalMonths") as string) || "48", 10);
  const cadence = String(formData.get("cadence") ?? "QUARTERLY"); // QUARTERLY | MONTHLY | YEARLY

  const grant = await prisma.rsuGrant.create({
    data: { userId, ticker, company, grantDate, totalShares },
  });

  // Auto-generate vest events based on cliff + cadence (simple linear schedule).
  const periodMonths = cadence === "MONTHLY" ? 1 : cadence === "YEARLY" ? 12 : 3;
  const periodsAfterCliff = Math.max(0, Math.floor((totalMonths - cliffMonths) / periodMonths));
  const totalPeriods = periodsAfterCliff + (cliffMonths > 0 ? 1 : 0);
  const sharesPerPeriod = totalShares / totalPeriods;

  const events: { vestDate: Date; shares: number }[] = [];
  if (cliffMonths > 0) {
    const cliffDate = new Date(vestStartDate);
    cliffDate.setMonth(cliffDate.getMonth() + cliffMonths);
    events.push({ vestDate: cliffDate, shares: sharesPerPeriod });
  }
  for (let i = 1; i <= periodsAfterCliff; i++) {
    const d = new Date(vestStartDate);
    d.setMonth(d.getMonth() + cliffMonths + i * periodMonths);
    events.push({ vestDate: d, shares: sharesPerPeriod });
  }

  if (events.length > 0) {
    await prisma.vestEvent.createMany({
      data: events.map((e) => ({
        grantId: grant.id,
        vestDate: e.vestDate,
        shares: e.shares,
        status: "PENDING",
      })),
    });
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
