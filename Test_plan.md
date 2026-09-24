# Week 6 — Write Endpoint Test Plan & Contract Changes

Contract: `openapi_updated.yaml` v1.1.0 · Server: `http://localhost:4000/v1`

## 1. What Part A found

`POST /events/{id}/advertise` is the **only** non-GET endpoint in the contract.

- There is no PUT, PATCH or DELETE, so the handout's "same PUT twice" and "DELETE then re-GET" checks don't apply.
- The "404 on a nonexistent ID" check still applies, to the parent event.
- `info.description` mentions "plus club creation", but there is no `POST /clubs`. See open decision 2.

## 2. Validation checklist (Part B), run in this order

| # | Check | Rule | Fails with |
|---|---|---|---|
| 0 | Auth | Bearer token present and valid | 401 |
| 1 | Path id | Positive integer (`abc`, `205abc`, `0`, `-1` all rejected) | 400 |
| 2 | Required fields | `promotionalMessage`, `startDate`, `endDate` all present | 400 |
| 3 | Types | The three fields are strings; `targetAudience` / `advertisedBy` are strings if present | 400 |
| 4 | Usable values | Message has a non-whitespace character; dates are real RFC 3339 date-times; `endDate` strictly after `startDate` | 400 |
| 5 | Event exists | Lookup by id | 404 |
| 6 | Write | Insert the row, return it mapped to `Advertisement` | 201 |

Steps 1–5 all run **before** anything touches the database.

## 3. Status codes (Part C)

| Outcome | Code |
|---|---|
| Advertisement created | **201** (never 200) |
| Validation failed / bad path id / bad JSON | **400** |
| Missing or invalid token | **401** |
| Event doesn't exist | **404** |

## 4. How to run the tests (Part D)

**Swagger UI**

1. Click **Authorize** and paste a marketplace-customer JWT.
2. Open `POST /events/{id}/advertise`, click **Try it out**, set `id` to `205`.
3. In the request body, choose a case from the **Examples** dropdown. The expected status is in its label (`T05 · Expect 400 …`).
4. Execute and compare the status code. For 400/404/401 cases, also check the body is `{ "error": ..., "message": ... }`.

**Windows (PowerShell).** Use `curl.exe`, because plain `curl` is an alias for `Invoke-WebRequest`, and put bodies in files to dodge quoting problems:

```powershell
# body.json contains one of the examples from the contract
curl.exe -i -X POST "http://localhost:4000/v1/events/205/advertise" `
  -H "Authorization: Bearer $env:TOKEN" `
  -H "Content-Type: application/json" `
  --data "@body.json"
