import "dotenv/config";

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { NextFunction, Request, Response } from "express";
import * as z from "zod/v4";
import { isAuthorizedBearerHeader, requireMcpBearerToken } from "./auth";
import {
  getAccountHoldings,
  getDataQuality,
  getEquityCompensation,
  getFinancialSummary,
  getIncomeTaxPosition,
  getNetWorthHistory,
  getTaxLots,
  listAccounts,
  modelStockSale,
  resolveMcpUserId,
} from "./financial-data";

const HOST = process.env.BASIS_MCP_HOST?.trim() || "127.0.0.1";
const PORT = Number(process.env.BASIS_MCP_PORT || 3001);
const BEARER_TOKEN = requireMcpBearerToken();
if (!new Set(["127.0.0.1", "localhost", "::1"]).has(HOST)) {
  throw new Error("Basis MCP is private by design and only binds to a loopback host.");
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("BASIS_MCP_PORT must be a valid port.");

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const objectOutput = { result: z.record(z.string(), z.unknown()).describe("Structured financial result") };

function response(result: Record<string, unknown>): CallToolResult {
  return {
    structuredContent: { result },
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
  };
}

function createServer() {
  const server = new McpServer(
    { name: "basis-finance", version: "0.1.0" },
    {
      instructions: "Private, read-only access to the user's Basis financial data. Use get_financial_summary first for broad questions, then narrower tools. Treat all values as sensitive. Never claim estimates are tax advice. Call get_data_quality before making recommendations that depend on cost basis, balances, or income freshness. model_stock_sale is a non-mutating estimate and does not execute trades.",
    },
  );

  const tool = <T extends z.ZodRawShape>(
    name: string,
    title: string,
    description: string,
    inputSchema: T,
    handler: (input: z.infer<z.ZodObject<T>>) => Promise<Record<string, unknown>>,
  ) => server.registerTool(name, { title, description, inputSchema, outputSchema: objectOutput, annotations }, (async (input: z.infer<z.ZodObject<T>>) => {
    const started = Date.now();
    try {
      const result = await handler(input as z.infer<z.ZodObject<T>>);
      console.info(`[basis-mcp] ${name} ok ${Date.now() - started}ms`);
      return response(result);
    } catch (error) {
      console.error(`[basis-mcp] ${name} failed ${Date.now() - started}ms: ${error instanceof Error ? error.message : "unknown error"}`);
      throw error;
    }
  }) as never);

  tool("get_financial_summary", "Get financial summary", "Return current gross and after-tax net worth, category totals, basis coverage, and a concise current-year federal tax position.", {}, async () => getFinancialSummary());
  tool("list_accounts", "List accounts", "List every net-worth contributor—including manual assets and debts—with opaque account IDs, balances, signed net-worth contribution, types, and freshness. Does not expose provider IDs or credentials.", {}, async () => listAccounts());
  tool("get_account_holdings", "Get account holdings", "Return positions and available cost basis for one opaque accountId from list_accounts.", {
    accountId: z.string().min(1).describe("Opaque account ID returned by list_accounts"),
  }, async ({ accountId }) => getAccountHoldings(accountId));
  tool("get_tax_lots", "Get tax lots", "Return available manual and Plaid tax lots, optionally filtered by account or ticker. Coinbase lots are unavailable.", {
    accountId: z.string().min(1).optional().describe("Optional opaque account ID from list_accounts"),
    ticker: z.string().min(1).max(20).optional(),
    limit: z.number().int().min(1).max(200).optional().default(100),
  }, async (input) => getTaxLots(input));
  tool("get_net_worth_history", "Get net worth history", "Return saved daily net-worth snapshots over a bounded lookback window.", {
    days: z.number().int().min(1).max(3650).optional().default(90),
  }, async ({ days }) => getNetWorthHistory(days));
  tool("get_income_tax_position", "Get income and tax position", "Return the latest pay-stub snapshot, projected annual income, withholding, federal bracket headroom, and model limitations.", {
    taxYear: z.number().int().min(2025).max(2026).optional().default(new Date().getFullYear()),
  }, async ({ taxYear }) => getIncomeTaxPosition(taxYear));
  tool("get_equity_compensation", "Get equity compensation", "Return RSU grants and vest events without private notes.", {
    upcomingOnly: z.boolean().optional().default(false),
  }, async ({ upcomingOnly }) => getEquityCompensation(upcomingOnly));
  tool("get_data_quality", "Get financial data quality", "Return connection freshness, missing cost-basis coverage, and other limitations. Call this before high-confidence recommendations.", {}, async () => getDataQuality());
  tool("model_stock_sale", "Model a stock sale", "Estimate lot allocation and incremental federal tax for a hypothetical stock sale. Read-only: it neither saves a scenario nor executes a trade.", {
    ticker: z.string().min(1).max(20),
    shares: z.number().positive(),
    pricePerShare: z.number().positive(),
    saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Sale date in YYYY-MM-DD format"),
    strategy: z.enum(["FIFO", "HIFO", "TAX_OPTIMAL"]).optional(),
  }, async (input) => modelStockSale(input));
  return server;
}

async function main() {
  await resolveMcpUserId();
  const app = createMcpExpressApp({ host: HOST, allowedHosts: [`${HOST}:${PORT}`, HOST, `localhost:${PORT}`, "localhost"] });

  app.get("/health", (_req: Request, res: Response) => res.json({ status: "ok", service: "basis-finance-mcp", transport: "streamable-http" }));
  app.use("/mcp", (req: Request, res: Response, next: NextFunction) => {
    if (isAuthorizedBearerHeader(req.headers.authorization, BEARER_TOKEN)) {
      next();
      return;
    }

    res
      .status(401)
      .set("WWW-Authenticate", 'Bearer realm="basis-mcp"')
      .set("Cache-Control", "no-store")
      .json({ error: "Unauthorized" });
  });
  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error(`[basis-mcp] transport failed: ${error instanceof Error ? error.message : "unknown error"}`);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  });
  app.get("/mcp", (_req: Request, res: Response) => res.status(405).set("Allow", "POST").json({ error: "Use POST for stateless Streamable HTTP." }));
  app.delete("/mcp", (_req: Request, res: Response) => res.status(405).set("Allow", "POST").json({ error: "Stateless sessions cannot be deleted." }));

  app.listen(PORT, HOST, () => console.info(`[basis-mcp] read-only server listening at http://${HOST}:${PORT}/mcp`));
}

void main().catch((error) => {
  console.error(`[basis-mcp] startup failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
