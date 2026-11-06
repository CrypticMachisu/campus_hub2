# CI and running the app

This is the practical guide for the team. It covers what runs automatically on
GitHub, what it does **not** touch, and the exact commands to start CampusHub for
a demo or presentation.

CI lives in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## 1. What CI does

CI runs on GitHub whenever someone:

- pushes to `main`, or
- opens or updates a pull request.

A newer push to the same branch cancels the older run, so only the latest commit
is checked.

There are two jobs, both on a fresh Ubuntu runner:

### Job 1 — "Lint and build"

1. Installs the root and `server/` dependencies with `npm ci`.
2. Runs `npm run lint` (ESLint over the whole repo).
3. Runs `npm run build` (the Vite production build).
4. Fails if either command fails.

This catches syntax problems, unused imports, lint rules, and a broken frontend
build before anyone merges.

### Job 2 — "Server tests (MySQL + API)"

This job starts a **throwaway MySQL 8 container** and does the same setup a
developer would do locally:

1. Starts MySQL with root/root (only inside the container).
2. Loads `server/campushub_database.sql`, which drops and recreates the
   `campushub` database **inside that container only**.
3. Runs `npm run migrate:baseline` (records the migrations the schema already
   contains) and `npm run set-passwords` (gives the demo accounts the password
   `campushub123`).
4. Starts the API with `node server.js` and waits for `GET /api/health`.
5. Runs all three server suites, one file at a time:

   ```
   node --test --test-concurrency=1 \
     tests/api-security.test.mjs \
     tests/migrate.test.mjs \
     tests/signups-comments.test.mjs
   ```

   That is 18 tests: API key/rate-limit security, the migration runner, and the
   signup/waitlist/comment routes.

   The suites run **sequentially on purpose**: the security suite deliberately
   exhausts the API key's rate window, and the route suite would spend a minute
   recovering if both files ran at the same time.

6. If anything fails, prints the API's log so the failure is diagnosable from
   the GitHub Actions page.

### What CI does not do

- **It does not deploy anything.** There is no deploy step, and it does not
  touch XAMPP, your laptop, or any shared database.
- **It does not migrate a real database.** All schema work happens inside the
  disposable MySQL container and disappears with it.
- **It does not run the frontend Jest tests.** The repo has Jest configured but
  no root `npm test` script yet, so CI only lints and builds the frontend.
- **It needs no repository secrets.** The JWT secret, API key, database
  password and seed password are dummy values defined in the workflow; they
  protect nothing outside the runner.

### Cost and typical duration

The repository is public, so standard GitHub-hosted runners are **free and
unmetered**. A run typically takes about 3–4 minutes. The security suite alone
waits out a 60-second rate-limit window, which is the main reason it is not
faster.

Where to look: **GitHub → Actions → CI**. Open a run to see each job and step;
failed steps keep their logs.

---

## 2. How CI affects starting the app

Short answer: **it does not change how you start the app locally, and it does not
need to be "run" before a presentation.**

- CI only reads the repository. It never writes to your machine or to a shared
  database.
- It uses its own API key, JWT secret and MySQL container, so nothing you do
  locally can break a CI run, and a CI run cannot affect your demo data.
- The one rule that matters: **do not present from a commit whose CI is red.**
  If `main` is red, check out the last green commit for the demo. Everything
  else is unaffected.

If you pull code that includes a new migration (for example `009_audit_log.sql`,
which adds the audit trail), run `npm run migrate` once against your existing
database. Without it the app still runs, but `GET /api/admin/audit` will fail
because the table does not exist.

---

## 3. Presentation / demo startup (Windows + XAMPP)

Do this once before the presentation, and again if the database is fresh.

### Step 1 — Start MySQL

Open **XAMPP Control Panel** and click **Start** next to MySQL. Only one MySQL
server can use port 3306; stop any other MySQL service first.

### Step 2 — Get the latest code

```bash
git pull origin main
```

### Step 3 — Database

**Case A — you already have a working database** (the usual case; keeps your
data):

```bash
cd server
npm install
npm run migrate:status    # shows applied and pending migrations
npm run migrate           # applies anything pending, e.g. 009_audit_log.sql
```

**Case B — fresh machine, or you deliberately want a clean demo database:**

```bash
mysql -u root campushub < server/campushub_database.sql
cd server
npm install
npm run migrate:baseline
npm run set-passwords
```

