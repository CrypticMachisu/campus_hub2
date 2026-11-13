# Cross-team retrospective — CampusHub in the ring

**Scope:** Team 6 (AgroConnect, our upstream provider), Team 7 (CampusHub, us), Team 8
(our downstream consumer). This covers the cross-team failures that actually broke a call,
the contract defects we found before they became outages, and the design changes that would
have prevented both.

**Sources:** [INTEGRATION_LOG.md](INTEGRATION_LOG.md), [RING_BULLETIN.md](RING_BULLETIN.md),
[RESILIENCE_NOTES.md](RESILIENCE_NOTES.md), [MONITORING_NOTES.md](MONITORING_NOTES.md),
[VERSIONING_NOTES.md](VERSIONING_NOTES.md), [CONTRACT_QUESTIONS.md](CONTRACT_QUESTIONS.md),
[DEPRECATION_NOTICE.md](DEPRECATION_NOTICE.md), [SECURITY_AUDIT.md](SECURITY_AUDIT.md), and
the live hand-off work recorded in the repository history.

**Reading note:** "Error" below means a real symptom a team saw, not a hypothetical. Where a
fix was only a workaround, it says so. `CONTRACT_DEVIATIONS.md` records a separate Week 6
advertisements exercise that never shipped in this app; it is not counted as a CampusHub
cross-team incident.

---

## 1. Incident register

