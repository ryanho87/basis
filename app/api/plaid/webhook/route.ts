import { createHash, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK, type JWTPayload } from "jose";
import { prisma } from "@/lib/prisma";
import { getPlaidClient } from "@/lib/plaid/client";
import { getPlaidConfigForItem } from "@/lib/plaid/developer-credentials";
import { syncPlaidItem } from "@/lib/plaid/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

type PlaidWebhookBody = {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
};

type PlaidWebhookClaims = JWTPayload & { request_body_sha256?: string };

export async function POST(request: Request) {
  const rawBody = await request.text();
  let body: PlaidWebhookBody;
  try {
    body = JSON.parse(rawBody) as PlaidWebhookBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.item_id) return Response.json({ received: true });

  const connection = await prisma.plaidItem.findUnique({
    where: { itemId: body.item_id },
    include: { developerCredential: true },
  });
  if (!connection) return Response.json({ received: true });

  const signature = request.headers.get("plaid-verification");
  if (!signature) return Response.json({ error: "Missing webhook signature" }, { status: 401 });
  try {
    const header = decodeProtectedHeader(signature);
    if (header.alg !== "ES256" || !header.kid) throw new Error("Invalid webhook header");
    const config = await getPlaidConfigForItem(connection);
    const response = await getPlaidClient(config).webhookVerificationKeyGet({ key_id: header.kid });
    const key = await importJWK(response.data.key as JWK, "ES256");
    const verified = await jwtVerify(signature, key, { algorithms: ["ES256"], maxTokenAge: "5 min" });
    const expected = (verified.payload as PlaidWebhookClaims).request_body_sha256;
    const actual = createHash("sha256").update(rawBody).digest("hex");
    if (!expected || expected.length !== actual.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
      throw new Error("Webhook body hash mismatch");
    }
  } catch {
    return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  if (body.webhook_type === "TRANSACTIONS" && body.webhook_code === "SYNC_UPDATES_AVAILABLE") {
    after(async () => {
      try {
        await syncPlaidItem(connection.id, connection.userId);
      } catch {
        // The sync run records the actionable Plaid error for the connection UI.
      }
    });
  }
  return Response.json({ received: true });
}
