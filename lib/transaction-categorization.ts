import "server-only";

import { prisma } from "@/lib/prisma";

export const DEFAULT_TRANSACTION_CATEGORIES = [
  ["Income", "income", "#059669"],
  ["Housing", "housing", "#7c3aed"],
  ["Food & Dining", "food-dining", "#ea580c"],
  ["Groceries", "groceries", "#65a30d"],
  ["Transportation", "transportation", "#2563eb"],
  ["Travel", "travel", "#0891b2"],
  ["Shopping", "shopping", "#db2777"],
  ["Entertainment", "entertainment", "#9333ea"],
  ["Health", "health", "#dc2626"],
  ["Utilities", "utilities", "#4f46e5"],
  ["Subscriptions", "subscriptions", "#d97706"],
  ["Taxes", "taxes", "#475569"],
  ["Business", "business", "#0f766e"],
  ["Transfers", "transfers", "#64748b"],
  ["Other", "other", "#71717a"],
] as const;

export function slugifyCategory(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

export function normalizeMerchant(value: string) {
  return value.toLowerCase().replace(/\b(inc|llc|corp|co|store|online|payment|purchase)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ").slice(0, 120);
}

export async function ensureTransactionCategories(userId: string) {
  await prisma.transactionCategory.createMany({
    data: DEFAULT_TRANSACTION_CATEGORIES.map(([name, slug, color]) => ({ userId, name, slug, color, isSystem: true })),
    skipDuplicates: true,
  });
  return prisma.transactionCategory.findMany({ where: { userId, archivedAt: null }, orderBy: [{ isSystem: "desc" }, { name: "asc" }] });
}

function inferredSlug(primary: string | null, detailed: string | null, merchant: string) {
  const source = `${primary ?? ""} ${detailed ?? ""} ${merchant}`.toUpperCase();
  if (source.includes("INCOME") || source.includes("PAYROLL") || source.includes("DEPOSIT")) return "income";
  if (source.includes("TRANSFER") || source.includes("LOAN_PAYMENTS") || source.includes("CREDIT_CARD_PAYMENT")) return "transfers";
  if (source.includes("RENT") || source.includes("MORTGAGE") || source.includes("HOME_IMPROVEMENT")) return "housing";
  if (source.includes("GROCERY") || source.includes("SUPERMARKET")) return "groceries";
  if (source.includes("RESTAURANT") || source.includes("FOOD_AND_DRINK") || source.includes("COFFEE")) return "food-dining";
  if (source.includes("TRAVEL") || source.includes("AIRLINE") || source.includes("HOTEL")) return "travel";
  if (source.includes("TRANSPORTATION") || source.includes("GAS") || source.includes("PARKING") || source.includes("RIDESHARE")) return "transportation";
  if (source.includes("MEDICAL") || source.includes("HEALTH") || source.includes("PHARMACY")) return "health";
  if (source.includes("UTILITIES") || source.includes("TELECOMMUNICATION") || source.includes("INTERNET")) return "utilities";
  if (source.includes("ENTERTAINMENT") || source.includes("RECREATION")) return "entertainment";
  if (source.includes("GENERAL_MERCHANDISE") || source.includes("CLOTHING") || source.includes("ELECTRONICS")) return "shopping";
  if (source.includes("TAX")) return "taxes";
  return "other";
}

export async function autoCategorizeTransactions(userId: string) {
  const [categories, rules, transactions] = await Promise.all([
    ensureTransactionCategories(userId),
    prisma.transactionCategorizationRule.findMany({ where: { userId } }),
    prisma.plaidTransaction.findMany({
      where: { transactionCategoryId: null, isRemoved: false, plaidAccount: { plaidItem: { userId } } },
      select: { id: true, merchantName: true, name: true, plaidPrimaryCategory: true, plaidDetailedCategory: true },
    }),
  ]);
  const bySlug = new Map(categories.map((category) => [category.slug, category.id]));
  const byMerchant = new Map(rules.map((rule) => [rule.merchantPattern, rule.categoryId]));
  const grouped = new Map<string, string[]>();
  for (const transaction of transactions) {
    const merchant = normalizeMerchant(transaction.merchantName || transaction.name);
    const ruleCategoryId = byMerchant.get(merchant);
    const categoryId = ruleCategoryId ?? bySlug.get(inferredSlug(transaction.plaidPrimaryCategory, transaction.plaidDetailedCategory, merchant));
    if (!categoryId) continue;
    const key = `${categoryId}:${ruleCategoryId ? "RULE" : "AUTO"}`;
    grouped.set(key, [...(grouped.get(key) ?? []), transaction.id]);
  }
  await Promise.all([...grouped].map(([key, ids]) => {
    const [transactionCategoryId, categorizationSource] = key.split(":");
    return prisma.plaidTransaction.updateMany({ where: { id: { in: ids } }, data: { transactionCategoryId, categorizationSource } });
  }));
  return { categorized: [...grouped.values()].reduce((sum, ids) => sum + ids.length, 0), categories };
}
