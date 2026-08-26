import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { EXPENSE_CATEGORIES, EXPENSE_TREATMENTS } from "@/lib/expenses";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== requestUrl.origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const userId = await getCurrentUserId();
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    treatment?: string;
    category?: string | null;
    deductiblePercent?: number | null;
    note?: string | null;
  };

  if (!body.treatment || !EXPENSE_TREATMENTS.includes(body.treatment as never)) {
    return NextResponse.json({ error: "Choose a valid expense treatment" }, { status: 400 });
  }
  if (body.category && !EXPENSE_CATEGORIES.includes(body.category as never)) {
    return NextResponse.json({ error: "Choose a valid expense category" }, { status: 400 });
  }
  const deductiblePercent = body.treatment === "MIXED"
    ? Math.min(100, Math.max(0, body.deductiblePercent ?? 50))
    : body.treatment === "BUSINESS" ? 100 : 0;

  const transaction = await prisma.plaidTransaction.findFirst({
    where: { id, plaidAccount: { plaidItem: { userId } } },
    select: { id: true },
  });
  if (!transaction) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  const updated = await prisma.plaidTransaction.update({
    where: { id },
    data: {
      expenseTreatment: body.treatment as never,
      expenseCategory: body.category ? body.category as never : null,
      deductiblePercent,
      userNote: body.note?.trim().slice(0, 500) || null,
    },
    select: { id: true, expenseTreatment: true, expenseCategory: true, deductiblePercent: true },
  });
  return NextResponse.json({ transaction: updated });
}
