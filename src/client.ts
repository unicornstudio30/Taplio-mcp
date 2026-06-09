import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { TaplioConfig } from "./config.js";

/** Shape of the `error` object inside a Taplio error envelope. */
export interface TaplioErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Error thrown for any non-2xx Taplio response. Carries the API's structured
 * error code and request id so callers (and the model) get an actionable message.
 */
export class TaplioApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, body: TaplioErrorBody, requestId?: string) {
    super(`[${body.code}] ${body.message}`);
    this.name = "TaplioApiError";
    this.status = status;
    this.code = body.code;
    this.requestId = requestId;
    this.details = body.details;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  query?: Query;
  body?: unknown;
}

/** Thin, typed wrapper over the Taplio REST API using global fetch (Node 18+). */
export class TaplioClient {
  constructor(private readonly config: TaplioConfig) {}

  get readOnly(): boolean {
    return this.config.readOnly;
  }

  async get<T = unknown>(path: string, query?: Query): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  async post<T = unknown>(path: string, body?: unknown, query?: Query): Promise<T> {
    return this.request<T>("POST", path, { body, query });
  }

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, { body });
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>("DELETE", path, {});
  }

  /** Uploads a local file as multipart/form-data to the given path. */
  async uploadFile<T = unknown>(path: string, filePath: string): Promise<T> {
    const data = await readFile(filePath);
    const form = new FormData();
    // Copy into a fresh Uint8Array so Blob gets a clean ArrayBuffer (not a view).
    const bytes = new Uint8Array(data);
    form.append("file", new Blob([bytes]), basename(filePath));
    return this.send<T>("POST", this.url(path), form);
  }

  private async request<T>(method: string, path: string, opts: RequestOptions): Promise<T> {
    const url = this.url(path, opts.query);
    const headers: Record<string, string> = {};
    let payload: string | FormData | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(opts.body);
    }
    return this.send<T>(method, url, payload, headers);
  }

  private async send<T>(
    method: string,
    url: string,
    body: string | FormData | undefined,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: "application/json",
          ...extraHeaders,
        },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new TaplioApiError(0, {
          code: "request_timeout",
          message: `Request to ${url} timed out after ${this.config.timeoutMs}ms.`,
        });
      }
      throw new TaplioApiError(0, {
        code: "network_error",
        message: `Network request to ${url} failed: ${(err as Error).message}`,
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    const json = text ? safeParse(text) : undefined;

    if (!res.ok) {
      const envelope = json as
        | { error?: TaplioErrorBody; meta?: { request_id?: string } }
        | undefined;
      const errBody: TaplioErrorBody = envelope?.error ?? {
        code: `http_${res.status}`,
        message: text || res.statusText || `HTTP ${res.status}`,
      };
      throw new TaplioApiError(res.status, errBody, envelope?.meta?.request_id);
    }

    return json as T;
  }

  private url(path: string, query?: Query): string {
    const u = new URL(this.config.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
      }
    }
    return u.toString();
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
