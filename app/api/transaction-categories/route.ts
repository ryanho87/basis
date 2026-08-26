import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTransactionCategories, slugifyCategory } from "@/lib/transaction-categorization";
import { getCurrentUserId } from "@/lib/user";

export const runtime = "nodejs";

function invalidOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin !== new URL(request.url).origin);
}

export async function GET() {
  const userId = await getCurrentUserId();
  const categories = await ensureTransactionCategories(userId);
  const rules = await prisma.transactionCategorizationRule.findMany({ where: { userId }, include: { category: true }, orderBy: { merchantPattern: "asc" } });
  return NextResponse.json({ categories, rules });
}

export async function POST(request: Request) {
  if (invalidOrigin(request)) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  const userId = await getCurrentUserId();
  const body = (await request.json().catch(() => ({}))) as { name?: string; color?: string };
  const name = body.name?.trim().slice(0, 48);
  const slug = name ? slugifyCategory(name) : "";
  if (!name || !slug) return NextResponse.json({ error: "Enter a category name" }, { status: 400 });
  const category = await prisma.transactionCategory.upsert({
    where: { userId_slug: { userId, slug } },
    update: { name, color: /^#[0-9a-f]{6}$/i.test(body.color ?? "") ? body.color! : "#71717a", archivedAt: null },
    create: { userId, name, slug, color: /^#[0-9a-f]{6}$/i.test(body.color ?? "") ? body.color! : "#71717a" },
  });
  return NextResponse.json({ category }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (invalidOrigin(request)) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  const userId = await getCurrentUserId();
  const body = (await request.json().catch(() => ({}))) as { id?: string; name?: string; archived?: boolean };
  const category = body.id ? await prisma.transactionCategory.findFirst({ where: { id: body.id, userId } }) : null;
  if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  if (category.isSystem && body.archived) return NextResponse.json({ error: "Built-in categories cannot be archived" }, { status: 400 });
  const name = body.name?.trim().slice(0, 48);
  const updated = await prisma.transactionCategory.update({ where: { id: category.id }, data: { name: name || undefined, archivedAt: body.archived === true ? new Date() : body.archived === false ? null : undefined } });
  return NextResponse.json({ category: updated });
}
