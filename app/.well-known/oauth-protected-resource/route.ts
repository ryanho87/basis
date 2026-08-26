import { BASIS_MCP_RESOURCE, BASIS_MCP_SCOPE, requireStytchProjectDomain } from "@/lib/mcp/config";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      resource: BASIS_MCP_RESOURCE,
      authorization_servers: [requireStytchProjectDomain()],
      scopes_supported: ["openid", "email", "profile", BASIS_MCP_SCOPE],
      resource_documentation: `${new URL(BASIS_MCP_RESOURCE).origin}/settings`,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
