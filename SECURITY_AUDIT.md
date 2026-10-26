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
  exceptions for "harmless" GETs. One exception is kept and justified: see
  the health check below.
- **Keys live in `server/.env`** (the `API_KEYS` variable), which is in
  `.gitignore` and has never been committed. A committed key is a leaked key.
  `server/.env.example` carries only placeholders. Keys are handed to
  consumers by direct message, sorted. Each key is generated as
  `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
  — 24 random bytes, 48 hex chars.
- Neither key appears anywhere in the repo history (checked with `git log -p`
  for `git grep` on the key values), in logs (only the *count* is logged at
  startup), or in this document.

## Part B — API key authentication

`server/middleware/apiKey.js` + registration in `server/server.js`
**before** every router. The comparison against the configured keys is done
on SHA-256 digests with `crypto.timingSafeEqual`, so a caller can't probe
the key length/characters by timing. The presented key (`req.apiKey`) is
reused by the rate limiter to attribute requests per consumer.

Demonstration (server on :5050 — no key, wrong key, valid key, plus a
formerly-open URL):

```
$ curl -i http://localhost:5050/api/clubs
{"error":"Missing or invalid API key."}   HTTP 401
$ curl -i -H "X-API-Key: wrong" http://localhost:5050/api/clubs
{"error":"Missing or invalid API key."}   HTTP 401
$ curl -i -H "X-API-Key: <our-team-key>" http://localhost:5050/api/clubs
HTTP 200 (JSON club list)
$ curl -i -H "X-API-Key: <our-team-key>" http://localhost:5050/api/does-not-exist
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
$ for i in 1 2 3 4 5; do
    curl -s -o /dev/null -w "%{http_code} " -H "X-API-Key: <our-team-key>" \
      http://localhost:5051/api/clubs
  done
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

1. **Sensitive fields in responses — checked, fixed nothing needed.**
   No endpoint returns raw database rows; every handler maps rows through
   `rowMappers.js`. `rowToUser` deliberately excludes `password_hash` even
   though `SELECT u.*` fetches it (login compares the hash server-side and
   never returns it). Club/event/signup/comment/announcement mappers return
   only contract fields. Fix applied under "Errors" (+ category_id etc. can
   be verified with the mapper tests in `server/tests`).

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
   - The centralized error handler returns `{"error":"Something went wrong
     on the server."}` — no stack traces, paths, queries, or table names in
     any response. Route-level errors are short human messages.
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

## Part E checklist

- [x] Every endpoint requires a valid API key; no key / wrong key → 401
- [x] Separate key per consumer, stored outside source code, `.env` not committed
- [x] Rate limiting works — real 429 demonstrated (`200 200 200 429 429`)
- [x] 429 includes `Retry-After` header and a JSON body
- [x] README.md and openapi.yaml describe the real auth + limit, no real key shown
- [x] This audit documents what was checked, found, and fixed
- [x] New tests cover the 401 and 200 cases (+ wrong-key 401, exempt health
      check, and the 429+Retry-After burst); `npm test` passes — 5/5
- [ ] Commit and push (on approval — this branch is not merged into main yet)
