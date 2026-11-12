# Versioning notes — Week 13

## 1. The change, in one sentence

Every event object v2 returns replaces the separate `date` (`"YYYY-MM-DD"`) and `time` (`"HH:MM"`) strings with one ISO 8601 timestamp, `startTime` (for example `"2026-11-02T06:30:00+03:00"`).

Endpoint: `GET /api/v2/events` (and the create/update responses on `/api/v2/events`). v1 keeps the old shape at `/api/events` and `/api/v1/events`.

## 2. Why it is worth a break

The current shape is two fields that only mean anything together, and neither carries a timezone. That has already produced a bug we documented: a server outside East Africa returned an event created as `2026-11-01` as `2026-10-31` (README → Known issues), because the date was turned into a JavaScript date and back in a different zone. Every consumer also has to join `date` + `time` before it can sort, compare or export an event — our own front end does that in five places. A timestamp with an explicit `+03:00` offset is unambiguous and is one field instead of two, which is also the field we would extend with an end time later without another break. It is a real fix, not change for its own sake.

## 3. Prediction: which exact line in the consumer's code fails

Our first downstream consumer is our own front end. It has since moved to `GET /api/v2/events` (commit `921fe8c`); before that move it called `GET /api/events`, and the prediction below is the failure the old shape would have produced. The first line to break is **`src/utils/dateTime.js:16`**:

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

The front end's move to v2 closes that gap in one place: `toUiEvent()` in `src/utils/eventsStore.js` slices `startTime` back into `date` + `time` for list and single-event responses, so every reader in the table keeps getting the fields it expects. It slices the string rather than converting through `Date`, so the stored East Africa Time wall clock cannot slide a day in another zone.

## 4. Who still uses v1 (Part F)

Callers known from the code, not from data:

| Path                     | Caller                                               | Still on v1?                               |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------ |
| `GET /api/events`        | our own React front end (`src/utils/eventsStore.js`) | no — moved to `/api/v2/events` (`921fe8c`) |
| `GET /api/events`        | Team 8, our downstream partner                       | unknown until the notice is answered       |
| `PUT`/`POST /api/events` | our own front end (`saveCustomEvent`)                | no — writes go to `/api/v2/events`         |

`/stats` lives in the server's memory, so it has to be read while the API is up. It was read once locally (capture below); real consumer numbers need a deployed server carrying real traffic.

### Reading the v1 vs v2 counts from `/stats`

Every route's running total is under `routes`, keyed by method + path:

```bash
curl -s -H "X-API-Key: $KEY" http://localhost:5000/api/stats
```

Filter it to the event rows if `jq` is installed:

```bash
curl -s -H "X-API-Key: $KEY" http://localhost:5000/api/stats \
  | jq '.routes | with_entries(select(.key | contains("events")))'
```

| Route label in `routes`                                            | Version | Who it is                                      |
| ------------------------------------------------------------------ | ------- | ---------------------------------------------- |
| `GET /api/v1/events/`                                              | v1      | a caller using the explicit version prefix     |
| `GET /api/events/`                                                 | v1      | a caller on the old unversioned URL            |
| `GET /api/v2/events/`                                              | v2      | migrated traffic — the number that should grow |
| `POST /api/v1/events/`, `POST /api/events/`                        | v1      | creating events, on either old URL             |
| `PUT`/`DELETE /api/v1/events/:id` (and the unversioned `:id` rows) | v1      | editing and deleting                           |
| `POST /api/v2/events/`, `PUT`/`DELETE /api/v2/events/:id`          | v2      | the same writes, migrated                      |

The trailing `/` is part of the list label: the events router is mounted at `/events`, so its list route is `req.route.path === "/"` and the label is `"/api/v1/events" + "/"`. Read the rows for writes too — a caller that migrated reads but not writes is only half-migrated.

Three things to keep in mind when reading them:

