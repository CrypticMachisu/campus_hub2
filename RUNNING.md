# RUNNING.md — how to run CampusHub from scratch

Step-by-step for **every cold start**: after your computer shuts down, after a reboot, or
from a clean clone on a new machine. Follow it top to bottom and the API runs. If a step
fails, use the **Alternative** lines underneath it before giving up.

Quick reference once everything is installed (first time only — see steps 2–5):

```
1. Start MySQL (XAMPP)          3. Start the server:  ./run.sh
2. Open the repo:  cd campus_hub2     4. Check:  curl http://localhost:5000/api/health
```

---

## Step 0 — prerequisites (installed once per machine)

| Need    | Version           | Check           |
| ------- | ----------------- | --------------- |
| Node.js | 18 or newer       | `node -v`       |
| npm     | bundled with Node | `npm -v`        |
| Git     | any recent        | `git --version` |
| MySQL   | XAMPP's works     | see Step 2      |

If Node is missing, install the current **LTS** release from https://nodejs.org and re-run the check. (Node's `fetch`, `AbortSignal.timeout` and the traffic script all need 18+.)

## Step 1 — get the latest code

```bash
cd <wherever-the-repo-is>\campus_hub2        # Git Bash: cd /c/Users/machi/.../campus_hub2
git pull origin main
```

**Alternative:** if it is a brand-new machine, clone instead:

```bash
git clone https://github.com/CrypticMachisu/campus_hub2.git
cd campus_hub2
```

> Pulling to a non-clean tree: if `git pull` refuses because of local changes, run
> `git status` first — stash (`git stash`) or commit your work instead of force-overwriting.

## Step 2 — start MySQL (XAMPP)

The app reads and writes the local MySQL database `campushub` on 127.0.0.1:3306
(XAMPP default: user `root`, empty password).

1. Open the **XAMPP Control Panel**.
2. Click **Start** next to **MySQL** (Apache is not required for the API).

**Alternative (CLI):**

```bash
# Git Bash on Windows — start XAMPP's MySQL headlessly
"C:/xampp/xampp_start.exe"    # or: net start mysql  (if MySQL is installed as a service)
```

**Check that it is listening:**

```bash
netstat -ano | findstr 3306        # Git Bash: netstat -ano | grep -E ":3306.*LISTENING"
```

Expected: one or two `LISTENING` lines with a PID.

> **Two MySQLs error:** only ONE MySQL may own port 3306. If netstat shows nothing or the
> DB later refuses connections, stop the other one (Windows: `services.msc` → MySQL/MySQL80
> → Stop) and start XAMPP's again.

## Step 3 — first time only: database schema and demo data

Skip this normally — the database survives a shutdown. Run it only on a fresh MySQL or a
fresh clone. From the **repo root**:

```bash
# Git Bash / macOS / Linux
mysql -u root -e "CREATE DATABASE IF NOT EXISTS campushub"
mysql -u root campushub < server/campushub_database.sql
cd server && npm install && npm run migrate:baseline
```

**Warning:** `server/campushub_database.sql` begins with `DROP DATABASE IF EXISTS campushub`, so loading it wipes and recreates the database — never load it into a database you want to keep.

The schema file already contains everything the migrations add, so a fresh install records them as applied (`migrate:baseline`) instead of running them.

**Windows alternative (PowerShell has no `<`):**

```powershell
cmd /c "C:\xampp\mysql\bin\mysql.exe -u root -e ""CREATE DATABASE IF NOT EXISTS campushub"""
cmd /c "C:\xampp\mysql\bin\mysql.exe -u root campushub < server\campushub_database.sql"
cd server; npm install; npm run migrate:baseline
```

**Alternative without a terminal:** open http://localhost/phpmyadmin , create database
`campushub`, import `server/campushub_database.sql` with its **Import** tab, then run
`cd server && npm run migrate:baseline`.

**Already have a database from an earlier clone?** Don't re-import. From `server/`:

```bash
npm run migrate:status   # shows applied and pending migrations
npm run migrate          # applies the pending ones in order, recording each
```

> If your MySQL root has a password, add `-p` to every mysql command and put the same
> password into `server/.env` as `DB_PASSWORD`.

## Step 4 — configure and start the API server

**4a. Server configuration (first time only).** `server/.env` is machine-local, git-ignored,
and survives shutdowns — you only rebuild it after a fresh clone or a `.env` deletion:

```bash
cd server
npm install                     # first run only (run.sh does this automatically too)
cp .env.example .env            # Windows Git Bash: cp works; cmd.exe: copy .env.example .env
```

Then fill in `server/.env`:

| Key               | What to put                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DB_*`            | Your MySQL login (XAMPP defaults already match the example)                                                                                      |
| `JWT_SECRET`      | Any long random string                                                                                                                           |
| `API_KEYS`        | Comma-separated keys the consumers send as `X-API-Key`. Generate one: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` |
| `PORT`            | 5000 (or anything free)                                                                                                                          |
| `PARTNER_URL`     | `https://farmers-agroconnect.onrender.com/api` — leave as is                                                                                     |
| `PARTNER_API_KEY` | Only if Team 6 issued you one; the app also runs without it                                                                                      |

