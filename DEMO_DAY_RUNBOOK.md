# CampusHub — Demo Day runbook, slide script and one-machine command sheet

Team 7 · Rayyan · Hunja · Roy · Tiphanie · **3-minute demo + 2 minutes Q&A**

This file is the single sheet the team presents from. It follows
`CampusHub_Demo_Day_Script (1).docx` and the Demo Day slide template order, and every
command in it has been checked against the code in this repository.

> **Week 13 update (12 Nov 2026):** API versioning shipped, so every slide, cue and test
> count below reflects `/api/v2` running beside a deprecated `/api/v1`. The Versioning slide
> is no longer a "next step" — it is a live demo beat with its own command in §5.3.
>
> **Post-Week-13 addition (13 Nov 2026):** the Agri club now has AgroConnect
> opportunities — farm visits, tree-planting days, harvest mornings and volunteering —
> at `GET /api/v2/agro/opportunities`, member-only, with interest registration, an
> admin roster, and a grower link: an activity can point at a real grower from Team 6's
> list, and its card then shows that grower's county, focus and current produce — labelled
> as theirs. It is **additive and v2-only**. Because there is no time left before
> Demo Day to re-test a consumer-facing change, we are not touching the outward-facing
> endpoints: `/api/events`, `/api/v2/events`, `/api/clubs`, `/api/partner/*` and every
> header and payload they return stay exactly as they are. Nothing in Team 8's or Team
> 6's integration moves. The optional demo beat is §3.5.

> Notes on sources: the slide template ZIP and Edgar's prompt files were not attached in
> the chat this runbook was written in, so the slide **names** below come from the deck
> sections listed in the Demo Day script (`Our App and Why It Exists`, `Our Ring`,
> `Live Demo`, `Our Run Sheet`, `Integration and Resilience`, `Design`, `Build and Test`,
> `Documentation`, `Security`, `Monitoring`, `Versioning`, `What Is Not Finished`). If your
> deck labels a slide differently, the order and the content still apply — just rename the
> heading. Everything is run from the **repo root** (`campus_hub2`, the folder the team
> clones), on **Windows PowerShell**.

---

## 0. The shape of the demo

| Time      | Slides (template)                                               | Presenter | Ends on cue                                                            |
| --------- | --------------------------------------------------------------- | --------- | ---------------------------------------------------------------------- |
| 0:00–0:40 | Our App and Why It Exists · Our Ring                            | Rayyan    | "…and provide club and event data to Team 8."                          |
| 0:40–2:40 | Live Demo · Our Run Sheet · Integration                         | Hunja     | "…`stale: false`, so it is live data."                                 |
| 2:40–3:30 | Design · Build and Test · Documentation · Security · Monitoring | Roy       | "…every local route stayed under about 30 ms."                         |
| 3:30–4:10 | Integration and Resilience · Versioning · What Is Not Finished  | Tiphanie  | "…v2 is live, v1 still answers and tells every caller when it leaves." |

**Timing reality check.** The per-part times above are the script's own (40 + 120 + 50 + 40 =
250 s ≈ 4:10), while the slot is 3 minutes of demo plus 2 minutes of Q&A. Rehearse to the
slot: if the room is strict, cut Hunja to about 1:10 by dropping step 4 (read back) and the
second failure, and cut Roy to about 40 s by pointing at the green CI tab instead of naming
every suite. All of that is talking and clicking, so it trims cleanly without losing a
claim.

**The single most important rule for a one-machine demo:** only **one** person types, in
**one** terminal, at a time. Three windows are open for the whole demo and nobody closes
them:

| Window       | What runs in it                                      | Who types              |
| ------------ | ---------------------------------------------------- | ---------------------- |
| **A — API**  | `node server.js`, every request logged to the screen | Hunja                  |
| **B — Web**  | `npm run dev` (Vite, `http://localhost:5173`)        | nobody                 |
| **C — Demo** | every `curl.exe` command and the small node scripts  | R → H → Roy → Tiphanie |

`$env:KEY` and `$env:TOKEN` are set **once** in window C before the audience arrives and
never again. That is why all the command work happens in C.

---

## 1. Before the audience — one machine, 15 minutes out

### 1.1 Checklist

- [ ] XAMPP Control Panel → **MySQL** started (green). Only one MySQL may hold port 3306.
- [ ] `git pull origin main`; the latest CI run on `main` is **green**.
- [ ] `cd server; npm run migrate:status` → `12 applied, 0 pending` (this machine is
      migrated as of 13 Nov, including the three Agro-opportunity migrations). If a fresh
      schema was imported from `server/campushub_database.sql` without a baseline it prints
      `0 applied, 12 pending`; that is expected — do **not** run `npm run migrate` then, it
      would try to create tables that already exist.
- [ ] `npx jest` from the repo root → `18 passed` (version + mapping suites; no database, ~10 s).
- [ ] `cd server; npm run refresh:agro` on the morning of the demo. The four seeded
      activities were dated relative to when the migration ran, and the API only returns
      upcoming ones, so this re-anchors the seeds to +3/+6/+9/+14 days. Admin-added
      activities keep their dates.
- [ ] `server/requests.log` deleted or empty (so the log only contains demo traffic).
      `Remove-Item server\requests.log -ErrorAction SilentlyContinue`
- [ ] Windows are open in the order A (API, left), B (Vite, middle), C (demo, right/full
      width for the projector), plus a browser with these **tabs**: 1. `http://localhost:5173` (Home, scrolled to "Farmers on AgroConnect") 2. `http://localhost:5000/api/health` 3. `docs/index.html` (the OpenAPI reference — Documentation slide) 4. `openapi.yaml` in an editor, scrolled to the versioning note near `version: 2.0.0` (Versioning slide) 5. GitHub → **Actions → CI** → the green run (Build and Test slide) 6. `MONITORING_NOTES.md` (Monitoring slide) 7. `VERSIONING_NOTES.md` (Versioning slide, if asked)
- [ ] Terminal font ≥ 16 pt, light-on-dark, so the projector can read JSON.
- [ ] Shell history cleared and `server/.env` **not** open — keys are never on screen.
- [ ] One full rehearsal, out loud, with a timer.

### 1.2 Start the two servers (off-screen, 5–10 minutes out)

**Window A — API, with the live log visible (this is the terminal the audience watches):**

```powershell
cd C:\path\to\campus_hub2\server
$env:PORT = "5000"
node server.js 2>&1 | Tee-Object -FilePath requests.log
```

Expected startup block (this is the "we just started from scratch" proof):

```
CampusHub API listening on port 5000
API keys loaded: 2
Rate limit: 100 requests per 60000 ms per key
Public URL: https://<current-tunnel>/api
API versions: /api/v2 (current) and /api/v1 = /api (deprecated, sunsets 2026-11-30)
```

That last line is the transition into Tiphanie's slide: v2 is the current version, and the
unversioned `/api` path is v1 with a date on it. `API keys loaded: 0` means `API_KEYS` is
empty — every request will 401. Fix before you present. Git Bash alternative: `./run.sh`
from the repo root (same thing, plus dependency install on first run).

> **PORT note (corrected 12 Nov):** `server/.env` sets `PORT=5000`, so `npm start` binds 5000 in
> a normal terminal. The only way this server lands on a random port is an inherited `PORT=0`:
> a shell spawned by the desktop app carries one, and dotenv never overrides a variable that is
> already set. The `$env:PORT = "5000"` line above makes window A immune either way. If you see
> `listening on port 0`, clear the variable instead of adding more overrides: `Remove-Item
Env:PORT` in PowerShell, `unset PORT` in Git Bash.