| #   | Boundary            | What happened                                                                                                                                                                                                              | Root cause                                                                                                      | Immediate fix                                                                                                                                        | Status / residual                                                                                                                           |
| --- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Team 6 → us         | Their `/farmers` and `/produce` reads changed from public to `X-API-Key` without a notice. Our proxy saw `401`, returned `502`, and the page showed saved data.                                                            | No change notice, no test key, no versioned contract.                                                           | Team 6 issued a partner key; we set `PARTNER_API_KEY`, re-tested live on 2026-11-09, and got `200` with `stale: false`.                              | Resolved, but our public response still flattens upstream auth failure into a generic `502`.                                                |
| 2   | Team 6 → us         | First call after Render Free idle took ~1 minute. Through our proxy it hung for 23.8 s, then returned `502` after three 1.5 s attempts. Warm calls were ~0.3 s.                                                            | Free-host cold start plus a timeout budget that is shorter than the cold start.                                 | Timeout/retry/fallback added; demo panels are warmed before presenting.                                                                              | Workaround only. The first user after idle can still get `502`; no circuit breaker or background warm-up.                                   |
| 3   | Team 6 → docs       | Their README said single-listing detail was PROPOSED and returned `404`, but `GET /produce/1` actually returned `200` with a `listing`.                                                                                    | Documentation was not generated from or tested against the running contract.                                    | We tested the route and recorded the discrepancy; integration uses the observed behaviour.                                                           | Partner docs still inconsistent; no code change on our side.                                                                                |
| 4   | Team 6 → us         | No v2 and no named change channel; `/api/v2/farmers` answers `401` before routing, so we could not even discover whether v2 existed. A deprecation notice did arrive on 12 November, but for product reads we do not call. | No versioning policy and no notice path.                                                                        | We asked for their versioning plan, then asked in writing which routes their notice covered; they confirmed `/produce` and `/farmers` are unchanged. | Partly resolved. Scope confirmed, no migration needed; still no deployed v2, test key, sunset status/body, or agreed date. Adapter unbuilt. |
| 5   | Us → Team 8         | Team 8's first calls produced `401`s in our log. Our hand-off README was written for local use and did not make the key/ngrok headers obvious.                                                                             | Internal docs were treated as consumer docs.                                                                    | Published a consumer-facing README and told them to send `X-API-Key` and `ngrok-skip-browser-warning: true`.                                         | Resolved for the calls we observed; no formal acknowledgement from Team 8.                                                                  |
| 6   | Us → Team 8         | Every public `/api/...` call returned plain-text `404 page not found` with `Ngrok-Agent-Ips`, even with a correct key.                                                                                                     | ngrok was forwarding to `localhost:4040` (its inspector), not the API on `5000`. Express never saw the request. | Restarted the tunnel against `5000`; verified `/api/health`, `/api/v2/events`, `/api/clubs`; added `npm run check:tunnel` and runbook warnings.      | Resolved. The check now fails on this exact failure mode.                                                                                   |
| 7   | Us → Team 8         | Consumers sometimes received ngrok's HTML browser-warning page instead of JSON.                                                                                                                                            | ngrok's interstitial intercepts requests without its skip header.                                               | Told consumers to send `ngrok-skip-browser-warning: true`; our frontend already does.                                                                | Workaround. A stable reverse proxy without an interstitial is the real fix.                                                                 |
| 8   | API semantics       | An unknown API path returned `401` because auth ran before routing. A consumer with a correct key could not tell "wrong URL" from "wrong key".                                                                             | Global auth middleware was mounted before route matching.                                                       | Moved guards per route via `createApiRouter`; unknown paths now return JSON `404 {"error":"Not found."}`.                                            | Resolved and tested.                                                                                                                        |
| 9   | API semantics       | Express returned HTML for unknown paths and malformed JSON, and could return a `500` where a `400` was correct.                                                                                                            | Framework defaults leaked through; no JSON error middleware.                                                    | Added JSON 404, JSON `400` for `entity.parse.failed`, and a JSON `500` handler.                                                                      | Resolved.                                                                                                                                   |
| 10  | Us → our frontend   | After v2 replaced `date` + `time` with `startTime`, every event sorted as oldest and looked past. `new Date(undefined + "T" + undefined)` silently became `0`.                                                             | Transport shape and UI shape were coupled in five pages; no single mapping boundary.                            | Moved the frontend to `/api/v2`; added `toUiEvent()` to map `startTime` back to `date` + `time` once.                                                | Resolved for our frontend. Team 8's migration is still unconfirmed.                                                                         |
| 11  | Deployment boundary | CORS was effectively open and one origin was added twice, producing duplicate `Access-Control-Allow-Origin` headers for that origin.                                                                                       | Two CORS middlewares, one unconditional and one hardcoded.                                                      | Replaced both with `CORS_ORIGINS` from the environment.                                                                                              | Resolved.                                                                                                                                   |
| 12  | Reliability         | Upstream `401/403/429/5xx` all became our `502 Partner data unavailable`; the cause was only in our terminal. The stale fallback could also hide a broken migration.                                                       | One generic proxy error, no machine-readable cause, fallback without a freshness alert.                         | Added explicit partner logs (`401`, `429`, timeout, shape mismatch) and a visible `stale` banner with `asOf`.                                        | Partially resolved. Responses still lack an upstream error code, and there is no alert on stale ratio.                                      |

### The two failures worth remembering

**Team 6's keyed-reads change was the classic silent breaking change.** The contract said
public; the running service said `401`. Our adapter turned that into `502`, and our fallback
turned it into a page that looked alive. The user saw saved data, not an error. The only
reason we found it quickly was the log line `partner rejected our API key (401)`. The fix was
a key, but the real lesson is that a fallback which hides a broken integration is a liability
unless it is paired with an alert and a visible freshness label.

**The ngrok `404` was an ingress failure, not an API failure.** The public URL was correct,
the key was correct, and the path was correct. ngrok had been started against its own
inspector on port `4040`, so it answered every request itself with `404 page not found` and
never forwarded it to Express. That is why a producer could not fix it by changing their
code. The durable fixes were a pinned target (`addr: 5000`), a check that fails on the
plain-text 404, and documentation that says explicitly: port `4040` is the inspector, never
the API.

---

## 2. Contract defects found before they became outages

These are cross-team design errors even though they did not all produce a broken call. They
forced us to guess, filter, or build around the contract.