**4b. Start the server** (from the repo root):

```bash
./run.sh            # Git Bash / macOS / Linux — installs server deps if missing, then runs
```

`run.sh` tees every request line into `server/requests.log` while showing it in the same
terminal. Leave this terminal open — closing it stops the server.

**Alternatives, in order of preference when `run.sh` fails:**

```bash
# 1. manual equivalent of run.sh
cd server && npm install && node server.js 2>&1 | tee requests.log

# 2. production start (no log copy)
cd server && npm start

# 3. different port, if 5000 is busy
PORT=5001 ./run.sh
#    Git Bash on Windows:       PORT=5001 ./run.sh
#    PowerShell:                $env:PORT=5001; npm --prefix server start
#    cmd.exe:                   set PORT=5001 && cd server && npm start
```

Expected startup output:

```
CampusHub API listening on port 5000
API keys loaded: 2
Rate limit: 100 requests per 60000 ms per key
Public URL: <your-ngrok-url>/api        (only when PUBLIC_URL is set)
```

**Check the server:**

```bash
curl http://localhost:5000/api/health                    # {"ok":true}
curl http://localhost:5000/api/clubs -H "X-API-Key: <your-api-key>"     # JSON clubs list
```

Windows PowerShell note: use `curl.exe` (plain `curl` is an alias for a different tool).

> **Port already in use:** find and stop the old instance —
> `netstat -ano | findstr :5000` → note the PID → `taskkill /PID <pid> /F`
> (Git Bash: `taskkill //PID <pid> //F`). Then run `./run.sh` again.

## Step 5 — the front end (only when you need the web UI)

The API works without this. From the **repo root**:

```bash
npm install                                              # first run only
```

The React app reads `VITE_API_URL` and `VITE_API_KEY` at build/dev start — fill in the
root `.env` (copy `.env.example` in the repo root first). `VITE_API_KEY` must be one of your
`server/.env` `API_KEYS` values.

```bash
# development (hot reload):
npm run dev            # Vite serves http://localhost:5173

# or a production build, served locally:
npm run build
npm run preview        # Vite serves the built dist/
```

**Alternatives:** if `npm run dev` errors with a port conflict, `npm run dev -- --port 5174`;
if `VITE_*` changes don't take effect, stop and re-run (Vite reads them at startup).

## Step 6 — letting teammates in (the public URL, optional)

Weeks 9–12 use an **ngrok** tunnel so the ring partner can call you:

```bash
ngrok http 5000
```

Copy the `https://...ngrok-free.dev` forwarding URL, put it into `server/.env` as
`PUBLIC_URL`, and restart the server — startup then prints `Public URL: <url>/api`.
Teammates call `https://<that-url>/api/...` with the key **you issued them**.

> **ngrok address changes** every time ngrok restarts unless you have a static domain:
> re-share the new URL after each restart. If teammates get browser-warning pages,
> their request needs the header `ngrok-skip-browser-warning: true` (our front end
> already sends it).

## Troubleshooting quick list

| Symptom                                                                | Fix                                                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `ECONNREFUSED` / `Couldn't connect to MySQL. Is XAMPP's MySQL running` | MySQL is not up — Step 2. Or `server/.env` points at the wrong host/port                                                             |
| `ER_BAD_DB_ERROR: Unknown database 'campushub'`                        | Run Step 3 once (schema not loaded on this machine)                                                                                  |
| Server prints `listening` but every request is 401                     | The caller's header `X-API-Key` must exactly match one of the comma-separated `server/.env` `API_KEYS` values                        |
| `Error: listen EADDRINUSE :::5000`                                     | Another process holds 5000 — see the port-in-use fix in Step 4b                                                                      |
| "mysql" is not recognized                                              | Use the full path `C:\xampp\mysql\bin\mysql.exe` (Windows) or add it to PATH                                                         |
| `/api/partner/*` answers 502 `Partner data unavailable`                | Expected behaviour when Team 6's upstream is down/slow/unauthorized — the log line above says why. The rest of the API is unaffected |
| Front end loads but every list is an error                             | The React bundle has no `VITE_API_KEY` or points at the wrong `VITE_API_URL` — fix root `.env`, restart `npm run dev` (or rebuild)   |
| ngrok teammates see an interstitial page                               | Send `ngrok-skip-browser-warning: true` (see Step 6)                                                                                 |

## After a shutdown — the 60-second version

```
1. XAMPP Control Panel → Start MySQL
2. (cd campus_hub2 && git pull origin main)
3. ./run.sh
4. curl http://localhost:5000/api/health     → {"ok":true}
```

That is everything: dot-env, packages and the database all survive the shutdown; only the
processes need restarting. The saved partner fallback copy (in-memory) resets by design —
the first successful partner call repopulates it.
