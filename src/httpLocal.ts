#!/usr/bin/env node
import { createServer as createHttp } from "node:http";
import { loadDotEnv } from "./config.js";
import { createHttpHandler } from "./httpServer.js";

// Local runner for the Streamable HTTP server — mirrors the Vercel deployment.
loadDotEnv();

const handler = createHttpHandler();
const port = Number(process.env.PORT ?? 3000);

createHttp((req, res) => {
  handler(req, res).catch((err) => {
    console.error("Handler error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "internal_error" }));
    }
  });
}).listen(port, () => {
  console.error(`taplio-mcp HTTP server listening on http://localhost:${port}/  (POST with ?token=...)`);
});
