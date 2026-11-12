# Versioning notes — Week 13

## 1. The change, in one sentence

Every event object v2 returns replaces the separate `date` (`"YYYY-MM-DD"`) and `time` (`"HH:MM"`) strings with one ISO 8601 timestamp, `startTime` (for example `"2026-11-02T06:30:00+03:00"`).

Endpoint: `GET /api/v2/events` (and the create/update responses on `/api/v2/events`). v1 keeps the old shape at `/api/events` and `/api/v1/events`.

## 2. Why it is worth a break

The current shape is two fields that only mean anything together, and neither carries a timezone. That has already produced a bug we documented: a server outside East Africa returned an event created as `2026-11-01` as `2026-10-31` (README → Known issues), because the date was turned into a JavaScript date and back in a different zone. Every consumer also has to join `date` + `time` before it can sort, compare or export an event — our own front end does that in five places. A timestamp with an explicit `+03:00` offset is unambiguous and is one field instead of two, which is also the field we would extend with an end time later without another break — a real simplification, not change for its own sake.

To be precise about what this buys: it removes the ambiguity and the joining, not the day-shift bug itself. `startTime` is composed from v1's `date` string, so on a host east of UTC it carries the same shifted day v1 reports (§12). Repairing that would change v1's values, which is exactly what v1 must not do while it is winding down.

## 3. Prediction: which exact line in the consumer's code fails

Our first downstream consumer is our own front end, which calls `GET /api/events`. The first line to break is **`src/utils/dateTime.js:16`**:

```js
const ts = new Date(`${event.date}T${event.time}`).getTime();
```

On a v2 event this becomes `new Date("undefinedTundefined")` → `NaN`, which the helper turns into `0`. Nothing throws. Every event sorts as "oldest possible", and `isPastEvent()` reports every event as already past. That is the quiet failure this week warns about.

The same pattern appears in:

| File                          | Line    | What it does                                                  | Failure on v2                                             |
| ----------------------------- | ------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| `src/utils/dateTime.js`       | 16      | builds a timestamp for sorting / past checks                  | `NaN` → `0` → all events sort oldest-first, all look past |
| `src/pages/Dashboard.jsx`     | 36      | `eventTimestamp()` for the dashboard lists                    | same silent `0`                                           |
| `src/pages/ClubProfile.jsx`   | 77      | `.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))`    | `NaN` comparisons → unstable order                        |
| `src/pages/ClubWorkspace.jsx` | 44      | builds a start time from `event.date` + `event.time`          | `NaN`                                                     |
| `src/utils/calendar.js`       | 37      | `toIcsStamp(event.date, event.time)` splits `date` and `time` | ICS start/end become `undefined…`                         |
| `src/pages/Dashboard.jsx`     | 153–154 | prefills the edit form from `event.date` / `event.time`       | form opens with empty date/time                           |
| `src/utils/eventsStore.js`    | 14      | builds the `startTime` request body from `date` + `time`      | request side is unchanged — still works                   |

Request bodies were deliberately left alone, so only code that _reads_ events breaks.

## 4. Who still uses v1 (Part F)

Two callers are known from the code, not from data:

| Path                     | Caller                                                 | Still on v1?                         |
| ------------------------ | ------------------------------------------------------ | ------------------------------------ |
| `GET /api/events`        | our own React front end (`src/utils/eventsStore.js:5`) | yes — not migrated in this change    |
| `GET /api/events`        | Team 8, our downstream partner                         | unknown until the notice is answered |
| `PUT`/`POST /api/events` | our own front end (`saveCustomEvent`)                  | yes                                  |

Call counts live in the server's memory, so they only exist while an instance is running. I read them on 12 November against the local XAMPP database (§10); the three paths are counted separately, which is the whole answer to "who still calls v1?":

```bash
curl -s -H "X-API-Key: <key>" http://localhost:5000/api/stats
```

What that run showed (13 events, all three calls made in the same minute):

| Row in `/stats`       | Count | Avg ms |
| --------------------- | ----- | ------ |
| `GET /api/events/`    | 1     | 43.6   |
| `GET /api/v1/events/` | 1     | 10.9   |
| `GET /api/v2/events/` | 1     | 23.0   |

