import { timingSafeEqual } from "node:crypto";
import type { ScheduledRefreshStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { captureNetWorthSnapshot, netWorthDateKey } from "@/lib/net-worth";
import { isRefreshWindowActive, snapshotSlotFor, type RefreshWindow } from "@/lib/scheduled-refresh";
import { syncAllFinancialAccounts } from "@/lib/sync-all";

export const runtime = "nodejs";
export const maxDuration = 800;

type RefreshResult = {
  userId: string;
  ok: boolean;
  snapshotCaptured: boolean;
  errors: string[];
};

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !supplied) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : "Scheduled refresh failed";
}

function serializedErrors(results: RefreshResult[]) {
  const failures = results
    .filter((result) => result.errors.length > 0)
    .map(({ userId, errors }) => ({ userId, errors }));
  return failures.length ? JSON.stringify(failures) : null;
}

function completionStatus(results: RefreshResult[]): ScheduledRefreshStatus {
  const failures = results.filter((result) => !result.ok).length;
  if (failures === 0) return "SUCCEEDED";
  if (failures === results.length) return "FAILED";
  return "PARTIAL";
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const searchParams = new URL(request.url).searchParams;
  const value = searchParams.get("window");
  if (value !== "morning" && value !== "market-close") {
    return Response.json({ error: "Unknown refresh window" }, { status: 400 });
  }
  const window: RefreshWindow = value;
  const candidate = searchParams.get("candidate")?.slice(0, 40) || null;
  const manual = searchParams.get("manual") === "1";
  const userAgent = request.headers.get("user-agent")?.slice(0, 110) || "unknown";
  const trigger = manual ? `manual:${userAgent}` : userAgent;
  const run = await prisma.scheduledRefreshRun.create({
    data: { window, candidate, trigger },
  });

  if (!manual && !isRefreshWindowActive(window, now)) {
    await prisma.scheduledRefreshRun.update({
      where: { id: run.id },
      data: { status: "SKIPPED", completedAt: new Date() },
    });
    return Response.json({ ok: true, skipped: true, reason: "DST guard", runId: run.id });
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
  await prisma.scheduledRefreshRun.update({
    where: { id: run.id },
    data: { eligibleProfiles: users.length },
  });

  const slot = snapshotSlotFor(window);
  const snapshotKey = `${netWorthDateKey(now)}:${slot}`;
  const results = new Map<string, RefreshResult>(users.map((user) => [user.id, {
    userId: user.id,
    ok: true,
    snapshotCaptured: false,
    errors: [],
  }]));

  // Capture every profile from the balances already on hand before waiting on
  // external institutions. Even if Plaid stalls, today's history still exists.
  let snapshotsCaptured = 0;
  for (const user of users) {
    const result = results.get(user.id)!;
    try {
      await captureNetWorthSnapshot(user.id, "SCHEDULED_REFRESH", { snapshotKey, capturedAt: now });
      result.snapshotCaptured = true;
      snapshotsCaptured += 1;
    } catch (error) {
      result.ok = false;
      result.errors.push(`Initial snapshot: ${errorMessage(error)}`);
    }
    await prisma.scheduledRefreshRun.update({
      where: { id: run.id },
      data: { snapshotsCaptured, errorsJson: serializedErrors([...results.values()]) },
    });
  }

  let refreshedProfiles = 0;
  for (const user of users) {
    const result = results.get(user.id)!;
    try {
      const summary = await syncAllFinancialAccounts(user.id, {
        snapshotSlot: slot,
        capturedAt: now,
        snapshotSource: "SCHEDULED_REFRESH",
      });
      if (!result.snapshotCaptured) {
        result.snapshotCaptured = true;
        snapshotsCaptured += 1;
      }
      result.errors.push(...summary.errors);
      result.ok = result.errors.length === 0;
    } catch (error) {
      result.ok = false;
      result.errors.push(errorMessage(error));
    }
    refreshedProfiles += 1;
    const completedResults = [...results.values()];
    await prisma.scheduledRefreshRun.update({
      where: { id: run.id },
      data: {
        refreshedProfiles,
        snapshotsCaptured,
        failedProfiles: completedResults.filter((item) => !item.ok).length,
        errorsJson: serializedErrors(completedResults),
      },
    });
  }

  const completedResults = [...results.values()];
  const status = completionStatus(completedResults);
  const failedProfiles = completedResults.filter((result) => !result.ok).length;
  await prisma.scheduledRefreshRun.update({
    where: { id: run.id },
    data: {
      status,
      snapshotsCaptured,
      refreshedProfiles,
      failedProfiles,
      errorsJson: serializedErrors(completedResults),
      completedAt: new Date(),
    },
  });

  return Response.json({
    ok: status === "SUCCEEDED",
    runId: run.id,
    window,
    manual,
    snapshotKey,
    eligibleProfiles: users.length,
    snapshotsCaptured,
    refreshedProfiles,
    failedProfiles,
    results: completedResults,
  });
}
