# Contract Questions — AgroConnect API (Team 6)

Questions raised while reviewing `openapi_for_group_6.yaml` from Campus Hub's (Team 7) perspective as a downstream consumer. Intended to surface ambiguities and inconsistencies before we build against this contract.

## 1. Field name mismatch between request and response for products
`CreateProductRequest` asks suppliers to submit a `quantity` field ("Stock count available"), but the `Product` schema returned by `GET /api/products` and `PUT /api/products/{id}` calls the same value `stock`. Was this a deliberate rename, or should the request body use `stock` too so consumers aren't guessing which field maps to which on write vs. read?

## 2. Status and timeline of the "Proposed Endpoints (Campus Hub)" section
Four endpoints — `/api/farmers/{id}/farm-location`, `/api/products/{id}/detail`, `/api/produce/{id}/detail`, and `/api/products/{id}/inventory` — are marked `[PROPOSED]`, and they're the ones that actually fulfill Campus Hub Needs 2–4. Since our integration depends on these, could the doc note a target date or implementation status for each, so we know whether to build against them now or wait?

## 3. Missing standard single-item GET for products and produce
`/api/produce/{id}` and `/api/products/{id}` only define `PUT` and `DELETE` — there's no plain `GET` for a single item; that's instead covered by the separate proposed `.../detail` paths. Is there a reason the conventional `GET /api/products/{id}` wasn't included alongside the existing CRUD operations, rather than introducing a second "detail" path? Consolidating could simplify the contract for consumers expecting standard REST semantics.

## 4. Timestamp format isn't ISO 8601
`createdAt`/`updatedAt` fields are typed as plain `string` with examples like `'2026-08-24 17:30:00'` — space-separated, no timezone offset — rather than `format: date-time` (ISO 8601, e.g. `2026-08-24T17:30:00Z`). Downstream consumers parsing these as dates may run into ambiguity around timezone. Can these be standardized to `date-time` format?

## 5. No pagination or filtering on the farmer directory
`GET /api/farmers` returns the full list of registered farmers with no `search`, `county`, or `page`/`limit` parameters, unlike `/api/produce` and `/api/products`, which support filtering. Given Campus Hub Need 1 is farmer discovery, should this endpoint support the same filtering/pagination pattern so the directory stays usable as it grows?

## 6. Ambiguous `id` reuse across produce and product in orders
`OrderItemInput` requires an `id` plus a `type` (`produce` or `product`) to distinguish which catalog the ID belongs to. Since produce and product listings appear to use separate ID sequences, is there any risk of a client passing the wrong `type` for a given `id` and silently referencing the wrong item? Would a compound identifier or namespaced ID (e.g. `produce:1` vs `product:1`) reduce that risk?

## 7. Sensitive location data exposed without authentication
The proposed `/api/farmers/{id}/farm-location` endpoint has `security: []` (public) and returns precise geographic details — landmarks, farm size, and a personal visit-contact phone number. Given this is more sensitive than the general farmer directory, should this endpoint require authentication, or at least be rate-limited, to reduce the risk of scraping farmers' physical locations and contact details?

