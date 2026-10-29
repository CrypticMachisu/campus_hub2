# CampusHub API

CampusHub is a REST API for a campus clubs-and-events app. It lets students list clubs and events, sign in, and (for authorised users) create clubs and manage events. It is aimed at developers building a front end or integrating another campus service with club and event data. All responses are JSON.

- **Base URL (local):** `http://localhost:5000/api`
- **Base URL (live, temporary):** `https://movable-eastcoast-showman.ngrok-free.dev/api`
- **Stack:** Node.js + Express + MySQL
- **API reference:** open `docs/index.html` in a browser (generated from `openapi.yaml`).

---

## Try it without installing anything (temporary live API)

While the blind test is running, a copy of the API is reachable at:

```
https://movable-eastcoast-showman.ngrok-free.dev/api
```

All endpoints live under `/api`. The bare address (without `/api`) returns `Cannot GET /`, which is expected.

Quick check:

```bash
curl https://movable-eastcoast-showman.ngrok-free.dev/api/health
```

Expected: `{"ok":true}`. If you get an HTML warning page instead of JSON, add the header `-H "ngrok-skip-browser-warning: true"` to the request. Browsers show the same warning once; click through it.

From Week 9 on, every request other than the health check must carry an API key in the `X-API-Key` header (see [API keys](#api-keys) below) — the live copy runs the same build, so the live URL enforces this exactly like local:

```bash
curl https://movable-eastcoast-showman.ngrok-free.dev/api/clubs -H "X-API-Key: <your-api-key>"
```

> **Windows PowerShell:** use `curl.exe` and quote each header:
> `curl.exe https://movable-eastcoast-showman.ngrok-free.dev/api/clubs -H "X-API-Key: <your-api-key>"`

A request without the key (or with an unknown one) returns the same `401` as locally: `{"error":"Missing or invalid API key."}`. The health check needs no key, so `.../api/health` is the quickest way to confirm the tunnel is up before you spend quota.

Reading clubs and events needs no account — just your shipped API key. To call a protected endpoint on the live copy, create your own account (the demo accounts below are not available there):

```bash
curl -X POST https://movable-eastcoast-showman.ngrok-free.dev/api/auth/register \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Your Name","email":"you@example.com","password":"at-least-8-chars"}'
```

Use the returned `token` as `Authorization: Bearer <token>` — still alongside your `X-API-Key` header, never instead of it — for example on `GET /api/auth/me`. New accounts are `member` accounts, so creating clubs or events returns `403`.

This address stops working when the host's machine or tunnel is switched off. All other examples in this README use the local address `http://localhost:5000/api`; swap in the live base URL if you are testing against the live copy.

---

## Run it locally (from a clean clone)

You need: **Node.js 18+**, **Git**, and **MySQL** (XAMPP's MySQL works). Nothing else.

> Only one MySQL server may use port 3306. If you have two (for example XAMPP and a separate MySQL service), stop one of them first.

```bash
git clone https://github.com/CrypticMachisu/campus_hub2.git
cd campus_hub2
```

**1. Start MySQL** (in XAMPP, click _Start_ next to MySQL).

**2. Create the database and load the schema + demo data.** Run these from the repo root. On macOS/Linux the `mysql` command is usually on your PATH. On Windows with XAMPP use `C:\xampp\mysql\bin\mysql.exe`.

```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS campushub"
mysql -u root campushub < server/campushub_database.sql
mysql -u root campushub < server/migrations/001_add_password_auth.sql
mysql -u root campushub < server/migrations/002_add_password_reset.sql
```

Windows PowerShell does not support `<`, so run the first line as written and the other three like this:

```powershell
cmd /c "C:\xampp\mysql\bin\mysql.exe -u root campushub < server\campushub_database.sql"
cmd /c "C:\xampp\mysql\bin\mysql.exe -u root campushub < server\migrations\001_add_password_auth.sql"
cmd /c "C:\xampp\mysql\bin\mysql.exe -u root campushub < server\migrations\002_add_password_reset.sql"
```

(Alternative: in phpMyAdmin, select `campushub`, open the **Import** tab and import the three files in the order shown.)

If your MySQL root user has a password, add `-p` to the commands and set `DB_PASSWORD` in step 3.

**3. Configure and start the server.**

```bash
cd server
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run set-passwords         # gives all 8 demo users the password below
npm start
```

You should see: `CampusHub API listening on http://localhost:5000`

**4. Check it works** (new terminal):

```bash
curl http://localhost:5000/api/health
```

Expected: `{"ok":true}`

> **Windows PowerShell:** use `curl.exe` (plain `curl` is an alias for something else), and for requests with a JSON body save the JSON to a file and use `--data "@file.json"` to avoid quoting problems. Example in the Login section.

---

## API keys

Every request to the API — reads included — must carry an API key in the `X-API-Key` header. The only exception is [`/api/health`](#health-check), which answers without a key so external uptime checks work and a consumer can confirm the API is alive before spending its quota.

Each consumer (your team, your ring partner, ...) has its **own** key, so usage can be attributed and one key can be revoked without breaking the rest. Keys are handed out privately by direct message — never published in this repository, the class channel, or a screenshot. The API's copy of the keys lives in `server/.env` (outside git); if a key ever leaks, it is rotated there and the consumer is told.

A request without a key, or with an unknown key, gets **401**: `{"error":"Missing or invalid API key."}` — no handler runs.

```bash
curl -i http://localhost:5000/api/clubs                                   # 401 – no key
curl -i -H "X-API-Key: wrong" http://localhost:5000/api/clubs             # 401 – wrong key
curl -i -H "X-API-Key: <your-api-key>" http://localhost:5000/api/clubs    # 200
```

### Rate limit

Each key may make **100 requests per 60 seconds**. We chose 100 as a defensible default: comfortably above any legitimate consumer's polling loop, low enough that a runaway client can't hammer the server. When it is exceeded, the API answers **429** with a `Retry-After` header (seconds) and a JSON body, so a well-behaved consumer knows exactly when to try again:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 42

{"error":"Too many requests.","retryAfter":42}
```

➡ All `curl` examples below assume you send `-H "X-API-Key: <your-api-key>"` with every request.

## Authentication (end users)

Every consumer sends its **API key** (above) on every request. On top of that, anything that creates or changes data additionally needs a **token** identifying the signed-in human:

1. Log in with `POST /api/auth/login` to get a `token`.
2. Send it on later requests as a header: `Authorization: Bearer <token>`.

Tokens are JWTs and are valid for 7 days. Roles are `tier1`, `tier2` and `member`.

### Demo accounts

All demo accounts use the password **`campushub123`** (set by `npm run set-passwords`; change it with `SEED_PASSWORD` in `server/.env`).

| Email                      | Role                       |
| -------------------------- | -------------------------- |
| `amara.okafor@campus.edu`  | `tier1` (can create clubs) |
| `leo.fischer@campus.edu`   | `tier2`                    |
| `sofia.ramirez@campus.edu` | `member`                   |

---

## Endpoints

All endpoints require `X-API-Key` (except `/api/health`); the `Auth` column shows what the key consumer additionally needs.

| Method | Path                 | Auth                     | Purpose                  |
| ------ | -------------------- | ------------------------ | ------------------------ |
| GET    | `/api/health`        | none (no API key either) | Check the API is running |
| POST   | `/api/auth/login`    | none – but API key       | Sign in, get a token     |
| POST   | `/api/auth/register` | none – but API key       | Create a member account  |
| GET    | `/api/auth/me`       | API key + token          | Get the signed-in user   |
| GET    | `/api/clubs`         | none – but API key       | List clubs               |
| POST   | `/api/clubs`         | API key + token (tier1)  | Create a club            |
| GET    | `/api/events`        | none – but API key       | List events              |
| POST   | `/api/events`        | API key + token          | Create an event          |
| PUT    | `/api/events/:id`    | API key + token          | Update an event          |
| DELETE | `/api/events/:id`    | API key + token          | Delete an event          |

### Health check

```bash
curl http://localhost:5000/api/health
```

```json
{ "ok": true }
```

### Login

`POST /api/auth/login` — body: `{ "email": string, "password": string }`

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"email":"amara.okafor@campus.edu","password":"campushub123"}'
```

PowerShell:

```powershell
'{"email":"amara.okafor@campus.edu","password":"campushub123"}' | Set-Content login.json
curl.exe -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" --data "@login.json"
```

Response `200` (token shortened here; yours is longer):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-01",
    "name": "Amara Okafor",
    "email": "amara.okafor@campus.edu",
    "role": "tier1",
    "adminForClubs": []
  }
}
```

### Register

`POST /api/auth/register` — body: `{ "name": string, "email": string, "password": string }`. The password must be at least 8 characters. Creates a `member` account.

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "X-API-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Student","email":"test.student@campus.edu","password":"longenough123"}'
```

Response `201 Created` (token shortened here):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-1791804321595",
    "name": "Test Student",
    "email": "test.student@campus.edu",
    "role": "member",
    "adminForClubs": []
  }
}
```

Registering an email that already exists returns `409`.

### Current user

`GET /api/auth/me` — requires a token.

```bash
curl http://localhost:5000/api/auth/me -H "X-API-Key: <your-api-key>" -H "Authorization: Bearer <token>"
```

Response `200`:

```json
{
  "user": {
    "id": "user-01",
    "name": "Amara Okafor",
    "email": "amara.okafor@campus.edu",
    "role": "tier1",
    "adminForClubs": []
  }
}
```

### List clubs

`GET /api/clubs` — no login token, but still send the API key. Returns every club, sorted by name, wrapped in a `clubs` array. Club IDs are strings like `club-01`.

```bash
curl http://localhost:5000/api/clubs -H "X-API-Key: <your-api-key>"
```

Response `200` (shortened to one club; the real response has six):

```json
{
  "clubs": [
    {
      "id": "club-04",
      "name": "Byte Club",
      "category": "Technology",
      "description": "Hands-on workshops, hackathon prep, and project nights for anyone into building software.",
      "logoUrl": "https://images.unsplash.com/photo-1758270705317-3ef6142d306f?...",
      "meetingTime": "Thursdays, 7:00 PM",
      "meetingLocation": "Engineering Building, Lab 108",
      "tags": ["coding", "hackathon", "workshops"]
    }
  ]
}
```

### Create a club

`POST /api/clubs` — requires a token from a `tier1` user. Body: `name` and `category` are required; `description`, `logoUrl`, `meetingTime`, `meetingLocation` and `tags` are optional. `category` must be an existing category name (for example `Technology` or `Social`). `tags` can be a list or a comma-separated string.

```bash
curl -X POST http://localhost:5000/api/clubs \
  -H "X-API-Key: <your-api-key>" \
  -H "Authorization: Bearer <tier1-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Chess Society","category":"Social","description":"Casual and ranked chess nights.","meetingTime":"Wednesdays, 6:00 PM","meetingLocation":"Student Union, Room 102","tags":["chess","games"]}'
