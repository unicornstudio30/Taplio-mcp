import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig } from "./config.js";
import { TaplioClient } from "./client.js";
import { registerTools } from "./tools.js";

/** Builds a fully-configured Taplio MCP server (tools registered, not yet connected). */
export function createServer(): McpServer {
  const config = loadConfig();
  const client = new TaplioClient(config);

  const server = new McpServer({
    name: "taplio-mcp",
    version: "0.1.0",
  });

  registerTools(server, client);
  return server;
}