The three versions never merge into one row. On a deployment these counts belong to real callers, so they are the numbers to record before v1 is switched off.

Rows to read: `GET /api/events/` and `GET /api/v1/events/` are v1; `GET /api/v2/events/` is v2. The request log adds the caller label (`key-xxxxxx`) per line, which is how you tell Team 8 apart from our own front end. **v1 cannot be switched off today**: our own front end still reads `event.date` / `event.time`, and no partner has confirmed a migration.

## 5. The notice we wrote

`DEPRECATION_NOTICE.md` — what changes, why, a copyable before/after body, six migration steps, a sunset date (`2026-11-30`) and what is _not_ changing. It lives in the repo root so there is a permanent copy.

Two things I would improve after reading it as the consumer:

- The before/after JSON is long; Team 8 will scroll past it on a phone. The three changed lines should be first.
- "v1 stops working" should list the exact status code they will get at sunset (404) so they can test for it.

Delivery: the full text is in `DEPRECATION_NOTICE.md`, but handing it to Team 8 is a person-to-person step and is still open — see the unchecked items in `INTEGRATION_LOG.md`.

## 6. Receiving a breaking change (Part E)

No deprecation notice reached us this week. Our upstream partner, AgroConnect (Team 6), has no v2 in their contract, so there was nothing to migrate to and I did not invent one for them. The honest version of "how did it feel to receive a breaking change on short notice" is already in `INTEGRATION_LOG.md`: on 8 November their reads moved from public to `X-API-Key` and the first we knew was a 401 in our own partner log while the page showed the stale-data banner. The notice never arrived; the break did.

What that says about notices: our `partnerGet()` turned their 401 into `502` and the page fell back to saved data, so the failure was visible only as a banner. That is the same trap as our own v2 rollout — a good fallback hides a broken migration. The upstream migration prep (a `partner.js` versions table plus `PARTNER_VERSION=v1|v2` in `.env`) is deliberately not built yet: it needs their real v2 contract, and inventing field names would be worse than waiting.

## 7. Reflection

Receiving our upstream change was not a notice at all. AgroConnect moved `/farmers` and `/produce` from public reads to `X-API-Key`, and the first I knew of it was a 401 in our request log while the Home page quietly showed the saved-data banner. My first move was not code, it was the log: `partner rejected our API key (401)` told me whose change it was, and `stale: true` told me no user had seen wrong data. That is the failure mode this week is about — a warning that arrives after the break.

Their contract is good at saying what a route returns. It says nothing about retirement, dates, or how to know when a field will change, and their README contradicted itself about single-listing reads. I had to ask rather than plan.

Reading my own notice as Team 8: I would put the changed lines first, the timeline second, and the long JSON last. I would also name the status code at sunset, because "stops working" is not testable. And the partner should not have to open a repository to learn the date.

As the API owner next time, one thing I would do differently: send the notice before the deploy, in the channel the consumer actually reads, and ask for a one-line acknowledgement. A notice with no reply is not a notice.

## 8. What changed in the repo

| File                             | Change                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `server/app.js`                  | new — builds and exports the Express app without listening; mounts `/api/v1`, `/api/v2`, and the unversioned `/api` (v1) |
| `server/server.js`               | now startup only: imports the app, checks MySQL, listens, logs the versions                                              |
| `server/v1.js`                   | new — the existing routers, unchanged, plus the deprecation headers on `/events`                                         |
| `server/routes/eventsV2.js`      | new — v2 view: one `toV2Event()` mapper and a response adapter over the same v1 handlers                                 |
| `server/v2.js`                   | new — the same resources as v1, with `/events` on the v2 view                                                            |
| `server/deprecate.js`            | new — `Deprecation`, `Sunset` and `Link` headers                                                                         |
| `server/tests/versions.test.mjs` | new — pins v1's field set, v2's shape, the key check, and which paths carry the headers                                  |
| `DEPRECATION_NOTICE.md`          | new — the notice to consumers                                                                                            |
| `README.md`, `openapi.yaml`      | pointer to v2 and the notice                                                                                             |
| `INTEGRATION_LOG.md`             | Week 13 section                                                                                                          |

