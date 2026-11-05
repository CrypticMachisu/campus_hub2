# Week 11 — Resilience Lab Notes

Feature under test: our integration with Team 6's AgroConnect API, called from our own
server (`server/routes/partner.js`) so the browser never sees their key, and shown on
the "Farmers on AgroConnect" directory and the "Fresh from AgroConnect" produce panels.

## Part A: Reproducing Partner Failures ("before" pictures)

Stand-in partner: `server/flaky-partner.js`, extended to Team 6's real contract shapes
and to the handout's no-restart mode switch: `curl http://localhost:4000/__mode/slow`
(`flaky`, `error`, `ok`).

| Mode  | Expected Behaviour                      | Actual Result                                    |
| ----- | --------------------------------------- | ------------------------------------------------ |
| OK    | Partner responds normally               | Successful response received                     |
| Slow  | Partner takes 10 seconds                | Request took 10.024 seconds                      |
| Flaky | First two requests fail, third succeeds | Two 503 errors followed by a successful response |
| Error | Partner returns a server error          | Received 500 Internal Server Error               |

With the Week 10 code (plain `fetch`, no timeout, no retry, no saved copy), these all hit
the user directly — see "What a real user experiences without this code" below.

### Observations

The normal partner request returned data successfully.

The slow partner took approximately 10 seconds to respond, which could make users wait unnecessarily.

The flaky partner returned two 503 Service Unavailable errors before recovering on the third request.

The error mode consistently returned a 500 Internal Server Error.

### User Impact

Without resilience mechanisms, users may experience long waiting times, failed requests, and unavailable partner data. Temporary partner failures can interrupt access to important information. Users may become frustrated if the application does not respond promptly. A reliable application should handle these failures gracefully.

## Parts B–D: what we built, and the numbers behind it

All three live in one place: `server/resilientFetch.js` (timeout + retries) and the
`serveWithFallback` layer in `server/routes/partner.js` (saved-data fallback).

### Our numbers, and why

- **Measured normal:** one `GET /farmers` through our server in **ok** mode took **0.22 s**
  (partner hop included; first, cold call: 0.218 s). Stand-in in slow mode, with the old
  Week 10 code: the page waited the full **10.0 s**. Against the real partner, the first
  failing call during the Week 12 monitoring runs hung **23.8 s** before 502.
- **Timeout = 1500 ms.** It is ~5x longer than a normal response (0.2 s, so room for a bad
  moment) and far shorter than the 10 s the partner makes us wait in slow mode, or the
  23.8 s the real partner once burned. A user should never be held hostage by our partner.
- **Retries = 2, GETs only.** Writes (POST `/orders`, and the `/auth/login` POST) are never
  retried — a retried WRITE could place the partner's order twice (Week 3 idempotency).
- **Delay = 200 ms doubling → 400 ms.** Never a tight loop; a struggling partner is not
  asked again at the same speed that is hurting it.
- **429 is special:** we wait the partner's `Retry-After` (capped at 5 s) instead of our own delay.
- **4xx are never retried:** Resending a 401/403 (wrong/missing key) or a 404 (no such id)
  changes nothing — the request is identical, so it returns immediately. Proved live: a
  nonexistent farmer id came back in **0.011 s** with exactly ONE partner hit.
- **Worst-case wait for a user, GET:** `(retries + 1) × timeout + delays` =
  `3 × 1500 + 200 + 400` = **5100 ms**. Measured, slow mode: **5.19 s** — matches the math.
  Acceptable for a panel that loads alongside the rest of the page; the rest of CampusHub
  is local MySQL and unaffected.

### What the user sees now (tested live, mode by mode)

Response contract changed from a bare array to `{ data, stale, asOf }`, and the React
components (`PartnerFarmers.jsx`, `PartnerProduce.jsx`) render a **visible banner** when
`stale` is true: "Showing saved data from {time}. The partner is not responding." A
fallback the user can't tell from live data would be a lie — the banner is the feature.

