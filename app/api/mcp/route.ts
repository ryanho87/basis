import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createFinancialMcpServer } from "@/mcp/create-server";
import { BASIS_MCP_RESOURCE, BASIS_MCP_SCOPE, BASIS_ORIGIN } from "@/lib/mcp/config";
import { authenticateRemoteMcpRequest } from "@/lib/mcp/stytch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const resourceMetadataUrl = `${BASIS_ORIGIN}/.well-known/oauth-protected-resource`;

function unauthorized() {
  return Response.json(
    { error: "unauthorized", error_description: "Connect and authorize Basis before accessing financial data." },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": `Bearer error="invalid_token", error_description="Unauthorized", resource_metadata="${resourceMetadataUrl}", scope="${BASIS_MCP_SCOPE}"`,
      },
    },
  );
}

async function handle(request: Request) {
  const authenticated = await authenticateRemoteMcpRequest(request);
  if (!authenticated) return unauthorized();

  const server = createFinancialMcpServer(authenticated.userId);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request, {
      authInfo: {
        token: authenticated.token,
        clientId: authenticated.clientId,
        scopes: authenticated.scopes,
        expiresAt: authenticated.expiresAt,
        resource: new URL(BASIS_MCP_RESOURCE),
      },
    });
  } catch (error) {
    console.error(`[basis-mcp] remote transport failed: ${error instanceof Error ? error.message : "unknown error"}`);
    return Response.json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null }, { status: 500 });
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id",
    },
  });
}
