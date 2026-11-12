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

Eight tests, all passing: v1's exact field set (`date`, `time`, no `startTime`), the unversioned URL returning byte-identical JSON to `/api/v1`, v2's exact field set and `startTime` value, v2 rejecting a missing/invalid key on every mount, the three headers on both v1 paths and on neither v2 nor an unknown path, an empty v2 list, and unknown subpaths still returning the JSON 404.

Every event object in v2 and in v1 comes out of the same handlers; the tests stub only the database query, so the mounts, guards and shaping are the real code.

Two checks from the handout could not be run here and are the first thing to do on a machine with MySQL:

1. `curl .../api/events > v1_before.json` before deploying and `diff v1_before.json v1_after.json` after — this copy of the repository has no database and no running server.
2. `curl -s .../api/stats` for the v1 call counts in section 4.

The handout's `npx jest` command does not apply as written: the root Jest config (`jest.config.js`) is CommonJS inside a `"type": "module"` package, so Jest cannot load it, and the root `__tests__` harness requires an `app.js` at the repo root that does not exist. The server's own convention is `node --test` (see `server/tests/`), so the version tests follow that and run green.
