import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  const userId = await getCurrentUserId();
  const { id } = await context.params;
  const deleted = await prisma.transactionCategorizationRule.deleteMany({ where: { id, userId } });
  return deleted.count ? new Response(null, { status: 204 }) : NextResponse.json({ error: "Rule not found" }, { status: 404 });
}
