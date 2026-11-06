# Monitoring — what we decided to record, and what we predicted

Done as part of Week 12, Parts A–D. The live API is at `http://localhost:5000/api` and logs every request to `server/requests.log`. See the `## Monitoring: request log and /stats` section of the README for a live example.

## A1. The rule we decided

Decided **before** writing any code: what goes in the log, and what never does.

| Log this                                                            | Never log this                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| Timestamp                                                           | API keys or tokens, even partly                           |
| Method and path (`GET /api/events`, not the full URL)               | Passwords and tokens in request or response bodies        |
| Status code                                                         | Full request or response bodies                           |
| Response time in milliseconds                                       | Query strings (they can carry emails, tokens, names)      |
| A caller label (a short fingerprint of the key, not the key itself) | Anything the caller would be upset to see in a screenshot |

"Who called" is useful: it separates our own traffic from our ring partner's. But it is done without ever writing the key — the caller label is the first six hex characters of a SHA-256 hash of the key, so the same key always gives the same label and nobody can recover a key from one.

This matches exactly the rule table in the Week 12 handout. The implementation is in `server/monitoring.js` and is wired in `server/server.js` as the very first middleware so that rejected requests (401s and 429s) are logged too.

## A2. Our predictions (before we had any data)

1. **Which endpoint will be the slowest, and why:** `GET /api/partner/farmers` (the upstream AgroConnect call we proxy server-side). It is the only request that leaves our process to a network call over the internet; every other endpoint reads or writes MySQL locally. A network round-trip plus their server's own latency makes it the slow one. If the partner is slow, that endpoint is slow.

2. **Which endpoint will produce the most errors, and why (guess):** `GET /api/events`. It is the most public, most frequently called read endpoint, so it will see the most invalid, missing, or over-limit requests — and the handout's traffic script targets it. Also, the 401s from requests with no key or the wrong key will all hit the same endpoints that live traffic hits, so those endpoints will accumulate the most `clientErrors`.

These are guesses. Part E of the handout asks us to compare them to the real numbers in `/stats` and the log, and to finish `MONITORING_NOTES.md` with: what we predicted vs. what the data actually shows, one real pattern stated with figures, a hypothesis for why it happens, and one production alert we would want. That comparison is deliberately left for Part E — this file covers Parts A–D only.

## Captured during the final verification run (Nov 5, 2026)

