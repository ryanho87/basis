import { getCurrentUserId } from "@/lib/user";
import { PlaidSyncError, syncAllPlaidItems, syncPlaidItem } from "@/lib/plaid/sync";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { connectionId?: string };
    const userId = await getCurrentUserId();
    const summary = body.connectionId
      ? await syncPlaidItem(body.connectionId, userId)
      : await syncAllPlaidItems(userId);
    return Response.json({ summary });
  } catch (error) {
    if (error instanceof PlaidSyncError) {
      const status = error.code === "CONNECTION_NOT_FOUND" ? 404 : 502;
      return Response.json({ error: error.message, code: error.code }, { status });
    }
    return Response.json({ error: "Plaid sync failed" }, { status: 500 });
  }
}
