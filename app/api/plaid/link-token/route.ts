import {
  CountryCode,
  Products,
  type LinkTokenCreateRequest,
} from "plaid";
import { getCurrentUserId } from "@/lib/user";
import { getPlaidClient } from "@/lib/plaid/client";
import { getPlaidConfigForItem, getPlaidConfigForUser } from "@/lib/plaid/developer-credentials";
import { toSafePlaidError } from "@/lib/plaid/errors";
import { prisma } from "@/lib/prisma";
import { decryptPlaidAccessToken } from "@/lib/plaid/token-crypto";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      connectionId?: string;
    };

    const userId = await getCurrentUserId();
    let config;
    let plaidRequest: LinkTokenCreateRequest;

    if (body.connectionId) {
      const connection = await prisma.plaidItem.findFirst({
        where: { id: body.connectionId, userId, status: { not: "DISCONNECTED" } },
        select: { userId: true, accessTokenEncrypted: true, developerCredential: true },
      });
      if (!connection) {
        return Response.json({ error: "Connection not found" }, { status: 404 });
      }
      config = await getPlaidConfigForItem(connection);
      const accessToken = decryptPlaidAccessToken(connection.accessTokenEncrypted);
      const plaid = getPlaidClient(config);
      const item = await plaid.itemGet({ access_token: accessToken });
      const transactionAccess = new Set([
        ...(item.data.item.products ?? []),
        ...(item.data.item.billed_products ?? []),
        ...(item.data.item.consented_products ?? []),
      ]).has(Products.Transactions);
      plaidRequest = {
        user: { client_user_id: userId },
        client_name: "Basis",
        country_codes: [CountryCode.Us],
        language: "en",
        redirect_uri: config.redirectUri,
        access_token: accessToken,
        additional_consented_products: transactionAccess ? undefined : [Products.Transactions],
      };
    } else {
      config = await getPlaidConfigForUser(userId);
      const defaultWebhookUrl = process.env.NODE_ENV === "production"
        ? `${new URL(request.url).origin}/api/plaid/webhook`
        : undefined;
      plaidRequest = {
        user: { client_user_id: userId },
        client_name: "Basis",
        country_codes: [CountryCode.Us],
        language: "en",
        redirect_uri: config.redirectUri,
        products: [Products.Transactions],
        additional_consented_products: [Products.Investments, Products.Liabilities],
        webhook: config.webhookUrl ?? defaultWebhookUrl,
      };
    }

    const response = await getPlaidClient(config).linkTokenCreate(plaidRequest);
    return Response.json({ linkToken: response.data.link_token });
  } catch (error) {
    const safeError = toSafePlaidError(error);
    return Response.json({ error: safeError.message, code: safeError.code }, { status: 500 });
  }
}