**Window B — the web front end:**

```powershell
cd C:\path\to\campus_hub2
npm run dev
```

Opens `http://localhost:5173`. The root `.env` supplies `VITE_API_URL` and `VITE_API_KEY`;
both must agree with `server/.env` or every list shows an error. The app appends `/v2` to
`VITE_API_URL` itself, so the base stays `…/api` and its calls land on `/api/v2`.

### 1.3 Pre-stage the demo session (window C, audience not watching)

This loads our own key straight out of `server/.env`, so the value is never typed, echoed
or photographed, and mints the admin token once:

```powershell
cd C:\path\to\campus_hub2
$env:API = "http://localhost:5000/api"

$keysLine = (Get-Content server\.env | Where-Object { $_ -match '^API_KEYS=' })
$env:KEY = ($keysLine -replace '^API_KEYS=', '').Split(',')[0].Trim()

$env:TOKEN = (curl.exe -s -X POST "$env:API/auth/login" `
  -H "X-API-Key: $env:KEY" -H "Content-Type: application/json" `
  --data "@login.json" | ConvertFrom-Json).token

if ($env:TOKEN) { "Token OK ($($env:TOKEN.Length) chars)" } else { "TOKEN MISSING - run: cd server; npm run set-passwords" }
```

Warm the partner panels — open the Home page **twice** and scroll to "Fresh from
AgroConnect". Team 6's host sleeps; the first call after idle can take a minute or return
502, and `/health` alone does **not** warm the data routes.

For the optional opportunities beat in §3.5, log in as `sofia.ramirez@campus.edu` (she is a
member of `club-07`) and open `http://localhost:5173/clubs/club-07` once, so the grower
details are warm and the panel is not fetching for the first time on stage. The activity
list itself is local and loads without the partner.

Leave window A running with the startup block on screen: that block **is** Hunja's "I just
started the API from scratch" evidence, so he does not restart it on stage. Stage nothing
else — every command he runs is in §3.2.

---

## 2. Rayyan — Introduction (slides 1–2, ~40 s)

### 2.1 Slide text

**Our App and Why It Exists**

- Students miss events scattered across posters, WhatsApp groups and emails.
- CampusHub: one place to find clubs, browse events, RSVP or join a waitlist, and comment.
- Club admins post announcements and manage their own events; tier 1 admins create clubs
  and approve admin requests.
- Stack: React front end · Node/Express API · MySQL (XAMPP) · one JSON API for all clients.

**Our Ring** (a simple diagram: Team 6 → us → Team 8)

- **Upstream — we call Team 6 (AgroConnect):** `GET /farmers`, `GET /produce`, from our
  server, so the browser never holds their key. Shown as "Farmers on AgroConnect" and
  "Fresh from AgroConnect".
- **Downstream — Team 8 (Strath shop) calls us:** `GET /api/clubs`, `GET /api/events` (and
  now `GET /api/v2/events` with their own key).
- **Our place in the ring:** consume farmer/produce data, provide club/event data.

### 2.2 What to say (40 seconds, timed)

> "We are Team 7, and this is CampusHub. Student clubs and event organisers need one place
> to publish clubs and events, so students stop missing things spread across posters and
> group chats.
>
> CampusHub helps students and campus communities in Kenya find clubs, browse events, sign
> up or join a waitlist, and comment. Club admins post announcements and manage their own
> events. Tier 1 admins create clubs and approve admin requests.
>
> Our API also connects us to two partner teams. Upstream, we call Team 6's AgroConnect API
> for `GET /farmers` and `GET /produce`. **Our server makes those calls, so the browser never
> sees the partner's key.** We show the results on our Home page as 'Farmers on AgroConnect'
> and 'Fresh from AgroConnect'. Downstream, Team 8's marketplace calls our API with
> endpoints like `GET /api/clubs` and `GET /api/events`, to show club and event details to
> their shop users.
>
> So our place in the ring is to consume farmer and produce data from Team 6, and provide
> club and event data to Team 8."

### 2.3 Commands that prove "CampusHub runs" (10 s, window C)

Say: _"The API is already up — here is the liveness check a partner uses before spending
quota, and a real read."_

```powershell
curl.exe "$env:API/health"
```

Expected: `{"ok":true}` — the only endpoint that needs no key.

```powershell
curl.exe "$env:API/clubs" -H "X-API-Key: $env:KEY"
```

Expected: one JSON line starting `{"clubs":[{"id":"club-01",...`. Say: _"This is the exact
payload Team 8 receives, using their own key, not ours."_

Optional 5 s bonus — who is calling us, without printing the key:

```powershell
cd server; node tools/caller-labels.js; cd ..
```

Expected: `#1  key-xxxxxx` / `#2  key-yyyyyy` — the same labels that appear in the request
log. This is the bridge into Hunja's demo.

### 2.4 Files to have on screen if asked

| Shown                          | Path                                           |
| ------------------------------ | ---------------------------------------------- |
| API entry point + route mounts | `server/app.js`, `server/server.js`            |
| Clubs read route               | `server/routes/clubs.js` (`GET /`)             |
| Partner proxy (upstream)       | `server/routes/partner.js`                     |
| What the partner sends         | `INTEGRATION_LOG.md` (contract review section) |

---

## 3. Hunja — Live demo and run sheet (slides 3–4, ~2 min)

One read, one write, one failure, then the partner's call appearing in our log. Narrate
every step. **Never show a key.**

### 3.1 Slide text

**Live Demo**

- Read: the events list a partner or client receives.
- Write: create an event as an admin → `201 Created` → read it back.
- Fail: no API key → `401`; delete a missing event → `404` — clean JSON, no crash.
- Partner: our proxy calls Team 6; `stale: false` means live data.

**Our Run Sheet** (the table in §3.2, trimmed to four rows: READ / WRITE / FAIL / PARTNER)

### 3.2 Run sheet — exact commands and words

All of these run in **window C**. Window A stays visible so the log grows as he talks.

