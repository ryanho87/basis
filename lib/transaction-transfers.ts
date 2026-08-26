import "server-only";

import type { CashFlowTreatment } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const PAIR_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

type CashFlowTransaction = {
  amount: number;
  plaidPrimaryCategory: string | null;
  plaidDetailedCategory: string | null;
  cashFlowTreatment: CashFlowTreatment;
  transactionCategory?: { slug: string } | null;
  transferPairAsDebit?: { id: string } | null;
  transferPairAsCredit?: { id: string } | null;
};

export type EffectiveCashFlow = "SPENDING" | "INCOME" | "TRANSFER" | "OTHER";

export function isPlaidTransfer(transaction: Pick<CashFlowTransaction, "plaidPrimaryCategory" | "plaidDetailedCategory">) {
  const primary = transaction.plaidPrimaryCategory ?? "";
  const detailed = transaction.plaidDetailedCategory ?? "";
  return primary === "TRANSFER_IN"
    || primary === "TRANSFER_OUT"
    || detailed.includes("CREDIT_CARD_PAYMENT")
    || detailed.includes("ACCOUNT_TRANSFER");
}

export function effectiveCashFlow(transaction: CashFlowTransaction): EffectiveCashFlow {
  if (transaction.cashFlowTreatment !== "AUTO") return transaction.cashFlowTreatment;
  if (transaction.transferPairAsDebit || transaction.transferPairAsCredit || isPlaidTransfer(transaction)) return "TRANSFER";
  if (transaction.amount < 0 && transaction.transactionCategory?.slug === "income") return "INCOME";
  if (transaction.amount > 0) return "SPENDING";
  return "OTHER";
}

export async function pairCreditCardPayments(userId: string) {
  const transactions = await prisma.plaidTransaction.findMany({
    where: {
      isRemoved: false,
      pending: false,
      cashFlowTreatment: "AUTO",
      plaidAccount: { isActive: true, plaidItem: { userId } },
      transferPairAsDebit: null,
      transferPairAsCredit: null,
    },
    select: {
      id: true,
      date: true,
      amount: true,
      plaidPrimaryCategory: true,
      plaidDetailedCategory: true,
      plaidAccount: { select: { type: true } },
    },
    orderBy: { date: "asc" },
  });

  const debits = transactions.filter((transaction) => transaction.amount > 0 && transaction.plaidAccount.type.toLowerCase() === "depository");
  const credits = transactions.filter((transaction) => transaction.amount < 0 && transaction.plaidAccount.type.toLowerCase() === "credit");
  const claimed = new Set<string>();
  let paired = 0;

  for (const debit of debits) {
    const candidates = credits
      .filter((credit) => {
        if (claimed.has(credit.id)) return false;
        const amountDifference = Math.abs(debit.amount - Math.abs(credit.amount));
        const dateDifference = Math.abs(debit.date.getTime() - credit.date.getTime());
        return amountDifference <= 0.01
          && dateDifference <= PAIR_WINDOW_MS
          && (isPlaidTransfer(debit) || isPlaidTransfer(credit));
      })
      .sort((a, b) => Math.abs(debit.date.getTime() - a.date.getTime()) - Math.abs(debit.date.getTime() - b.date.getTime()));
    const credit = candidates[0];
    if (!credit) continue;
    const dateDays = Math.abs(debit.date.getTime() - credit.date.getTime()) / 86_400_000;
    try {
      await prisma.transactionTransferPair.create({
        data: {
          userId,
          debitTransactionId: debit.id,
          creditTransactionId: credit.id,
          matchSource: "AUTO",
          confidence: Math.max(0.8, 1 - dateDays * 0.04),
        },
      });
      claimed.add(credit.id);
      paired += 1;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("Unique constraint")) throw error;
    }
  }

  return paired;
}
