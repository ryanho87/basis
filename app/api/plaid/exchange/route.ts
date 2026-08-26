import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { getPlaidClient } from "@/lib/plaid/client";
import { getPlaidConfigForUser } from "@/lib/plaid/developer-credentials";
import { toSafePlaidError } from "@/lib/plaid/errors";
import { encryptPlaidAccessToken } from "@/lib/plaid/token-crypto";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      publicToken?: string;
      institution?: { id?: string; name?: string } | null;
    };
    const publicToken = body.publicToken?.trim();
    if (!publicToken) {
      return Response.json({ error: "A public token is required" }, { status: 400 });
    }

    const userId = await getCurrentUserId();
    const config = await getPlaidConfigForUser(userId);
    const plaid = getPlaidClient(config);
    const exchange = await plaid.itemPublicTokenExchange({ public_token: publicToken });
    const { access_token: accessToken, item_id: itemId } = exchange.data;
    const itemResponse = await plaid.itemGet({ access_token: accessToken });
    const item = itemResponse.data.item;
    const existingConnection = await prisma.plaidItem.findUnique({
      where: { itemId },
      select: { userId: true },
    });
    if (existingConnection && existingConnection.userId !== userId) {
      return Response.json({ error: "This Plaid connection belongs to another user" }, { status: 403 });
    }
    const accessTokenEncrypted = encryptPlaidAccessToken(accessToken);

    const connection = await prisma.plaidItem.upsert({
      where: { itemId },
      update: {
        accessTokenEncrypted,
        developerCredentialId: config.credentialId,
        institutionId: item.institution_id ?? body.institution?.id ?? null,
        institutionName: body.institution?.name?.trim() || null,
        consentExpiresAt: item.consent_expiration_time
          ? new Date(item.consent_expiration_time)
          : null,
        status: "ACTIVE",
        errorCode: null,
        errorMessage: null,
      },
      create: {
        userId,
        developerCredentialId: config.credentialId,
        itemId,
        accessTokenEncrypted,
        institutionId: item.institution_id ?? body.institution?.id ?? null,
        institutionName: body.institution?.name?.trim() || null,
        consentExpiresAt: item.consent_expiration_time
          ? new Date(item.consent_expiration_time)
          : null,
      },
      select: {
        id: true,
        institutionName: true,
        status: true,
      },
    });

    return Response.json({ connection });
  } catch (error) {
    const safeError = toSafePlaidError(error);
    return Response.json({ error: safeError.message, code: safeError.code }, { status: 500 });
  }
}
