#!/usr/bin/env node
import type { IncomingMessage, ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadDotEnv } from "./config.js";
import { createServer } from "./server.js";
import { createHttpHandler } from "./httpServer.js";

/**
 * This module is intentionally dual-purpose:
 *
 *  1. Run directly (`node dist/index.js` / `npm run mcp`) — starts the local
 *     stdio MCP server for Claude Desktop / Claude Code.
 *
 *  2. Imported by a serverless host (Vercel) — the default export is a standard
 *     Node HTTP handler serving the same MCP server over Streamable HTTP. This
 *     makes deployment robust even when the platform picks this file as the
 *     function entry instead of `api/mcp.mjs`.
 */

async function startStdio(): Promise<void> {
  loadDotEnv();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("taplio-mcp server running on stdio");
}

// Only start the stdio server when this file is executed directly, never when
// it is imported as a serverless function module.
const invokedDirectly =
  process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  startStdio().catch((err) => {
    console.error("Fatal error starting taplio-mcp:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

// HTTP handler for serverless platforms (Vercel). Reads TAPLIO_API_KEY and
// MCP_SHARED_SECRET from the environment; gates every request on the token.
const httpHandler = createHttpHandler();

export default function (req: IncomingMessage, res: ServerResponse) {
  return httpHandler(req as never, res);
}