| #   | Command (PowerShell, window C)                                                                                                                                                                                | What to say                                                                                                                                                                      | Expected                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 0   | _(window A is already showing the startup block and each request as one JSON line)_                                                                                                                           | "The API runs from `server/server.js` — every request will appear in the log terminal as one JSON line. The logger is registered first, so even a rejected request is recorded." | startup block from §1.2                                |
| 1   | `curl.exe "$env:API/events" -H "X-API-Key: $env:KEY"`                                                                                                                                                         | "Here's a live read. Each event has a club, date, time, location and category. This is what a client or a partner receives."                                                     | `{"events":[ … ]}`                                     |
| 2   | `'{"clubId":"club-01","title":"Exam Revision Night","description":"Group revision session","category":"Academic","date":"2026-11-20","time":"18:00","location":"Library, Room 2"}' \| Set-Content event.json` | "I write the payload to a file so nothing is lost to shell quoting, then POST it."                                                                                               | file written                                           |
| 3   | `curl.exe -i -X POST "$env:API/events" -H "X-API-Key: $env:KEY" -H "Authorization: Bearer $env:TOKEN" -H "Content-Type: application/json" --data "@event.json"`                                               | "As an admin I create an event. We get 201 Created, and the response is the saved event with its new id."                                                                        | `HTTP/1.1 201 Created` + `{"event":{"id":"custom-…"}}` |
| 4   | `$env:NEWID = ((curl.exe -s "$env:API/events" -H "X-API-Key: $env:KEY" \| ConvertFrom-Json).events \| Where-Object title -eq 'Exam Revision Night' \| Select-Object -Last 1).id; $env:NEWID`                  | "Read the list again — the new event is saved, in MySQL, not in memory."                                                                                                         | `custom-1752…`                                         |
| 5   | `curl.exe -i "$env:API/clubs"`                                                                                                                                                                                | "With no API key we get 401, and no handler ever runs — the key check is middleware."                                                                                            | `401` + `{"error":"Missing or invalid API key."}`      |
| 6   | `curl.exe -i -X DELETE "$env:API/events/custom-0000" -H "X-API-Key: $env:KEY" -H "Authorization: Bearer $env:TOKEN"`                                                                                          | "Delete an event that doesn't exist: 404 Event not found. Clear JSON errors, not crashes."                                                                                       | `404` + `{"error":"Event not found."}`                 |
| 7   | `curl.exe "$env:API/partner/farmers" -H "X-API-Key: $env:KEY"`                                                                                                                                                | "In the other direction, this route calls Team 6 **from our server**. The response says `stale: false`, so it is live data."                                                     | `{"data":[…],"stale":false,"asOf":"…"}`                |
| 8   | _(point at window A)_                                                                                                                                                                                         | "And here is the log: one line per request, with the status, the milliseconds and a caller label — `key-xxxxxx` — never the key itself."                                         | JSON lines incl. `/api/partner/farmers`                |

Timing beats: 0:40 start · 0:55 read · 1:15 write + read back · 1:45 failures ·
2:10 partner + log · 2:35 stop.