- **The counts reset on restart.** They are in memory; `startedAt` and `uptimeSeconds` are in the same body. Compare v1 and v2 over the same window.
- **A row counts attempts, including rejected ones.** A 401 on a known route still matches that route, so it lands in the row with `clientErrors` incremented (a 401 against `/api/events` did exactly that during the local run); only an unmatched path, such as an unknown 404, falls under `(no route)`. Read `count - clientErrors - serverErrors` when you want served reads.
- **The rows say which version, not which caller.** To attribute a count, read the request log — one JSON line per request on the server's stdout, redirected to `server/requests.log` if you want a file (that path is gitignored by `*.log`, so whatever sits there is a leftover from an earlier local run — a stale five-line file from 9 November on this machine — never a committed sample). Each line carries the full `path` and a `caller` label (`key-xxxxxx`, a hash prefix — never the key). That is how Team 8 is told apart from our own front end.

Our own checks count too: each read above adds one to `GET /api/stats`, and a burst of manual curls spends the same 100-per-60s budget as any other caller.

#### Captured locally, 12 November 2026

API started against the local MySQL, then five `GET`s sent to each events URL from a fresh process. `/stats` returned:

```text
startedAt 2026-11-12T10:19:02.851Z      total 16

GET /api/v2/events/   count 5   clientErrors 0   avgMs 40.2
GET /api/v1/events/   count 5   clientErrors 0   avgMs 23.9
GET /api/events/      count 5   clientErrors 0   avgMs 24.3
```

Five v2 reads, five v1 reads on the explicit prefix, five on the old URL — the three rows the table predicts, with exactly the labels it names. All fifteen request-log lines carried the same `caller` label (`key-1a2313`), so one consumer is recognisable across all three of its URLs.

Two things this capture settled:

- **The version suite does not feed these counts.** `__tests__/versions.test.js` drives the app in-process through supertest and never opens a port, so its v1/v2 traffic cannot appear in a server's `/stats`; only the api-security and signups/comments suites hit `:5000`. The numbers above come from deliberate curls, not from `npm test`.
- **`server/.env` sets `PORT=5000`**, so `npm start` binds 5000. A shell spawned by the desktop app injects `PORT=0` instead, and dotenv does not override a variable that is already set — that, not `.env`, is how the server ends up on a random port and `curl localhost:5000` gets nothing. The commands above pass `PORT=5000 node server.js` so the capture does not depend on either.

These are not consumer numbers — 5/5/5 is the probe, not usage. Repeat the three loops against deployed traffic and replace them; Team 8's key will show a different `caller` label, which is the whole point.

**Our own front end no longer needs v1.** It moved to `/api/v2` on 12 November, so its reads and writes now land on the v2 rows; the capture above was taken before that move. Whether v1 can be switched off now depends on the other callers: Team 8 has not answered, and any remaining traffic will appear in the log under a different `caller` label.

## 5. The notice we wrote

`DEPRECATION_NOTICE.md` — what changes, why, a copyable before/after body, six migration steps, a sunset date (`2026-11-30`) and what is _not_ changing. It lives in the repo root so there is a permanent copy.

Two things I would improve after reading it as the consumer:

- The before/after JSON is long; Team 8 will scroll past it on a phone. The three changed lines should be first.
- "v1 stops working" now lists the exact status and body they will get at sunset (`404 {"error":"Not found."}`), so they can test for it instead of guessing.

Delivery: the full text is in `DEPRECATION_NOTICE.md`, but handing it to Team 8 is a person-to-person step and is still open — see the unchecked items in `INTEGRATION_LOG.md`.

## 6. Receiving a breaking change (Part E)

A notice did reach us this week. On 12 November AgroConnect (Team 6) sent one for their product catalogue reads and asked us to review it. Before answering I checked what we actually call: `/farmers`, `/produce` and `/farmers/:id`. Their reply confirmed in writing that the notice covers `/api/products` and `/api/v1/products` only, that `/produce` and `/farmers` are unchanged (including `title` and `quantity`), and that no migration is needed from us. So there was nothing to migrate to and I did not invent a v2 for them. The honest version of "how did it feel to receive a breaking change on short notice" is already in `INTEGRATION_LOG.md`: on 8 November their reads moved from public to `X-API-Key` and the first we knew was a 401 in our own partner log while the page showed the stale-data banner. For that change the notice never arrived; the break did.