`server/routes/events.js` is untouched: v2 mounts the same handlers, so validation, permissions and status codes cannot drift between versions.

## 9. Consumer impact, in one table

| The consumer does                         | v1 (`/api/events`, `/api/v1/events`)   | v2 (`/api/v2/events`) | What to do                          |
| ----------------------------------------- | -------------------------------------- | --------------------- | ----------------------------------- |
| `body.events`                             | array                                  | array                 | nothing                             |
| `event.date` / `event.time`               | present                                | **absent**            | use `event.startTime`               |
| `new Date(event.date + "T" + event.time)` | works                                  | `Invalid Date`        | `new Date(event.startTime)`         |
| `Date.parse(event.date)` for sorting      | works                                  | `NaN`                 | `Date.parse(event.startTime)`       |
| takes the calendar day                    | `event.date`                           | —                     | `event.startTime.slice(0, 10)`      |
| prefills a date/time form                 | reads `date` + `time`                  | —                     | split `startTime` once, in a helper |
| `POST` / `PUT` body                       | accepts `date` + `time` or `startTime` | identical             | nothing                             |
| error bodies                              | `{ "error": "..." }`                   | identical             | nothing                             |
| clubs, auth, signups, comments, partner   | unchanged                              | identical             | nothing                             |
| response headers                          | `Deprecation: true`, `Sunset`, `Link`  | none                  | use them to detect the sunset       |

## 10. Evidence and how to run it

### Unit and route tests

```bash
cd server
node --test tests/versions.test.mjs   # 9 tests
node --test tests                     # whole server suite, needs MySQL
```

Nine version tests: v1's exact field set (`date`, `time`, no `startTime`), the unversioned URL returning byte-identical JSON to `/api/v1`, v2's exact field set and `startTime` value, v2 rejecting a missing/invalid key on every mount, the three headers on both v1 paths and on neither v2 nor an unknown path, v1 and v2 returning the same error body, an empty v2 list, and unknown subpaths still returning the JSON 404. Every event object in v2 and in v1 comes out of the same handlers; the tests stub only the database query, so the mounts, guards and shaping are the real code.

### The live run — 12 November 2026, XAMPP MariaDB 10.11

`server/campushub_database.sql` imported into a fresh `campushub` database: 7 clubs, 13 events, 8 users, 7 categories. The API was then booted twice from real code — once at the parent commit `7f1eb1c` (before), once at `7bb594e` (after) — and called over HTTP with a real API key.

| Call                 | Before (`7f1eb1c`) | After (`7bb594e`)                                                                                               |
| -------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `GET /api/events`    | 200, 13 events     | 200, 13 events, **byte-identical body**                                                                         |
| `GET /api/v1/events` | 404 `Not found.`   | 200, body identical to `/api/events`                                                                            |
| `GET /api/v2/events` | 404 `Not found.`   | 200, 13 events, one `startTime`, no `date`/`time`                                                               |
| Headers on v1 paths  | none               | `Deprecation: true`, `Sunset: Mon, 30 Nov 2026 00:00:00 GMT`, `Link: </api/v2/events>; rel="successor-version"` |
| Headers on v2        | —                  | none                                                                                                            |
| Startup line         | no versions line   | `API versions: /api/v2 (current) and /api/v1 = /api (deprecated, sunsets 2026-11-30)`                           |

`diff v1_before.json v1_after.json` → **no output, exit 0**, with 13 events on both sides.

One event from `/api/v2/events`:

```json
{
  "id": "event-05",
  "clubId": "club-03",
  "title": "River Trail 5K",
  "description": "A social 5K along the river trail, coffee after at the Rec Center.",
  "category": "Sports & Fitness",
  "location": "Rec Center steps",
  "imageUrl": "/images/events/event-05.jpg",
  "bringNote": "",
  "capacity": null,
  "signupCount": 0,
  "isSeed": true,
  "startTime": "2026-11-12T06:30:00+03:00"
}
```

The request log separates the versions, one JSON line each (`"path":"/api/events"`, `"path":"/api/v1/events"`, `"path":"/api/v2/events"`), and `/stats` counts them as three different rows: `GET /api/events/`, `GET /api/v1/events/`, `GET /api/v2/events/`.

