import "server-only";

import { Client, envs } from "stytch";
import { BASIS_MCP_SCOPE, requireStytchProjectDomain } from "@/lib/mcp/config";
import { prisma } from "@/lib/prisma";

let client: Client | null = null;

function stytchClient() {
  if (client) return client;
  const projectId = process.env.STYTCH_PROJECT_ID?.trim();
  const secret = process.env.STYTCH_SECRET?.trim();
  if (!projectId || !secret) throw new Error("STYTCH_PROJECT_ID and STYTCH_SECRET are required for remote MCP.");
  client = new Client({
    project_id: projectId,
    secret,
    env: projectId.startsWith("project-live-") ? envs.live : envs.test,
    custom_base_url: requireStytchProjectDomain(),
  });
  return client;
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

/** Validate a Stytch Connected Apps token and bind it to exactly one Basis profile. */
export async function authenticateRemoteMcpRequest(request: Request) {
  const token = bearerToken(request);
  if (!token) return null;

  try {
    const stytch = stytchClient();
    const claims = await stytch.idp.introspectTokenLocal(token);
    const scopes = new Set(claims.scope.split(/\s+/).filter(Boolean));
    if (!scopes.has(BASIS_MCP_SCOPE)) return null;

    // Trusted Auth Token Profiles map Better Auth's JWT `sub` into Stytch's
    // external_id. Resolve that server-side; never trust a caller-supplied ID.
    const stytchUser = await stytch.users.get({ user_id: claims.subject });
    const authUserId = stytchUser.external_id;
    if (!authUserId) return null;

    const identity = await prisma.authUser.findUnique({
      where: { id: authUserId },
      select: { profileUserId: true },
    });
    if (!identity?.profileUserId) return null;

    return {
      userId: identity.profileUserId,
      clientId: Array.isArray(claims.audience) ? claims.audience[0] : claims.audience,
      scopes: [...scopes],
      token,
      expiresAt: claims.expires_at,
    };
  } catch (error) {
    console.warn(`[basis-mcp] rejected access token: ${error instanceof Error ? error.message : "invalid token"}`);
    return null;
  }
}
