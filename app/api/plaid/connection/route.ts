import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { getPlaidClient } from "@/lib/plaid/client";
import { getPlaidConfigForItem } from "@/lib/plaid/developer-credentials";
import { toSafePlaidError } from "@/lib/plaid/errors";
import { decryptPlaidAccessToken } from "@/lib/plaid/token-crypto";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const userId = await getCurrentUserId();
  const body = (await request.json()) as { connectionId?: string };
  if (!body.connectionId) {
    return Response.json({ error: "A connection ID is required" }, { status: 400 });
  }

  const result = await prisma.plaidItem.updateMany({
    where: { id: body.connectionId, userId },
    data: { status: "ACTIVE", errorCode: null, errorMessage: null },
  });
  if (result.count === 0) {
    return Response.json({ error: "Connection not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = (await request.json()) as { connectionId?: string };
    if (!body.connectionId) {
      return Response.json({ error: "A connection ID is required" }, { status: 400 });
    }

    const connection = await prisma.plaidItem.findFirst({
      where: { id: body.connectionId, userId },
      select: { id: true, userId: true, accessTokenEncrypted: true, developerCredential: true },
    });
    if (!connection) {
      return Response.json({ error: "Connection not found" }, { status: 404 });
    }

    const config = await getPlaidConfigForItem(connection);
    await getPlaidClient(config).itemRemove({
      access_token: decryptPlaidAccessToken(connection.accessTokenEncrypted),
    });
    await prisma.plaidItem.delete({ where: { id: connection.id } });
    return Response.json({ ok: true });
  } catch (error) {
    const safeError = toSafePlaidError(error);
    return Response.json({ error: safeError.message, code: safeError.code }, { status: 500 });
  }
}
