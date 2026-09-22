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
import { isAccountConnectionKind } from "@/lib/account-connection";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      connectionId?: unknown;
      accountKind?: unknown;
    } | null;

    if (!body || typeof body !== "object" || Array.isArray(body) || (body.connectionId !== undefined && (typeof body.connectionId !== "string" || !body.connectionId.trim()))
      || (body.accountKind !== undefined && !isAccountConnectionKind(body.accountKind))) {
      return Response.json({ error: "Choose a bank, investment, or loan account to connect." }, { status: 400 });
    }

    const userId = await getCurrentUserId();
    let config;
    let plaidRequest: LinkTokenCreateRequest;

    if (typeof body.connectionId === "string") {
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
      const consentedProducts = new Set([
        ...(item.data.item.products ?? []),
        ...(item.data.item.billed_products ?? []),
        ...(item.data.item.consented_products ?? []),
      ]);
      const missingProducts = [Products.Transactions, Products.Investments, Products.Liabilities]
        .filter((product) => !consentedProducts.has(product));
      plaidRequest = {
        user: { client_user_id: userId },
        client_name: "Basis",
        country_codes: [CountryCode.Us],
        language: "en",
        redirect_uri: config.redirectUri,
        access_token: accessToken,
        update: { account_selection_enabled: true },
        additional_consented_products: missingProducts.length ? missingProducts : undefined,
      };
    } else {
      config = await getPlaidConfigForUser(userId);
      const defaultWebhookUrl = process.env.NODE_ENV === "production"
        ? `${new URL(request.url).origin}/api/plaid/webhook`
        : undefined;
      const requiredProduct = body.accountKind === "investments" ? Products.Investments
        : body.accountKind === "loans" ? Products.Liabilities : Products.Transactions;
      plaidRequest = {
        user: { client_user_id: userId },
        client_name: "Basis",
        country_codes: [CountryCode.Us],
        language: "en",
        redirect_uri: config.redirectUri,
        products: [requiredProduct],
        additional_consented_products: [Products.Transactions, Products.Investments, Products.Liabilities]
          .filter((product) => product !== requiredProduct),
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