Full server suite against that database: **30 tests, 30 pass, 0 fail** (the two signup/comment tests skip until `node set-passwords.js` has given the demo accounts a password).

To reproduce, with XAMPP's MySQL running:

```bash
mysql -u root < server/campushub_database.sql   # fresh campushub, 13 events
cd server && cp .env.example .env               # then set API_KEYS
node set-passwords.js                           # un-skips the 2 tests
node --test tests                               # 30/30
```

The handout's `npx jest` command does not apply as written: the root Jest config (`jest.config.js`) is CommonJS inside a `"type": "module"` package, so Jest cannot load it, and the root `__tests__` harness requires an `app.js` at the repo root that does not exist. The server's own convention is `node --test` (see `server/tests/`), so the version tests follow that and run green.

## 11. The handout, walked as a checklist

**Done** = in the repo and verified against the real database on 12 November 2026. **Manual** = needs a person in the ring channel or a decision only you can make. **Blocked** = needs Team 6 to publish something.

| Handout step                                                                                                                | Status                              | Where / evidence                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A.** Pick one legitimate breaking change                                                                                  | Done                                | §1 — one field replaced, reason in §2.                                                                                                                                                                                                                                        |
| **A.** `VERSIONING_NOTES.md`: change, why, predicted failing line                                                           | Done, one caveat                    | §1–3. The prediction names our own consumer's line (`src/utils/dateTime.js:16`); Team 8's line is still to be asked for (manual).                                                                                                                                             |
| **B1.** `curl` snapshot to `v1_before.json` before changing anything                                                        | Done                                | Ran the parent commit `7f1eb1c` against the seeded database, then `7bb594e`; `diff` empty (§10).                                                                                                                                                                              |
| **B2.** Move handlers into `v1.js`, move don't edit                                                                         | Done                                | `server/routes/events.js` was never edited; `server/v1.js` mounts it unchanged.                                                                                                                                                                                               |
| **B3.** `v2.js`, one mapper to the new shape                                                                                | Done                                | `server/routes/eventsV2.js` (`toV2Event`), mounted by `server/v2.js`.                                                                                                                                                                                                         |
| **B4.** Mount v2, then v1, then the unversioned paths                                                                       | Done                                | `server/app.js`: `/api/v2`, `/api/v1`, `/api`, all after monitor/CORS/`health`/`stats`; the key guard is per route, so v2 still needs a key (tested).                                                                                                                         |
| **B5.** Make the log/`/stats` show the version                                                                              | Done                                | Log lines carry `/api/events`, `/api/v1/events`, `/api/v2/events`; `/stats` has a row per path — both observed live (§10).                                                                                                                                                    |
| **B6.** Call all three URLs by hand                                                                                         | Done                                | All three called over HTTP against the real database, before and after (§10).                                                                                                                                                                                                 |
| **C1.** `diff v1_before.json v1_after.json` prints nothing                                                                  | Done                                | Empty diff, exit 0, 13 events on both sides.                                                                                                                                                                                                                                  |
| **C2.** A test that pins v1's shape, the old URL, v2's shape and the headers                                                | Done                                | `server/tests/versions.test.mjs`, 9 tests, green. v1 has no `GET /events/:id`, so the error-shape check uses an unauthenticated `POST` and asserts v1 and v2 return the same body.                                                                                            |
| **C3.** `deprecate.js` + `old` on the v1 routes                                                                             | Done                                | `server/deprecate.js`; applied at the mount in `server/v1.js` so v2 cannot inherit the headers.                                                                                                                                                                               |
| **C4.** `npx jest` passes                                                                                                   | Substituted, deliberately           | Root Jest cannot load (CJS config in an ESM package, harness needs a root `app.js`); the server's convention is `node --test` — 9/9 for the version suite, 30/30 for the whole suite.                                                                                         |
| **D.** `DEPRECATION_NOTICE.md` with what, why, before/after, steps, sunset, questions                                       | Done                                | `DEPRECATION_NOTICE.md`, plus what is _not_ changing.                                                                                                                                                                                                                         |
| **D.** Commit the notice                                                                                                    | Done                                | `775138f`, extended by `7bb594e`.                                                                                                                                                                                                                                             |
| **D.** Send it to the partner, full text, and ask for a reply                                                               | **Manual**                          | Needs your ring channel; the text is ready. `INTEGRATION_LOG.md` tracks the reply.                                                                                                                                                                                            |
| **D.** Sunset date the partner can meet, no later than the day before Demo Day, v1 alive until after Demo Day               | Done                                | Migrate by 19 Nov (Demo Day); v1 stops 30 Nov. The handout's two sentences pull against each other — we read the intent as "partner on v2 before Demo Day, v1 outlives Demo Day".                                                                                             |
| **E1–E8.** Receive a notice, try their v2, `partner.js` + `PARTNER_VERSION`, parser tests, switch, `"stale": false`, log it | **Blocked**                         | Team 6 has published no v2 and sent no notice; `/api/v2/farmers` answers `401` before routing, so even its existence needs their key. Building a versions table against an invented contract would be worse than waiting (§6). These are the 8 rubric points we cannot claim. |
| **F.** Who still uses v1, from `/stats`                                                                                     | Done here, needs production numbers | Method and measured rows in §4; the three paths are counted separately, so deployed numbers answer the question directly.                                                                                                                                                     |
| **F.** Reflection, 150–250 words                                                                                            | Done                                | §7, 223 words.                                                                                                                                                                                                                                                                |
| **F.** `git status` clean, `.env` not committed                                                                             | Done                                | `.env` is local-only and gitignored; `.env.example` is the committed template.                                                                                                                                                                                                |
| **F.** `git add …`, commit, push                                                                                            | Done                                | `main` and `week13-api-versioning`, both at `7bb594e` plus this commit.                                                                                                                                                                                                       |

