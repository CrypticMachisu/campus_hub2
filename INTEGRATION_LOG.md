# Integration Log — Week 10

**Us (consumer):** CampusHub, Team 7 **Upstream partner (provider):** AgroConnect, Team 6
**Their base URL:** https://farmers-agroconnect.onrender.com/api
**What we call:** `GET /farmers` (public, no key; URL they sent us: https://farmers-agroconnect.onrender.com/api/farmers) — shown on our Home page as "Farmers on AgroConnect". Also available: `GET /produce` panel.
**How:** our Express route `GET /api/partner/produce` calls them server-side; browser never calls them directly.

## Contract review before coding (from their README)

- Auth: none for `GET /health`, `/produce`, `/farmers`, `/products`. JWT only for writes/orders. The handout's `X-API-Key` does not apply; `PARTNER_API_KEY` is optional and unused.
- `/farmers` shape: `200 { "farmers": [ {id, fullName, phone, county, focus, createdAt} ] }`. We forward only id, fullName, county, focus (not phone).
- `/produce` shape: `200 { "listings": [ {id, title, category, price, unit, quantity, county, sellerName, availableFrom, ...} ] }`. No matches: `{ "listings": [] }`.
- Errors: JSON `{ message, fields? }`; no machine-readable code.
- Hosted on Render Free: README says first request after 15 min idle can take about a minute.

## First call (Part B)

- [ ] Date/time: ____ Command: `curl.exe -i https://farmers-agroconnect.onrender.com/api/farmers`
- [ ] Status: ____ Time to respond (cold or warm?): ____
- [ ] Matches README shape? ____ (paste response, nothing secret in it)

## Bugs and surprises

Only log what actually happened. Rows below are things to CHECK; delete any that turn out fine and fill in the rest.

| #   | What broke (symptom)                                                                                                                  | Root cause                                        | Fix                                                               | Whose code, who fixed        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------- |
| 1   | Handout expects an API key, partner has none                                                                                          | Their public routes need no key                   | Called without a key; key kept optional in env                    | Handout assumption, no bug   |
| 2   | First request after idle is very slow / times out                                                                                     | Render Free wakes after ~1 min (per their README) | Warm up before demo; timeouts are Week 11                         | Hosting limit, logged only   |
| 3   | TO CHECK: README says single-item reads use `GET /produce/{id}` but also says "individual listing detail" is PROPOSED and returns 404 | README contradicts itself, or one part is stale   | Test `GET /produce/1`; report result with the bug-report template | Partner docs, partner to fix |
| 4   | (yours)                                                                                                                               |                                                   |                                                                   |                              |

## Tests done on purpose (record what each did)

| Test                                                          | Expected (their README)                                     | Actual |
| ------------------------------------------------------------- | ----------------------------------------------------------- | ------ |
| `GET /produce?search=zzzz` (no match)                         | 200 `{"listings":[]}`                                       |        |
| `GET /produce?county=nakuru` vs `Nakuru`                      | exact, case-sensitive                                       |        |
| `GET /produce/1`                                              | 200 `{listing}`                                             |        |
| `GET /produce/9999`                                           | 404 `This listing no longer exists.`                        |        |
| `GET /nope`                                                   | 404 `This API route was not found.`                         |        |
| Our page with `PARTNER_URL` set to `https://nope.invalid/api` | friendly message, our server still up, log says `ENOTFOUND` |        |
| Partner server stopped                                        | friendly message, log `ECONNREFUSED`/502                    |        |
| Partner back                                                  | page recovers with no code change                           |        |

## Bug report template used (Part C)

What I did: ____ / What I expected: ____ (their README, section __) / What I got: ____ / Evidence: ____ / When: ____

## Downstream partner (Part E) — Team 8 calling us

Our base URL (ngrok, changes on restart): https://movable-eastcoast-showman.ngrok-free.dev/api

- [ ] 401s seen in our terminal: ____
- [ ] 404s (paths our contract doesn't have): ____
- [ ] 429s: ____
- [ ] Bugs on our side + fix: ____
- [ ] Contract/README clarified: ____
      Tip we gave them: send header `ngrok-skip-browser-warning: true`.

## Collaboration evidence

Who we contacted on Team 6, when, what we agreed: ____
