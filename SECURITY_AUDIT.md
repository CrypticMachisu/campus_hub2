# Week 9 — API Security Self-Audit

Date: 2026-10-26 · Branch: `test/week9-api-security`

Week 9 parts B–E added API key auth, rate limiting, and this audit. Part A's
planning is recorded here because everything below follows from it.

## Part A — Plan your keys

- **Consumers of this API:**
  - our **ring partner** (downstream consumer) → key 1
  - **our own team** (testing, and our browser front end) → key 2
- **One key per consumer, never a shared key** — so we can tell callers apart
  and revoke one without breaking the other.
- **Rule:** every endpoint requires a valid key in `X-API-Key`, with no
  exceptions for "harmless" GETs. One exception is kept and justified: the
  health check (`GET /api/health`). It returns only `{"ok":true}`, reveals no
  data, and lets uptime checks and partners confirm the API is alive without
  spending quota.
- **Keys live in `server/.env`** (the `API_KEYS` variable), which is in
  `.gitignore`. A committed key is a leaked key, so `server/.env.example`
  carries only placeholders. Keys are handed to consumers by direct message,
  never in the repo or a shared channel. Each key is generated with
  `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
  — 24 random bytes, 48 hex characters.
- **Verified:** `git log --all -- server/.env .env` returns nothing (the
  file was never tracked), and `git log --all -p -S<first six characters of
  each key>` returns nothing (no key appears in the history). Keys are also
  not in logs (only the _count_ is printed at startup) or in this document.

## Part B — API key authentication

`server/middleware/apiKey.js` + registration in `server/server.js`
**before** every router. The comparison against the configured keys is done
on SHA-256 digests with `crypto.timingSafeEqual`, so a caller can't probe
the key length/characters by timing. The presented key (`req.apiKey`) is
reused by the rate limiter to attribute requests per consumer.

Demonstration (no key, wrong key, valid key, plus a formerly-open URL):

```
$ curl -i http://localhost:5000/api/clubs
{"error":"Missing or invalid API key."}   HTTP 401
$ curl -i -H "X-API-Key: wrong" http://localhost:5000/api/clubs
{"error":"Missing or invalid API key."}   HTTP 401
$ curl -i -H "X-API-Key: <our-team-key>" http://localhost:5000/api/clubs
HTTP 200 (JSON club list)
$ curl -i -H "X-API-Key: <our-team-key>" http://localhost:5000/api/does-not-exist
{"error":"Not found."}   HTTP 404
```

401 vs 403: with a single access level we only use 401 ("I don't know who
you are"). 403 stays reserved for the existing per-user permission errors
("I know who you are, and you can't do that").

## Part C — Rate limiting

`server/middleware/rateLimit.js`: in-memory fixed-window limiter, keyed by
`req.apiKey` (falls back to `req.ip`). Registered after the key check and
before all routers. **Chosen threshold: 100 requests per key per 60
seconds** (`RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` in `server/.env`).

**Why 100:** comfortably above any legitimate consumer's polling loop
(even hitting `/clubs` once per second is only 60/min), but low enough that
a runaway client or a buggy loop can't hammer the DB back-to-back. The
429 carries a `Retry-After` header and a JSON body so a well-behaved
consumer knows exactly when to try again.

Demonstration (limit temporarily lowered to 3, exactly as the lab asks):

```
$ 1..5 | ForEach-Object { curl.exe -s -o NUL -w "%{http_code} " -H "X-API-Key: <our-team-key>" http://localhost:5000/api/clubs }
200 200 200 429 429
```

The 429 response itself (real headers and body):

```
HTTP/1.1 429 Too Many Requests
Retry-After: 60
Content-Type: application/json; charset=utf-8

{"error":"Too many requests.","retryAfter":60}
```

Honest limits (same as the handout's): the limiter lives in one server
process's memory — it resets on restart and doesn't coordinate across
several server copies. Fine for this course; production would use a shared
store such as Redis.

## Part D — what we checked, what we found

Checked every response the API can return, reading each as an attacker
would. "Nothing wrong" entries are recorded too, per the handout.

1. **Sensitive fields in responses — checked, nothing wrong.**
   No endpoint returns raw database rows; every handler maps rows through
   `rowMappers.js`. `rowToUser` deliberately excludes `password_hash` even
   though `SELECT u.*` fetches it (login compares the hash server-side and
   never returns it). Club/event/signup/comment/announcement mappers return
   only contract fields. No fix needed. The `category_id` assertion in
   `server/tests` confirms raw column names don't leak into responses.

2. **Other people's data via ID manipulation — checked, nothing wrong.**
   - There is no `GET /api/users/:id` or `GET /events/:id` at all; only
     list endpoints.
   - `GET /api/signups/mine` is scoped by the token's user id, not a URL
     parameter.
   - `GET /api/signups/event/:eventId` returns other people's names/emails
     but only to callers with admin access to that club (server-side
     `canManageClub` check against the DB, not client input).
   - `DELETE /api/signups/:id` rejects a signup that isn't the caller's.

3. **Error messages — fixed one leak.**
   - The centralized error handler returns
     `{"error":"Something went wrong on the server."}` — no stack traces,
     paths, queries, or table names in any response. Route-level errors are
     short human messages.
   - **Fixed:** unknown URLs used to return Express's default HTML 404
     page, which advertises the framework and doesn't fit our "all
     responses are JSON" contract. Now any unknown path answers
     `404 {"error":"Not found."}` (demonstration output above).

4. **Write endpoints / mass assignment — checked, nothing wrong.**
   Every write handler inserts/updates an explicit column list built from
   explicit variables; nothing spreads `req.body` into a query. Extra
   fields (e.g. `isAdmin`, `role`, `id`) in a request body are simply
   ignored: `role` is never taken from input (assign roles by hand in the
   DB), `user_id` is always the token's `sub`, and event/club ids are
   server-generated (`custom-*`/`club-*` timestamps, not client-supplied).

5. **Keys in the wrong place — checked, nothing wrong.**
   - No key in the repo: `.env` is git-ignored (verified `git status`
     doesn't list it), README/docs use `<your-api-key>` placeholders only.
   - Partner integration (`server/routes/partner.js`) sends
     `PARTNER_API_KEY` in a header and logs only statuses/codes, never the
     key. The commented-out "RAW partner response" debug lines are either
     removed or clearly marked to delete before commit.
   - Startup logs print **how many** keys are loaded and a warning when
     that's zero — never the values.
   - Known, accepted: `POST /auth/forgot-password` prints the reset link
     (with its one-time token) to the **server console** because there is
     no email service yet. It's documented in the OpenAPI spec, doesn't
     reach any HTTP response, and expires in 1 hour. The docs' reset flow
     relies on it.

6. **Admin dashboard (`GET /api/admin`) — checked, one accepted risk.**
   - Requires a valid API key **and** a tier1 login (`requireAuth` +
     `requireTier1`). A test confirms a valid key alone gets 401, and a
     non-admin account gets 403.
   - It returns, per consumer, a hashed `keyId`, request counts, and the
     last-seen IP address. IP addresses are personal data, so they are
     visible to tier1 admins only.
   - **Accepted risk:** the response also includes `maskedKey`, the first 3
     and last 4 characters of each key (7 of 48). This is shown to tier1
     admins only and does not allow reconstructing a key, but it is more
     than strictly needed; `keyId` alone would identify a consumer.
   - Behind a proxy such as ngrok, `req.ip` shows the proxy's address
     unless `trust proxy` is configured, so `lastIp` is not reliable for
     tunnelled traffic.

7. **The frontend key is visible in the browser — accepted limitation.**
   Our React app sends its key from `VITE_API_KEY`, which Vite bundles into
   the JavaScript the browser downloads, so anyone using the site can read
   it. The key identifies our app and enables per-consumer rate limiting; it
   is not a secret. User-level protection comes from the login token (JWT)
   required on writes and private reads. The frontend key is separate from
   the partner's, so it can be revoked without breaking the partner.

8. **Shared rate-limit bucket for the frontend — noted.**
   All browser users share the frontend's single key, and so one
   100-per-minute bucket. Heavy simultaneous use could briefly lock
   everyone out. For this course the limit stays at 100; a production fix
   would be a higher limit for the frontend key or per-user limits.

9. **CORS — noted.** `cors()` is configured with no restrictions, so any
   origin can call the API from a browser. API keys and tokens, not the
   origin, are what protect the data. A production deployment would restrict
   CORS to the frontend's own origin.

## Part E checklist

- [x] Every endpoint requires a valid API key; no key / wrong key → 401
- [x] Separate key per consumer, stored outside source code, `.env` not committed
- [x] Rate limiting works — real 429 demonstrated (`200 200 200 429 429`)
- [x] 429 includes `Retry-After` header and a JSON body
- [x] README.md and openapi.yaml describe the real auth + limit, no real key shown
- [x] This audit documents what was checked, found, and fixed
- [x] New tests cover the 401 and 200 cases (+ wrong-key 401, exempt health
      check, the 429+Retry-After burst, and the `/admin` checks); `npm test`
      passes — 8/8
- [x] Commit and push