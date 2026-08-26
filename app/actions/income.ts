"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { FilingStatus, PayFrequency } from "@prisma/client";

export async function upsertPaycheckProfile(formData: FormData) {
  const userId = await getCurrentUserId();
  await prisma.paycheckProfile.upsert({
    where: { userId },
    update: {
      annualSalary: parseFloat((formData.get("annualSalary") as string) || "0"),
      payFrequency: (formData.get("payFrequency") as PayFrequency) || "BIWEEKLY",
      expectedBonus: parseFloat((formData.get("expectedBonus") as string) || "0") || null,
      bonusMonth: parseInt((formData.get("bonusMonth") as string) || "0", 10) || null,
      k401Contribution: parseFloat((formData.get("k401Contribution") as string) || "0") || null,
      hsaContribution: parseFloat((formData.get("hsaContribution") as string) || "0") || null,
      otherPretax: parseFloat((formData.get("otherPretax") as string) || "0") || null,
    },
    create: {
      userId,
      annualSalary: parseFloat((formData.get("annualSalary") as string) || "0"),
      payFrequency: (formData.get("payFrequency") as PayFrequency) || "BIWEEKLY",
      expectedBonus: parseFloat((formData.get("expectedBonus") as string) || "0") || null,
      bonusMonth: parseInt((formData.get("bonusMonth") as string) || "0", 10) || null,
      k401Contribution: parseFloat((formData.get("k401Contribution") as string) || "0") || null,
      hsaContribution: parseFloat((formData.get("hsaContribution") as string) || "0") || null,
      otherPretax: parseFloat((formData.get("otherPretax") as string) || "0") || null,
    },
  });
  revalidatePath("/tax");
  revalidatePath("/");
}

export async function upsertSCorpProfile(formData: FormData) {
  const userId = await getCurrentUserId();
  await prisma.sCorpProfile.upsert({
    where: { userId },
    update: {
      corpName: (formData.get("corpName") as string) || null,
      annualRevenue: parseFloat((formData.get("annualRevenue") as string) || "0"),
      operatingExpenses: parseFloat((formData.get("operatingExpenses") as string) || "0") || 0,
      w2SalaryFromCorp: parseFloat((formData.get("w2SalaryFromCorp") as string) || "0"),
      projectedDistribution: parseFloat((formData.get("projectedDistribution") as string) || "0") || null,
      solo401kContribution: parseFloat((formData.get("solo401kContribution") as string) || "0") || null,
    },
    create: {
      userId,
      corpName: (formData.get("corpName") as string) || null,
      annualRevenue: parseFloat((formData.get("annualRevenue") as string) || "0"),
      operatingExpenses: parseFloat((formData.get("operatingExpenses") as string) || "0") || 0,
      w2SalaryFromCorp: parseFloat((formData.get("w2SalaryFromCorp") as string) || "0"),
      projectedDistribution: parseFloat((formData.get("projectedDistribution") as string) || "0") || null,
      solo401kContribution: parseFloat((formData.get("solo401kContribution") as string) || "0") || null,
    },
  });
  revalidatePath("/tax");
  revalidatePath("/");
}

export async function addIncomeSnapshot(formData: FormData) {
  const userId = await getCurrentUserId();
  const rawRsuIncome = String(formData.get("ytdRsuVestIncome") ?? "").trim();
  await prisma.w2Snapshot.create({
    data: {
      userId,
      taxYear: parseInt((formData.get("taxYear") as string) || `${new Date().getFullYear()}`, 10),
      snapshotDate: new Date((formData.get("snapshotDate") as string) || new Date().toISOString()),
      ytdWages: parseFloat((formData.get("ytdWages") as string) || "0"),
      ytdFederalWithheld: parseFloat((formData.get("ytdFederalWithheld") as string) || "0") || 0,
      ytdStateWithheld: parseFloat((formData.get("ytdStateWithheld") as string) || "0") || 0,
      ytdBonuses: parseFloat((formData.get("ytdBonuses") as string) || "0") || 0,
      ytdRsuVestIncome: parseFloat(rawRsuIncome || "0") || 0,
      rsuIncomeIsExplicit: rawRsuIncome !== "",
    },
  });
  revalidatePath("/tax");
  revalidatePath("/");
}

export async function updateUserTaxSettings(formData: FormData) {
  const userId = await getCurrentUserId();
  await prisma.user.update({
    where: { id: userId },
    data: {
      filingStatus: (formData.get("filingStatus") as FilingStatus) || "SINGLE",
      state: (formData.get("state") as string) || null,
    },
  });
  revalidatePath("/tax");
  revalidatePath("/settings");
  revalidatePath("/");
}
