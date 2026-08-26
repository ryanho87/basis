import assert from "node:assert/strict";
import { isAuthorizedBearerHeader, requireMcpBearerToken } from "../mcp/auth";

const token = "a".repeat(64);

assert.equal(requireMcpBearerToken(token), token);
assert.throws(() => requireMcpBearerToken(""), /BASIS_MCP_BEARER_TOKEN/);
assert.throws(() => requireMcpBearerToken("too-short"), /at least 32 bytes/);
assert.throws(() => requireMcpBearerToken(`${"a".repeat(32)} token`), /no whitespace/);

assert.equal(isAuthorizedBearerHeader(undefined, token), false);
assert.equal(isAuthorizedBearerHeader(token, token), false);
assert.equal(isAuthorizedBearerHeader(`Basic ${token}`, token), false);
assert.equal(isAuthorizedBearerHeader(`Bearer ${"b".repeat(64)}`, token), false);
assert.equal(isAuthorizedBearerHeader(`Bearer ${token}suffix`, token), false);
assert.equal(isAuthorizedBearerHeader(`Bearer ${token}`, token), true);
assert.equal(isAuthorizedBearerHeader(`bearer ${token}`, token), true);

console.info("Basis MCP bearer-auth checks passed.");
