# Week 13 ring bulletin — CampusHub Events API v2

**From:** Team 7, CampusHub API · **To:** our ring — **Team 8** (you call our API) and **Team 6, AgroConnect** (we call yours) · **Date:** 12 November 2026

This is the short version for people in the ring. The formal paperwork is
[DEPRECATION_NOTICE.md](DEPRECATION_NOTICE.md) (our notice to consumers) and
[VERSIONING_NOTES.md](VERSIONING_NOTES.md) (our reasoning, prediction and reflection). Everything below is also in the repo:
`github.com/CrypticMachisu/campus_hub2`.

---

## 1. If you call our API — what changed, what to do

**One change:** each event now has a single ISO 8601 `startTime` instead of the separate `date` and `time` strings.

|                                   | v1 — `/api/events`, `/api/v1/events`                                                             | v2 — `/api/v2/events`                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Event fields                      | `…, "date": "2026-11-02", "time": "06:30", …`                                                    | `…, "startTime": "2026-11-02T06:30:00+03:00", …` |
| Everything else                   | ids, titles, `category`, `location`, `signupCount`, `isSeed`, the `{ "events": [ … ] }` envelope | **identical**                                    |
| API key, rate limit, error bodies | unchanged                                                                                        | unchanged                                        |
| Response headers                  | `Deprecation: true`, `Sunset`, `Link`                                                            | none                                             |

**Nothing else changed.** Clubs, auth, signups, comments, announcements and partner endpoints answer the same. `POST` and `PUT` bodies still accept `date` + `time` (and `startTime`), so the code that _writes_ events does not need touching — only the code that _reads_ them does.

**Why we broke it:** we were sending a date and a clock time with no timezone. A server outside East Africa returned an event dated `2026-11-01` as `2026-10-31` (it is in our README under Known issues), and every consumer had to paste two fields together before it could sort or compare events.

### What to do (about 15 minutes)

1. Call `/api/v2/events` instead of `/api/events` (and `/api/v2/events/{id}` for `PUT` / `DELETE`). Same key, same rate limit.
2. Replace `event.date` / `event.time` with `event.startTime`.
3. Need a real date? `new Date(event.startTime)`. **Do not** keep concatenating the old two fields — on a v2 object that is `new Date("undefinedTundefined")`, which silently becomes `Invalid Date` and then `0`, so everything sorts as oldest and looks past. That is the failure this whole exercise is about: it does not throw.
4. Need only the calendar day? `event.startTime.slice(0, 10)` — that is the day in `+03:00`, the same day v1 reported.
5. Test it, then tell us. We will check our `/stats` for your caller label on `GET /api/v2/events/` before we trust that you have migrated.

### Deadlines

| Date                   | What happens                                                                     |
| ---------------------- | -------------------------------------------------------------------------------- |
| 12 Nov 2026            | v2 is live. v1 keeps working and now announces its own sunset on every response. |
| 19 Nov 2026 (Demo Day) | Both demos should be running on v2.                                              |
| 30 Nov 2026            | v1 stops working. `/api/events` and `/api/v1/events` are removed.                |

v1 stays up **past** Demo Day on purpose, so nobody's demo breaks. If 30 November is a date you cannot meet, say so now — a date changed in writing is fine, a demo that breaks is not.

---

## 2. If we call your API — Team 6 (AgroConnect)

**What we call today,** with `X-API-Key`, a 1.5 s timeout and two retries:
`GET /farmers`, `GET /produce?…`, `GET /farmers/:id` under `PARTNER_URL` — currently
`https://farmers-agroconnect.onrender.com/api`. Our `/api/partner/*` responses wrap your body as
`{ "data": …, "stale": false, "asOf": … }` and fall back to a saved copy with `"stale": true` when you are down.

**What we need from you, in priority order:**

1. **A notice channel**, i.e. one named person and a message we can reply to — not a repo we have to poll. On 8 November your reads moved from public to `X-API-Key` and the first we knew was a `401` in our own log while our Home page quietly showed saved data. The notice never arrived; the break did.
2. **Before any breaking change:** what changes (the field list), why, one example of the new body we can copy, a sunset date we can honestly meet (two weeks or more), and whether the current path stays up until then.
3. **A versioned path** (for example `/api/v2/…`) that runs beside the current one, with the current paths kept working until the sunset — the same thing we are doing for Team 8.
4. **A test key** when v2 lands, so we can compare your real body to your notice by hand before we change any code.
5. **What is _not_ changing** — ids, status strings, filters, the key — because that is the list that saves us from checking everything.

**What we are doing on our side.** One file (`server/routes/partner.js` plus a small versions table) will hold the path and the parser for each of your versions, chosen by `PARTNER_VERSION` in `server/.env`, with a test that fails loudly if the body does not match the version we think we are on. Rollback becomes one word in `.env`. We will not switch until we have seen one live v2 response and our own `/api/partner/*` answers `"stale": false`.

**Our one-line ask right now:** reply with your versioning plan — whether a v2 exists, what would break, and when. If you have no v2 planned, say that too, and we will keep calling the current contract.

---

## 3. What is not changing on our side

- Every non-events endpoint: `clubs`, `auth`, `users`, `admin-requests`, `signups`, `comments`, `announcements`, `partner`, `health`, `stats`.
- `POST` / `PUT` / `DELETE` request bodies for events, including `date` + `time`.
- API keys, the 100-requests-per-minute rate limit, and the `{ "error": "…" }` error envelope.
- Our Week 10/11 integration with AgroConnect — unchanged this week.

---

## 4. Who does what this week

| Member            | Action                                                                                                                                           | By        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| Team 8 (consumer) | Read the notice, reply that you read it, switch your reads to `/api/v2/events`, tell us when done so we can confirm it in `/stats`.              | 19 Nov    |
| Team 6 (producer) | Reply with your versioning plan and a notice channel; send the v2 contract and a test key when v2 exists.                                        | This week |
| Team 7 (us)       | Send the notice to Team 8 by hand, migrate our own React front end to v2, watch `/stats` for remaining v1 callers, keep v1 running until 30 Nov. | Sunset    |

## 5. Where everything lives

| File                         | What it is                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DEPRECATION_NOTICE.md`      | The full notice for consumers: what, why, before/after, six migration steps, timeline, questions.                       |
| `VERSIONING_NOTES.md`        | Our one breaking change, the exact front-end lines it breaks, who still uses v1, the handout checklist, the reflection. |
| `INTEGRATION_LOG.md`         | The Week 13 row: what changed, who it hit, what was done and by whom.                                                   |
| `openapi.yaml`, `README.md`  | The v2/deprecation pointer next to the normal API description.                                                          |
| `__tests__/versions.test.js` | The proof v1 did not change and v2 has the new shape. Run `npx jest` from the repo root.                                |
