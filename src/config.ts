import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Loads a local .env file into process.env if present (Node 18.20+/20.6+/22+).
 *
 * MCP clients (e.g. Claude Desktop) launch this server with an arbitrary
 * working directory — usually `/` — so we cannot rely on the cwd. We look for
 * `.env` relative to this module's location (project root, one level above
 * `dist/` or `src/`) and fall back to the cwd. Missing files are ignored;
 * real clients can also pass env directly.
 */
export function loadDotEnv(): void {
  const fn = (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile;
  if (typeof fn !== "function") return;

  const here = dirname(fileURLToPath(import.meta.url)); // .../dist or .../src
  const candidates = [
    resolve(here, "../.env"), // project root when running from dist/ or src/
    resolve(here, "../../.env"),
    resolve(process.cwd(), ".env"),
  ];
  for (const path of candidates) {
    try {
      fn(path);
      return; // loaded successfully
    } catch {
      // not at this path — try the next candidate
    }
  }
}

export interface TaplioConfig {
  apiKey: string;
  baseUrl: string;
  readOnly: boolean;
  timeoutMs: number;
}

/**
 * Reads configuration from the environment. Throws a clear error if the
 * required API key is missing so the failure is obvious at startup.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): TaplioConfig {
  const apiKey = (env.TAPLIO_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error(
      "TAPLIO_API_KEY is not set. Add it to your environment or .env file. " +
        "Find your key in Taplio → Settings → API.",
    );
  }

  const baseUrl = (env.TAPLIO_BASE_URL ?? "https://api.taplio.com").trim().replace(/\/+$/, "");
  const readOnly = /^(1|true|yes)$/i.test((env.TAPLIO_READONLY ?? "").trim());

  const rawTimeout = Number(env.TAPLIO_TIMEOUT_MS ?? "30000");
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 30000;

  return { apiKey, baseUrl, readOnly, timeoutMs };
}