Sample log lines from a live run against the API (Part B: one 200, one 401, one 404; caller `key-1454b5` is our real key's fingerprint, `none` means no or wrong key):

```json
{"time":"2026-11-05T13:50:55.289Z","method":"GET","path":"/api/clubs","status":401,"ms":2,"caller":"none"}
{"time":"2026-11-05T13:50:55.157Z","method":"GET","path":"/api/clubs","status":200,"ms":41,"caller":"key-1454b5"}
{"time":"2026-11-05T13:51:10.694Z","method":"GET","path":"/api/not-a-route","status":404,"ms":1.4,"caller":"key-1454b5"}
```

Copy of `/stats` after running `traffic.js` (N=60) against the live API (Part D, step 4):

```json
{
  "startedAt": "2026-11-05T13:50:41.538Z",
  "uptimeSeconds": 41,
  "total": 66,
  "clientErrors": 29,
  "serverErrors": 0,
  "errorRatePercent": 0,
  "avgMs": 13.8,
  "routes": {
    "GET /api/events/": {
      "count": 20,
      "clientErrors": 0,
      "serverErrors": 0,
      "avgMs": 23.6,
      "maxMs": 60.3
    },
    "GET /api/clubs/": {
      "count": 15,
      "clientErrors": 0,
      "serverErrors": 0,
      "avgMs": 25.7,
      "maxMs": 64.8
    },
    "GET /api/signups/event/:eventId": {
      "count": 12,
      "clientErrors": 12,
      "serverErrors": 0,
      "avgMs": 1,
      "maxMs": 1.9
    },
    "GET (no route)": {
      "count": 17,
      "clientErrors": 17,
      "serverErrors": 0,
      "avgMs": 1.1,
      "maxMs": 2.1
    },
    "GET /api/health": {
      "count": 1,
      "clientErrors": 0,
      "serverErrors": 0,
      "avgMs": 19.9,
      "maxMs": 19.9
    },
    "GET /api/stats": {
      "count": 1,
      "clientErrors": 0,
      "serverErrors": 0,
      "avgMs": 1.9,
      "maxMs": 1.9
    }
  }
}
```

The two different signup-by-event ids in `traffic.js` both land in the one `GET /api/signups/event/:eventId` row — route patterns group, paths do not fragment. The traffic run produced 200s, 401s and 404s, `serverErrors` stayed 0, and `grep -c "<real key>"` on the log printed 0.

## Part E — what the data says, compared to what we predicted

Measured on a clean server restart (so the totals were zero at run start): `traffic.js` N=60, plus four targeted partner calls and a few single probes. Final `/stats` snapshot: total 68, clientErrors 30, serverErrors 4, errorRatePercent 5.9, avgMs 374.6.

The five handout questions, answered with numbers:

| Question                           | Answer from the data                                                                                                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slowest on average?                | `GET /api/partner/farmers`: avgMs **8098.5** (next fastest-to-slowest: `/api/partner/produce` 164.9, `/api/clubs/` 29.9, `/api/events/` 28.7, everything local ≤ 10)                                                                                                       |
| Slowest worst case?                | Same route: `GET /api/partner/farmers` maxMs **23841.2** — 80× the next route's max (`/api/clubs/` 71.6). The average alone hides nothing here, but for local routes it would: `/api/clubs/` averages 29.9 ms yet one call took 71.6 ms                                    |
| Fails most often?                  | Two culprits, different kinds: `GET /api/signups/event/:eventId` has **23 of 23 calls 401** (client), and `GET /api/partner/farmers` has **3 of 3 calls 502** (server). `/api/events/` itself: 16 calls, 0 errors                                                          |
| Are the 401s a mistake or probing? | Our own traffic. The log shows two 401 populations: `caller:"none"` (the no-key entry in `traffic.js` — sent by us) and `caller:"key-1454b5"` (our own real key hitting `/api/signups/event/:eventId`). No unfamiliar `key-xxxxxx` label appears, so: mistake, not probing |
| Is the error rate healthy?         | Overall 5.9% sounds bad but it is **entirely** `/api/partner/*`: 4×502 → errorRatePercent 0 before those calls, and every local route shows serverErrors 0. Unhealthy upstream, healthy API                                                                                |

1. **What we predicted vs. what the data shows.** Prediction 1 (slowest = `GET /api/partner/farmers`, because it is the only call that leaves our process) — **confirmed**: avgMs 8098.5, maxMs 23841.2, roughly 100–270× slower on average than every DB-backed endpoint. Prediction 2 (most errors = `GET /api/events`) — **wrong, and for an instructive reason**: its with-key calls were 16/16 successful (0 clientErrors), and its _no-key_ 401s never touch the events row at all — the key check runs before routing, so those land in `GET (no route)` (7 calls, all clientErrors). The most-errored route was actually `GET /api/signups/event/:eventId` (23/23 401) with `GET /api/partner/farmers` (3/3 502) correct for server errors.

2. **One real pattern, stated with figures.** `GET /api/signups/event/:eventId` is 23/23 401s across _both_ generated ids (`event-05`, `event-13` — same grouped row), and it fails **fast**: avgMs 1.2, maxMs 4.0. Meanwhile `GET /api/partner/farmers` failed all 3 deliberate probes as **502**, the first after **23.8 s** (a connect timeout) and the remaining ones in ~0.3 s — so once the upstream connection gives up, subsequent failures are quick, empty errors.

3. **Why I think it happens, and what I would check next.** First, the signups route is code-checked and explained: `server/routes/signups.js` guards `GET /event/:eventId` with `requireAuth` — a logged-in _user session_ — not merely an API key. Our traffic generator and probes carry only `X-API-Key`, so the quick 1.2 ms 401s are exactly “no session”. To prove it end-to-end I would replay the same URL as a logged-in dashboard user and expect 200 (403 if the user lacks admin on that club). Second, the partner 502s need no DB: the first call burned 23.8 s reaching `farmers-agroconnect` (their API 401s us without a partner-issued key anyway), then 0.3 s repeated failures — I would check whether we can mark the upstream as briefly down and serve the Week 11 fallback faster instead of letting each caller wait on a doomed connect.

4. **One alert for production.** Number + threshold + action: alert on **serverErrors per route ≥ 3 in a 5-minute window** (with `errorRatePercent` at ~0 for local routes, any 5xx at all is news; 3 means a real outage, not a blip). When it fires: page a human to fix the upstream/cause; meanwhile the Week 11 `/api/upcoming` fallback should already be serving the last-good cached partner data so users see stale-but-real data instead of 502s.
