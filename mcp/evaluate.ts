import "dotenv/config";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { requireMcpBearerToken } from "./auth";

const url = new URL(process.env.BASIS_MCP_URL || "http://127.0.0.1:3001/mcp");
const bearerToken = requireMcpBearerToken();
const client = new Client({ name: "basis-mcp-eval", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { Authorization: `Bearer ${bearerToken}` } },
});
const forbidden = /accessToken|privateKey|documentHash|externalAccountId|detailsJson|notes/i;

function payload(value: unknown): Record<string, unknown> {
  const structured = value as { structuredContent?: { result?: Record<string, unknown> } };
  if (!structured.structuredContent?.result) throw new Error("Tool returned no structured result");
  return structured.structuredContent.result;
}

async function main() {
  try {
    const unauthorized = await fetch(url, { method: "POST" });
    if (unauthorized.status !== 401) throw new Error(`Unauthenticated MCP request returned ${unauthorized.status}, expected 401`);

    await client.connect(transport);
    const listed = await client.listTools();
    const expected = ["get_financial_summary", "list_accounts", "get_account_holdings", "get_tax_lots", "get_net_worth_history", "get_income_tax_position", "get_equity_compensation", "get_data_quality", "model_stock_sale"];
    for (const name of expected) {
      if (!listed.tools.some((tool) => tool.name === name)) throw new Error(`Missing tool: ${name}`);
    }
    for (const tool of listed.tools) {
      if (tool.annotations?.readOnlyHint !== true || tool.annotations?.destructiveHint !== false || tool.annotations?.openWorldHint !== false) throw new Error(`Unsafe annotations on ${tool.name}`);
    }

    let accounts: Record<string, unknown>[] = [];
    for (const name of ["get_financial_summary", "list_accounts", "get_net_worth_history", "get_income_tax_position", "get_equity_compensation", "get_data_quality"]) {
      const result = await client.callTool({ name, arguments: {} });
      const data = payload(result);
      if (forbidden.test(JSON.stringify(data))) throw new Error(`${name} exposed a forbidden sensitive field`);
      if (name === "list_accounts") accounts = data.accounts as Record<string, unknown>[];
    }

    if (accounts[0]?.accountId) {
      const holdings = await client.callTool({ name: "get_account_holdings", arguments: { accountId: accounts[0].accountId } });
      if (forbidden.test(JSON.stringify(payload(holdings)))) throw new Error("get_account_holdings exposed a forbidden sensitive field");
    }

    const lotsResult = await client.callTool({ name: "get_tax_lots", arguments: { limit: 20 } });
    const lots = payload(lotsResult).lots as Record<string, unknown>[];
    if (forbidden.test(JSON.stringify(lots))) throw new Error("get_tax_lots exposed a forbidden sensitive field");
    const usableLot = lots.find((lot) => typeof lot.ticker === "string" && typeof lot.quantity === "number" && typeof lot.costBasisPerShare === "number");
    if (usableLot) {
      const modeled = await client.callTool({ name: "model_stock_sale", arguments: {
        ticker: usableLot.ticker,
        shares: Math.min(1, usableLot.quantity as number),
        pricePerShare: Math.max(0.01, (usableLot.costBasisPerShare as number) * 1.1),
        saleDate: new Date().toISOString().slice(0, 10),
      } });
      if (forbidden.test(JSON.stringify(payload(modeled)))) throw new Error("model_stock_sale exposed a forbidden sensitive field");
    }

    console.info(`Basis MCP eval passed: bearer auth, ${expected.length} tools, annotations, structured output, and redaction checks.`);
  } finally {
    await transport.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
