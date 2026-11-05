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
