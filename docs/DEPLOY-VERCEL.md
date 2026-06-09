# Deploy the Taplio MCP server to Vercel (for claude.ai / mobile)

This hosts the server as a serverless function so you get a public **HTTPS URL** you can add to claude.ai as a custom connector. The local desktop setup keeps working independently.

## How security works here

- **The Taplio API key never leaves the server.** It lives only as an encrypted Vercel environment variable (`TAPLIO_API_KEY`).
- **The endpoint is gated by a secret token** (`MCP_SHARED_SECRET`). Every request must include it (`...?token=<secret>`), or it's rejected with `401`. claude.ai's connector UI has no field for custom headers, so the secret rides in the URL — keep that URL private; it's effectively a password.
- The server **fails closed**: if `MCP_SHARED_SECRET` is unset, it refuses every request.
- Optionally set `TAPLIO_READONLY=true` to block all write tools (create/update/delete/publish/schedule/media) on the public endpoint.

> The token in the URL is the gate. Treat the full connector URL like a secret, and rotate `MCP_SHARED_SECRET` if it ever leaks.

---

## Step 1 — Push this project to GitHub

```bash
cd "/Users/saidurrahaman/Desktop/Projects/Taplio MCP"
git init
git add .
git commit -m "Taplio MCP server"
# create an EMPTY repo on github.com first, then:
git remote add origin https://github.com/<you>/taplio-mcp.git
git branch -M main
git push -u origin main
```

`.env` is gitignored, so your key is **not** pushed. Good.

## Step 2 — Import into Vercel

1. Go to <https://vercel.com/new> and import the repo.
2. Framework preset: **Other** (no framework). Leave the build command as-is — `vercel.json` already sets `npm run build`.
3. Don't deploy yet — add env vars first (next step). If it auto-deploys, that's fine; you'll redeploy after adding env vars.

## Step 3 — Add environment variables

In the Vercel project → **Settings → Environment Variables**, add (for **Production**, Preview, and Development):

| Name | Value |
|------|-------|
| `TAPLIO_API_KEY` | your Taplio API key |
| `MCP_SHARED_SECRET` | a strong random string (see below) |
| `TAPLIO_READONLY` | `false` (or `true` to make the public endpoint read-only) |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Then **Deployments → … → Redeploy** so the new env vars take effect.

## Step 4 — ⚠️ Turn OFF Vercel Deployment Protection

Vercel projects often default to **"Vercel Authentication"** protection, which would require a Vercel login and **block claude.ai**.

Go to **Settings → Deployment Protection → Vercel Authentication → Disabled** (Production).
Your own `MCP_SHARED_SECRET` is what protects the endpoint instead.

## Step 5 — Get your URL and verify it

Your endpoint is:

```
https://<your-project>.vercel.app/mcp?token=<MCP_SHARED_SECRET>
```

Verify from your terminal (replace both placeholders):

```bash
curl -s -X POST "https://<your-project>.vercel.app/mcp?token=<secret>" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"taplio_health","arguments":{}}}'
```

Expected: a `data:` line containing `"status": "ok"`. A `401` means the token is wrong; a Vercel login page means Step 4 wasn't done.

## Step 6 — Add it to claude.ai

1. claude.ai → **Settings → Connectors → Add custom connector** (requires a paid plan; org admins may need to allow custom connectors).
2. **Name:** Taplio
3. **Remote MCP server URL:** `https://<your-project>.vercel.app/mcp?token=<MCP_SHARED_SECRET>`
4. Save. The Taplio tools then appear in the chat's tool menu on web and mobile.

---

## Rotating the secret

Change `MCP_SHARED_SECRET` in Vercel → redeploy → update the URL in the claude.ai connector. The old URL stops working immediately.

## Notes & limits

- `taplio_upload_media` takes a **local file path**, which doesn't make sense on a remote server — use it only via the local desktop setup. The other 14 tools work fine remotely.
- Stateless serverless mode: each request is self-contained (no Redis/session store needed).
- `maxDuration` is 60s (see `vercel.json`); raise it if you hit timeouts on slow calls and your plan allows.
