import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isRefreshWindowActive, snapshotSlotFor, type RefreshWindow } from "@/lib/scheduled-refresh";
import { syncAllFinancialAccounts } from "@/lib/sync-all";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !supplied) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const value = new URL(request.url).searchParams.get("window");
  if (value !== "morning" && value !== "market-close") {
    return Response.json({ error: "Unknown refresh window" }, { status: 400 });
  }
  const window: RefreshWindow = value;
  if (!isRefreshWindowActive(window, now)) {
    return Response.json({ ok: true, skipped: true, reason: "DST guard" });
  }

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { plaidItems: { some: { status: { not: "DISCONNECTED" } } } },
        { coinbaseConnection: { is: { status: { not: "DISCONNECTED" } } } },
      ],
    },
    select: { id: true },
  });
  const results: Array<{ userId: string; ok: boolean; errors: string[] }> = [];
  for (const user of users) {
    try {
      const summary = await syncAllFinancialAccounts(user.id, {
        snapshotSlot: snapshotSlotFor(window),
        capturedAt: now,
      });
      results.push({ userId: user.id, ok: summary.errors.length === 0, errors: summary.errors });
    } catch (error) {
      results.push({
        userId: user.id,
        ok: false,
        errors: [error instanceof Error ? error.message : "Scheduled refresh failed"],
      });
    }
  }

  return Response.json({
    ok: results.every((result) => result.ok),
    window,
    refreshedProfiles: results.length,
    failedProfiles: results.filter((result) => !result.ok).length,
    results,
  });
}