**Cleanup (do it during Roy's slide, off-screen, not during the demo):**

```powershell
curl.exe -i -X DELETE "$env:API/events/$env:NEWID" -H "X-API-Key: $env:KEY" -H "Authorization: Bearer $env:TOKEN"
```

Expected `204 No Content`. Repeat the same DELETE and it answers `404` — a nice extra proof
that the delete really happened.

### 3.3 What to say if Team 8's call does not arrive

"If Team 8's call does not reach us, I will show our own call instead and say so — I will
not pretend their request is mine." Then read the log for the `key-` label of _our_ key and
say plainly: "That label is ours."

### 3.4 If something breaks — say what you see

| Symptom                                   | Say this                                                                                    | Do this                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `502` on `/api/partner/farmers`           | "That's a 502 — our partner's server is not answering. Our API is up; the partner is down." | Keep going; the next slide covers exactly this.          |
| `ECONNREFUSED` / `Can't reach the server` | "The API process is not running on 5000."                                                   | Restart window A; check `netstat -ano \| findstr :5000`. |
| Every call `401`                          | "Our key is not loaded — the startup line would say `API keys loaded: 0`."                  | Fix `API_KEYS` in `server/.env`, restart.                |
| `429`                                     | "That's our rate limiter: 100 requests per key per minute, with `Retry-After`."             | Restart window A (counters are in memory) or wait 60 s.  |
| `SQLITE`/MySQL error                      | "MySQL is down, so the API exits on purpose."                                               | XAMPP → Start MySQL → restart window A.                  |

### 3.5 Optional live beat — Agro club opportunities (members only, ~20 s)

Skippable. It needs a logged-in member, so it costs a login unless §1.3 already staged one.
The point to make is that this feature is **additive**: nothing a consumer already calls has
changed.

1. [C] Log in as `sofia.ramirez@campus.edu` / `campushub123`, then open
   `http://localhost:5173/clubs/club-07` and scroll to **Farm visits and volunteering**.
   If the panel looks cramped on the projector, collapse the member sidebar with the «
   button at its top right; the floating » button brings it back, and the choice survives a
   reload.
2. [C] Point at the panel's two groups — **Added by club admins** and **CampusHub starter
   activities** — and say: "These are our own records, not Team 6's. A
   grower listing tomatoes is not a farm visit, so we never manufacture one from the
   partner's data."
   Then point at a card's grower line: the name with the **AgroConnect** tag, the county and
   focus underneath, and "At their stall" with up to three listings (e.g.
   `Fresh tomatoes · KES 120/kg`). Say: "That part is theirs, fetched live and labelled; the
   visit itself is ours." If the tag is missing, Team 6 had no matching grower and the card
   falls back to the plain host name — it never guesses a stall.
3. [C] Click **I'm interested** on one card. The count goes up, the live region confirms it,
   and **Add to calendar** exports the activity as an `.ics`.
4. [C] Log in as `amara.okafor@campus.edu` (tier1) and press **Who's interested** on the same
   card: the roster shows names, emails and the time each member registered. With ten
   seconds to spare, open **Add an activity** and point at the **Grower** field: it is a list
   from AgroConnect, not free text, and choosing one gives the new card that grower's county
   and stall.

If a lecturer asks who can see this: the server checks membership, so a signed-out visitor
or a member of another club gets `401`/`403` and no activities, while the panel on the page
shows a members-only note. The list also survives Team 6 being down — each card's grower
details fall back to the saved snapshot and the line above the cards says when it was saved,
and names the produce copy separately when only that feed is stale.

If you are behind time, **skip this beat**. It is the newest feature, not the core demo, and
every command below still runs without it.

---

## 4. Roy — Design, Build and Test, Documentation, Security, Monitoring (~50 s)

### 4.1 Slide text

**Design** — one Express app, thin routes over MySQL; guards per route, not per mount, so an
unknown path is a 404 and not a fake 401. The app is exported from `server/app.js` without
listening, which is what lets the tests drive it in-process. In the member workspace the
sidebar is retractable (its state survives a reload), and the opportunities panel lists
only the club's own activities; a card can carry a real grower chosen from Team 6's list,
with that grower's current produce beside it, each part labelled live or saved.

**Build and Test** — CI on every push: ESLint + Vite build + 22 server tests on a throwaway
MySQL container (`api-security`, `migrate`, `signups-comments`, `agro-opportunities`), plus
18 Jest tests (13 version, 5 for the v2 mapping) that need no database; a headless browser
smoke test for login, RSVP, waitlist and retry.

**Documentation** — `README.md` quickstart (PowerShell `curl.exe`, `--data "@file.json"`),
`openapi.yaml` → `docs/index.html` (Redoc), plus `RUNNING.md`, `OPERATIONS.md`,
`CI.md`, `INTEGRATION_LOG.md`.

**Security** — every route except `/api/health` needs `X-API-Key` (timing-safe comparison);
100 requests / 60 s per key → `429` + `Retry-After`; keys only in `server/.env`, never in
git; writes need a bearer token. v2 needs the key exactly like v1.

**Monitoring** — one JSON log line per request (method, path, status, ms, caller label);
never keys, tokens, bodies or query strings; `GET /api/stats` aggregates by route, including
the v1/v2 split.

### 4.2 What to say (50 seconds, timed)

> "Our project covers the full API lifecycle. We wrote an OpenAPI contract and a README
> quickstart with Windows PowerShell examples. We built read and write endpoints for auth,
> clubs, events, signups and comments. We have 21 automated server tests covering API key
> and rate-limit security, the migration runner, and signup, waitlist and comment routes,
> plus eighteen Jest tests that pin the v1 and v2 response shapes, the sunset switch and the `startTime` mapping.
>
> Security: every request except `/api/health` needs an API key, and each key gets 100
> requests per 60 seconds. Past that the API returns 429 with a `Retry-After` header. Keys
> live in `server/.env`, never in git.
>
> Monitoring: every request writes one JSON log line with the method, path, status, time and
> a caller label. We never log keys, tokens, bodies or query strings. Our `/stats` endpoint
> showed one real pattern: in one run of 68 requests the slowest route was our partner proxy,
> `GET /api/partner/farmers`, averaging about 8.1 seconds with a worst case of 23.8 seconds,
> while every local route stayed under about 30 milliseconds."

### 4.3 Commands (window C, all fast — do not run the full suite live)

```powershell
cd server; npm run migrate:status; cd ..
```

Expected on a migrated database: `9 applied, 0 pending`. On this machine it prints
`0 applied, 9 pending` (schema imported from `campushub_database.sql`, never baselined) —
say that honestly if asked, and do not run the migrator on stage.

```powershell
npx jest
```

Expected: `Tests: 9 passed` in about 3 seconds. This is the safe live test to run: it drives
the exported app in-process with supertest, stubs the database query, and never needs MySQL
or a port. It is the proof that v1's field set and the old URL are frozen and that v2 has the
new shape.

```powershell
cd server; node --test tests/migrate.test.mjs; cd ..
```

Runs the migration suite only (it creates and drops its own throwaway database). **Do not**
run `npm test` on stage: the security suite deliberately exhausts a 60-second rate window,
so a full run takes 70–90 seconds. Point at the green **CI** tab for the 21-test number and
say so honestly.

```powershell
curl.exe -i "$env:API/clubs" | Select-Object -First 1
```

(Only if Hunja did not already show the 401.) Expected `HTTP/1.1 401 Unauthorized`.

```powershell
curl.exe "$env:API/stats" -H "X-API-Key: $env:KEY" | ConvertFrom-Json | Select-Object total, clientErrors, serverErrors, errorRatePercent, avgMs
```

Expected: the running totals for everything the demo just did — this is the "monitoring is
not a file we wrote, it is a live endpoint" moment.

```powershell
Get-Content server\requests.log -Tail 5
```

Expected: the last five JSON lines, one per request, including the 401 and the partner call.

### 4.4 Files to show if a lecturer asks

`openapi.yaml`, `docs/index.html`, `README.md` (Monitoring section), `server/tests/`,
`__tests__/versions.test.js`, `jest.config.cjs`, `.github/workflows/ci.yml`,
`server/middleware/apiKey.js`, `server/middleware/rateLimit.js`, `server/monitoring.js`.

---

## 5. Tiphanie — Integration and Resilience, Versioning, What Is Not Finished (~40 s)

### 5.1 Slide text

**Integration and Resilience**

- Timeout **1500 ms** (~5× a normal 0.2 s reply, far below the 10 s slow mode).
- Retries **2, GETs only**, waits 200 ms then 400 ms; a `429` waits the partner's
  `Retry-After` (capped at 5 s); `4xx` never retried.
- Worst case **3 × 1500 + 200 + 400 = 5100 ms** (measured 5.19 s).
- Fallback: last saved copy with `stale: true` **and a visible banner** — a fallback nobody
  can mistake for live data.
- No circuit breaker yet.

**Versioning** (shipped this week)

- `GET /api/v2/events` is live with the new shape: one ISO 8601 `startTime`
  (`"2026-11-02T06:30:00+03:00"`) instead of separate `date` + `time`.
- `GET /api/v1/events` and the old `GET /api/events` keep the old shape and send
  `Deprecation: true`, `Sunset: Mon, 30 Nov 2026 00:00:00 GMT` and
  `Link: </api/v2/events>; rel="successor-version"` on **every** response.
- v1 is stopped by a date check (`isV1Retired`) in front of the events mounts, read on every
  request, so the sunset happens without a deploy; after 30 Nov the old events paths answer
  the 404 the notice promises, even in a process that started before the date.
- v2 is a mapper over v1's own handlers, so validation, permissions and status codes cannot
  drift; only the response shape changes.
- Proof: `diff docs/v1_before.json docs/v1_after.json` prints nothing (both 4684 bytes,
  sha256 `3356ca69…`), and `npx jest` pins it with 18 tests.
- The notice to Team 8 is `DEPRECATION_NOTICE.md`. Upstream, Team 6 sent a deprecation
  notice on 12 November but it covers their product reads only; `/produce` and `/farmers`,
  which we call, are confirmed unchanged, so the partner integration is untouched.

**What Is Not Finished**

- Rate-limit counts and saved partner data are in memory → a restart clears them.
- Team 6's Render host can be cold; ngrok's URL changes on restart.
- Our own React front end now calls `/api/v2` (the version is applied once, in
  `src/utils/api.js`). Create → edit → delete was checked through the club admin dashboard:
  `POST` 201, `PUT` 200, `DELETE` 204, with the row and the stored `startTime` agreeing at
  every step. Only the time field was changed in that run — Chrome's date input rejected
  automated keystrokes — so a date edit is still unchecked by hand. `ClubProfile`, `MyEvents`,
  the ICS export and the workspace next-event panel were checked on 12 November and show the
  same dates as before the move.
- Team 6's `/api/v2/products` exists only on their machine with no test key, and their notice
  does not cover `/produce`, so there is nothing of theirs to migrate to yet.
- No `GET /api/clubs/:id` or `GET /api/events/:id` (v2 adds `PUT`/`DELETE` on `/events/:id`,
  not a single-event read).
- The Agro opportunities feature is deliberately not extended before Demo Day. It is
  additive (`/api/v2/agro/*` only), member-gated, tested and documented, and we will not
  touch an outward-facing endpoint (`/events`, `/api/v2/events`, `/clubs`, `/partner/*`)
  this close to the presentation — there is no time to re-run the consumer checks that a
  change there would need. The grower/produce join is by name because their listings carry
  no seller id: a renamed grower simply loses the stall, and nothing is guessed.
- Next: shared rate-limit store · hand-check a date change in the dashboard form · the Team 6
  migration when a notice covers `/produce` and a deployed v2 exists.

### 5.2 What to say (40 seconds, timed)

> "We prepared for partner failures. Calls to Team 6 time out after 1.5 seconds. We retry
> GETs at most twice, waiting 200 then 400 milliseconds, and we never retry writes. If the
> partner is still down, our service returns the last saved list with `stale: true`, and the
> page shows a banner saying it is saved data. We tested that with a stand-in partner in
> slow, flaky and error modes.
>
> This week we also shipped a breaking change without breaking anyone. Events now carry one
> timestamp, `startTime`, instead of a date and a clock time with no timezone — the old shape
> is what made create-event return a date a day early on a server outside `+03:00`. v2 runs
> beside v1: `/api/v2/events` has the new shape, and `/api/v1/events` plus the old
> `/api/events` still answer exactly as before, now with a `Deprecation` header, a `Sunset`
> date of 30 November and a `Link` to the replacement. We proved v1 did not change by
> diffing the response before and after — it prints nothing — and pinned it with eighteen tests.
>
> What is not finished: our rate-limit counts and saved partner data are in memory, so a
> restart clears them. Our own front end moved to v2 this week: it reads the new timestamp in
> one place and the rest of the app is untouched. Upstream, Team 6's notice this week covers
> product reads we do not call, so our partner integration is unchanged — there is still
> nothing of theirs to migrate to."

### 5.3 Optional live proof (10 s for versioning, 25 s for the stand-in partner)

The versioning proof needs no extra window and no restart — it is the safest "live" beat in
the whole demo:

```powershell
# [C] same data, new shape
curl.exe -s "$env:API/v2/events" -H "X-API-Key: $env:KEY" | ConvertFrom-Json |
  Select-Object -ExpandProperty events | Select-Object -First 1 id, title, startTime

# [C] the old URL still answers, and says when it leaves
curl.exe -i "$env:API/events" -H "X-API-Key: $env:KEY" | Select-String 'Deprecation|Sunset|Link'
```

Say: _"The first is v2 — one `startTime` with an explicit offset. The second is the old URL:
same shape as before, plus three headers telling every caller it is deprecated, when it
stops, and where to go. That is a notice the consumer cannot miss, because it arrives with
the data."_

Optional resilience proof — the stand-in partner can be switched **without restarting
anything**, which is exactly what makes it safe on one machine:

```powershell
# pre-staged before the demo, in its own window (window D)
cd C:\path\to\campus_hub2\server
node flaky-partner.js
# -> Fake partner running at http://localhost:4000
```

```powershell
# also pre-staged: a second API instance pointed at the stand-in (window E)
cd C:\path\to\campus_hub2\server
$env:PORT = "5001"; $env:PARTNER_URL = "http://localhost:4000"; $env:PARTNER_API_KEY = "stand-in"
node server.js
```

Then, in window C:

```powershell
curl.exe -s "http://localhost:4000/__mode/flaky"          # partner fails twice, then works
curl.exe -i "http://localhost:5001/api/partner/farmers" -H "X-API-Key: $env:KEY"
curl.exe -s "http://localhost:4000/__mode/error"          # partner always 500
curl.exe -s "http://localhost:5001/api/partner/farmers" -H "X-API-Key: $env:KEY"
```

Say: _"Two retries, then the saved copy with `stale: true` — and window E shows each retry
with its wait, never the key. No restart, no code change."_

If you are not ahead of time, **skip the partner part**: the 401/404 failure in Hunja's run
sheet plus the numbers on the slide already satisfy the demo's "one failure" requirement, and
two extra windows are a real risk on one machine. Keep the versioning proof — it costs two
commands.

### 5.4 Files to show

`server/resilientFetch.js` (timeout, retries, 4xx rule, 429 `Retry-After`), the
`serveWithFallback` function in `server/routes/partner.js`, the stale banner in
`src/components/PartnerFarmers.jsx`, and `RESILIENCE_NOTES.md` / `MONITORING_NOTES.md`
Part E for the measured numbers.

For versioning: `server/v1.js`, `server/v2.js`, `server/routes/eventsV2.js` (the one
`toV2Event` mapper), `server/deprecate.js` (the three headers), `VERSIONING_NOTES.md`,
`DEPRECATION_NOTICE.md`, `__tests__/versions.test.js`, and `docs/v1_before.json` /
`docs/v1_after.json`.

---

## 6. The whole run on one machine, in order

Copy-paste blocks, in the order they happen. Everything marked **[C]** is window C and
inherits `$env:API`, `$env:KEY`, `$env:TOKEN` from §1.3.

### Phase 0 — 15 minutes out (no audience)

```powershell
# [A] window A
cd C:\path\to\campus_hub2\server
$env:PORT = "5000"
node server.js 2>&1 | Tee-Object -FilePath requests.log
```

```powershell
# [B] window B
cd C:\path\to\campus_hub2
npm run dev
```

```powershell
# [C] window C — pre-stage, then open Home twice to warm Team 6
cd C:\path\to\campus_hub2
$env:API = "http://localhost:5000/api"
$keysLine = (Get-Content server\.env | Where-Object { $_ -match '^API_KEYS=' })
$env:KEY = ($keysLine -replace '^API_KEYS=', '').Split(',')[0].Trim()
$env:TOKEN = (curl.exe -s -X POST "$env:API/auth/login" -H "X-API-Key: $env:KEY" -H "Content-Type: application/json" --data "@login.json" | ConvertFrom-Json).token
curl.exe -s "$env:API/partner/farmers" -H "X-API-Key: $env:KEY" > $null
npx jest
```

### Phase 1 — Rayyan, 0:00–0:40

```powershell
# [C] on his last sentence about the ring
curl.exe "$env:API/health"
curl.exe "$env:API/clubs" -H "X-API-Key: $env:KEY"
```

Cue to Hunja: "…and provide club and event data to Team 8."

### Phase 2 — Hunja, 0:40–2:40

```powershell
# [C] READ
curl.exe "$env:API/events" -H "X-API-Key: $env:KEY"

# [C] WRITE — payload to a file, then POST
'{"clubId":"club-01","title":"Exam Revision Night","description":"Group revision session","category":"Academic","date":"2026-11-20","time":"18:00","location":"Library, Room 2"}' | Set-Content event.json
curl.exe -i -X POST "$env:API/events" -H "X-API-Key: $env:KEY" -H "Authorization: Bearer $env:TOKEN" -H "Content-Type: application/json" --data "@event.json"

# [C] READ BACK — grab the new id for cleanup
$env:NEWID = ((curl.exe -s "$env:API/events" -H "X-API-Key: $env:KEY" | ConvertFrom-Json).events | Where-Object title -eq 'Exam Revision Night' | Select-Object -Last 1).id
$env:NEWID

# [C] FAIL — no key, then a missing id
curl.exe -i "$env:API/clubs"
curl.exe -i -X DELETE "$env:API/events/custom-0000" -H "X-API-Key: $env:KEY" -H "Authorization: Bearer $env:TOKEN"

# [C] PARTNER — live upstream, then point at window A's log
curl.exe "$env:API/partner/farmers" -H "X-API-Key: $env:KEY"
```

Cue to Roy: "…`stale: false`, so it is live data."

### Phase 3 — Roy, 2:40–3:30

```powershell
# [C] first, quietly clean up Hunja's event while Roy starts talking
curl.exe -i -X DELETE "$env:API/events/$env:NEWID" -H "X-API-Key: $env:KEY" -H "Authorization: Bearer $env:TOKEN"

# [C] schema + the fast Jest suite (3 s, no database needed)
cd server; npm run migrate:status; cd ..
npx jest

# [C] live monitoring: totals, then raw log lines
curl.exe "$env:API/stats" -H "X-API-Key: $env:KEY" | ConvertFrom-Json | Select-Object total, clientErrors, serverErrors, errorRatePercent, avgMs
Get-Content server\requests.log -Tail 5
```

Cue to Tiphanie: "…every local route stayed under about 30 ms."

### Phase 4 — Tiphanie, 3:30–4:10

Run the two versioning commands from §5.3 over the slide, then talk over
`server/resilientFetch.js` (scrolled to the rules comment block) or `RESILIENCE_NOTES.md`.
No extra windows unless you pre-staged the stand-in partner.

Cue to end: "…v2 is live, v1 still answers and tells every caller when it leaves." → thank
the room, Q&A.

### Phase 5 — after the room (2 minutes of Q&A)

Leave windows A, B and C exactly as they are; the log is the best Q&A prop. Do **not** stop
the server, do not close the tunnel, do not clear the screen.

---

## 7. Appendix A — the full API cycle, start to finish

The complete arc, in the order it happens, with what each step is for. Every step is
server-to-server (`curl`), so no `Origin` header, no CORS involved.

| Step         | Command                                                                                                                                                         | Purpose                                      | Expected                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| 1. Liveness  | `curl.exe "$env:API/health"`                                                                                                                                    | Cheap proof the API is up; needs no key      | `{"ok":true}`                                   |
| 2. Auth      | `curl.exe -s -X POST "$env:API/auth/login" -H "X-API-Key: $env:KEY" -H "Content-Type: application/json" --data "@login.json"`                                   | Exchange credentials for a bearer token      | `{"token":"eyJ…","user":{…}}`                   |
| 3. Read      | `curl.exe "$env:API/events" -H "X-API-Key: $env:KEY"`                                                                                                           | Public read: what a partner receives         | `{"events":[…]}`                                |
| 4. Write     | `curl.exe -i -X POST "$env:API/events" -H "X-API-Key: $env:KEY" -H "Authorization: Bearer $env:TOKEN" -H "Content-Type: application/json" --data "@event.json"` | Admin-only write; key **and** token required | `201` + `{"event":{"id":"custom-…"}}`           |
| 5. Verify    | `curl.exe "$env:API/events" -H "X-API-Key: $env:KEY"`                                                                                                           | Persisted to MySQL, not just acknowledged    | the new title appears                           |
| 6. Auth fail | `curl.exe -i "$env:API/clubs"`                                                                                                                                  | Key guard runs before any handler            | `401` `{"error":"Missing or invalid API key."}` |
| 7. Not found | `curl.exe -i -X DELETE "$env:API/events/custom-0000" -H "X-API-Key: $env:KEY" -H "Authorization: Bearer $env:TOKEN"`                                            | Structured error, no 500, no crash           | `404` `{"error":"Event not found."}`            |
| 8. Partner   | `curl.exe "$env:API/partner/farmers" -H "X-API-Key: $env:KEY"`                                                                                                  | Our server → Team 6; key stays server-side   | `{"data":[…],"stale":false,"asOf":"…"}`         |
| 9. Observe   | `curl.exe "$env:API/stats" -H "X-API-Key: $env:KEY"`                                                                                                            | All of the above, aggregated                 | `total`, `clientErrors`, `avgMs`, `routes`      |
| 10. Clean up | `curl.exe -i -X DELETE "$env:API/events/$env:NEWID" -H "X-API-Key: $env:KEY" -H "Authorization: Bearer $env:TOKEN"`                                             | Idempotent-ish lifecycle                     | `204 No Content`, then `404` if repeated        |
| 11. v2 read  | `curl.exe "$env:API/v2/events" -H "X-API-Key: $env:KEY"`                                                                                                        | Same data, new shape                         | `{"events":[… "startTime":"…+03:00" …]}`        |
| 12. Sunset   | `curl.exe -i "$env:API/events" -H "X-API-Key: $env:KEY" \| Select-String 'Deprecation\|Sunset\|Link'`                                                           | The deprecation contract, on the wire        | `Deprecation: true`, `Sunset: …`, `Link: …`     |

Where each step lives in the code: `server/app.js` (mounts, health, JSON 404),
`server/server.js` (startup only), `server/v1.js` and `server/v2.js` (the two versions),
`server/deprecate.js` (headers), `server/middleware/apiKey.js` (401),
`server/middleware/rateLimit.js` (429), `server/routes/auth.js` (login),
`server/routes/events.js` (list/create/delete), `server/routes/eventsV2.js` (the v2 shape),
`server/routes/partner.js` (upstream proxy), `server/monitoring.js` (`/api/stats`).

The same cycle as a partner sees it: their key, our base URL, `GET /api/clubs` and
`GET /api/events` — or `GET /api/v2/events` for the new shape. No token needed for reads,
`Ngrok-Skip-Browser-Warning: true` if they come through the tunnel.

---

## 8. Appendix B — logs: where they are, what they mean, what they are for

### 8.1 Where the logs are

| Log                   | Location                                          | How it is created                                                           |
| --------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| Request log (the one) | `server/requests.log`, also on screen in window A | `./run.sh`, or `node server.js 2>&1 \| Tee-Object -FilePath requests.log`   |
| Server console output | window A (stdout/stderr)                          | startup block, warnings, `partner call failed: …` lines, error stack traces |
| CI logs               | GitHub → **Actions** → CI → run → job → step      | every push to `main` and every pull request                                 |
| Tunnel request log    | `http://127.0.0.1:4040` while ngrok runs          | every request that crosses the tunnel                                       |

`*.log` is in `.gitignore`, so `requests.log` is never committed and never leaks. It
overwrites each time you start with `Tee-Object -FilePath` — delete it before a demo so the
only lines in it are demo lines.

### 8.2 What one line represents

```json
{
  "time": "2026-11-05T13:50:55.157Z",
  "method": "GET",
  "path": "/api/clubs",
  "status": 200,
  "ms": 41,
  "caller": "key-1454b5"
}
```

| Field    | Meaning                                              | Why we record it                                                            |
| -------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `time`   | ISO timestamp, UTC                                   | Correlate with the partner's log and with CI                                |
| `method` | HTTP verb                                            | Separates reads from writes when reading the log                            |
| `path`   | Path only — no query string                          | Shows which route **and version** was used, without capturing emails/tokens |
| `status` | Response status                                      | The single most useful number: 401/429 (caller), 5xx (us or the partner)    |
| `ms`     | Response time                                        | Proves local routes are ~10–30 ms and the partner proxy is seconds          |
| `caller` | `none`, or `key-` + first 6 hex of the key's SHA-256 | Tells our traffic from Team 8's, and is not reversible to the key           |

**Never in the log:** API keys, bearer tokens, passwords, request or response bodies, query
strings. The logger is `server/monitoring.js`, registered **first** in `server/app.js`, so
401s and 429s are logged too. `GET /api/stats` aggregates the same data by route pattern
(`/api/clubs/club-1` and `/api/clubs/club-2` share one row) and lives in memory, so it
resets with the server. Because the mount is part of the route label, `/api/events/`,
`/api/v1/events/` and `/api/v2/events/` are **three separate rows** — that is how you answer
"who is still on v1?".

### 8.3 What they are for (say this in Q&A)

1. **Integration evidence** — a line with both our label and Team 8's label is proof they
   called us, without exposing anyone's key.
2. **Debugging** — `partner call failed: timeout` vs `ECONNREFUSED` vs
   `partner rejected our API key (401)` each point to a different fix.
3. **Performance** — `/stats` showed `GET /api/partner/farmers` at 8098.5 ms average and
   23841.2 ms worst case, against ~30 ms for local routes. That number is _why_ the
   resilience work exists.
4. **Migration tracking** — the `/api/v1/events/` row stops growing when Team 8 moves, and
   `/api/v2/events/` starts. A deprecation you cannot measure is a guess.
5. **Security auditing** — a burst of 401s with `caller:"none"` is probing or a broken
   client; a 429 tells you a consumer ignored `Retry-After`.

### 8.4 Reading the log live (PowerShell, window C)

```powershell
Get-Content server\requests.log -Tail 20                 # last 20 requests
Get-Content server\requests.log -Wait -Tail 0            # live tail, Ctrl+C to stop
Get-Content server\requests.log | Select-String '401|429|5\d\d'          # errors only
(Get-Content server\requests.log | ConvertFrom-Json) | Group-Object path | Sort-Object Count -Descending | Select-Object Count, Name
(Get-Content server\requests.log | ConvertFrom-Json) | Where-Object { $_.path -like '/api/partner/*' } | Format-Table time, path, status, ms, caller
```

Git Bash / macOS equivalent: `tail -f server/requests.log`, `grep -E '"status":(401|429|5)' server/requests.log`.

**The two proofs worth showing:**

```powershell
Get-Content server\requests.log | Select-String 'X-API-Key|Authorization|Bearer' -Quiet   # -> False
(Get-Content server\requests.log | ConvertFrom-Json).caller | Sort-Object -Unique          # -> key-xxxxxx, none
```

First: no header ever reaches the file. Second: every caller is a short label or `none` —
nothing recoverable.

Map a label to a consumer without printing the key:

```powershell
cd server; node tools/caller-labels.js; cd ..
```

### 8.5 If the log is not there — how to add and locate it

Three cases, in order of likelihood:

**a) The file was never written** because the server was started with plain `npm start`
(no tee). Nothing is broken — the lines are on the console. To get a file, restart with:

```powershell
cd server
node server.js 2>&1 | Tee-Object -FilePath requests.log
```

**b) You are on a machine where `monitoring.js` is missing.** The middleware is one function.
In `server/monitoring.js`:

```js
import crypto from "crypto";
const round = (n) => Math.round(n * 10) / 10;
function who(req) {
  if (!req.apiKey) return "none";
  return "key-" + crypto.createHash("sha256").update(req.apiKey).digest("hex").slice(0, 6);
}
export function monitor(req, res, next) {
  const start = process.hrtime.bigint();
  const path = req.path; // capture now: no query string, and Express rewrites req.url later
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(
      JSON.stringify({
        time: new Date().toISOString(),
        method: req.method,
        path,
        status: res.statusCode,
        ms: round(ms),
        caller: who(req),
      })
    );
  });
  next();
}
```

and in `server/app.js`, **before** `cors`, `express.json()` and the `/api/health` route
(so rejected requests are logged too):

```js
import { monitor, statsHandler } from "./monitoring.js";
app.use(monitor);
```

Then restart and make one request: `curl.exe "$env:API/health"` and the line appears.
Locate it with the commands in §8.4.

**c) Nothing at all appears on restart.** Check you are looking at the right folder — the
file is written into the **current directory of the node process**, i.e. `server\requests.log`
when started from `server/`, not the repo root. Confirm with
`Get-ChildItem -Recurse -Filter requests.log`.

