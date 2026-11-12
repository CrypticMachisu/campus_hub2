# Versioning notes — Week 13

## 1. The change, in one sentence

Every event object v2 returns replaces the separate `date` (`"YYYY-MM-DD"`) and `time` (`"HH:MM"`) strings with one ISO 8601 timestamp, `startTime` (for example `"2026-11-02T06:30:00+03:00"`).

Endpoint: `GET /api/v2/events` (and the create/update responses on `/api/v2/events`). v1 keeps the old shape at `/api/events` and `/api/v1/events`.

## 2. Why it is worth a break

The current shape is two fields that only mean anything together, and neither carries a timezone. That has already produced a bug we documented: a server outside East Africa returned an event created as `2026-11-01` as `2026-10-31` (README → Known issues), because the date was turned into a JavaScript date and back in a different zone. Every consumer also has to join `date` + `time` before it can sort, compare or export an event — our own front end does that in five places. A timestamp with an explicit `+03:00` offset is unambiguous and is one field instead of two, which is also the field we would extend with an end time later without another break. It is a real fix, not change for its own sake.

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

I could not measure call counts: `/stats` lives in the server's memory and this machine has no MySQL, so no server was running to read it. When the API is up, the answer is one request:

```bash
curl -s -H "X-API-Key: <key>" http://localhost:5000/api/stats
```

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

```bash
cd server
node --test tests/versions.test.mjs
```

Nine tests, all passing: v1's exact field set (`date`, `time`, no `startTime`), the unversioned URL returning byte-identical JSON to `/api/v1`, v2's exact field set and `startTime` value, v2 rejecting a missing/invalid key on every mount, the three headers on both v1 paths and on neither v2 nor an unknown path, v1 and v2 returning the same error body, an empty v2 list, and unknown subpaths still returning the JSON 404.

Every event object in v2 and in v1 comes out of the same handlers; the tests stub only the database query, so the mounts, guards and shaping are the real code.

Two checks from the handout could not be run here and are the first thing to do on a machine with MySQL:

1. `curl .../api/events > v1_before.json` before deploying and `diff v1_before.json v1_after.json` after — this copy of the repository has no database and no running server.
2. `curl -s .../api/stats` for the v1 call counts in section 4.

The handout's `npx jest` command does not apply as written: the root Jest config (`jest.config.js`) is CommonJS inside a `"type": "module"` package, so Jest cannot load it, and the root `__tests__` harness requires an `app.js` at the repo root that does not exist. The server's own convention is `node --test` (see `server/tests/`), so the version tests follow that and run green.

## 11. The handout, walked as a checklist

**Done** = in the repo and verified here. **Manual** = cannot be completed from a machine with no database, no mail/chat account and no partner key.