What that says about notices: our `partnerGet()` turned their 401 into `502` and the page fell back to saved data, so the failure was visible only as a banner. That is the same trap as our own v2 rollout — a good fallback hides a broken migration. The upstream migration prep (a `partner.js` versions table plus `PARTNER_VERSION=v1|v2` in `.env`) is deliberately not built yet: it needs their real v2 contract, and inventing field names would be worse than waiting.

## 7. Reflection

Receiving our upstream's keyed-reads change was not a notice at all. AgroConnect moved `/farmers` and `/produce` from public reads to `X-API-Key`, and the first I knew of it was a 401 in our request log while the Home page quietly showed the saved-data banner. My first move was not code, it was the log: `partner rejected our API key (401)` told me whose change it was, and `stale: true` told me no user had seen wrong data. That is the failure mode this week is about — a warning that arrives after the break.

Their contract is good at saying what a route returns. It says nothing about retirement, dates, or how to know when a field will change, and their README contradicted itself about single-listing reads. I had to ask rather than plan. The notice they sent on 12 November is the first retirement information they have given us, and it still shows the gap: v2 exists only locally with no test key, the hosted v1 carries none of the deprecation headers the notice describes, and no sunset status or body is committed. Sending a notice is not the same as shipping something we can migrate to.

Reading my own notice as Team 8: I would put the changed lines first, the timeline second, and the long JSON last. I would also name the status code at sunset, because "stops working" is not testable. And the partner should not have to open a repository to learn the date.

As the API owner next time, one thing I would do differently: send the notice before the deploy, in the channel the consumer actually reads, and ask for a one-line acknowledgement. A notice with no reply is not a notice.

## 8. What changed in the repo