### 8.6 If a lecturer wants CI logs

GitHub → **Actions** → **CI** → the run for `main` → **Server tests (MySQL + API)** → the
failing/succeeding step. The workflow deliberately prints the API log when a suite fails,
so the failure is diagnosable from the page. CI never deploys and never touches a real
database; it uses a throwaway MySQL container.

---

## 9. Appendix C — files used in the presentation

| Path                                                                 | What it is                                                                    | Who shows it / slide                        |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- |
| `server/server.js`                                                   | Startup only: checks MySQL, listens, logs the versions                        | Hunja                                       |
| `server/app.js`                                                      | Builds and exports the app: monitor first, health, v1/v2 mounts, JSON 404     | Rayyan, Hunja                               |
| `server/v1.js`                                                       | The old version, frozen, plus the deprecation headers on `/events`            | Tiphanie / Versioning                       |
| `server/v2.js`                                                       | The new version: same resources, `/events` on the v2 view                     | Tiphanie / Versioning                       |
| `server/routes/eventsV2.js`                                          | The one `toV2Event` mapper and the response adapter                           | Tiphanie / Versioning                       |
| `server/deprecate.js`                                                | `Deprecation`, `Sunset`, `Link` headers                                       | Tiphanie / Versioning                       |
| `server/monitoring.js`                                               | Request log + `/api/stats`                                                    | Roy / Monitoring                            |
| `server/middleware/apiKey.js`                                        | `X-API-Key` guard, timing-safe compare, 401                                   | Roy / Security                              |
| `server/middleware/rateLimit.js`                                     | 100 req / 60 s, 429 + `Retry-After`                                           | Roy / Security                              |
| `server/middleware/apiGuards.js`                                     | Guards registered per route so unknown paths stay 404                         | Roy / Design                                |
| `server/resilientFetch.js`                                           | Timeout, retries, 4xx rule, 429 `Retry-After`                                 | Tiphanie / Resilience                       |
| `server/routes/partner.js`                                           | Team 6 proxy, `serveWithFallback`, `stale` flag                               | Tiphanie, Hunja                             |
| `src/components/PartnerFarmers.jsx`                                  | "Farmers on AgroConnect" + stale banner                                       | Tiphanie / Resilience                       |
| `server/routes/agro.js`                                              | Opportunities: member-only reads, interest, admin roster, grower/produce join | §3.5 (optional)                             |
| `server/migrations/010_agro_opportunities.sql`                       | Opportunity, interest and partner-snapshot tables + seeded activities         | §3.5 (optional)                             |
| `server/migrations/011_seed_agro_interest.sql`                       | Three seeded interest registrations so counts are not zero                    | §3.5 (optional)                             |
| `server/migrations/012_link_seed_growers.sql`                        | Points the seeded activities at real partner growers (name match)             | §3.5 (optional)                             |
| `src/components/AgroOpportunities.jsx`                               | Member/rights-gated panel, grower picker, stall lines, admin roster           | §3.5 (optional)                             |
| `src/utils/agroStore.js`                                             | Client calls for `/v2/agro` and the partner grower list; one date mapping     | §3.5 (optional)                             |
| `server/routes/events.js`                                            | List / create / delete used in the live demo (untouched by versioning)        | Hunja                                       |
| `server/routes/clubs.js`                                             | The read Team 8 consumes                                                      | Rayyan, Hunja                               |
| `server/tests/*.test.mjs`                                            | 22 server tests (4 suites, incl. `agro-opportunities`)                        | Roy / Build and Test                        |
| `__tests__/versions.test.js`                                         | 13 Jest tests: v1 frozen, v2 shape, headers, key, 404, sunset                 | Roy / Build and Test, Tiphanie / Versioning |
| `__tests__/eventsStore.test.js`                                      | 5 Jest tests: `startTime` → `date`/`time`, incl. past midnight                | Tiphanie / Versioning                       |
| `jest.config.cjs`, `babel.config.cjs`                                | Jest config (CJS in an ESM package) + the test-only ESM→CJS transform         | Roy / Build and Test                        |
| `docs/v1_before.json`, `docs/v1_after.json`                          | The Evidence 1 snapshots; identical bytes, sha256 `3356ca69…`                 | Tiphanie / Versioning                       |
| `.github/workflows/ci.yml`                                           | Lint + build + MySQL test job                                                 | Roy / Build and Test                        |
| `openapi.yaml`                                                       | The contract; `info.version: 2.0.0` + the v2/deprecation note                 | Roy / Documentation, Tiphanie / Versioning  |
| `docs/index.html`                                                    | Pre-generated Redoc reference from the OpenAPI file                           | Roy / Documentation                         |
| `README.md`                                                          | Quickstart, keys, rate limit, monitoring, versioning pointer                  | Roy / Documentation                         |
| `CI.md`, `RUNNING.md`, `OPERATIONS.md`                               | CI, cold start, ops runbook                                                   | Q&A backup                                  |
| `VERSIONING_NOTES.md`                                                | The change, the prediction, who uses v1, the handout checklist                | Tiphanie / Versioning                       |
| `DEPRECATION_NOTICE.md`                                              | The full notice sent to consumers                                             | Tiphanie / Versioning                       |
| `RING_BULLETIN.md`                                                   | The short version for the ring (Team 8, Team 6)                               | Rayyan / Our Ring                           |
| `MONITORING_NOTES.md`                                                | Predicted vs measured, Part E numbers                                         | Roy / Monitoring                            |
| `RESILIENCE_NOTES.md`                                                | Modes tested, 5.19 s measured, what we did not build                          | Tiphanie / Resilience                       |
| `INTEGRATION_LOG.md`                                                 | Team 6 contract, first call, surprises                                        | Rayyan / Our Ring                           |
| `login.json`, `event.json`, `club.json`, `reg.json`, `badlogin.json` | Demo payloads (`--data "@file.json"`) — must be in the window-C folder        | Hunja                                       |
| `traffic.js`                                                         | Generates mixed traffic so `/stats` has data                                  | Q&A / Monitoring                            |
| `server/flaky-partner.js`                                            | Stand-in partner with `/__mode/slow`, `/flaky`, `/error`, `/ok`               | Tiphanie (optional)                         |
| `server/tools/caller-labels.js`                                      | Prints log labels without printing keys                                       | Rayyan, Roy                                 |
| `scripts/smoke.mjs`                                                  | Headless browser smoke test (login, RSVP, waitlist, retry)                    | Q&A / Build and Test                        |
| `run.sh`                                                             | One-command start that tees `requests.log`                                    | Hunja (Git Bash)                            |
| `server/.env`, `.env`                                                | Keys and config — **never shown on screen**                                   | —                                           |

