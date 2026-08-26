import { CountryCode } from "plaid";
import { getCurrentUserId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { getPlaidClient } from "@/lib/plaid/client";
import type { PlaidEnvironmentName } from "@/lib/plaid/config";
import { encryptPlaidSecret, decryptPlaidSecret } from "@/lib/plaid/token-crypto";
import { toSafePlaidError } from "@/lib/plaid/errors";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  const userId = await getCurrentUserId();
  const body = (await request.json().catch(() => null)) as {
    clientId?: unknown;
    secret?: unknown;
    environment?: unknown;
  } | null;
  const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
  const secret = typeof body?.secret === "string" ? body.secret.trim() : "";
  const environment = body?.environment as PlaidEnvironmentName;

  if (clientId.length < 8 || clientId.length > 200 || secret.length < 8 || secret.length > 500) {
    return Response.json({ error: "Enter a valid Plaid client ID and secret" }, { status: 400 });
  }
  if (environment !== "sandbox" && environment !== "production") {
    return Response.json({ error: "Choose Sandbox or Production" }, { status: 400 });
  }

  const existing = await prisma.plaidDeveloperCredential.findUnique({
    where: { userId },
    include: { _count: { select: { items: true } } },
  });
  if (existing && existing._count.items > 0 && decryptPlaidSecret(existing.clientIdEncrypted) !== clientId) {
    return Response.json(
      { error: "Disconnect existing institutions before switching to a different Plaid client ID" },
      { status: 409 },
    );
  }

  try {
    const config = {
      credentialId: null,
      clientId,
      secret,
      environment,
      redirectUri: process.env.PLAID_REDIRECT_URI?.trim() || undefined,
      webhookUrl: process.env.PLAID_WEBHOOK_URL?.trim() || undefined,
    };
    await getPlaidClient(config).institutionsGet({
      count: 1,
      offset: 0,
      country_codes: [CountryCode.Us],
    });

    const saved = await prisma.$transaction(async (tx) => {
      const credential = await tx.plaidDeveloperCredential.upsert({
        where: { userId },
        update: {
          clientIdEncrypted: encryptPlaidSecret(clientId),
          secretEncrypted: encryptPlaidSecret(secret),
          environment,
        },
        create: {
          userId,
          clientIdEncrypted: encryptPlaidSecret(clientId),
          secretEncrypted: encryptPlaidSecret(secret),
          environment,
        },
      });
      await tx.plaidItem.updateMany({
        where: { userId, developerCredentialId: null },
        data: { developerCredentialId: credential.id },
      });
      return credential;
    });

    return Response.json({
      configured: true,
      environment: saved.environment,
      clientIdHint: `••••${clientId.slice(-4)}`,
    });
  } catch (error) {
    const safe = toSafePlaidError(error);
    return Response.json({ error: `Plaid rejected those credentials: ${safe.message}` }, { status: 400 });
  }
}

export async function DELETE() {
  const userId = await getCurrentUserId();
  const credential = await prisma.plaidDeveloperCredential.findUnique({
    where: { userId },
    include: { _count: { select: { items: true } } },
  });
  if (!credential) return Response.json({ ok: true });
  if (credential._count.items > 0) {
    return Response.json(
      { error: "Disconnect every institution before removing Plaid credentials" },
      { status: 409 },
    );
  }
  await prisma.plaidDeveloperCredential.delete({ where: { id: credential.id } });
  return Response.json({ ok: true });
}