```

Response `201`: `{ "club": { ... } }`, where the club has the same fields as in the list above and a generated `id` starting with `club-`.

Using a token from a non-tier1 account (for example one from `register`) returns `403` with `{"error":"Tier 1 admin access required."}`.

### List events

`GET /api/events` — no login token, but still send the API key. Returns every event, ordered by date and time, wrapped in an `events` array. `clubId` points at a club's `id`.

```bash
curl http://localhost:5000/api/events -H "X-API-Key: <your-api-key>"
```

Response `200` (shortened to one event; the real response has twelve):

```json
{
  "events": [
    {
      "id": "event-05",
      "clubId": "club-03",
      "title": "River Trail 5K",
      "description": "A social 5K along the river trail, coffee after at the Rec Center.",
      "category": "Sports & Fitness",
      "date": "2026-10-12",
      "time": "06:30",
      "location": "Rec Center steps",
      "imageUrl": "https://images.unsplash.com/photo-1745790289741-12a211a8325d?...",
      "isSeed": true
    }
  ]
}
```

### Create an event

`POST /api/events` — requires a token, and the caller must manage the event's club. Body: `clubId`, `title`, `category`, `date` (`YYYY-MM-DD`) and `time` (`HH:MM`) are required; `description`, `location` and `imageUrl` are optional. `category` must be an existing category name.

```bash
curl -X POST http://localhost:5000/api/events \
  -H "X-API-Key: <your-api-key>" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"clubId":"club-01","title":"README Test Event","description":"Testing","category":"Academic","date":"2026-11-01","time":"18:00","location":"Room 1"}'