Demo accounts (password `campushub123`, from `npm run set-passwords`): `amara.okafor@campus.edu`
(tier1, the token in `login.json`), `leo.fischer@campus.edu` (club admin, club-01),
`sofia.ramirez@campus.edu` (member, club-01 **and club-07** — use her for §3.5).

---

## 10. Appendix D — Q&A cheat sheet

| Likely question                        | 15-second answer                                                                                                                                           | Show                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Where is the key stored?               | `server/.env` only, git-ignored; `PARTNER_API_KEY` in the same file, used server-side only                                                                 | `server/.env.example`       |
| How do you know Team 8 called you?     | Two different `key-` labels in the log for the same route                                                                                                  | window A                    |
| Why not retry writes?                  | A retried POST could place an order twice — idempotency                                                                                                    | `server/resilientFetch.js`  |
| Why 1.5 s?                             | ~5× a normal 0.2 s reply, far below the 10 s slow mode; worst case 5.1 s                                                                                   | `RESILIENCE_NOTES.md`       |
| Why not a circuit breaker?             | Not built; we retry every request, which is the honest limitation                                                                                          | slide                       |
| Is the rate limit shared?              | No, in memory per process, resets on restart — next step is a shared store                                                                                 | `rateLimit.js`              |
| Why break the event shape?             | `date` + `time` carried no timezone and had to be glued together to sort; one `startTime` with `+03:00` fixes the day-early bug                            | `VERSIONING_NOTES.md` §1–2  |
| How is v2 not a copy of v1?            | v2 mounts v1's own handlers and maps only the response (`toV2Event`), so validation and permissions cannot drift                                           | `server/routes/eventsV2.js` |
| How do consumers know v1 is leaving?   | Every v1 response carries `Deprecation: true`, `Sunset`, `Link` — not just an email                                                                        | §5.3 command                |
| What if Team 8 does not migrate?       | We watch `/stats`; v1 keeps serving until 30 Nov, so nobody breaks before Demo Day                                                                         | `/api/stats`                |
| Did v1 actually stay identical?        | `diff docs/v1_before.json docs/v1_after.json` prints nothing; both are committed with sha256 `3356ca69…`                                                   | `docs/`                     |
| Are the tests reliable?                | 22 server tests on a throwaway MySQL container in CI (three agro migrations loaded first), plus 18 Jest tests (13 version, 5 mapping) with no database     | CI tab, `npx jest`          |
| Who can see the agro opportunities?    | Club-07 members and its admins only: `401` signed out, `403` another club's member, checked server-side, not in the UI                                     | §3.5                        |
| Are those opportunities Team 6's data? | No. They are local records (`source: seed` or `admin`); AgroConnect only supplies the matched grower's details and a snapshot                              | `server/routes/agro.js`     |
| What is the produce under a grower?    | Team 6's `/produce`, matched to that grower by name and tagged **AgroConnect**; if Team 6 is down we show the saved copy with its date, or no stall at all | §3.5                        |     | Where do grower details come from? | Team 6's `/farmers` and `/produce`, matched by name and tagged **AgroConnect**; if they are down the card uses the saved copy and says when it was saved | §3.5, `server/routes/agro.js` |
| Why did our own front end move to v2?  | One base URL in `src/utils/api.js` sets `…/v2`; `toUiEvent()` maps `startTime` back to `date`/`time`, so no page changed                                   | `src/utils/eventsStore.js`  |
| What about Team 6's v2?                | They have not published one; we asked, and we will not build against an invented contract                                                                  | `RING_BULLETIN.md` §2       |
| What about the 6-second slide on logs? | One JSON line per request, no key, no body, no query string; `/stats` aggregates                                                                           | `MONITORING_NOTES.md`       |
| Did you actually integrate?            | First call 2026-11-09: `/farmers` 200 with 5 farmers, `/produce` 200 with 4 listings                                                                       | `INTEGRATION_LOG.md`        |

