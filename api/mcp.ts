import type { IncomingMessage, ServerResponse } from "node:http";
import { createHttpHandler } from "../dist/httpServer.js";

// Vercel Serverless Function entry point for the Taplio MCP server.
// Env vars (set in the Vercel dashboard, encrypted):
//   - TAPLIO_API_KEY      : your Taplio API key (server-side only)
//   - MCP_SHARED_SECRET   : the token clients must present in the URL (?token=...)
//   - TAPLIO_READONLY     : optional "true" to block all write tools
//
// Vercel pre-parses JSON bodies onto req.body and provides req.query, both of
// which createHttpHandler() understands. The handler is stateless (a fresh MCP
// server per request) which matches Vercel's serverless execution model.
const handler = createHttpHandler();

export default function (req: IncomingMessage, res: ServerResponse) {
  return handler(req as never, res);
}

export const config = {
  // Use the Node.js runtime (needed for the MCP SDK + Node APIs), not Edge.
  runtime: "nodejs",
};