```

PowerShell: save the JSON body to `event.json` and use `--data "@event.json"`, with `-H "Authorization: Bearer $env:TOKEN"`.

Response `201 Created`:

```json
{
  "event": {
    "id": "custom-1791803508229",
    "clubId": "club-01",
    "title": "README Test Event",
    "description": "Testing",
    "category": "Academic",
    "date": "2026-10-31",
    "time": "18:00",
    "location": "Room 1",
    "imageUrl": null,
    "isSeed": false
  }
}
```

Note the `date` in this response is one day earlier than the one sent. See [Known issues](#known-issues).

### Update an event

`PUT /api/events/:id` — requires a token, and the caller must manage the event's club. Only events whose ID starts with `custom-` (events created through the API) can be updated; the built-in `event-` events are read-only. `title` and `category` are required; send the other fields (`description`, `date`, `time`, `location`, `imageUrl`) too, because they are all overwritten. The event's club cannot be changed.

```bash
curl -X PUT http://localhost:5000/api/events/custom-1791803508229 \
  -H "X-API-Key: <your-api-key>" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"README Test Event (updated)","description":"Testing","category":"Academic","date":"2026-11-01","time":"19:00","location":"Room 2"}'
```

Response `200`: `{ "event": { ... } }` with the updated event.

### Delete an event

`DELETE /api/events/:id` — requires a token, and the caller must manage the event's club. Only `custom-` events can be deleted. Use the `id` returned when the event was created.

```bash
curl -i -X DELETE http://localhost:5000/api/events/custom-1791803508229 \
  -H "X-API-Key: <your-api-key>" \
  -H "Authorization: Bearer <token>"
