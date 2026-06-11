# Speed E2E Dashboard

Web UI for triggering and monitoring the Speed Wallet E2E test suite.

## Architecture

```
Browser → Vercel App (Next.js) → [proxy] → Local Server (Express) → E2E Scripts → Android Device
```

- **`vercel-app/`** — Next.js dashboard deployed to Vercel
- **`local-server/`** — Express server running on the machine with the Android device

## Setup

### 1. Local Server (your machine)

```bash
cd local-server
npm install
cp .env.example .env
# Edit .env — set APPIUM_TESTS_DIR and API_KEY
node server.js
```

Expose the local server publicly (choose one):
- **ngrok**: `ngrok http 3001` → copy the HTTPS URL
- **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:3001`

### 2. Vercel App

1. Push this repo to GitHub
2. Import to Vercel → select `vercel-app/` as the root directory
3. Set environment variables in Vercel:
   - `LOCAL_SERVER_URL` — public URL of your local server (from ngrok/cloudflare)
   - `LOCAL_SERVER_API_KEY` — same value as `API_KEY` in local-server/.env

### Environment Variables

| Variable | Where | Description |
|---|---|---|
| `LOCAL_SERVER_URL` | Vercel | Public URL of local server |
| `LOCAL_SERVER_API_KEY` | Vercel | API key to authenticate with local server |
| `PORT` | local-server/.env | Port for local server (default: 3001) |
| `APPIUM_TESTS_DIR` | local-server/.env | Absolute path to appium-tests/ directory |
| `API_KEY` | local-server/.env | Secret key (must match LOCAL_SERVER_API_KEY) |

## Usage

1. Start local server: `node local-server/server.js`
2. Expose it publicly via ngrok or Cloudflare Tunnel
3. Open the Vercel app URL
4. Select run type + countries → click **Run**
5. Watch live logs → view HTML report when done
