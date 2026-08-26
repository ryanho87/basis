import { PageBody, PageHeader } from "@/components/page-header";
import {
  CashFlowOverview,
  type CashFlowInsights,
  type CashFlowMonth,
  type SpendingCategory,
} from "@/components/cash-flow-overview";
import { TransactionFeed, type CategoryOption, type TransactionRow } from "@/components/transaction-feed";
import { SyncAllButton } from "@/components/sync-all-button";
import { prisma } from "@/lib/prisma";
import { normalizeMerchant } from "@/lib/transaction-categorization";
import { effectiveCashFlow } from "@/lib/transaction-transfers";
import { getCurrentUserId } from "@/lib/user";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 75;

type TransactionSearchParams = Promise<{ category?: string; page?: string }>;

export default async function TransactionsPage({ searchParams }: { searchParams: TransactionSearchParams }) {
  const userId = await getCurrentUserId();
  const { category: initialCategory = "", page: requestedPage } = await searchParams;
  const requestedPageNumber = Math.max(1, Number.parseInt(requestedPage ?? "1", 10) || 1);
  const transactionWhere = {
    isRemoved: false,
    plaidAccount: { isActive: true, plaidItem: { userId } },
  } as const;
  const totalTransactions = await prisma.plaidTransaction.count({ where: transactionWhere });
  const totalPages = Math.max(1, Math.ceil(totalTransactions / PAGE_SIZE));
  const page = Math.min(requestedPageNumber, totalPages);
  const analyticsStart = new Date();
  analyticsStart.setHours(0, 0, 0, 0);
  analyticsStart.setMonth(analyticsStart.getMonth() - 12, 1);

  const [transactions, analyticsTransactions, categoryRecords, rules] = await Promise.all([
    prisma.plaidTransaction.findMany({
      where: transactionWhere,
      include: {
        transactionCategory: true,
        transferPairAsDebit: { select: { id: true } },
        transferPairAsCredit: { select: { id: true } },
        splits: { include: { category: true } },
        plaidAccount: { include: { plaidItem: { select: { institutionName: true } } } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    getAnalyticsTransactions(userId, analyticsStart),
    prisma.transactionCategory.findMany({
      where: { userId, archivedAt: null },
      orderBy: { name: "asc" },
    }),
    prisma.transactionCategorizationRule.findMany({
      where: { userId },
      include: { category: true },
      orderBy: { merchantPattern: "asc" },
    }),
  ]);

  const { months, categories, categoryByMonth } = summarizeCashFlow(analyticsTransactions);
  const categoryOptions: CategoryOption[] = categoryRecords.map(({ id, name, color, isSystem }) => ({
    id,
    name,
    color,
    isSystem,
  }));
  const rows: TransactionRow[] = transactions.map((transaction) => ({
    id: transaction.id,
    date: transaction.date.toISOString(),
    name: transaction.name,
    merchantName: transaction.merchantName,
    amount: transaction.amount,
    pending: transaction.pending,
    categoryId: transaction.transactionCategoryId,
    category: transaction.transactionCategory?.name ?? null,
    categorizationSource: transaction.categorizationSource,
    expenseTreatment: transaction.expenseTreatment,
    cashFlowTreatment: transaction.cashFlowTreatment,
    effectiveCashFlow: effectiveCashFlow(transaction),
    transferMatched: Boolean(transaction.transferPairAsDebit || transaction.transferPairAsCredit),
    accountName: transaction.plaidAccount.name,
    accountMask: transaction.plaidAccount.mask,
    institutionName: transaction.plaidAccount.plaidItem.institutionName,
    splits: transaction.splits.map((split) => ({
      id: split.id,
      categoryId: split.categoryId,
      category: split.category.name,
      amount: split.amount,
      note: split.note,
    })),
  }));

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="Every connected cash and card account, now with categories you control"
        actions={<SyncAllButton />}
      />
      <PageBody className="max-w-[1500px]">
        <div className="space-y-6">
          <CashFlowOverview
            months={months}
            categories={categories}
            insights={buildInsights(analyticsTransactions, months, categoryByMonth)}
          />
          <TransactionFeed
            transactions={rows}
            categories={categoryOptions}
            rules={rules.map((rule) => ({
              id: rule.id,
              merchantPattern: rule.merchantPattern,
              category: rule.category.name,
            }))}
            initialQuery={initialCategory.slice(0, 80)}
            pagination={{ page, pageSize: PAGE_SIZE, totalPages, totalTransactions }}
          />
        </div>
      </PageBody>
    </div>
  );
}

type AnalyticsTransaction = Awaited<ReturnType<typeof getAnalyticsTransactions>>;

async function getAnalyticsTransactions(userId: string, analyticsStart: Date) {
  return prisma.plaidTransaction.findMany({
    where: {
      isRemoved: false,
      date: { gte: analyticsStart },
      plaidAccount: { isActive: true, plaidItem: { userId } },
    },
    select: {
      date: true,
      amount: true,
      pending: true,
      merchantName: true,
      name: true,
      plaidPrimaryCategory: true,
      plaidDetailedCategory: true,
      cashFlowTreatment: true,
      transactionCategory: { select: { name: true, slug: true } },
      transferPairAsDebit: { select: { id: true } },
      transferPairAsCredit: { select: { id: true } },
      splits: { select: { amount: true, category: { select: { name: true } } } },
    },
    orderBy: { date: "asc" },
  });
}

function summarizeCashFlow(transactions: AnalyticsTransaction) {
  const monthMap = new Map<string, CashFlowMonth>();
  for (let index = 11; index >= 0; index -= 1) {
    const date = new Date();
    date.setMonth(date.getMonth() - index, 1);
    const month = monthKey(date);
    monthMap.set(month, {
      month,
      label: date.toLocaleDateString("en-US", { month: "short" }),
      income: 0,
      spending: 0,
    });
  }
  const categoryMap = new Map<string, number>();
  const categoryByMonth = new Map<string, Map<string, number>>();

  for (const transaction of transactions) {
    const cashFlow = effectiveCashFlow(transaction);
    if (transaction.pending || cashFlow === "TRANSFER" || cashFlow === "OTHER") continue;
    const key = monthKey(transaction.date);
    const bucket = monthMap.get(key);
    if (cashFlow === "INCOME") {
      if (bucket) bucket.income += Math.abs(transaction.amount);
      continue;
    }
    if (cashFlow !== "SPENDING") continue;
    const spendingAmount = Math.abs(transaction.amount);
    if (bucket) bucket.spending += spendingAmount;
    const contributions = transaction.splits.length
      ? transaction.splits.map((split) => [split.category.name, split.amount] as const)
      : [[transaction.transactionCategory?.name ?? pretty(transaction.plaidDetailedCategory || transaction.plaidPrimaryCategory || "Other"), spendingAmount] as const];
    for (const [category, amount] of contributions) {
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + amount);
      const monthly = categoryByMonth.get(key) ?? new Map<string, number>();
      monthly.set(category, (monthly.get(category) ?? 0) + amount);
      categoryByMonth.set(key, monthly);
    }
  }

  const categories: SpendingCategory[] = [...categoryMap]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);
  return { months: [...monthMap.values()], categories, categoryByMonth };
}

function buildInsights(
  transactions: AnalyticsTransaction,
  months: CashFlowMonth[],
  categoryByMonth: Map<string, Map<string, number>>,
): CashFlowInsights {
  const latest = months.at(-1) ?? { income: 0, spending: 0, month: "" };
  const previous = months.at(-2);
  const now = new Date();
  const recurringGroups = new Map<string, Array<{ date: Date; amount: number; label: string }>>();
  for (const transaction of transactions) {
    if (transaction.pending || effectiveCashFlow(transaction) !== "SPENDING") continue;
    const label = transaction.merchantName || transaction.name;
    const key = normalizeMerchant(label);
    const group = recurringGroups.get(key) ?? [];
    group.push({ date: transaction.date, amount: Math.abs(transaction.amount), label });
    recurringGroups.set(key, group);
  }
  const recurring = [...recurringGroups.values()]
    .flatMap((group) => {
      if (group.length < 3) return [];
      const ordered = group.sort((a, b) => a.date.getTime() - b.date.getTime());
      const intervals = ordered.slice(1).map((item, index) => (item.date.getTime() - ordered[index].date.getTime()) / 86_400_000);
      const amounts = ordered.map((item) => item.amount);
      if (intervals.filter((days) => days >= 20 && days <= 40).length < Math.max(2, intervals.length - 1)
        || Math.max(...amounts) > Math.min(...amounts) * 1.35) return [];
      return [{ merchant: ordered.at(-1)!.label, amount: amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length }];
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);
  const currentCategories = categoryByMonth.get(latest.month) ?? new Map();
  const priorKeys = months.slice(-4, -1).map((month) => month.month);
  const anomalies = [...currentCategories]
    .flatMap(([category, amount]) => {
      const baseline = priorKeys.reduce((sum, key) => sum + (categoryByMonth.get(key)?.get(category) ?? 0), 0) / Math.max(1, priorKeys.length);
      return amount >= 100 && baseline > 0 && amount > baseline * 1.5 ? [{ category, amount, baseline }] : [];
    })
    .sort((a, b) => b.amount / Math.max(1, b.baseline) - a.amount / Math.max(1, a.baseline))
    .slice(0, 4);
  const priorYear = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const priorYearKey = monthKey(priorYear);
  const priorYearSpending = transactions
    .filter((transaction) => !transaction.pending && monthKey(transaction.date) === priorYearKey && effectiveCashFlow(transaction) === "SPENDING")
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  return {
    savingsRate: latest.income > 0 ? (latest.income - latest.spending) / latest.income * 100 : null,
    projectedSpending: now.getDate()
      ? latest.spending / now.getDate() * new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      : latest.spending,
    spendingVsPreviousPercent: previous?.spending
      ? (latest.spending - previous.spending) / previous.spending * 100
      : null,
    spendingVsYearPercent: priorYearSpending
      ? (latest.spending - priorYearSpending) / priorYearSpending * 100
      : null,
    recurring,
    anomalies,
  };
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function pretty(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
