# Integration Log — Week 10

**Us (consumer):** CampusHub, Team 7 **Upstream partner (provider):** AgroConnect, Team 6
**Their base URL:** https://farmers-agroconnect.onrender.com/api
**What we call:** `GET /farmers` and `GET /produce` (both now require `X-API-Key`; verified 2026-11-08) — shown on our Home page as "Farmers on AgroConnect" and "Fresh from AgroConnect".
**How:** our Express route `GET /api/partner/produce` calls them server-side; browser never calls them directly.

## Contract review before coding (from their README)

- Auth (verified 2026-11-08): `GET /health` is public. `GET /farmers` and `GET /produce` return 401 `{"message":"A valid X-API-Key header is required."}` without a key. This differs from the earlier README, which said those reads were public and did not use `X-API-Key`.
- `/farmers` shape: `200 { "farmers": [ {id, fullName, phone, county, focus, createdAt} ] }`. We forward only id, fullName, county, focus (not phone).
- `/produce` shape: `200 { "listings": [ {id, title, category, price, unit, quantity, county, sellerName, availableFrom, ...} ] }`. No matches: `{ "listings": [] }`.
- Errors: JSON `{ message, fields? }`; no machine-readable code.
- Hosted on Render Free: README says first request after 15 min idle can take about a minute.

## First call (Part B)

- [x] Date/time: 2026-11-09. Command: `curl.exe -i https://farmers-agroconnect.onrender.com/api/farmers -H "X-API-Key: <Team 6 key>"`
- [x] Status: 200. Time to respond: 1.7 s cold; 0.3 s once warm. Returned 5 farmers.
- [x] Matches README shape: yes, `{ "farmers": [ ... ] }`.

## Bugs and surprises

Only log what actually happened. Rows below are things to CHECK; delete any that turn out fine and fill in the rest.

| #   | What broke (symptom)                                                                                                        | Root cause                                        | Fix                                                                                  | Whose code, who fixed        |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------- |
| 1   | Partner now requires `X-API-Key`; our server had no key configured                                                          | Upstream changed from public reads to keyed reads | Set `PARTNER_URL` and `PARTNER_API_KEY` from Team 6; live 200 on 2026-11-09          | Team 6 + Team 7, fixed       |
| 2   | First request after idle is very slow / times out                                                                           | Render Free wakes after ~1 min (per their README) | Warm the real partner panels before demo; cold calls can still hit the 1.5 s timeout | Hosting limit, logged only   |
| 3   | README says single-item reads use `GET /produce/{id}` but also says "individual listing detail" is PROPOSED and returns 404 | README contradicts itself, or one part is stale   | Tested `GET /produce/1`: 200 with a `listing`; docs are inconsistent, not the route  | Partner docs, partner to fix |

## Tests done on purpose (record what each did)

| Test                                                    | Expected (their README)              | Actual (2026-11-09)                                     |
| ------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------- |
| `GET /farmers` with `X-API-Key`                         | 200 `{farmers}`                      | 200, 5 farmers                                          |
| `GET /produce` with `X-API-Key`                         | 200 `{listings}`                     | 200, 4 listings                                         |
| `GET /produce?search=zzzz` (no match)                   | 200 `{"listings":[]}`                | 200, 0 listings                                         |
| `GET /produce/1`                                        | 200 `{listing}`                      | 200, `listing`                                          |
| `GET /produce/9999`                                     | 404 `This listing no longer exists.` | 404, same message                                       |
| `GET /nope`                                             | 404 `This API route was not found.`  | 404, same message                                       |
| `GET /api/partner/farmers` through our server           | 200 `{data, stale, asOf}`            | 200, `stale: false`, 5 farmers                          |
| `GET /api/partner/produce` through our server           | 200 `{data, stale, asOf}`            | 200, `stale: false`, 4 listings                         |
| `GET /api/partner/farmers/5` through our server         | 200 `{data, stale, asOf}`            | 200, `stale: false`                                     |
| First request immediately after restart (upstream cold) | live 200                             | 502 after three 1.5 s timeouts; warm calls returned 200 |

## Bug report template used (Part C)

What I did: ____ / What I expected: ____ (their README, section __) / What I got: ____ / Evidence: ____ / When: ____

## Downstream partner (Part E) — Team 8 calling us

Our base URL (ngrok, changes on restart): https://movable-eastcoast-showman.ngrok-free.dev/api

- [ ] 401s seen in our terminal: When the idle time is exceeded it was shown when group 8 tried accessing it.
- [ ] Contract/README clarified: The initial readme was locally oriented but once we publicised the api we sent an updated README.
      Tip we gave them: send header `ngrok-skip-browser-warning: true`.

## Collaboration evidence

We contacted Jochebed Mukami from group 6 and we agreed to communicate on any issues faced with their api access.

## Week 13 — versioning (what changed, and who it affected)

**What we changed (our API, for our consumers):** each event now has one ISO `startTime` (`"2026-11-02T06:30:00+03:00"`) instead of separate `date` + `time`. v2 is `/api/v2/events`; v1 stays at `/api/events` and `/api/v1/events` and now sends `Deprecation`, `Sunset: Mon, 30 Nov 2026 00:00:00 GMT` and `Link` headers. Full text for Team 8: `DEPRECATION_NOTICE.md`.

**Upstream notice received (Team 6, AgroConnect):** none. Their contract has no v2, so there is nothing to migrate to and we did not invent one. Our integration (`server/routes/partner.js`) still calls their `/farmers`, `/produce` and `/farmers/:id` under the current contract and is unchanged this week.

| #   | Symptom                                                                      | Root cause                                                                                          | What we changed                                                                                                                                                                                                                             | Whose code, status      |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 4   | Our own front end sorts every event as "oldest" and treats it as past on v2  | `date` + `time` were replaced by `startTime`; `new Date(date + "T" + time)` is `Invalid Date` → `0` | `src/utils/api.js` calls `/api/v2`; `toUiEvent()` in `src/utils/eventsStore.js` slices `startTime` back to `date` + `time`. Checked 2026-11-12: dashboard create/edit/delete, ClubProfile, MyEvents, ICS export (`DTSTART:20261108T180000`) | Ours (Team 7), resolved |
| 5   | A deprecation notice was _not_ received for AgroConnect's keyed-reads change | Their reads went from public to `X-API-Key` without an announcement                                 | We found it in our partner log (401 → 502 → `stale: true` banner), added the key, re-tested 2026-11-09                                                                                                                                      | Theirs + ours, resolved |

**Nothing broke this time for our consumers**, because v1 is still mounted on the old URLs and every v1 response says it is leaving. The two things that need a human before 30 November:

- [ ] Send the full `DEPRECATION_NOTICE.md` text to Team 8 (the file is in the repo root; sending it from a person is the part I cannot do) and get a reply.
- [ ] Read `GET /api/stats` + the request log and record which caller labels still hit `GET /api/events/` and `GET /api/v1/events/` before turning v1 off.
