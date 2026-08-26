import { getCurrentUserId } from "@/lib/user";
import { PlaidSyncError, syncPlaidItem } from "@/lib/plaid/sync";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { connectionId?: string };
    if (!body.connectionId) {
      return Response.json({ error: "A connection ID is required" }, { status: 400 });
    }
    const userId = await getCurrentUserId();
    const summary = await syncPlaidItem(body.connectionId, userId);
    return Response.json({ summary });
  } catch (error) {
    if (error instanceof PlaidSyncError) {
      const status = error.code === "CONNECTION_NOT_FOUND" ? 404 : 502;
      return Response.json({ error: error.message, code: error.code }, { status });
    }
    return Response.json({ error: "Plaid sync failed" }, { status: 500 });
  }
}
