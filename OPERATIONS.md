# CampusHub API — internal ops runbook

Not consumer-facing: this file is for the host machine that serves the API. Consumers get README.md; this explains how to start it and keep the tunnel healthy. No secrets are printed here — keys live only in `server/.env`.

## What runs on the host

| Process                      | Port      | Notes                                                      |
| ---------------------------- | --------- | ---------------------------------------------------------- |
| Node/Express API (`server/`) | `:5000`   | The API. Front end is not needed to serve consumers.       |
| MySQL (XAMPP)                | `:3306`   | Must be up first; server exits if it can't connect.        |
| ngrok                        | → `:5000` | Public tunnel; its web UI sits at `http://127.0.0.1:4040`. |

## Start-up sequence (in this order)

### 1. MySQL

XAMPP Control Panel → **Start** next to MySQL. Sanity check:

```bash
mysql -u root -e "SELECT 1"
# Windows/XAMPP if mysql isn't on PATH:
# "C:\xampp\mysql\bin\mysql.exe" -u root -e "SELECT 1"
```

Only one MySQL server may own 3306 — if XAMPP and a system MySQL service conflict, stop one.

### 2. Server env (`server/.env`)

One-time: `cp .env.example .env` (then edit). The values matter:

- `DB_*` — match your MySQL (XAMPP default: root, no password).
- `JWT_SECRET` — any long random string; generate with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `API_KEYS` — comma-separated, one key per consumer. Generate each the same way.
- `SEED_PASSWORD` — demo-account password (`npm run set-passwords` applies it).
- `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` — defaults 60000 / 100.
- `PORT` — normally `5000`; see the PORT=0 trap below.
- `PUBLIC_URL` — the current ngrok base URL (used for the startup log only).

Never commit `.env`, never paste a key into chat or screenshots; share keys by direct message.

### 3. First-time data setup (skip if already done)

From the repo root:

```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS campushub"
mysql -u root campushub < server/campushub_database.sql
mysql -u root campushub < server/migrations/001_add_password_auth.sql
mysql -u root campushub < server/migrations/002_add_password_reset.sql

cd server && npm install
npm run set-passwords      # gives all 8 demo users SEED_PASSWORD
```

(On Windows PowerShell, wrap the redirecting lines in `cmd /c` as README.md shows.)

### 4. Start the API

```bash
cd server
PORT=5000 node server.js > /tmp/campushub-5000.log 2>&1 &
```

**PORT=0 trap:** this machine's shell sessions can carry `PORT=0`, and dotenv will not override an already-set environment variable — the server then binds to a random port and "looks up". Always pass `PORT=5000` explicitly on the start command, even if `.env` also sets it.

Startup log should say, in order:

```
CampusHub API listening on port 5000
API keys loaded: 2
Rate limit: 100 requests per 60000 ms per key
Public URL: https://<current-tunnel>/api
```

`API keys loaded: 0` means `API_KEYS` is empty — every request will 401 until fixed. Log prints the **count**, never the keys.

### 5. Verify before opening the tunnel

```bash
curl http://127.0.0.1:5000/api/health                      # {"ok":true}
curl http://127.0.0.1:5000/api/clubs -H "X-API-Key: $KEY"  # 200
curl http://127.0.0.1:5000/api/clubs                       # 401 (key enforced)
```

(Read the real first key with `KEY=$(grep '^API_KEYS=' server/.env | cut -d= -f2 | cut -d, -f1 | tr -d '\r')` in the shell — don't paste it anywhere.)

### 6. Start the tunnel

```bash
ngrok http 5000
```

Free-plan notes:

- The URL **changes on every ngrok restart**. Two places must follow it:
  - `PUBLIC_URL` in `server/.env` (restart the API after changing — it's read at startup),
  - the consumer-facing base URL in [README.md](README.md) ("Base URL (live, temporary)").
- Consumers' first browser request returns an HTML interstitial; they send `ngrok-skip-browser-warning: true` (README covers this; the ngrok web UI at `127.0.0.1:4040` records every request).
- If ngrok already runs from a different shell session, `127.0.0.1:4040` shows its current URL — don't start a second tunnel.

### 7. End-to-end check through the tunnel

```bash
curl https://<current-tunnel>/api/health -H "ngrok-skip-browser-warning: 1"
curl https://<current-tunnel>/api/clubs -H "X-API-Key: <key>" -H "ngrok-skip-browser-warning: 1"
```

## Stopping the server

Windows quirk: `kill <pid>` from Git Bash does not reliably stop the node process. Find the PID and force-end it:

```bash
netstat -ano | grep ":5000 .*LISTEN"     # PID in the last column
taskkill //PID <pid> //F                 # double slashes in Git Bash
```

Stop the tunnel with `Ctrl+C` in the ngrok terminal (or `Ctrl+C` again to also quit ngrok's prompt). The ngrok session terminates when the machine does; consumers are told the live URL is best-effort while the demo runs.

## For a throwaway test instance

To verify code changes without touching the live copy, run a second server on another port with its own keys — env vars set on the command line win over `.env` (dotenv never overrides):

```bash
cd server
PORT=5099 API_KEYS=throwaway-test-key JWT_SECRET=test-secret node server.js > /tmp/campushub-test.log 2>&1 &
curl http://127.0.0.1:5099/api/health
TEST_BASE_URL=http://127.0.0.1:5099/api API_KEYS=throwaway-test-key npm test
```

Kill it by the port it holds (same netstat/taskkill dance). Note the test burst fills the test key's rate window; the suite waits out any `Retry-After` it hits.

## Troubleshooting cheat sheet

| Symptom                                       | Cause / fix                                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Server exits with `Couldn't connect to MySQL` | XAMPP MySQL not running, or `DB_*` in `server/.env` wrong.                                                                         |
| `EADDRINUSE :5000` at startup                 | An old instance is still bound. `taskkill //PID <old-pid> //F`, then start again.                                                  |
| Server "starts" but isn't on 5000             | The `PORT=0` trap — pass `PORT=5000` explicitly.                                                                                   |
| Everything 401s in production traffic         | `API_KEYS` empty/typo — check the `API keys loaded:` count in the log.                                                             |
| Consumers see an HTML page instead of JSON    | They hit the ngrok interstitial — send `ngrok-skip-browser-warning: true`.                                                         |
| Consumers see 429                             | One consumer exceeded 100 requests/60s; they should honour `Retry-After`.                                                          |
| 429 while you yourself test a working key     | Your own key filled its window; wait it out or use a second test key.                                                              |
| Tunnel URL changed and consumers got errors   | Update `PUBLIC_URL` + README base URL and tell consumers; the tunnel is free-plan and rotates on restart.                          |
| `docs/index.html` shows an old endpoint list  | It's a pre-generated Redoc bundle; rebuild it from `openapi.yaml` after spec changes (redoc CLI not scripted in package.json yet). |
