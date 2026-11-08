import { requireAuth } from "../middleware/auth.js";
import { createApiRouter } from "../middleware/apiGuards.js";
import { fetchWithRetry } from "../resilientFetch.js"; // Week 11: timeout + capped retries

// Calls Team 6's AgroConnect API from the SERVER so the browser never
// sees the partner's key. Their API requires an X-API-Key header on
// every call; the key lives only in server/.env as PARTNER_API_KEY.
export const partnerRouter = createApiRouter();

const FRIENDLY_ERROR = { error: "Partner data unavailable" };

// Week 11 (Part B/C): our numbers, argued in RESILIENCE_NOTES.md.
// A call that normally takes a few hundred milliseconds is cut off after
// 1.5 s, and only momentary failures get a second chance (at most 2
// retries, waits doubling: 200 ms then 400 ms; 429 waits Retry-After).
// Worst case for a GET: (retries + 1) x timeout + delays = 5100 ms.
const PARTNER_CALL = { timeoutMs: 1500, retries: 2, delayMs: 200 };

// Week 11 (Part D): last known good response per endpoint, kept in memory
// as { [cacheKey]: { data, asOf } }. It disappears when we restart, by
// design: a boundary is better than silently serving yesterday's data
// forever. Everything served from here is flagged stale: true and shows
// WHEN it was saved, so a fallback is never passed off as live data.
const lastGood = {};

function partnerBase() {
  const base = process.env.PARTNER_URL;
  return base ? base.replace(/\/$/, "") : null;
}

/** Headers for every partner call. The key is sent, never logged. */
function partnerHeaders() {
  const headers = { Accept: "application/json" };
  if (process.env.PARTNER_API_KEY) headers["X-API-Key"] = process.env.PARTNER_API_KEY;
  return headers;
}

const failureReason = (err) =>
  err.name === "TimeoutError" ? "timeout" : err.cause?.code || err.message;

/**
 * GET <partner>/<path> with timeout + capped retries. Never touches `res`;
 * returns { ok: true, data, asOf } or { ok: false, status, reason } and
 * logs WHY (timeout, network code, or partner status) — never the key.
 */
async function partnerGet(path, query = {}) {
  const base = partnerBase();
  if (!base) {
    console.error("PARTNER_URL is not set in server/.env");
    return { ok: false, status: 502, reason: "PARTNER_URL missing" };
  }
  if (!process.env.PARTNER_API_KEY) {
    console.error("PARTNER_API_KEY is not set in server/.env — partner will answer 401");
  }

  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  try {
    const r = await fetchWithRetry(url, { headers: partnerHeaders() }, PARTNER_CALL);

    if (r.status === 401 || r.status === 403) {
      console.error(`partner rejected our API key (${r.status}) — check PARTNER_API_KEY`);
      return { ok: false, status: 502, reason: `partner rejected our key (${r.status})` };
    }
    if (r.status === 429) {
      console.error("partner rate limit hit (429) — call less often");
      return { ok: false, status: 502, reason: "partner returned 429" };
    }
    if (r.status === 404) return { ok: true, status: 404, data: null };
    if (!r.ok) {
      console.error("partner returned", r.status);
      return { ok: false, status: 502, reason: `partner returned ${r.status}` };
    }
    return { ok: true, status: r.status, data: await r.json(), asOf: new Date().toISOString() };
  } catch (err) {
    console.error("partner call failed:", failureReason(err));
    return { ok: false, status: 502, reason: failureReason(err) };
  }
}

/**
 * Week 11 (Part D): one place that decides what the user sees.
 * Fresh success -> live data (stale: false). Any failure -> the last good
 * copy, flagged stale: true with the time it was saved; if we have never
 * succeeded, a friendly 502. The log still records each failure reason
 * above, so a stale response never hides the actual cause (e.g. a 401).
 */
function serveWithFallback(res, cacheKey, fresh) {
  if (fresh) {
    lastGood[cacheKey] = fresh;
    return res.json({ data: fresh.data, stale: false, asOf: fresh.asOf });
  }
  const saved = lastGood[cacheKey];
  if (saved) {
    console.error(`partner data stale: serving saved copy for ${cacheKey} from ${saved.asOf}`);
    return res.json({ data: saved.data, stale: true, asOf: saved.asOf });
  }
  return res.status(502).json(FRIENDLY_ERROR);
}

// GET /api/partner/produce -> their GET /produce
// Contract: 200 { listings: [ ... ] }
// Success response: 200 { data: [ ... ], stale: false, asOf }
partnerRouter.get("/produce", async (req, res) => {
  // Pass through only the filters their contract documents.
  const query = {};
  for (const name of ["search", "county", "category"]) {
    const v = req.query[name];
    if (typeof v === "string" && v.trim()) query[name] = v.trim();
  }
  const cacheKey = "produce";

  const result = await partnerGet("/produce", query);
  if (!result.ok) return serveWithFallback(res, cacheKey);

  if (!Array.isArray(result.data?.listings)) {
    console.error(
      "partner shape mismatch, expected { listings: [] }; got keys:",
      Object.keys(result.data ?? {})
    );
    return serveWithFallback(res, cacheKey);
  }

  // Only what our pages need, using THEIR field names exactly.
  serveWithFallback(res, cacheKey, {
    data: result.data.listings.map((l) => ({
      id: l.id,
      title: l.title,
      category: l.category,
      price: l.price,
      unit: l.unit,
      quantity: l.quantity,
      county: l.county,
      sellerName: l.sellerName,
      availableFrom: l.availableFrom,
    })),
    asOf: result.asOf,
  });
});

