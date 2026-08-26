import "server-only";

import { prisma } from "@/lib/prisma";
import { decryptPlaidSecret } from "@/lib/plaid/token-crypto";
import { getPlaidConfig, isPlaidConfigured, type PlaidConfig, type PlaidEnvironmentName } from "@/lib/plaid/config";

type StoredCredential = {
  id: string;
  clientIdEncrypted: string;
  secretEncrypted: string;
  environment: string;
};

function storedConfig(credential: StoredCredential): PlaidConfig {
  if (credential.environment !== "sandbox" && credential.environment !== "production") {
    throw new Error("Stored Plaid environment is invalid");
  }
  return {
    credentialId: credential.id,
    clientId: decryptPlaidSecret(credential.clientIdEncrypted),
    secret: decryptPlaidSecret(credential.secretEncrypted),
    environment: credential.environment as PlaidEnvironmentName,
    redirectUri: process.env.PLAID_REDIRECT_URI?.trim() || undefined,
    webhookUrl: process.env.PLAID_WEBHOOK_URL?.trim() || undefined,
  };
}

export async function getPlaidConfigForUser(userId: string) {
  const credential = await prisma.plaidDeveloperCredential.findUnique({ where: { userId } });
  if (credential) return storedConfig(credential);

  const legacyOwner = process.env.PLAID_LEGACY_USER_ID?.trim();
  if (legacyOwner && legacyOwner === userId) return getPlaidConfig();

  throw new Error("Add your Plaid developer credentials before connecting an institution");
}

export async function getPlaidConfigForItem(item: {
  userId: string;
  developerCredential: StoredCredential | null;
}) {
  if (item.developerCredential) return storedConfig(item.developerCredential);
  const legacyOwner = process.env.PLAID_LEGACY_USER_ID?.trim();
  if (legacyOwner && legacyOwner === item.userId) return getPlaidConfig();
  throw new Error("This institution is missing its Plaid developer credential owner");
}

export async function getPlaidCredentialStatus(userId: string) {
  const credential = await prisma.plaidDeveloperCredential.findUnique({
    where: { userId },
    select: { clientIdEncrypted: true, environment: true },
  });
  if (credential) {
    const clientId = decryptPlaidSecret(credential.clientIdEncrypted);
    return {
      configured: true,
      source: "profile" as const,
      environment: credential.environment as PlaidEnvironmentName,
      clientIdHint: clientId.length > 4 ? `••••${clientId.slice(-4)}` : "Configured",
    };
  }

  const legacyOwner = process.env.PLAID_LEGACY_USER_ID?.trim();
  if (legacyOwner === userId && isPlaidConfigured()) {
    return {
      configured: true,
      source: "server" as const,
      environment: getPlaidConfig().environment,
      clientIdHint: "Server-managed",
    };
  }

  return {
    configured: false,
    source: "none" as const,
    environment: "production" as const,
    clientIdHint: null,
  };
}
