import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  const userId = await getCurrentUserId();
  const body = (await request.json().catch(() => ({}))) as { transactionId?: string; splits?: Array<{ categoryId?: string; amount?: number; note?: string }> };
  const transaction = body.transactionId ? await prisma.plaidTransaction.findFirst({ where: { id: body.transactionId, plaidAccount: { plaidItem: { userId } } }, select: { id: true, amount: true } }) : null;
  if (!transaction) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  const splits = (body.splits ?? []).slice(0, 12).map((split) => ({ categoryId: split.categoryId ?? "", amount: Number(split.amount), note: split.note?.trim().slice(0, 120) || null }));
  if (splits.length < 2 || splits.some((split) => !split.categoryId || !Number.isFinite(split.amount) || split.amount <= 0)) return NextResponse.json({ error: "Add at least two valid split amounts" }, { status: 400 });
  const categories = await prisma.transactionCategory.count({ where: { id: { in: [...new Set(splits.map((split) => split.categoryId))] }, userId, archivedAt: null } });
  if (categories !== new Set(splits.map((split) => split.categoryId)).size) return NextResponse.json({ error: "Invalid split category" }, { status: 400 });
  const total = splits.reduce((sum, split) => sum + split.amount, 0);
  if (Math.abs(total - Math.abs(transaction.amount)) > 0.01) return NextResponse.json({ error: `Split amounts must total ${Math.abs(transaction.amount).toFixed(2)}` }, { status: 400 });
  await prisma.$transaction([
    prisma.transactionSplit.deleteMany({ where: { transactionId: transaction.id } }),
    prisma.transactionSplit.createMany({ data: splits.map((split) => ({ transactionId: transaction.id, ...split })) }),
    prisma.plaidTransaction.update({ where: { id: transaction.id }, data: { categorizationSource: "SPLIT" } }),
  ]);
  return NextResponse.json({ splitCount: splits.length });
}