---

## 11. Appendix E — if the demo machine misbehaves

```powershell
# is anything on 5000 / 5173 / 4000?
netstat -ano | findstr ":5000 :5173 :4000"

# kill a stale API (double slashes matter in Git Bash; in PowerShell use one)
taskkill /PID <pid> /F
```

| Symptom                                         | Fix                                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `EADDRINUSE :5000`                              | Stop the old process above, restart window A                                              |
| Server prints `listening` but every call is 401 | `API_KEYS` empty or `VITE_API_KEY` differs from it                                        |
| Front end loads, every list errors              | Root `.env` has no `VITE_API_KEY`, or `VITE_API_URL` is wrong — restart `npm run dev`     |
| `Couldn't connect to MySQL`                     | XAMPP MySQL is not running                                                                |
| Server on a random port / nothing on 5000       | An inherited `PORT=0` overrode `.env`'s 5000; clear it or start with `$env:PORT = "5000"` |
| Partner panels are empty on first load          | Reload once; Team 6's host is cold                                                        |
| 429 in the middle of the demo                   | Wait 60 s, or restart window A (counters are in memory)                                   |
| `npx jest` fails to load the config             | You deleted `jest.config.cjs` or `babel.config.cjs`; both are required                    |
| Projector cuts off the right side               | `Get-Content … -Tail 5` instead of the full list; widen the window before you start       |

**Last resort, and say it out loud:** "The API is running from the repo on this machine; if
the network partner is down I will show our saved-data path instead." Never fake a partner
call, never show a key, never present from a red CI commit.
