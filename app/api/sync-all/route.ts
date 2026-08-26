import { getCurrentUserId } from "@/lib/user";
import { syncAllFinancialAccounts } from "@/lib/sync-all";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    const userId = await getCurrentUserId();
    const summary = await syncAllFinancialAccounts(userId);
    return Response.json({ summary }, { status: summary.errors.length ? 207 : 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Account refresh failed" },
      { status: 500 },
    );
  }
}
