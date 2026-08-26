import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeMerchant } from "@/lib/transaction-categorization";
import { getCurrentUserId } from "@/lib/user";

export const runtime = "nodejs";
const TREATMENTS = new Set(["UNREVIEWED", "PERSONAL", "BUSINESS", "MIXED", "EXCLUDED"]);
const CASH_FLOW_TREATMENTS = new Set(["AUTO", "SPENDING", "INCOME", "TRANSFER"]);

export async function PATCH(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  const userId = await getCurrentUserId();
  const body = (await request.json().catch(() => ({}))) as { transactionIds?: string[]; categoryId?: string; createRule?: boolean; treatment?: string; cashFlowTreatment?: string };
  const ids = [...new Set(body.transactionIds ?? [])].slice(0, 500);
  if (!ids.length) return NextResponse.json({ error: "Choose at least one transaction" }, { status: 400 });
  if (body.treatment && !TREATMENTS.has(body.treatment)) return NextResponse.json({ error: "Invalid treatment" }, { status: 400 });
  if (body.cashFlowTreatment && !CASH_FLOW_TREATMENTS.has(body.cashFlowTreatment)) return NextResponse.json({ error: "Invalid cash-flow treatment" }, { status: 400 });
  const category = body.categoryId ? await prisma.transactionCategory.findFirst({ where: { id: body.categoryId, userId, archivedAt: null } }) : null;
  if (body.categoryId && !category) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  const transactions = await prisma.plaidTransaction.findMany({
    where: { id: { in: ids }, plaidAccount: { plaidItem: { userId } } },
    select: { id: true, merchantName: true, name: true },
  });
  if (transactions.length !== ids.length) return NextResponse.json({ error: "One or more transactions were not found" }, { status: 404 });

  const data = {
    ...(category ? { transactionCategoryId: category.id, categorizationSource: "MANUAL" } : {}),
    ...(body.treatment ? { expenseTreatment: body.treatment as never, deductiblePercent: body.treatment === "BUSINESS" ? 100 : body.treatment === "MIXED" ? 50 : 0 } : {}),
    ...(body.cashFlowTreatment ? { cashFlowTreatment: body.cashFlowTreatment as never } : {}),
  };
  await prisma.plaidTransaction.updateMany({ where: { id: { in: ids } }, data });

  let ruleCount = 0;
  if (body.createRule && category) {
    const patterns = [...new Set(transactions.map((transaction) => normalizeMerchant(transaction.merchantName || transaction.name)).filter(Boolean))];
    for (const merchantPattern of patterns) {
      await prisma.transactionCategorizationRule.upsert({
        where: { userId_merchantPattern: { userId, merchantPattern } },
        update: { categoryId: category.id },
        create: { userId, merchantPattern, categoryId: category.id },
      });
      ruleCount += 1;
    }
    const matches = await prisma.plaidTransaction.findMany({ where: { isRemoved: false, plaidAccount: { plaidItem: { userId } } }, select: { id: true, merchantName: true, name: true } });
    const patternSet = new Set(patterns);
    const matchingIds = matches.filter((transaction) => patternSet.has(normalizeMerchant(transaction.merchantName || transaction.name))).map((transaction) => transaction.id);
    if (matchingIds.length) await prisma.plaidTransaction.updateMany({ where: { id: { in: matchingIds } }, data: { transactionCategoryId: category.id, categorizationSource: "RULE" } });
  }
  return NextResponse.json({ updated: transactions.length, ruleCount });
}