| Defect                                                                                                      | Why it matters to a consumer                                                                          | What we did                                                                                                         |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `CreateProductRequest` uses `quantity`; the returned `Product` calls the same value `stock`.                | A write/read pair uses different names for the same field, so every consumer needs a private mapping. | Raised in `CONTRACT_QUESTIONS.md`; integration forwards their field names rather than inventing a translation.      |
| Four endpoints CampusHub needed were marked `[PROPOSED]` with no date or status.                            | Consumers cannot tell what is safe to build against.                                                  | Raised the status/timeline question; did not build against proposed paths.                                          |
| No conventional `GET /products/{id}` or `GET /produce/{id}` in the contract, only a separate "detail" path. | Standard REST clients expect single-item reads; the alternative fragments the contract.               | Raised it; our integration uses the routes that actually exist.                                                     |
| Timestamps were plain strings like `'2026-08-24 17:30:00'`, not RFC 3339.                                   | Timezone ambiguity and inconsistent parsing across consumers.                                         | Raised it; our own v2 moved to one ISO timestamp with an explicit offset.                                           |
| `GET /farmers` had no pagination or filtering, unlike produce/products.                                     | The directory becomes expensive and unusable as it grows.                                             | Raised it; our UI does not assume it can page.                                                                      |
| `id` is reused across produce and products; orders need a separate `type` to disambiguate.                  | A wrong `type` can silently reference the wrong catalog item.                                         | Raised namespaced IDs as an option; our order proxy sends the explicit type.                                        |
| A proposed farm-location endpoint was public and returned precise location plus a personal contact number.  | Security and privacy risk, not just a contract preference.                                            | Raised it in the contract questions; did not build a public location feature.                                       |
| Errors are `{ message, fields? }` with no machine-readable code.                                            | Consumers must parse prose to distinguish auth, validation, missing resource, and rate limit.         | Our proxy logs the upstream status; our own API uses a consistent `{ error }` body, though not yet a full code set. |
| No notice channel, no deprecation headers, no versioned path.                                               | A breaking change can only be discovered by a failed call.                                            | Escalated in the ring bulletin; we built versioning for our own consumers instead of repeating the pattern.         |

The important distinction: these were not all Team 6's "bugs". Several were reasonable
student-project shortcuts. The failure was that the ring had no mechanism to turn an
ambiguity into an agreed contract before code depended on it.

---

## 3. Other issues that amplified the cross-team failures

These were internal or operational, but they changed how badly a boundary failure landed.

- **The frontend API key is bundled into the browser.** `VITE_API_KEY` is visible to anyone
  who opens DevTools. It identifies the app and supports rate limiting, but it is not a
  secret. All browser users also share one 100-request/60-second bucket. A BFF or
  per-session token would remove both problems.
- **Rate-limit counters, `/stats`, and the partner cache are in memory.** A restart clears
  them, so consumer attribution and stale data disappear exactly when an incident is being
  investigated.
- **The first public README was local-oriented.** It assumed `localhost`, did not lead with
  the key header, and did not mention ngrok's warning header. Team 8's first calls exposed
  that.
- **The demo database contained route-test artifacts and aged seed dates.** That made real
  screens look empty or wrong, and it made the partner/demo story depend on when the seed
  was last run.
- **`PORT=0` could be inherited from the parent shell**, so the API bound a random port while
  the tunnel pointed at `5000`. The docs originally blamed `.env`; the corrected explanation
  is an inherited environment variable that dotenv does not override.
- **The migration state was not baselined** on the machine that imported
  `campushub_database.sql`, so `migrate:status` reported `0 applied, 9 pending`. Running the
  migrator on that database would have tried to create existing tables.
- **`run.sh` overwrote the request log on every start.** That destroyed the evidence needed
  to debug the previous run; it now appends.

---

## 4. The pattern behind the incidents

1. **Contracts were discovered at runtime, not agreed before code.** Team 6's auth change and
   docs contradiction, and our own v1 date/time shape, all forced consumers to reverse-engineer
   behaviour.
2. **There was no change-control path.** A named person, a message, a test key, and an
   acknowledgement were missing on both sides of the ring. A notice in a repository is not a
   notice if the consumer does not read that repository.