### What a person still has to do

1. **Send the notice to Team 8** in the ring channel, full text plus the repo link, and ask for a one-line reply. Record it in `INTEGRATION_LOG.md`.
2. **Ask Team 8 for the exact line** in their Week 10 integration that reads `event.date` / `event.time`, so §3 is about their code and not only ours.
3. **Chase Team 6** for their versioning plan and a v2 contract with a key; only then build `partner.js`'s versions table, `PARTNER_VERSION` and `partner.test.js` (Part E).
4. **Decide about our own front end** before 30 November: migrate it to `startTime` (§3 lists every line) or accept that it breaks at the sunset.
5. **Read `/stats` + the request log on the deployment** before switching v1 off, so "who still calls v1" is about real callers rather than our own probes.

## 12. A limitation the live run exposed: v2 does not fix the off-by-one

Running the real stack surfaced something worth writing down rather than hiding. `event-05` is stored as `2026-11-13 06:30`. On this machine (Africa/Nairobi, UTC+3) the API returned `"date": "2026-11-12"` and v2 returned `"startTime": "2026-11-12T06:30:00+03:00"` — a day early, exactly the bug the README describes. With `TZ=UTC` the same row comes back as `2026-11-13`, so the shift is a property of the host, not of the data.

The cause is `server/rowMappers.js:73-75`: MySQL's `DATE` arrives as a JavaScript `Date` at local midnight, and `toISOString()` converts it to UTC, which moves the day back on any host east of UTC. `toV2Event` builds `startTime` from that same string, so v2 inherits the shift instead of repairing it. The offset in `startTime` makes the inconsistency visible; it does not remove it.

Why this change does not fix it: the repair is one line — build `YYYY-MM-DD` from `getFullYear()`, `getMonth()` and `getDate()` instead of `toISOString()` — but it changes the values v1 returns on those hosts. v1's promise during its sunset is "the same answers you got yesterday", and the handout's evidence check is exactly that diff. A silent data correction smuggled into a versioning change is how consumers learn not to trust the next one, so it belongs in its own announced change.

In practice: on a UTC deployment (the usual) both versions are right; on a +03:00 host both are a day early, and `startTime`'s `+03:00` offset states the clock while the day attached to it is v1's day. The narrow, honest claim for this week is that v2 changes the _shape_ and the day-shift bug stays open. Next: fix `rowMappers.js` once, announce it as a data fix affecting both versions, and re-run the diff with the corrected values.
