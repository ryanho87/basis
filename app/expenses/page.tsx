import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ExpenseCategorizer, type ExpenseRow } from "@/components/expense-categorizer";
import { PageBody, PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const userId = await getCurrentUserId();
  const transactions = await prisma.plaidTransaction.findMany({
    where: {
      isRemoved: false,
      plaidAccount: { type: "credit", isActive: true, plaidItem: { userId } },
    },
    include: { plaidAccount: { include: { plaidItem: { select: { institutionName: true } } } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 1000,
  });
  const rows: ExpenseRow[] = transactions.map((transaction) => ({
    id: transaction.id,
    date: transaction.date.toISOString(),
    name: transaction.name,
    merchantName: transaction.merchantName,
    amount: transaction.amount,
    pending: transaction.pending,
    plaidPrimaryCategory: transaction.plaidPrimaryCategory,
    plaidDetailedCategory: transaction.plaidDetailedCategory,
    expenseTreatment: transaction.expenseTreatment,
    expenseCategory: transaction.expenseCategory,
    deductiblePercent: transaction.deductiblePercent,
    accountName: transaction.plaidAccount.name,
    accountMask: transaction.plaidAccount.mask,
    institutionName: transaction.plaidAccount.plaidItem.institutionName,
  }));

  return <div>
    <PageHeader title="Expenses" description="Sort card transactions into business, personal, and the suspiciously popular ‘mixed use’ bucket" actions={<Link href="/accounts" className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-100 px-3 text-sm font-medium transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-zinc-800 dark:hover:bg-zinc-700"><RefreshCw className="size-4" /> Sync accounts</Link>} />
    <PageBody className="max-w-[1400px]">
      {rows.length ? <ExpenseCategorizer initialRows={rows} /> : <EmptyState title="No credit card transactions yet" description="Connect or sync a credit card from Accounts. Basis will import Plaid’s merchant and category data, then let you decide whether dinner was networking or just Tuesday." ctaLabel="Go to accounts" ctaHref="/accounts" />}
    </PageBody>
  </div>;
}
