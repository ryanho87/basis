import { getCurrentUserId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { syncCoinbase } from "@/lib/coinbase/sync";
import { captureNetWorthSnapshot } from "@/lib/net-worth";

export const runtime = "nodejs";

export async function POST() {
  const userId = await getCurrentUserId();
  try {
    const summary = await syncCoinbase(userId);
    return Response.json({ summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Coinbase sync failed";
    await prisma.coinbaseConnection.updateMany({
      where: { userId },
      data: { status: "ERROR", errorMessage: message },
    });
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const userId = await getCurrentUserId();
  await prisma.coinbaseConnection.updateMany({
    where: { userId },
    data: { status: "DISCONNECTED", errorMessage: null },
  });
  await captureNetWorthSnapshot(userId, "COINBASE_SYNC");
  return Response.json({ ok: true });
}
