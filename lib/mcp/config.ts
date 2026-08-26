import "server-only";

const configuredBaseUrl = process.env.BETTER_AUTH_URL?.trim();

if (process.env.NODE_ENV === "production" && !configuredBaseUrl) {
  throw new Error("BETTER_AUTH_URL is required in production so OAuth tokens have a stable issuer and audience.");
}

export const BASIS_ORIGIN = new URL(configuredBaseUrl || "http://localhost:3000").origin;
export const BASIS_OAUTH_ISSUER = `${BASIS_ORIGIN}/api/auth`;
export const BASIS_MCP_RESOURCE = `${BASIS_ORIGIN}/api/mcp`;
export const BASIS_MCP_SCOPE = "basis:read";
export const BASIS_MCP_SCOPES = [BASIS_MCP_SCOPE] as const;

export const STYTCH_PROJECT_DOMAIN = process.env.NEXT_PUBLIC_STYTCH_PROJECT_DOMAIN?.trim()?.replace(/\/$/, "") || "";

export function requireStytchProjectDomain() {
  if (!STYTCH_PROJECT_DOMAIN) throw new Error("NEXT_PUBLIC_STYTCH_PROJECT_DOMAIN is required for remote MCP.");
  return STYTCH_PROJECT_DOMAIN;
}
