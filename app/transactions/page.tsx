import { PageBody, PageHeader } from "@/components/page-header";
import { CashFlowOverview, type CashFlowMonth, type SpendingCategory } from "@/components/cash-flow-overview";
import { TransactionFeed, type TransactionRow } from "@/components/transaction-feed";
import { SyncAllButton } from "@/components/sync-all-button";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

const TRANSFERS = new Set(["TRANSFER_IN", "TRANSFER_OUT"]);

export default async function TransactionsPage() {
  const userId = await getCurrentUserId();
  const since = new Date();
  since.setMonth(since.getMonth() - 11, 1);
  since.setHours(0, 0, 0, 0);
  const transactions = await prisma.plaidTransaction.findMany({
    where: { isRemoved: false, plaidAccount: { isActive: true, plaidItem: { userId } } },
    include: { plaidAccount: { include: { plaidItem: { select: { institutionName: true } } } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 2000,
  });

  const monthMap = new Map<string, CashFlowMonth>();
  for (let index = 11; index >= 0; index -= 1) {
    const date = new Date(); date.setMonth(date.getMonth() - index, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(month, { month, label: date.toLocaleDateString("en-US", { month: "short" }), income: 0, spending: 0 });
  }
  const categoryMap = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.date < since || transaction.pending) continue;
    const month = `${transaction.date.getFullYear()}-${String(transaction.date.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthMap.get(month); if (!bucket) continue;
    const primary = transaction.plaidPrimaryCategory ?? "UNCATEGORIZED";
    if (TRANSFERS.has(primary)) continue;
    if (primary === "INCOME" && transaction.amount < 0) bucket.income += Math.abs(transaction.amount);
    else if (transaction.amount > 0) {
      bucket.spending += transaction.amount;
      const category = transaction.plaidDetailedCategory || primary;
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + transaction.amount);
    }
  }
  const categories: SpendingCategory[] = [...categoryMap].map(([category, amount]) => ({ category: pretty(category), amount })).sort((a, b) => b.amount - a.amount).slice(0, 8);
  const rows: TransactionRow[] = transactions.map((transaction) => ({ id: transaction.id, date: transaction.date.toISOString(), name: transaction.name, merchantName: transaction.merchantName, amount: transaction.amount, pending: transaction.pending, category: transaction.plaidDetailedCategory || transaction.plaidPrimaryCategory, accountName: transaction.plaidAccount.name, accountMask: transaction.plaidAccount.mask, institutionName: transaction.plaidAccount.plaidItem.institutionName }));

  return <div><PageHeader title="Transactions" description="Every connected cash and card account, without making you play tab roulette" actions={<SyncAllButton />} /><PageBody className="max-w-[1500px]"><div className="space-y-6"><CashFlowOverview months={[...monthMap.values()]} categories={categories} /><TransactionFeed transactions={rows} /></div></PageBody></div>;
}

function pretty(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