| Failure                          | What the user saw                                                                                                     | What our log said                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Partner stopped (`ECONNREFUSED`) | The last saved directory with the saved-data banner (fast, ~0.6 s), or "Partner data unavailable" if nothing is saved | `partner call failed: ECONNREFUSED`, plus the `stale: serving saved copy` line or a 502 line              |
| Partner slow (10 s)              | Saved data with the banner after ~5.1 s — not a 10 s freeze                                                           | 2x `retrying` warnings, then `partner call failed: timeout`                                               |
| Partner flaky (2 of 3 fail)      | **No failure at all** — the page succeeded in ~0.67 s                                                                 | Exactly 2 `retrying` lines; the partner log shows attempt 3 succeeded                                     |
| Partner always 500               | Saved data with the banner (~0.63 s)                                                                                  | `attempt 1 failed… 200 ms`, `attempt 2… 400 ms`, then `partner returned 500` — exactly 2 retries, no loop |
| Partner 404 (unknown farmer id)  | Clean `{"error":"Farmer not found."}` in ~0.01 s                                                                      | No retries — one partner hit for a 404                                                                    |
| Partner rejects our key (401)    | Friendly 502 (or stale data)                                                                                          | `partner rejected our API key (401) — check PARTNER_API_KEY`, key itself never printed                    |

### Proofs from the live run (Nov 5, 2026)

- **ok:** `{"data":[...],"stale":false,"asOf":"…"}` in 0.22 s, ONE partner call.
- **flaky:** user got fresh 200 with `stale:false`; terminal showed exactly two
  `partner attempt N failed, retrying in …` lines.
- **error:** exactly two retries, then `{"data":[...],"stale":true,"asOf":"…"}` (saved
  data), no crash, no loop.
- **slow:** saved data banner after a measured **5.19 s**; each attempt was cut at 1.5 s
  (`timeout` in the log) instead of waiting the partner's 10 s.
- **partner stopped:** again saved data, this time after **0.63 s** (`ECONNREFUSED` fails
  instantly, so only the delays remain).
- **server restarted while partner still down:** the saved copy is in memory only, so a
  fresh process had nothing and answered **502 `{"error":"Partner data unavailable"}`**
  after ~0.73 s — friendly, no crash, no spinner. When the stand-in came back on
  `__mode/ok`, the same unchanged page returned live data (`stale:false`) with **no code
  change**. `grep` for our real API key over the whole log prints **0** — failures are
  logged with reasons, never the key.

## What a real user experiences WITHOUT this code

Someone opens the CampusHub page with the "Farmers on AgroConnect" directory or the
"Fresh produce" panel. With the partner slow, the panel sits on its loading skeletons for
10+ seconds — against the real partner we measured a 23.8 s hang on a bad moment — and a
user has long since scrolled past or closed the tab. With the partner flaky, two reloads
out of three show "Partner data is unavailable right now." with no hint that one second
later it would have worked. With the partner down, every visitor gets the same error until
the partner heals itself. The user's only "next step" is F5 and hope.

## What we did NOT build

A circuit breaker: a switch that stops calling a partner that has been failing for a
while, and politely tests it occasionally — ours still tries every request up to three
times, so a partner that is down for a whole lecture gets hammered once per page view,
and the worst-case 5.1 s wait happens for every single caller until it recovers.

## The real-partner drill (Part E)

`PARTNER_URL` in `server/.env` points at Team 6's live API
(`https://farmers-agroconnect.onrender.com/api`) — it was changed to the stand-in only
inside our test process (an env override), never in `.env`, so the real partner "went back
in" by construction. Their API currently answers **401 to our key** (a key their team has
not yet issued/reactivated); our code logs `partner rejected our API key (401)` and serves
the friendly message or saved copy — the same paths this lab proves with the stand-in.
The stop/restart drill with them (their server off → banner appears within 5.1 s; their
server back → live data, no code change) is ready to run in one agreed window and needs
zero code changes — the stand-in run above is the same drill, byte for byte.
