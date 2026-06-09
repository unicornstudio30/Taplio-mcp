# Taplio MCP

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the **official Taplio REST API** (`https://api.taplio.com`) to Claude and other MCP clients.

Unlike browser-automation approaches, this server talks to Taplio's documented, key-authenticated API — so it's stable, fast, and doesn't break when the web UI changes.

## What it can do

15 tools mapped 1:1 to the Taplio API:

| Tool | Description |
|------|-------------|
| `taplio_health` | Liveness probe for the API |
| `taplio_list_posts` | List posts (scheduled / sending / sent), with date + status filters |
| `taplio_get_post` | Get a single post by id |
| `taplio_list_drafts` | List post drafts |
| `taplio_get_draft` | Get a single draft |
| `taplio_create_draft` | Create a draft (1–3000 chars) |
| `taplio_update_draft` | Update a draft's text |
| `taplio_delete_draft` | Discard a draft |
| `taplio_publish_draft` | **Publish a draft to LinkedIn immediately** |
| `taplio_schedule_draft` | Schedule a draft for a future time |
| `taplio_attach_media` | Attach already-uploaded media by reference |
| `taplio_upload_media` | Upload a local image/video file and attach it |
| `taplio_search_inspirations` | Search Taplio's viral-post inspiration index |
| `taplio_analytics_overview` | Account analytics time-series |
| `taplio_analytics_posts` | Per-post engagement analytics |

## Setup

```bash
npm install
npm run build
```

Get your API key from **Taplio → Settings → API**.

### Quick check

Run the read-only smoke test against the live API (only calls non-mutating endpoints):

```bash
TAPLIO_API_KEY=your_key_here npm run smoke
```

## Connect to Claude Desktop

Edit your Claude Desktop config:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add (use the absolute path to `dist/index.js`):

```json
{
  "mcpServers": {
    "taplio": {
      "command": "node",
      "args": ["/Users/saidurrahaman/Desktop/Projects/Taplio MCP/dist/index.js"],
      "env": {
        "TAPLIO_API_KEY": "your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. The Taplio tools appear under the 🔌 / tools menu.

## Remote server (claude.ai web / mobile)

Claude Desktop runs the server locally. To use Taplio from **claude.ai or the mobile app**, you need a hosted HTTPS endpoint. This repo includes a serverless HTTP build for that.

- Full walkthrough: **[docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md)**
- Test the HTTP server locally first:
  ```bash
  MCP_SHARED_SECRET=devsecret npm run http
  # then POST to http://localhost:3000/mcp?token=devsecret
  ```

Security model: the Taplio key stays server-side (`TAPLIO_API_KEY` env var); the endpoint is gated by a secret token in the URL (`?token=...`); the server fails closed if the secret is unset.

## Connect to Claude Code

```bash
claude mcp add taplio --env TAPLIO_API_KEY=your_key_here -- node "/Users/saidurrahaman/Desktop/Projects/Taplio MCP/dist/index.js"
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TAPLIO_API_KEY` | ✅ | — | Your Taplio API key. Sent as `Authorization: Bearer <key>`. |
| `TAPLIO_BASE_URL` | | `https://api.taplio.com` | API base URL. |
| `TAPLIO_READONLY` | | `false` | When `true`, blocks all write/destructive tools (create/update/delete/publish/schedule/media). Read tools still work. |
| `TAPLIO_TIMEOUT_MS` | | `30000` | Per-request timeout. |

See `.env.example`.

## Safety notes

- **`taplio_publish_draft` posts to LinkedIn immediately and is irreversible.** Claude will ask for your approval before any tool call; review publish/schedule calls carefully. Set `TAPLIO_READONLY=true` to disable all writes entirely.
- `scheduled_for` must be an ISO 8601 datetime in the future (e.g. `2026-06-10T14:30:00Z`).
- Errors from the API are surfaced with their `code`, message, and `request_id` for easy debugging.

## Development

```bash
npm run dev        # watch mode (tsx)
npm run typecheck  # type-check only
npm run mcp        # run from source without building
```

## Project layout

```
src/
  index.ts    # entry — stdio transport
  server.ts   # builds the McpServer, registers tools
  tools.ts    # all 15 tool definitions
  client.ts   # typed Taplio REST client (fetch + error handling)
  config.ts   # env config loader
scripts/
  smoke.ts    # read-only live API smoke test
```
