/**
 * Read-only smoke test against the live Taplio API.
 * Usage: TAPLIO_API_KEY=... npm run smoke
 * Only calls non-mutating endpoints (health, list, analytics, inspirations).
 */
import { loadConfig, loadDotEnv } from "../src/config.js";
import { TaplioClient } from "../src/client.js";

async function main() {
  loadDotEnv();
  const client = new TaplioClient(loadConfig());

  const checks: Array<[string, () => Promise<unknown>]> = [
    ["GET /v1/healthz", () => client.get("/v1/healthz")],
    ["GET /v1/posts?limit=2", () => client.get("/v1/posts", { limit: 2 })],
    ["GET /v1/posts/drafts?limit=2", () => client.get("/v1/posts/drafts", { limit: 2 })],
    ["GET /v1/inspirations?limit=2", () => client.get("/v1/inspirations", { limit: 2 })],
    ["GET /v1/analytics/overview", () => client.get("/v1/analytics/overview")],
  ];

  let failures = 0;
  for (const [label, fn] of checks) {
    try {
      const res = await fn();
      const preview = JSON.stringify(res).slice(0, 160);
      console.log(`✅ ${label}\n   ${preview}\n`);
    } catch (err) {
      failures++;
      console.log(`❌ ${label}\n   ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  console.log(failures === 0 ? "All read-only checks passed." : `${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