```

Response `204 No Content` (success, with an empty body):

```
HTTP/1.1 204 No Content
```

### Other endpoints

These routes exist but are not documented here: `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, and the `/api/users`, `/api/admin-requests`, `/api/signups`, `/api/comments` and `/api/announcements` groups.

---

## Errors

Errors from the API are JSON with a single `error` message and the matching HTTP status code. Check the status code first: `2xx` means success.

Wrong password (`401 Unauthorized`):

```bash
curl -i -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"amara.okafor@campus.edu","password":"wrong"}'
```

```json
{ "error": "Invalid email or password." }
```

Missing or invalid token on a protected endpoint (`401 Unauthorized`):

```bash
curl -i -X POST http://localhost:5000/api/events \
  -H "Content-Type: application/json" \
  -d '{"clubId":"club-01","title":"Test","description":"Testing","category":"Academic","date":"2026-11-01","time":"18:00","location":"Room 1"}'
```

```json
{ "error": "Not authenticated." }
```

Missing or invalid API key on any endpoint except `GET /api/health` (`401 Unauthorized`):

```bash
curl -i http://localhost:5000/api/clubs
```

```json
{ "error": "Missing or invalid API key." }
```

Too many requests with one key in a minute (`429 Too Many Requests`) — includes a `Retry-After` header so a well-behaved consumer knows when to try again:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 42

{"error":"Too many requests.","retryAfter":42}
```

Unexpected server failure (`500`):

```json
{ "error": "Something went wrong on the server." }
```

### Other error messages

| Status | `error` message                             | When                                                                                       |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 400    | `Email and password are required.`          | Login with a missing field                                                                 |
| 400    | `Name and email are required.`              | Register with a missing field                                                              |
| 400    | `Enter a valid email address.`              | Register or forgot-password with a bad email                                               |
| 400    | `Password must be at least 8 characters.`   | Register or reset-password with a short password                                           |
| 400    | `Club name is required.`                    | Create club without a name                                                                 |
| 400    | `Title is required.`                        | Create or update an event without a title                                                  |
| 400    | `Unknown category: <name>`                  | Create or update a club or event with a category that doesn't exist                        |
| 403    | `Tier 1 admin access required.`             | Create a club with a token that isn't tier1                                                |
| 403    | `You don't have admin access to that club.` | Create, update or delete an event for a club you don't manage                              |
| 403    | `Seed events are read-only.`                | Update or delete a built-in `event-` event                                                 |
| 404    | `Event not found.`                          | Update or delete an event ID that doesn't exist                                            |
| 404    | `Not found.`                                | Any URL that doesn't exist                                                                 |
| 409    | `That email is already registered.`         | Register with an email that exists                                                         |
| 429    | `Too many requests.`                        | The key exceeded 100 requests in 60 seconds; see `retryAfter` and the `Retry-After` header |

> **All responses are JSON now.** A request to a path that doesn't exist returns `404` with `{"error":"Not found."}` instead of Express's HTML page. There is no `GET /api/clubs/:id` or `GET /api/events/:id`; use the list endpoints and filter by `id`.

---

## Known issues

- **Event dates can come back one day early.** In the create-event example, `"date":"2026-11-01"` was returned as `"2026-10-31"` by a server running in East Africa (UTC+3). Check the returned `date` before relying on it.
- **The test accounts share one known password.** They are for local development only.

---

## Optional: the web front end

```bash
# from the repo root
npm install
npm run dev
```

Opens at `http://localhost:5173` and talks to the API at `http://localhost:5000/api` (set by `VITE_API_URL` in the root `.env.example`). The API must already be running.
