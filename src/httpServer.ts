import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";

/**
 * Request shape accepted by the handler. Plain Node http provides only the
 * stream; serverless platforms (Vercel) additionally pre-parse `body`/`query`.
 * We support both.
 */
type Req = IncomingMessage & { body?: unknown; query?: Record<string, unknown> };

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const text = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(text);
}

/** Reads and JSON-parses a request body from the raw stream. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}

/** Extracts the auth token from `?token=` or an `Authorization: Bearer` header. */
function extractToken(req: Req): string | undefined {
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  try {
    const url = new URL(req.url ?? "", "http://localhost");
    const q = url.searchParams.get("token");
    if (q) return q;
  } catch {
    /* ignore malformed url */
  }
  const fromQuery = req.query?.token;
  return typeof fromQuery === "string" ? fromQuery : undefined;
}

/** Constant-time-ish string compare to avoid trivial timing leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Returns a Node-style request handler that serves the Taplio MCP server over
 * stateless Streamable HTTP. Suitable for serverless (Vercel) and local Node.
 *
 * Security: requires MCP_SHARED_SECRET to be set; every request must present a
 * matching token (URL `?token=` or Bearer header) or it is rejected. The Taplio
 * API key is read server-side from TAPLIO_API_KEY and never exposed to clients.
 */
export function createHttpHandler() {
  const secret = (process.env.MCP_SHARED_SECRET ?? "").trim();

  return async function handler(req: Req, res: ServerResponse): Promise<void> {
    // Refuse to run unauthenticated — fail closed.
    if (!secret) {
      sendJson(res, 500, {
        error: "server_misconfigured",
        message: "MCP_SHARED_SECRET is not set on the server.",
      });
      return;
    }

    const token = extractToken(req);
    if (!token || !safeEqual(token, secret)) {
      sendJson(res, 401, { error: "unauthorized", message: "Missing or invalid token." });
      return;
    }

    if (req.method !== "POST") {
      // Stateless Streamable HTTP: only POST carries JSON-RPC. GET/others -> 405.
      res.writeHead(405, { "Content-Type": "application/json", Allow: "POST" });
      res.end(JSON.stringify({ error: "method_not_allowed" }));
      return;
    }

    let body: unknown;
    try {
      body = req.body !== undefined ? req.body : await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "invalid_json", message: "Request body is not valid JSON." });
      return;
    }

    // Stateless: a brand-new server + transport per request, then cleaned up.
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: "internal_error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };
}
