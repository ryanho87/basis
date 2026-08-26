import "server-only";

export function isCoinbaseConfigured() {
  return Boolean(
    process.env.COINBASE_API_KEY_NAME?.trim() &&
      process.env.COINBASE_API_PRIVATE_KEY?.trim() &&
      process.env.COINBASE_LEGACY_USER_ID?.trim(),
  );
}

export function getCoinbaseConfig(userId: string) {
  const apiKeyName = process.env.COINBASE_API_KEY_NAME?.trim();
  const rawPrivateKey = process.env.COINBASE_API_PRIVATE_KEY?.trim();
  const legacyUserId = process.env.COINBASE_LEGACY_USER_ID?.trim();
  if (!apiKeyName || !rawPrivateKey || !legacyUserId) {
    throw new Error("Coinbase read-only API credentials and owner profile are not configured");
  }
  if (userId !== legacyUserId) {
    throw new Error("Coinbase personal credentials are not available for this financial profile");
  }
  return {
    apiKeyName,
    privateKey: rawPrivateKey.replace(/\\n/g, "\n"),
  };
}