| Handout step                                                                                                                | Status                    | Where / evidence                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A.** Pick one legitimate breaking change                                                                                  | Done                      | §1 — one field replaced, real reason (§2).                                                                                                                                                                                                                                                                                                                                                  |
| **A.** `VERSIONING_NOTES.md`: change, why, predicted failing line                                                           | Done, with a caveat       | §1–3. The prediction names our own consumer's line (`src/utils/dateTime.js:16`); the partner's line is **Manual** — ask Team 8 which file reads `date`/`time`.                                                                                                                                                                                                                              |
| **B1.** `curl` snapshot to `v1_before.json` before changing anything                                                        | **Manual**                | No MySQL and no server copy on this machine, so there was nothing to snapshot. The frozen warehouse is byte-identical to the pre-change `server/routes/events.js` instead (§8). Run the two `curl`s when the DB is up.                                                                                                                                                                      |
| **B2.** Move handlers into `v1.js`, move don't edit                                                                         | Done                      | `server/routes/events.js` was never edited at all; `server/v1.js` mounts it unchanged. Zero edits is a stronger version of “move, don't edit”.                                                                                                                                                                                                                                              |
| **B3.** `v2.js`, one mapper to the new shape                                                                                | Done                      | `server/routes/eventsV2.js` (`toV2Event`), mounted by `server/v2.js`.                                                                                                                                                                                                                                                                                                                       |
| **B4.** Mount v2, then v1, then the unversioned paths                                                                       | Done                      | `server/app.js`: `/api/v2`, `/api/v1`, `/api`, all after monitor/CORS/`health`/`stats`; the key guard is per route, so v2 still needs a key (tested).                                                                                                                                                                                                                                       |
| **B5.** Make the log/`/stats` show the version                                                                              | Done                      | `server/monitoring.js` captures `req.path` at request start, so log lines read `/api/v1/events` and `/api/v2/events`; `/stats` keys on `req.baseUrl + req.route.path`.                                                                                                                                                                                                                      |
| **B6.** Call all three URLs by hand                                                                                         | Partial                   | v1 = old URL = old shape, and v2 = new shape are asserted in `versions.test.mjs`. Live `curl` is **Manual** (no DB).                                                                                                                                                                                                                                                                        |
| **C1.** `diff v1_before.json v1_after.json` prints nothing                                                                  | **Manual**                | Same missing database. The test in `versions.test.mjs` is the proof that runs every time.                                                                                                                                                                                                                                                                                                   |
| **C2.** A test that pins v1's shape, the old URL, v2's shape and the headers                                                | Done                      | `server/tests/versions.test.mjs`, 9 tests. v1 has no `GET /events/:id`, so the “error shape unchanged” check uses an unauthenticated `POST` and asserts v1 and v2 return the same body.                                                                                                                                                                                                     |
| **C3.** `deprecate.js` + `old` on the v1 routes                                                                             | Done                      | `server/deprecate.js`; applied at the mount in `server/v1.js` so v2 cannot inherit the headers.                                                                                                                                                                                                                                                                                             |
| **C4.** `npx jest` passes                                                                                                   | Substituted, deliberately | The root Jest config cannot load (CJS file in an ESM package) and its harness needs a root `app.js` that does not exist; the server's own convention is `node --test`, which is where these tests live and pass 9/9.                                                                                                                                                                        |
| **D.** `DEPRECATION_NOTICE.md` with what, why, before/after, steps, sunset, questions                                       | Done                      | `DEPRECATION_NOTICE.md` — all six handout sections, plus what is _not_ changing.                                                                                                                                                                                                                                                                                                            |
| **D.** Commit the notice                                                                                                    | Done                      | `775138f` on `main`.                                                                                                                                                                                                                                                                                                                                                                        |
| **D.** Send it to the partner, full text, and ask for a reply                                                               | **Manual**                | Needs a person in the ring channel. The text is ready to paste; the checklist in `INTEGRATION_LOG.md` tracks the reply.                                                                                                                                                                                                                                                                     |
| **D.** Sunset date the partner can meet, no later than the day before Demo Day, v1 alive until after Demo Day               | Done                      | Migrate by 19 Nov (Demo Day); v1 stops 30 Nov. The handout's two sentences pull against each other — we read the intent as “partner on v2 before Demo Day, v1 outlives Demo Day”, which is what the notice says.                                                                                                                                                                            |
| **E1–E8.** Receive a notice, try their v2, `partner.js` + `PARTNER_VERSION`, parser tests, switch, `"stale": false`, log it | **Blocked, not done**     | Team 6 has published no v2 and sent no notice. `https://farmers-agroconnect.onrender.com/api/v2/farmers` answers `401` (their key guard runs before routing), so we cannot even see whether v2 exists without their key. Building a versions table against an invented contract would be worse than waiting; §6 records the position honestly. This is the 8 rubric points we cannot claim. |
| **F.** Who still uses v1, from `/stats`                                                                                     | Partial                   | Method and the exact rows to read are in §4, and `/stats`/logs now separate `/api/v1/events/`, `/api/events/` and `/api/v2/events/`. The counts need a running server — **Manual**.                                                                                                                                                                                                         |
| **F.** Reflection, 150–250 words                                                                                            | Done                      | §7, 223 words.                                                                                                                                                                                                                                                                                                                                                                              |
| **F.** `git status` clean, `.env` not committed                                                                             | Done                      | Committed and pushed; `.env` stayed in `.gitignore`.                                                                                                                                                                                                                                                                                                                                        |
| **F.** `git add …`, commit, push                                                                                            | Done                      | `775138f` on `main`, plus the `week13-api-versioning` branch.                                                                                                                                                                                                                                                                                                                               |

### What a person still has to do

1. **Snapshot and diff v1** with MySQL running (`curl … > v1_before.json`, then again after a restart, then `diff`) — the handout's Evidence 1.
2. **Call the three URLs by hand** (`/api/v1/events`, `/api/events`, `/api/v2/events`) and eyeball the JSON, as in Part B step 6.
3. **Send the notice to Team 8** in the ring channel, full text plus the repo link, and ask for a one-line reply. Then record the reply in `INTEGRATION_LOG.md`.
4. **Ask Team 8 for the exact line** in their Week 10 integration that reads `event.date` / `event.time`, so §3 is about their code and not only ours.
5. **Read `/stats` + the request log** once the API is deployed, and write down which caller labels are still on v1 (Part F).
6. **Chase Team 6** for their versioning plan and a v2 contract with a key; only then build `partner.js`'s versions table, `PARTNER_VERSION` and `partner.test.js` (Part E).
7. **Decide about our own front end** before 30 November: migrate it to `startTime` (§3 lists every line) or accept that it breaks at the sunset.
