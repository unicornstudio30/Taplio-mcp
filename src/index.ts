#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadDotEnv } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  loadDotEnv();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Important: never write to stdout — it is the MCP transport. Use stderr for logs.
  console.error("taplio-mcp server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting taplio-mcp:", err instanceof Error ? err.message : err);
  process.exit(1);
});
