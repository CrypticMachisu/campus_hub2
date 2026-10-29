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

## Restarting the stack (tunnel or API down)

Tunnel-down usually means _two_ deaths: ngrok died and the API server died with it (they share a session — a machine reboot, a closed terminal, or an idle laptop sleep kills both). Restart the whole thing; piecemeal diagnosis wastes time.

**1. Decide what's dead. Two checks from the repo root:**

```bash
curl -s --max-time 5 http://127.0.0.1:4040/api/tunnels   # tunnel half (ngrok web API)
curl -s --max-time 5 http://127.0.0.1:5000/api/health    # API half
```

If the ngrok process is listed (`tasklist //FI "IMAGENAME eq ngrok.exe"`) but `:4040` doesn't answer, it is a **zombie** — kill it before starting a new one, or ngrok will silently fail or double-bind:

```bash
taskkill //PID <ngrok-pid> //F                          # double slashes in Git Bash
```

**2. Start the tunnel.** ngrok was installed as a Microsoft Store app, so it is _not_ on the Git Bash PATH — use the WindowsApps alias:

```bash
("$LOCALAPPDATA/Microsoft/WindowsApps/ngrok.exe" http 5000 > /tmp/ngrok-console.log 2>&1 &)
sleep 5
curl -s http://127.0.0.1:4040/api/tunnels | grep -o 'https://[^"]*\.' | head -1   # current public URL
```

**3. Follow the URL if it changed.** Free-plan URLs rotate; this copy has kept the same reserved URL so far, but check the two mirrors every restart:

- `PUBLIC_URL` in `server/.env` (cosmetic — the startup log only — but keep it truthful),
- the consumer-facing base URL in [README.md](README.md) ("Base URL (live, temporary)").

**4. Start the API half if it's down** — section 4 above has the full recipe, and the PORT=0 trap applies on every restart:

```bash
cd server && (PORT=5000 npm run dev > /tmp/campushub-5000.log 2>&1 &)
```

Note `node --watch` swallows its own startup errors from the redirect; if the log ends on a lone `Restarting 'server.js'` and `:5000` has no listener, run `node server.js` in the foreground once to see the real error — the PORT=0 case logs `listening on port 0` and binds to an ephemeral port the tunnel can't reach.

**5. Verify the bridge end to end** — section 7's two curls (health + key-authed clubs, both with `ngrok-skip-browser-warning: 1`). A green health check _locally_ is not enough; after a tunnel restart, re-run both through the public URL before telling consumers it's back.

## Keeping the stack up (watchdog)

`npm run tunnel:watch` automates steps 1–4 above so an ngrok or API death is recovered in seconds, not "when someone next looks at a log". It polls `127.0.0.1:4040/api/tunnels` every 20s; when the tunnel is unhealthy (web UI dead, or up but zero tunnels — the zombie state counts), it kills any zombie ngrok, relaunches with the WindowsApps alias, re-checks 10s later, and mirrors a rotated URL into `PUBLIC_URL` in `server/.env`. Each cycle it also polls the API's key-exempt health check; when `:5000` stops answering it kills any stale listener still holding the port and relaunches `node server.js` with explicit `PORT=5000`.

```bash
npm run tunnel:watch
# or detached:
(bash scripts/tunnel-watchdog.sh > /tmp/tunnel-watchdog-console.log 2>&1 &)
```

What it writes: [`ngrok-watchdog.log`](ngrok-watchdog.log) logs every decision (recovery started, zombie/stale listener killed, API or tunnel back, URL mirrored). It stays silent while both halves are healthy.

Honest limits — exact speed wins, not immortality:

- **A machine sleep or reboot kills the watchdog with everything else.** Run it per-session after startup step 6, not as a daemon. At demo time, disable sleep so the whole stack (MySQL, API, tunnel, watchdog) stays up.
- **It will not rescue a server that refuses to boot.** If the API's own exit-on-boot checks fire (fail-fast env validation, MySQL down), the watchdog reports `api still not answering` every cycle and points you at the API log — fix the listed cause; don't expect the relaunch to paper over it.
- Restarts are blind, not diagnostic. The kill-listener-and-relaunch path assumes the runbook recipe (explicit `PORT`, valid `server/.env`) is still the right one. If you deliberately stopped the API half to edit it, the watchdog will keep restarting it — set `WATCHDOG_DRY_RUN=1` (or don't run the watchdog) while you work.
- Test hooks instead of touching the live stack: `WATCHDOG_INTERVAL`, `WATCHDOG_DRY_RUN=1`, `NGROK_UI_URL`, `LOG_FILE`, `ENV_FILE`, and for the API half `API_PORT`, `API_HEALTH_URL`, `API_LOG`.

## For a throwaway test instance

To verify code changes without touching the live copy, run a second server on another port with its own keys — env vars set on the command line win over `.env` (dotenv never overrides):

```bash
cd server
PORT=5099 API_KEYS=throwaway-test-key JWT_SECRET=not-a-real-secret-but-at-least-16-chars node server.js > /tmp/campushub-test.log 2>&1 &
curl http://127.0.0.1:5099/api/health
TEST_BASE_URL=http://127.0.0.1:5099/api API_KEYS=throwaway-test-key npm test
```

Kill it by the port it holds (same netstat/taskkill dance). Note the test burst fills the test key's rate window; the suite waits out any `Retry-After` it hits.

## Troubleshooting cheat sheet

| Symptom                                                                  | Cause / fix                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server exits with `Couldn't connect to MySQL`                            | XAMPP MySQL not running, or `DB_*` in `server/.env` wrong.                                                                                                                                           |
| `EADDRINUSE :5000` at startup                                            | An old instance is still bound. `taskkill //PID <old-pid> //F`, then start again.                                                                                                                    |
| Server exits with `Refusing to start: server/.env is missing or invalid` | Fail-fast env validation — fix each listed `✗` line in `server/.env` (missing DB creds, a bad `DB_PORT`, an unset/placeholder/too-short `JWT_SECRET`, or `API_KEYS` without keys), then start again. |
| Login 500s and `JWT_SECRET` was just fixed                               | The old tokens were signed with the old secret; every consumer must log in again.                                                                                                                    |
| Server "starts" but isn't on 5000                                        | The `PORT=0` trap — pass `PORT=5000` explicitly.                                                                                                                                                     |
| Everything 401s in production traffic                                    | `API_KEYS` empty/typo — check the `API keys loaded:` count in the log.                                                                                                                               |
| Consumers see an HTML page instead of JSON                               | They hit the ngrok interstitial — send `ngrok-skip-browser-warning: true`.                                                                                                                           |
| Consumers see 429                                                        | One consumer exceeded 100 requests/60s; they should honour `Retry-After`.                                                                                                                            |
| ngrok.exe runs but :4040 is dead                                         | Zombie instance — `taskkill //PID <pid> //F`, then start the tunnel again (see "Restarting the stack").                                                                                              |
| `ngrok: command not found` in Git Bash                                   | Store install isn't on PATH — use `$LOCALAPPDATA/Microsoft/WindowsApps/ngrok.exe`.                                                                                                                   |
| 429 while you yourself test a working key                                | Your own key filled its window; wait it out or use a second test key.                                                                                                                                |
| Tunnel URL changed and consumers got errors                              | Update `PUBLIC_URL` + README base URL and tell consumers; the tunnel is free-plan and rotates on restart.                                                                                            |
| Tunnel died again while nobody was watching                              | Run `npm run tunnel:watch` next session; it recovers steps 1–3 automatically (sleep/reboot still kills it — keep the machine awake).                                                                 |
| `docs/index.html` shows an old endpoint list                             | It's a pre-generated Redoc bundle; rebuild it from `openapi.yaml` after spec changes (redoc CLI not scripted in package.json yet).                                                                   |