```

For path-id cases change `205` to `abc`, `205abc`, `0`, `-1` or `999999`. For auth cases drop the `Authorization` header or corrupt the token.

**Persistence check (MySQL, e.g. via XAMPP phpMyAdmin).** The contract has no GET for advertisements, so verify state changes in the database. Substitute your real table name:

```sql
SELECT COUNT(*) FROM <advertisements_table>;                 -- note before
-- run a request --
SELECT COUNT(*) FROM <advertisements_table>;                 -- 201: +1, everything else: unchanged
SELECT * FROM <advertisements_table> ORDER BY id DESC LIMIT 3; -- compare stored values to the request
```

## 5. Test matrix (full machine-readable list is `x-test-cases` in the YAML)

| IDs | Case | Expect | Then check |
|---|---|---|---|
| T01–T02 | Valid full / minimal request | 201 | Body has every required `Advertisement` field; `eventId` equals path id; T02 omits optional fields rather than returning `null`; row count +1 |
| T03 | Same valid request twice | 201, 201 | Two different `id`s, two rows (POST is not idempotent) |
| T04 | Body includes `id`, `status`, `eventId`, `createdAt` | 201 | Server values used, client values ignored |
| T05–T08 | Missing `promotionalMessage` / `startDate` / `endDate` / everything | 400 | Row count unchanged |
| T09–T10 | Empty string / whitespace-only message | 400 | Row count unchanged |
| T11–T12, T17 | Wrong types (number where string expected) | 400 | Row count unchanged |
| T13–T14 | `"next friday"` / `2026-02-30T00:00:00Z` | 400 | Row count unchanged |
| T15–T16 | `endDate` equal to / before `startDate` | 400 | Row count unchanged |
| T18–T19 | Malformed JSON / no body and no Content-Type | 400 | Response is JSON in the Error shape, not an HTML page and not a 500 |
| T20–T22 | Path id `abc`, `205abc`, `0`, `-1` | 400 | `205abc` is not silently treated as 205 |
| T23 | Nonexistent event `999999`, valid body | 404 | Row count unchanged |
| T24–T25 | No token / garbled token | 401 | Row count unchanged |
| T26–T27 | Priority: no token + bad body; bad body + nonexistent event | 401; 400 | Confirms order 401 → 400 → 404 |
| T28 | Non-admin marketplace customer | 201 | No 403 (contract says no club-admin role needed) |
| T29 | After all of T05–T27 | n/a | Row count equals the count from before T05 |

Traps in Node/Express that these cases catch:

- `parseInt("205abc")` is `205`, so T21 fails if you parse the path id that way. Use a regex like `/^[1-9]\d*$/` or `Number.isInteger(Number(id))`.
- `new Date("2026-02-30T00:00:00Z")` becomes 2 March instead of `Invalid Date`, so an `isNaN(new Date(x))` check alone won't catch T14. Round-trip the value (`d.toISOString()` must match the input's date) or use a date-validation library.
- `express.json()` answers malformed JSON with an HTML error page by default, so T18 needs an error-handling middleware that returns the Error shape.
- A missing `Content-Type` leaves `req.body` empty or undefined, and `req.body.promotionalMessage` can then throw a 500 (T19).
- MySQL `NULL` columns map to JSON `null`, which violates `type: string`, so omit optional fields that are empty (T02).
- MySQL columns are probably snake_case, so map to camelCase exactly as in Week 5 and don't leak extra columns.

## 6. Part E — entry to append to `CONTRACT_DEVIATIONS.md`

```markdown
## Week 6 — POST /events/{id}/advertise (contract v1.0.0 → v1.1.0)

| # | Change | Reason found |
|---|---|---|
| 1 | Path `id` now `minimum: 1`; invalid id returns 400 `invalid_parameter` | Bad-input testing (`abc`, `205abc`, `0`, `-1`) |
| 2 | `promotionalMessage` now `minLength: 1` and must contain a non-whitespace character | Empty / whitespace-only strings are present but not usable |
| 3 | Documented `endDate` must be strictly after `startDate` (already implied by the 400 example) | Equal dates must be rejected |
| 4 | 400 description broadened: wrong types, malformed JSON, bad path id. Named examples added | Contract only mentioned missing/malformed fields |
| 5 | Documented check order 401 → 400 → 404 | Needed for deterministic tests when several problems occur at once |
| 6 | `status` documented as server-derived; `id`/`eventId`/`status`/`createdAt` in request body ignored | Prevents clients writing server-controlled fields |
| 7 | Optional response fields omitted when not supplied, never `null` | Schema declares `type: string`, so `null` would violate it |
| 8 | Documented that POST is not idempotent (same request twice creates two ads) | Handout idempotency check |
| 9 | Added named request examples and `x-test-cases` (T01–T29) | Documents how each case is tested; no runtime effect |

Impact on Team 8: valid requests from before still succeed. Requests with whitespace-only messages or `id` values like `205abc` are now rejected with 400.
```

## 7. Open decisions

1. **No GET for advertisements.** Part D says to re-fetch with a GET, but the contract has none, so persistence is checked in SQL. Adding `GET /events/{id}/advertisements` would fix this, but it changes what Team 8 can rely on, so agree it with them first.
2. **"Club creation" in the API description.** `info.description` mentions it and no endpoint exists. Either add `POST /clubs` or delete the phrase. I left it untouched.
3. **Check order.** I put 400 before 404 to match the handout's "validate first" habit. If you'd rather return 404 first, flip T27 and the note in the contract.
4. **Past-dated ads.** The contract allows an `endDate` already in the past (status `expired`). If you want to reject that with 400, add a test case and a rule.
5. **`promotionalMessage` length.** Add a `maxLength` matching your MySQL column so an oversized string returns 400 and doesn't cause a 500 or get truncated.

## 8. Commit (from the handout)

```bash
git add . CONTRACT_DEVIATIONS.md
git commit -m "Week 6: write endpoints implemented with validation"
git push
```
