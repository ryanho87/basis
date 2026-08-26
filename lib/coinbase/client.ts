import "server-only";

import { createPrivateKey, randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { getCoinbaseConfig } from "./config";

const COINBASE_HOST = "api.coinbase.com";

async function authorization(userId: string, method: string, path: string) {
  const { apiKeyName, privateKey } = getCoinbaseConfig(userId);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: "cdp",
    sub: apiKeyName,
    nbf: now,
    exp: now + 120,
    uri: `${method.toUpperCase()} ${COINBASE_HOST}${path}`,
  })
    .setProtectedHeader({
      alg: "ES256",
      kid: apiKeyName,
      nonce: randomBytes(16).toString("hex"),
    })
    .sign(createPrivateKey(privateKey));
}

export async function coinbaseRequest<T>(userId: string, path: string): Promise<T> {
  const url = new URL(path, `https://${COINBASE_HOST}`);
  const token = await authorization(userId, "GET", url.pathname);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Coinbase request failed (${response.status}): ${text.slice(0, 240)}`);
  }
  return (await response.json()) as T;
}

export async function getUsdPrice(currency: string) {
  if (currency === "USD" || currency === "USDC") return 1;
  const response = await fetch(
    `https://${COINBASE_HOST}/v2/prices/${encodeURIComponent(currency)}-USD/spot`,
    { cache: "no-store", signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as { data?: { amount?: string } };
  const price = Number(body.data?.amount);
  return Number.isFinite(price) && price >= 0 ? price : null;
}
