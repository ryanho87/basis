"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { requireOwnedAccount } from "@/lib/ownership";
import {
  AccountType,
  AcquisitionType,
  LiabilityType,
  ManualAssetType,
  RepaymentPlan,
  StudentLoanType,
} from "@prisma/client";

export async function createAccount(formData: FormData) {
  const userId = await getCurrentUserId();
  const account = await prisma.account.create({
    data: {
      userId,
      name: String(formData.get("name") ?? "Untitled"),
      institution: (formData.get("institution") as string) || null,
      type: formData.get("type") as AccountType,
      cashBalance: parseFloat((formData.get("cashBalance") as string) || "0") || 0,
    },
  });
  revalidatePath("/");
  revalidatePath("/accounts");
  redirect(`/accounts/${account.id}`);
}

export async function deleteAccount(accountId: string) {
  const userId = await getCurrentUserId();
  await prisma.account.deleteMany({ where: { id: accountId, userId } });
  revalidatePath("/");
  revalidatePath("/accounts");
  redirect("/accounts");
}

export async function addLot(accountId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  await requireOwnedAccount(accountId, userId);
  await prisma.assetLot.create({
    data: {
      accountId,
      ticker: String(formData.get("ticker") ?? "").toUpperCase(),
      name: (formData.get("name") as string) || null,
      shares: parseFloat((formData.get("shares") as string) || "0"),
      costBasisPerShare: parseFloat((formData.get("costBasisPerShare") as string) || "0"),
      acquiredAt: new Date((formData.get("acquiredAt") as string) || new Date().toISOString()),
      acquisitionType: (formData.get("acquisitionType") as AcquisitionType) || "PURCHASE",
      notes: (formData.get("notes") as string) || null,
    },
  });
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/");
  revalidatePath("/equity");
}

export async function deleteLot(accountId: string, lotId: string) {
  const userId = await getCurrentUserId();
  await prisma.assetLot.deleteMany({ where: { id: lotId, accountId, account: { userId } } });
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/");
}

export async function addHoldingPosition(accountId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  await requireOwnedAccount(accountId, userId);
  await prisma.holdingPosition.create({
    data: {
      accountId,
      ticker: String(formData.get("ticker") ?? "").toUpperCase(),
      name: (formData.get("name") as string) || null,
      shares: parseFloat((formData.get("shares") as string) || "0"),
      currentValue: parseFloat((formData.get("currentValue") as string) || "0"),
    },
  });
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/");
}

export async function deleteHoldingPosition(accountId: string, posId: string) {
  const userId = await getCurrentUserId();
  await prisma.holdingPosition.deleteMany({ where: { id: posId, accountId, account: { userId } } });
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/");
}

export async function updateAccountCash(accountId: string, formData: FormData) {
  const userId = await getCurrentUserId();
  await prisma.account.updateMany({
    where: { id: accountId, userId },
    data: { cashBalance: parseFloat((formData.get("cashBalance") as string) || "0") },
  });
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/");
}

export async function createManualAsset(formData: FormData) {
  const userId = await getCurrentUserId();
  await prisma.manualAsset.create({
    data: {
      userId,
      name: String(formData.get("name") ?? "Asset"),
      type: (formData.get("type") as ManualAssetType) || "OTHER",
      currentValue: parseFloat((formData.get("currentValue") as string) || "0"),
      purchasePrice: parseFloat((formData.get("purchasePrice") as string) || "0") || null,
      purchaseDate: formData.get("purchaseDate")
        ? new Date(formData.get("purchaseDate") as string)
        : null,
    },
  });
  revalidatePath("/");
  revalidatePath("/accounts");
  redirect("/accounts");
}

export async function createLiability(formData: FormData) {
  const userId = await getCurrentUserId();
  const isStudentLoan = formData.get("isStudentLoan") === "on";
  if (isStudentLoan) {
    await prisma.studentLoan.create({
      data: {
        userId,
        servicer: (formData.get("servicer") as string) || null,
        loanType: (formData.get("loanType") as StudentLoanType) || "FEDERAL_DIRECT",
        balance: parseFloat((formData.get("balance") as string) || "0"),
        interestRate: parseFloat((formData.get("interestRate") as string) || "0"),
        monthlyPayment: parseFloat((formData.get("monthlyPayment") as string) || "0") || null,
        repaymentPlan: (formData.get("repaymentPlan") as RepaymentPlan) || null,
        pslfEligible: formData.get("pslfEligible") === "on",
      },
    });
  } else {
    await prisma.liability.create({
      data: {
        userId,
        name: String(formData.get("name") ?? "Liability"),
        type: (formData.get("type") as LiabilityType) || "OTHER",
        currentBalance: parseFloat((formData.get("currentBalance") as string) || "0"),
        interestRate: parseFloat((formData.get("interestRate") as string) || "0") || null,
        monthlyPayment: parseFloat((formData.get("monthlyPayment") as string) || "0") || null,
      },
    });
  }
  revalidatePath("/");
  revalidatePath("/accounts");
  redirect("/accounts");
}