// GET /api/partner/farmers -> their GET /farmers
// Contract: 200 { farmers: [ {id, fullName, phone, county, focus, createdAt} ] }
partnerRouter.get("/farmers", async (req, res) => {
  const cacheKey = "farmers";

  const result = await partnerGet("/farmers");
  if (!result.ok) return serveWithFallback(res, cacheKey);

  if (!Array.isArray(result.data?.farmers)) {
    console.error(
      "partner shape mismatch, expected { farmers: [] }; got keys:",
      Object.keys(result.data ?? {})
    );
    return serveWithFallback(res, cacheKey);
  }

  // Their farmers' phone numbers are not forwarded.
  serveWithFallback(res, cacheKey, {
    data: result.data.farmers.map((f) => ({
      id: f.id,
      fullName: f.fullName,
      county: f.county,
      focus: f.focus,
    })),
    asOf: result.asOf,
  });
});

// GET /api/partner/farmers/:id -> their GET /farmers/:id
// Contract: 200 { farmer: {...} }
// A 404 is real information: asked for an id that does not exist. Stale
// fallback does not apply — respond 404 directly.
partnerRouter.get("/farmers/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(422).json({ error: "Invalid farmer id." });
  }
  const cacheKey = `farmers:${id}`;

  const result = await partnerGet(`/farmers/${id}`);
  if (result.ok && result.status === 404) {
    return res.status(404).json({ error: "Farmer not found." });
  }
  if (!result.ok) return serveWithFallback(res, cacheKey);

  const f = result.data?.farmer;
  if (!f) {
    console.error(
      "partner shape mismatch, expected { farmer }; got keys:",
      Object.keys(result.data ?? {})
    );
    return serveWithFallback(res, cacheKey);
  }
  serveWithFallback(res, cacheKey, {
    data: { id: f.id, fullName: f.fullName, county: f.county, focus: f.focus },
    asOf: result.asOf,
  });
});

// ---------------------------------------------------------------------
// OPTIONAL, WRITE: place an order on the partner's API.
// Needs PARTNER_BUYER_EMAIL / PARTNER_BUYER_PASSWORD in server/.env.
// This changes THEIR live database: agree with Team 6 before using it.
// It does nothing unless someone calls POST /api/partner/orders.
// POSTs are never retried (week 3 idempotency): the timeout still cuts
// off a hung partner, but a retry could place the order twice.
// ---------------------------------------------------------------------
let partnerToken = null;

async function getPartnerToken(force = false) {
  if (partnerToken && !force) return partnerToken;
  const r = await fetchWithRetry(
    `${partnerBase()}/auth/login`,
    {
      method: "POST",
      headers: { ...partnerHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        email: process.env.PARTNER_BUYER_EMAIL,
        password: process.env.PARTNER_BUYER_PASSWORD,
      }),
    },
    PARTNER_CALL
  ); // POST -> 0 retries automatically; timeout still applies
  if (!r.ok) throw new Error(`partner login returned ${r.status}`);
  const data = await r.json();
  partnerToken = data.token; // expires after 7 days; we re-login on a 401
  return partnerToken;
}

async function postOrder(token, body) {
  return fetchWithRetry(
    `${partnerBase()}/orders`,
    {
      method: "POST",
      headers: {
        ...partnerHeaders(),
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
    PARTNER_CALL
  ); // same: timeout yes, retries no
}

// POST /api/partner/orders   body: { listingId, quantity }
// Only signed-in CampusHub users can trigger it (requireAuth).
partnerRouter.post("/orders", requireAuth, async (req, res) => {
  const { listingId, quantity } = req.body ?? {};
  if (!Number.isInteger(listingId) || !Number.isInteger(quantity) || quantity < 1) {
    return res.status(422).json({ error: "listingId and quantity must be positive integers." });
  }
  const body = { items: [{ id: listingId, type: "produce", quantity }] };

  try {
    let r = await postOrder(await getPartnerToken(), body);
    if (r.status === 401) r = await postOrder(await getPartnerToken(true), body);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("partner order returned", r.status);
      return res
        .status(r.status === 409 || r.status === 422 ? r.status : 502)
        .json({ error: data.message || "Partner data unavailable" });
    }
    res
      .status(201)
      .json({ orderId: data.order.id, total: data.order.total, status: data.order.status });
  } catch (err) {
    console.error("partner call failed:", failureReason(err));
    res.status(502).json(FRIENDLY_ERROR);
  }
});