3. **Public ingress was treated as a development convenience.** Free ngrok gave us a rotating
   URL, an interstitial, and an inspector on `4040` that looked like an API endpoint. It was
   never a stable part of the architecture.
4. **Auth and routing were coupled.** A global key check made unknown paths look like auth
   failures, which sent consumers debugging the wrong thing.
5. **Fallbacks hid failures.** The stale-data banner was honest to the user, but the system
   had no alert on "we have been stale for an hour" or "the partner is rejecting our key".
6. **Time was modelled as local strings.** `date` plus `time` with no offset created a real
   day-early bug and forced every consumer to join two fields before sorting.
7. **Versioning arrived after the first consumer.** It worked because v1 stayed mounted, but
   the safer design is to ship `/v1` from day one and treat every shape as frozen.
8. **The same key served all browser users.** That is acceptable for a course demo, but it
   makes per-consumer quotas, revocation, and abuse response impossible.

---

## 5. How I would design the app from the beginning

### 5.1 Contract first, and executable

- Author `openapi.yaml` before the routes. Make it the source of truth for paths, schemas,
  examples, status codes, auth, and deprecation.
- Generate the TypeScript/JavaScript client and runtime validators from it. A consumer should
  not hand-write a second copy of the contract.
- Put contract tests in CI: every documented example must validate against the running app,
  and every response must match its schema. A docs contradiction should fail the build, not
  wait for a consumer to find it.
- Define one error envelope from day one:
  `{ "error": { "code": "EVENT_NOT_FOUND", "message": "...", "details": {}, "requestId": "..." } }`.
  Status codes alone are not enough; consumers need stable codes.
- Version the path from the first release: `/api/v1/...`. Additive changes stay in v1;
  breaking changes get `/api/v2` with a sunset date, deprecation headers, and a migration
  guide. Keep the old version mounted until the date, including the unversioned alias.

### 5.2 Model time and identity once

- Store timestamps in UTC. Return RFC 3339 with an explicit offset (`Z` is fine). Convert to
  `Africa/Nairobi` only at the presentation edge.
- Use one `startTime` field, not `date` + `time`. If a UI needs a date and a clock, split it
  in one mapper, not in five pages.
- Use opaque, namespaced IDs (`evt_...`, `club_...`, `usr_...`, `prd_...`). Do not reuse an ID
  across resource types. Do not expose sequential database IDs.
- Design list endpoints with cursor pagination and filters from day one:
  `?limit=50&cursor=...`, plus a `nextCursor` in the response. Retrofitting pagination is a
  breaking change.
- Use idempotency keys for writes that can be retried. A retried POST must not create a
  duplicate order or event.

### 5.3 Separate the browser from the API

The cleanest version is a small backend-for-frontend (BFF):

```text
Browser -> CampusHub BFF (session cookie, CSRF, API key, caching)
             -> CampusHub API
                  -> PartnerAdapter -> Team 6

Team 8 -> API gateway / stable ingress -> CampusHub API
```

- The BFF holds the API key and the partner key; the browser never sees either.
- The BFF sets an `HttpOnly`, `Secure`, `SameSite` session cookie. No long-lived token in
  `localStorage`.
- The API uses machine credentials (`Authorization: Bearer ...` or a dedicated
  `X-API-Key`) with scopes. User JWTs are a separate concern.
- If a BFF is too much for the course, at minimum treat the frontend key as public, give it
  its own higher quota, and never reuse the partner key there. The current design already
  keeps the partner key server-side; keep that property.

### 5.4 Give the partner boundary a real adapter

Do not call `fetch` from a route and hope the shape is right. Build one adapter per upstream
version:

- `PartnerClient` interface with `getFarmers()`, `getProduce()`, `getFarmer(id)`.
- Runtime schema validation at the boundary. A shape mismatch is a typed error, not a
  `res.json` surprise.
- A versioned adapter selected by `PARTNER_VERSION`, so switching from v1 to v2 is one
  environment change and one test, not a rewrite.