| File                            | Change                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `server/app.js`                 | new — builds and exports the Express app without listening; mounts `/api/v1`, `/api/v2`, and the unversioned `/api` (v1) |
| `server/server.js`              | now startup only: imports the app, checks MySQL, listens, logs the versions                                              |
| `server/v1.js`                  | new — the existing routers, unchanged, plus the deprecation headers on `/events`                                         |
| `server/routes/eventsV2.js`     | new — v2 view: one `toV2Event()` mapper and a response adapter over the same v1 handlers                                 |
| `server/v2.js`                  | new — the same resources as v1, with `/events` on the v2 view                                                            |
| `server/deprecate.js`           | new — `Deprecation`, `Sunset` and `Link` headers                                                                         |
| `__tests__/versions.test.js`    | new — the same nine assertions under Jest + supertest, which is what `npx jest` runs                                     |
| `__tests__/eventsStore.test.js` | new — 5 tests for the `startTime` → `date`/`time` mapping, including past midnight                                       |
| `src/utils/api.js`              | the version is applied once, as `<VITE_API_URL>/v2`, so every store moved together                                       |
| `src/utils/eventsStore.js`      | `toUiEvent()` maps v2's `startTime` back to `date` + `time`; create/update responses included                            |
| `DEPRECATION_NOTICE.md`         | new — the notice to consumers                                                                                            |
| `README.md`, `openapi.yaml`     | pointer to v2 and the notice                                                                                             |
| `INTEGRATION_LOG.md`            | Week 13 section                                                                                                          |

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
npx jest
```

Nine tests, all passing: v1's exact field set (`date`, `time`, no `startTime`), the unversioned URL returning byte-identical JSON to `/api/v1`, v2's exact field set and `startTime` value, v2 rejecting a missing/invalid key on every mount, the three headers on both v1 paths and on neither v2 nor an unknown path, v1 and v2 returning the same error body, an empty v2 list, and unknown subpaths still returning the JSON 404.

`npx jest` now runs **14**: those nine, plus five in `__tests__/eventsStore.test.js` that pin `toUiEvent()` — a normal timestamp, one with no seconds, one just past midnight, an early `+03:00` clock that must not slide back a day, and an event with no `startTime`. Run against a deliberately broken slice, four of the five failed, so the guard is live rather than decorative.

Every event object in v2 and in v1 comes out of the same handlers; the tests stub only the database query, so the mounts, guards and shaping are the real code.

Both handout evidence checks have now been captured on this machine:

1. **Evidence 1 — before/after `diff`.** The old server was run from a worktree at `7f1eb1c`; `GET /api/events` was saved as `docs/v1_before.json` (13 events, 4684 bytes, sha256 `3356ca69…`). The current code answered with the same bytes into `docs/v1_after.json`, so `diff` printed nothing. Both snapshots are committed under `docs/`, so the proof does not depend on a temp folder. The v1 response carried `Deprecation`/`Sunset`/`Link`; v2 carried none.
2. **`/api/stats`** — captured locally, numbers and reading in section 4.

The handout's `npx jest` command now works as written. `jest.config.cjs` holds the config — the `.cjs` extension is the fix for a config file Jest otherwise loads as ESM and fails with `module is not defined` — and `babel.config.cjs` compiles the server's ESM sources to CJS for the test run only. The suite is `__tests__/versions.test.js`, using supertest against the exported app. It carries the same nine assertions the server used to run under `node --test`; that copy was removed so there is one suite rather than two that can drift.

## 11. The handout, walked as a checklist

**Done** = in the repo and verified here. **Manual** = cannot be completed from a machine with no database, no mail/chat account and no partner key.

| Handout step                                                                                                                | Status                | Where / evidence                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A.** Pick one legitimate breaking change                                                                                  | Done                  | §1 — one field replaced, real reason (§2).                                                                                                                                                                                                              |
| **A.** `VERSIONING_NOTES.md`: change, why, predicted failing line                                                           | Done, with a caveat   | §1–3. The prediction names our own consumer's line (`src/utils/dateTime.js:16`); the partner's line is **Manual** — ask Team 8 which file reads `date`/`time`.                                                                                          |
| **B1.** `curl` snapshot to `v1_before.json` before changing anything                                                        | Done                  | Old server run from a `7f1eb1c` worktree (reusing `server/node_modules` and `--env-file=../../server/.env`); `GET /api/events` saved as `docs/v1_before.json` — 13 events, 4684 bytes.                                                                  |
| **B2.** Move handlers into `v1.js`, move don't edit                                                                         | Done                  | `server/routes/events.js` was never edited at all; `server/v1.js` mounts it unchanged. Zero edits is a stronger version of “move, don't edit”.                                                                                                          |
| **B3.** `v2.js`, one mapper to the new shape                                                                                | Done                  | `server/routes/eventsV2.js` (`toV2Event`), mounted by `server/v2.js`.                                                                                                                                                                                   |
| **B4.** Mount v2, then v1, then the unversioned paths                                                                       | Done                  | `server/app.js`: `/api/v2`, `/api/v1`, `/api`, all after monitor/CORS/`health`/`stats`; the key guard is per route, so v2 still needs a key (tested).                                                                                                   |
| **B5.** Make the log/`/stats` show the version                                                                              | Done                  | `server/monitoring.js` captures `req.path` at request start, so log lines read `/api/v1/events` and `/api/v2/events`; `/stats` keys on `req.baseUrl + req.route.path`.                                                                                  |
| **B6.** Call all three URLs by hand                                                                                         | Done                  | Five GETs to each of `/api/events`, `/api/v1/events` and `/api/v2/events` against the live server: the two v1 URLs returned the old shape, v2 returned `startTime`. `__tests__/versions.test.js` asserts the same split on every run.                   |
| **C1.** `diff v1_before.json v1_after.json` prints nothing                                                                  | Done                  | `docs/v1_after.json` is the same 4684 bytes and the same sha256 (`3356ca69…`) as `docs/v1_before.json`; `diff` exits 0 and prints nothing. Re-check with `diff docs/v1_before.json docs/v1_after.json`.                                                 |
| **C2.** A test that pins v1's shape, the old URL, v2's shape and the headers                                                | Done                  | `__tests__/versions.test.js`, 9 tests. v1 has no `GET /events/:id`, so the “error shape unchanged” check uses an unauthenticated `POST` and asserts v1 and v2 return the same body.                                                                     |
| **C3.** `deprecate.js` + `old` on the v1 routes                                                                             | Done                  | `server/deprecate.js`; applied at the mount in `server/v1.js` so v2 cannot inherit the headers. `server/app.js` puts an `isV1Retired()` guard in front of the v1 mounts, read per request, so the sunset is enforced by the date rather than by memory. |
| **C4.** `npx jest` passes                                                                                                   | Done                  | `jest.config.cjs` (the `.cjs` extension fixes the CJS-inside-`"type": "module"` load error) plus `babel.config.cjs` for the ESM→CJS transform; `npx jest` passes 18/18 (13 version + 5 mapping).                                                        |
| **D.** `DEPRECATION_NOTICE.md` with what, why, before/after, steps, sunset, questions                                       | Done                  | `DEPRECATION_NOTICE.md` — all six handout sections, plus what is _not_ changing.                                                                                                                                                                        |
| **D.** Commit the notice                                                                                                    | Done                  | `775138f` on `main`.                                                                                                                                                                                                                                    |
| **D.** Send it to the partner, full text, and ask for a reply                                                               | **Manual**            | Needs a person in the ring channel. The text is ready to paste; the checklist in `INTEGRATION_LOG.md` tracks the reply.                                                                                                                                 |
| **D.** Sunset date the partner can meet, no later than the day before Demo Day, v1 alive until after Demo Day               | Done                  | Migrate by 19 Nov (Demo Day); v1 stops 30 Nov. The handout's two sentences pull against each other — we read the intent as “partner on v2 before Demo Day, v1 outlives Demo Day”, which is what the notice says.                                        |
| **E1–E8.** Receive a notice, try their v2, `partner.js` + `PARTNER_VERSION`, parser tests, switch, `"stale": false`, log it | **Blocked, not done** | Their 12 Nov notice covers product reads only, their v2 is local with no test key, and `/produce` is confirmed unchanged; `/api/v2/farmers` still answers `401`, so there is no migration to do. §6 records the position honestly.                      |
| **F.** Who still uses v1, from `/stats`                                                                                     | Partial               | Method, exact rows and one local capture (v2 5 / v1 5 / old 5) are in §4, and `/stats`/logs now separate `/api/v1/events/`, `/api/events/` and `/api/v2/events/`. Real consumer counts still need deployed traffic — **Manual**.                        |
| **F.** Reflection, 150–250 words                                                                                            | Done                  | §7, 223 words.                                                                                                                                                                                                                                          |
| **F.** `git status` clean, `.env` not committed                                                                             | Done                  | Committed and pushed; `.env` stayed in `.gitignore`.                                                                                                                                                                                                    |
| **F.** `git add …`, commit, push                                                                                            | Done                  | `775138f` on `main`, plus the `week13-api-versioning` branch.                                                                                                                                                                                           |

### What a person still has to do

1. **Send the notice to Team 8** in the ring channel, full text plus the repo link, and ask for a one-line reply. Then record the reply in `INTEGRATION_LOG.md`.
2. **Ask Team 8 for the exact line** in their Week 10 integration that reads `event.date` / `event.time`, so §3 is about their code and not only ours.
3. **Read `/stats` + the request log on the deployed server** and write down which caller labels are still on v1 (Part F). The local capture in §4 shows how to read it; it is not consumer traffic.
4. **Chase Team 6** for their versioning plan and a v2 contract with a key; only then build `partner.js`'s versions table, `PARTNER_VERSION` and `partner.test.js` (Part E).
5. **Re-check one thing by hand** before Demo Day: a date change in the dashboard's edit form — Chrome's date field ignored automated keystrokes, so only the time was edited in the run recorded above. The other views were checked on 12 November: `ClubProfile` (`Sun, 8 Nov` / `Sun, 15 Nov`), `MyEvents` (`Sun, 15 Nov · 17:30` plus the `15 / NOV` chip), the ICS export (`DTSTART:20261108T180000`, `DTEND:20261108T200000`) and the workspace next-event panel (`NOV` / `15`, `IN 3 DAYS`, `Sun, 15 Nov · 17:30`). All render the same dates as before the move.

Both local evidence checks are now done: the §10 before/after `diff` and the §4 `/stats` capture.
