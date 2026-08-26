import "server-only";

export type PlaidEnvironmentName = "sandbox" | "production";

export type PlaidConfig = {
  credentialId: string | null;
  clientId: string;
  secret: string;
  environment: PlaidEnvironmentName;
  redirectUri?: string;
  webhookUrl?: string;
};

function requireEnv(name: "PLAID_CLIENT_ID" | "PLAID_SECRET") {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export function getPlaidConfig(): PlaidConfig {
  const configuredEnvironment = process.env.PLAID_ENV?.trim() || "sandbox";
  const environment = (configuredEnvironment === "development" ? "production" : configuredEnvironment) as PlaidEnvironmentName;
  if (!(["sandbox", "production"] as const).includes(environment)) {
    throw new Error("PLAID_ENV must be sandbox or production");
  }

  return {
    credentialId: null,
    clientId: requireEnv("PLAID_CLIENT_ID"),
    secret: requireEnv("PLAID_SECRET"),
    environment,
    redirectUri: process.env.PLAID_REDIRECT_URI?.trim() || undefined,
    webhookUrl: process.env.PLAID_WEBHOOK_URL?.trim() || undefined,
  };
}

export function isPlaidConfigured() {
  return Boolean(
    process.env.PLAID_CLIENT_ID?.trim() &&
      process.env.PLAID_SECRET?.trim() &&
      process.env.PLAID_TOKEN_ENCRYPTION_KEY?.trim(),
  );
}