- Error taxonomy that preserves cause: `UPSTREAM_AUTH`, `UPSTREAM_RATE_LIMIT`,
  `UPSTREAM_TIMEOUT`, `UPSTREAM_BAD_SHAPE`, `UPSTREAM_UNAVAILABLE`. Map those to our public
  `502/503` with a code and a request ID, and alert on them.
- Timeout, retry, jitter, and circuit breaker in one place. Retry only idempotent calls.
  Honour `Retry-After`. Do not retry `401/403/404`.
- Persistent last-known-good cache with `asOf` and a TTL, not an in-memory object that dies
  on restart. Serve stale only with a visible label and a metric.
- A synthetic canary that calls the partner on a schedule and records latency, status, and
  shape. It should catch a cold start or a keyed-read change before a user does.
- Contract tests against recorded fixtures and, when available, a partner sandbox/test key.
  Keep one test that asserts the exact field names and envelopes we depend on.

### 5.5 Make ingress boring and stable

- Use a named tunnel or reverse proxy with a stable hostname (Cloudflare Tunnel, nginx, or a
  small always-on VM). Do not make a free ngrok URL part of the public contract.
- Terminate TLS at the ingress. Put the API behind `/api`; never expose an inspector or admin
  UI on the same host.
- Expose `/api/health` for liveness and `/api/ready` for "database and partner config are
  usable". Health must not require a key; readiness can be richer.
- Run a public smoke test in CI and before every demo: `GET /api/health` must return
  `{"ok":true}`, a keyed read must return `200`, and an unknown path must return JSON `404`.
  This is the check that would have caught the `4040` tunnel immediately.
- Keep local, staging, and demo environments separate. Staging should be always-on, with a
  test key and a seeded database, so the first real integration call is not also the first
  time the public URL is tested.

### 5.6 Observe the boundary, not just the process

Every log line and metric should answer: who called, which version, which upstream, and what
happened.

- Structured fields: `requestId`, `consumerId` (hashed key label), `route`, `method`,
  `status`, `durationMs`, `apiVersion`, `upstreamStatus`, `cacheStatus`, `stale`.
- Metrics per consumer and per route, not only totals. The `/stats` endpoint already shows
  the idea; move it to a real metrics store.
- Alerts with numbers and actions:
  - upstream `401/403` for 2 consecutive checks -> "partner key or contract changed";
  - `5xx` rate above 1% for 5 minutes -> page the on-call;
  - stale ratio above 10% for 15 minutes -> partner degradation;
  - p95 latency above 2 s for 10 minutes -> dependency or DB;
  - public health check failing twice -> ingress or process down.
- Keep a request ID in every error body and every log line. A consumer should be able to send
  you one string and have you find the exact call.

### 5.7 Test the contract, not just the code

- Unit tests for mappers and error taxonomy.
- Contract tests generated from OpenAPI: request/response schemas, status codes, headers.
- Consumer-driven contract tests with Team 8: they publish the fields they read; we run their
  contract in our CI. This catches a v2 break before their code does.
- Failure injection for the partner: slow, flaky, `401`, `429`, `500`, malformed body, empty
  list, cold start. The existing `flaky-partner.js` is the right instinct; make it a
  permanent test fixture.
- Public smoke test through the real ingress, not `localhost`. This is a different failure
  domain and needs its own check.
- Migration tests against a throwaway database, plus a seed that is idempotent and uses dates
  relative to the run.
- One browser test for the critical path: login, RSVP, waitlist, cancel, error state. Keep it
  small and stable.

### 5.8 Run the ring as a product, not a series of favours

- Name one liaison per team and one change channel that is actually read. A repository file
  is a record, not a notification.
- Use a one-page change notice template: what changes, why, before/after example, affected
  fields, test key, sandbox URL, sunset date, rollback plan, and a one-line acknowledgement.
- Give at least two weeks' notice for a breaking change, and keep the old path alive through
  the agreed date. Put the sunset in response headers and in the docs.
- Hold a 15-minute weekly contract sync: diff the OpenAPI, confirm who is on which version,
  and run the joint smoke test. Record the result in `INTEGRATION_LOG.md`.
