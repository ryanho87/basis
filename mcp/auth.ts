import { timingSafeEqual } from "node:crypto";

export const MCP_BEARER_TOKEN_ENV = "BASIS_MCP_BEARER_TOKEN";
export const MIN_MCP_BEARER_TOKEN_BYTES = 32;

export function requireMcpBearerToken(value = process.env[MCP_BEARER_TOKEN_ENV]): string {
  const token = value?.trim() || "";
  if (Buffer.byteLength(token, "utf8") < MIN_MCP_BEARER_TOKEN_BYTES || /\s/.test(token)) {
    throw new Error(
      `${MCP_BEARER_TOKEN_ENV} must be a secret token of at least ${MIN_MCP_BEARER_TOKEN_BYTES} bytes with no whitespace. Generate one with: npm run mcp:token`,
    );
  }
  return token;
}

export function isAuthorizedBearerHeader(authorization: string | undefined, expectedToken: string): boolean {
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!match) return false;

  const presented = Buffer.from(match[1], "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}
