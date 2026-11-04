# Monitoring — what we decided to record, and what we predicted

Done as part of Week 12 (Parts A–E). The live API is at `http://localhost:5000/api` and logs every request to `server/requests.log`. See the `## Monitoring: request log and /stats` section of the README for a live example.

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

These are guesses. Part E of the handout asks us to compare them to the real numbers in `/stats` and the log, and to finish `MONITORING_NOTES.md` with: what we predicted vs. what the data actually shows, one real pattern stated with figures, a hypothesis for why it happens, and one production alert we would want. That comparison and pattern can only be written **after** traffic is run (Parts D–E), so this file is intentionally incomplete on that front until then.
