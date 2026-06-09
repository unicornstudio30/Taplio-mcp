import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TaplioApiError, type TaplioClient } from "./client.js";

/** Renders a successful tool result as pretty JSON text content. */
function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/** Renders an error tool result (isError: true) with a readable message. */
function fail(err: unknown) {
  let text: string;
  if (err instanceof TaplioApiError) {
    const parts = [`Taplio API error (HTTP ${err.status}) [${err.code}]: ${err.message}`];
    if (err.requestId) parts.push(`request_id: ${err.requestId}`);
    if (err.details && Object.keys(err.details).length) {
      parts.push(`details: ${JSON.stringify(err.details)}`);
    }
    text = parts.join("\n");
  } else {
    text = err instanceof Error ? err.message : String(err);
  }
  return { content: [{ type: "text" as const, text }], isError: true };
}

/** Wraps a handler so thrown errors become structured isError results. */
function handler<A>(fn: (args: A) => Promise<ReturnType<typeof ok>>) {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (err) {
      return fail(err);
    }
  };
}

export function registerTools(server: McpServer, client: TaplioClient): void {
  /** Guards write tools when the server is in read-only mode. */
  const ensureWritable = () => {
    if (client.readOnly) {
      throw new Error(
        "Server is in read-only mode (TAPLIO_READONLY=true); this write operation is blocked.",
      );
    }
  };

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------
  server.registerTool(
    "taplio_health",
    {
      title: "Taplio health check",
      description: "Liveness probe for the Taplio API. Verifies the API is reachable.",
      inputSchema: {},
    },
    handler(async () => ok(await client.get("/v1/healthz"))),
  );

  // ---------------------------------------------------------------------------
  // Posts (published / scheduled)
  // ---------------------------------------------------------------------------
  server.registerTool(
    "taplio_list_posts",
    {
      title: "List posts",
      description:
        "List the account's posts (scheduled, sending, or sent). Supports pagination via cursor and date filtering.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("Max items to return."),
        cursor: z.string().optional().describe("Pagination cursor from a previous response's meta.next_cursor."),
        status: z
          .enum(["scheduled", "sending", "sent"])
          .optional()
          .describe("Filter by post status."),
        from: z.string().optional().describe("Start of window, YYYY-MM-DD (UTC)."),
        to: z.string().optional().describe("End of window, YYYY-MM-DD (UTC)."),
      },
    },
    handler(async ({ limit, cursor, status, from, to }) =>
      ok(await client.get("/v1/posts", { limit, cursor, status, from, to })),
    ),
  );

  server.registerTool(
    "taplio_get_post",
    {
      title: "Get a post",
      description: "Fetch a single post by its id.",
      inputSchema: { id: z.string().describe("Post id.") },
    },
    handler(async ({ id }) => ok(await client.get(`/v1/posts/${encodeURIComponent(id)}`))),
  );

  // ---------------------------------------------------------------------------
  // Drafts
  // ---------------------------------------------------------------------------
  server.registerTool(
    "taplio_list_drafts",
    {
      title: "List drafts",
      description: "List the account's post drafts, most recent first. Supports cursor pagination.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("Max items to return."),
        cursor: z.string().optional().describe("Pagination cursor from a previous response."),
      },
    },
    handler(async ({ limit, cursor }) => ok(await client.get("/v1/posts/drafts", { limit, cursor }))),
  );

  server.registerTool(
    "taplio_get_draft",
    {
      title: "Get a draft",
      description: "Fetch a single post draft by its id, including any attached media.",
      inputSchema: { id: z.string().describe("Draft id.") },
    },
    handler(async ({ id }) => ok(await client.get(`/v1/posts/drafts/${encodeURIComponent(id)}`))),
  );

  server.registerTool(
    "taplio_create_draft",
    {
      title: "Create a draft",
      description:
        "Create a new post draft with text content (1–3000 characters). Returns the created draft including its id.",
      inputSchema: {
        content: z.string().min(1).max(3000).describe("Post body text (1–3000 characters)."),
      },
    },
    handler(async ({ content }) => {
      ensureWritable();
      return ok(await client.post("/v1/posts/drafts", { content }));
    }),
  );

  server.registerTool(
    "taplio_update_draft",
    {
      title: "Update a draft",
      description: "Replace the text content of an existing draft (1–3000 characters).",
      inputSchema: {
        id: z.string().describe("Draft id."),
        content: z.string().min(1).max(3000).describe("New post body text (1–3000 characters)."),
      },
    },
    handler(async ({ id, content }) => {
      ensureWritable();
      return ok(await client.patch(`/v1/posts/drafts/${encodeURIComponent(id)}`, { content }));
    }),
  );

  server.registerTool(
    "taplio_delete_draft",
    {
      title: "Discard a draft",
      description: "Permanently discard a post draft. This cannot be undone.",
      inputSchema: { id: z.string().describe("Draft id to discard.") },
    },
    handler(async ({ id }) => {
      ensureWritable();
      return ok(await client.delete(`/v1/posts/drafts/${encodeURIComponent(id)}`));
    }),
  );

  server.registerTool(
    "taplio_publish_draft",
    {
      title: "Publish a draft now",
      description:
        "Publish a draft to LinkedIn IMMEDIATELY. This is an outward-facing, irreversible action — the post goes live right away. Prefer taplio_schedule_draft when timing is flexible.",
      inputSchema: { id: z.string().describe("Draft id to publish now.") },
    },
    handler(async ({ id }) => {
      ensureWritable();
      return ok(await client.post(`/v1/posts/drafts/${encodeURIComponent(id)}/commit`));
    }),
  );

  server.registerTool(
    "taplio_schedule_draft",
    {
      title: "Schedule a draft",
      description:
        "Schedule a draft to be published at a future time. `scheduled_for` is an ISO 8601 datetime (e.g. 2026-06-10T14:30:00Z). Must be in the future.",
      inputSchema: {
        id: z.string().describe("Draft id to schedule."),
        scheduled_for: z
          .string()
          .describe("ISO 8601 datetime for publication, e.g. 2026-06-10T14:30:00Z. Must be in the future."),
      },
    },
    handler(async ({ id, scheduled_for }) => {
      ensureWritable();
      return ok(
        await client.post(`/v1/posts/drafts/${encodeURIComponent(id)}/schedule`, { scheduled_for }),
      );
    }),
  );

  // ---------------------------------------------------------------------------
  // Media
  // ---------------------------------------------------------------------------
  server.registerTool(
    "taplio_attach_media",
    {
      title: "Attach uploaded media",
      description:
        "Attach already-uploaded media to a draft by reference. Each item needs an id and a type (image, video, or carousel). Use taplio_upload_media to upload a local file instead.",
      inputSchema: {
        id: z.string().describe("Draft id."),
        media: z
          .array(
            z.object({
              id: z.string().describe("Media id."),
              type: z.enum(["image", "video", "carousel"]).describe("Media type."),
              url: z.string().url().optional().describe("Optional media URL."),
            }),
          )
          .min(1)
          .describe("One or more media references to attach."),
      },
    },
    handler(async ({ id, media }) => {
      ensureWritable();
      return ok(await client.post(`/v1/posts/drafts/${encodeURIComponent(id)}/media`, { media }));
    }),
  );

  server.registerTool(
    "taplio_upload_media",
    {
      title: "Upload media file",
      description:
        "Upload a local image or video file and attach it to a draft. Provide the absolute path to the file on the machine running this server. Returns the updated draft.",
      inputSchema: {
        id: z.string().describe("Draft id to attach the uploaded file to."),
        file_path: z.string().describe("Absolute path to the image/video file on this machine."),
      },
    },
    handler(async ({ id, file_path }) => {
      ensureWritable();
      return ok(await client.uploadFile(`/v1/posts/drafts/${encodeURIComponent(id)}/upload`, file_path));
    }),
  );

  // ---------------------------------------------------------------------------
  // Inspirations
  // ---------------------------------------------------------------------------
  server.registerTool(
    "taplio_search_inspirations",
    {
      title: "Search inspirations",
      description:
        "Search Taplio's viral-post inspiration index. All filters are optional; with none supplied it browses recent high-performing posts.",
      inputSchema: {
        query: z.string().optional().describe("Free-text search query."),
        min_likes: z.number().int().optional().describe("Minimum like count."),
        min_comments: z.number().int().optional().describe("Minimum comment count."),
        max_followers: z.number().int().optional().describe("Cap on author follower count."),
        min_days_old: z.number().int().optional().describe("Minimum post age in days."),
        max_days_old: z.number().int().optional().describe("Maximum post age in days."),
        min_char_count: z.number().int().optional().describe("Minimum post length in characters."),
        from: z.string().optional().describe("Start date, YYYY-MM-DD."),
        to: z.string().optional().describe("End date, YYYY-MM-DD."),
        lang: z.string().optional().describe("Language code, e.g. en."),
        limit: z.number().int().min(1).max(100).optional().describe("Max items to return."),
        cursor: z.string().optional().describe("Pagination cursor."),
      },
    },
    handler(async (args) => ok(await client.get("/v1/inspirations", args))),
  );

  // ---------------------------------------------------------------------------
  // Analytics
  // ---------------------------------------------------------------------------
  server.registerTool(
    "taplio_analytics_overview",
    {
      title: "Analytics overview",
      description:
        "Time-series of account + post metrics bucketed by day over a window. `from`/`to` are YYYY-MM-DD (UTC); omit for the default window. `metrics` is an optional comma-separated subset.",
      inputSchema: {
        from: z.string().optional().describe("Window start, YYYY-MM-DD (UTC)."),
        to: z.string().optional().describe("Window end, YYYY-MM-DD (UTC)."),
        granularity: z.enum(["day"]).optional().describe("Bucket granularity (currently only 'day')."),
        metrics: z.string().optional().describe("Comma-separated subset of metrics to return."),
      },
    },
    handler(async (args) => ok(await client.get("/v1/analytics/overview", args))),
  );

  server.registerTool(
    "taplio_analytics_posts",
    {
      title: "Per-post analytics",
      description:
        "Paginated list of the account's posts with engagement metrics over a window. `from`/`to` are YYYY-MM-DD (UTC).",
      inputSchema: {
        from: z.string().optional().describe("Window start, YYYY-MM-DD (UTC)."),
        to: z.string().optional().describe("Window end, YYYY-MM-DD (UTC)."),
        limit: z.number().int().min(1).max(100).optional().describe("Max items to return."),
        cursor: z.string().optional().describe("Pagination cursor."),
      },
    },
    handler(async (args) => ok(await client.get("/v1/analytics/posts", args))),
  );
}