> **Warning:** `server/campushub_database.sql` begins with
> `DROP DATABASE IF EXISTS campushub`. In Case B it wipes and recreates the
> database. Never run it when you have data worth keeping.

With XAMPP, the `mysql` binary may not be on your PATH. Use the full path:

```bash
/c/xampp/mysql/bin/mysql.exe -u root campushub < server/campushub_database.sql
```

In PowerShell, which does not support `<`:

```powershell
cmd /c "C:\xampp\mysql\bin\mysql.exe -u root campushub < server\campushub_database.sql"
```

`set-passwords` matters: the seed rows have empty password hashes, so accounts
cannot log in until it has run.

### Step 4 — Start the API

```bash
cd server
npm run dev
```

Wait for `CampusHub API listening on port 5000`. Leave this terminal open.

### Step 5 — Start the frontend

In a **second** terminal, from the repo root:

```bash
npm install
npm run dev
```

Open the URL Vite prints (normally <http://localhost:5173>).

### Step 6 — Sign in

All demo accounts use the password set by `npm run set-passwords`
(default `campushub123`):

| Account                    | Role   | What it shows                |
| -------------------------- | ------ | ---------------------------- |
| `amara.okafor@campus.edu`  | tier1  | Platform-wide admin view     |
| `leo.fischer@campus.edu`   | tier2  | Club admin for club-01       |
| `sofia.ramirez@campus.edu` | member | Member workspace for club-01 |
| `yuki.tanaka@campus.edu`   | member | Second member in club-01     |
| `nadia.haddad@campus.edu`  | member | Different club (club-05)     |

### Configuration files

These are already set up on the team machines; only needed on a new clone.

`server/.env`:

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=campushub
JWT_SECRET=<any long random string>
API_KEYS=<one or more comma-separated keys>
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
SEED_PASSWORD=campushub123
```

Root `.env`:

```
VITE_API_KEY=<must match one of the keys in API_KEYS>
```

The API requires `X-API-Key` on every endpoint except `GET /api/health`. The
frontend reads `VITE_API_KEY`, so the two files must agree.

---

## 4. Run the same checks locally (optional, before pushing)

```bash
# From the repo root
npm ci
npm run lint
npm run build

# Server suites (the API must already be running, and the database seeded)
cd server
node --test --test-concurrency=1 \
  tests/api-security.test.mjs \
  tests/migrate.test.mjs \
  tests/signups-comments.test.mjs
```

Notes:

- `tests/migrate.test.mjs` creates and drops its own database
  (`campushub_migrate_test_<pid>`). It never touches `campushub`.
- The security suite bursts requests until it gets a 429 and then waits about a
  minute, so a local run takes roughly 70–90 seconds. That is expected, not a
  hang.
- If you only touched the frontend, `npm run lint && npm run build` is usually
  enough.

---

## 5. Presentation quick checklist

- [ ] XAMPP MySQL is running (green in the control panel).
- [ ] `git pull origin main`, and the latest CI run on `main` is green.
- [ ] `cd server && npm run migrate:status` → `9 applied, 0 pending`.
- [ ] `cd server && npm run dev` → "listening on port 5000".
- [ ] In a second terminal: `npm run dev` → Vite URL opens.
- [ ] Log in as Sofia (member) and Amara (tier1) once to confirm both views.
- [ ] Keep the API terminal visible; errors and request logs appear there.

### Troubleshooting

| Symptom                                                       | Cause and fix                                                                                                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login says "Invalid email or password" for every demo account | Passwords were never seeded. Run `cd server && npm run set-passwords`.                                                                                          |
| `GET /api/admin/audit` returns 500                            | Migration `009` was not applied. Run `cd server && npm run migrate`.                                                                                            |
| `EADDRINUSE` on port 5000                                     | An old API server is still running. Find and stop it: `netstat -ano \| grep :5000`, then `taskkill //F //PID <pid>` (Git Bash).                                 |
| Frontend requests get 401                                     | `VITE_API_KEY` in the root `.env` does not match any key in `server/.env`'s `API_KEYS`.                                                                         |
| Requests suddenly return 429 during a demo                    | The API allows 100 requests per key per 60 seconds. Wait a minute, or restart the API (the limiter is in memory and resets on restart).                         |
| CI is red but the app works locally                           | CI is stricter about a clean install. Read the failing step's log; reproduce with `npm ci && npm run lint && npm run build` and the server suite command above. |