- Do a joint failure drill before Demo Day: partner off, partner slow, wrong key, tunnel down.
  Each team should know what the other will see and who acts.
- Treat "no reply" as "not migrated". A notice without an acknowledgement is not a completed
  hand-off.

### 5.9 Documentation that a consumer can use without asking

- One generated reference, one quickstart, one changelog, one error catalog.
- Put the live base URL, auth header, rate limit, version, and sunset at the top. Do not make
  a consumer read the repository to find the date.
- Show copy-paste examples for `curl` and for the language the consumer actually uses.
- State what is **not** changing. That list is often more useful than the change itself.
- Include the failure signatures: plain-text ngrok 404 vs JSON 404 vs 401 vs 429. The
  [PRODUCER_INTEGRATION.md](PRODUCER_INTEGRATION.md) note is the model.
- Keep the docs in CI: broken links, stale examples, and schema drift should fail the build.

### 5.10 Operate the demo like production

- Stable URL, warm partner, pre-seeded data, and a preflight script that checks health, keyed
  read, v2 read, unknown-path JSON 404, and the tunnel target.
- Do not run a migration or a version cutover during the demo window.
- Keep a rollback: v1 mounted, previous build tagged, partner stand-in ready.
- Seed relative dates and clean test artifacts; make the seed idempotent.
- Keep one person typing, one terminal, and a printed fallback command sheet.

---

## 6. If we could only change five things

1. **Stable ingress plus a public smoke test.** This alone would have prevented the `4040`
   incident and the browser-warning confusion.
2. **Contract-first with generated clients and contract tests.** This would have caught the
   `quantity`/`stock`, proposed-endpoint, and date/time ambiguities before code depended on
   them.
3. **UTC timestamps and namespaced IDs from day one.** This removes the day-early bug, the
   five-page mapper, and the cross-catalog ID ambiguity.
4. **A real partner adapter with an error taxonomy, circuit breaker, and persistent cache.**
   This turns a silent `401 -> 502 -> stale` into an actionable alert without hiding data.
5. **A ring change protocol with a named channel and acknowledgement.** This is the cheapest
   fix and the one that addresses the root cause of the worst incident.

---

## 7. What we got right

- **v1 stayed mounted at the old unversioned URLs.** Team 8's existing calls did not break
  when v2 shipped.
- **v2 is a mapper over v1's handlers**, so validation, permissions, and status codes cannot
  drift between versions.
- **Guards are per route**, so an unknown path is a JSON `404`, not a fake `401`.
- **The stale banner is visible and carries `asOf`.** A fallback is not passed off as live
  data.
- **The partner key stays on the server.** The browser never holds Team 6's key.
- **The failure drills and `/stats` work** surfaced the real slow route and the real 401
  population rather than a guess.
- **The documentation is unusually honest** about what is blocked, what is manual, and what
  is not finished. That is why this retrospective can be specific.

---

## 8. Open items

- Chase Team 8 for a reply to [DEPRECATION_NOTICE.md](DEPRECATION_NOTICE.md) (sent by hand,
  unanswered) and confirm their caller label on `/api/v2/events` in `/stats`; do not assume
  migration from silence.
- Get Team 6's named notice channel, a deployed v2, its contract, and a test key.
  Their 12 November notice covers product reads only, so `/produce` still has no
  versioned path and no notice path. Only then build `PARTNER_VERSION` and the adapter
  tests.
- Replace the free ngrok URL with a stable ingress and run the public smoke test from CI.
- Add a circuit breaker, a persistent partner cache, and an alert on stale ratio and upstream
  `401/403`.
- Move the frontend key behind a BFF or give it a separate, higher quota; stop sharing one
  bucket across all browser users.
- Move `/stats` and rate-limit counters to a shared store if more than one API process will
  ever run.
- Add consumer-driven contract tests with Team 8 and a weekly contract diff with Team 6.
- Fix the Team 6 docs contradiction and resolve the open contract questions before building
  anything new against them.
