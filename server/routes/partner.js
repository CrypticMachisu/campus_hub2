import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

// Calls Team 6's AgroConnect API from the SERVER so the browser never
// sees the partner's key. Their API now requires an X-API-Key header on
// every call; the key lives only in server/.env as PARTNER_API_KEY.
export const partnerRouter = Router();

const FRIENDLY_ERROR = { error: "Partner data unavailable" };

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

/**
 * GET <partner>/<path>. Returns { status, data } or null after sending a
 * friendly 502 itself, so each route stays short. Logs WHY (status or
 * network code) without ever printing the key.
 */
async function partnerGet(res, path, query = {}) {
  const base = partnerBase();
  if (!base) {
    console.error("PARTNER_URL is not set in server/.env");
    res.status(502).json(FRIENDLY_ERROR);
    return null;
  }
  if (!process.env.PARTNER_API_KEY) {
    console.error("PARTNER_API_KEY is not set in server/.env — partner will answer 401");
  }

  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  try {
    const r = await fetch(url, { headers: partnerHeaders() });
    if (r.status === 401 || r.status === 403) {
      console.error(`partner rejected our API key (${r.status}) — check PARTNER_API_KEY`);
      res.status(502).json(FRIENDLY_ERROR);
      return null;
    }
    if (r.status === 429) {
      console.error("partner rate limit hit (429) — call less often");
      res.status(502).json(FRIENDLY_ERROR);
      return null;
    }
    if (r.status === 404) return { status: 404, data: null };
    if (!r.ok) {
      console.error("partner returned", r.status);
      res.status(502).json(FRIENDLY_ERROR);
      return null;
    }
    return { status: r.status, data: await r.json() };
  } catch (err) {
    // ECONNREFUSED = nothing listening; ENOTFOUND = hostname wrong
    console.error("partner call failed:", err.cause?.code || err.message);
    res.status(502).json(FRIENDLY_ERROR);
    return null;
  }
}

// GET /api/partner/produce -> their GET /produce
// Contract: 200 { listings: [ ... ] }
partnerRouter.get("/produce", async (req, res) => {
  // Pass through only the filters their contract documents.
  const query = {};
  for (const name of ["search", "county", "category"]) {
    const v = req.query[name];
    if (typeof v === "string" && v.trim()) query[name] = v.trim();
  }

  const result = await partnerGet(res, "/produce", query);
  if (!result) return;

  if (!Array.isArray(result.data?.listings)) {
    console.error(
      "partner shape mismatch, expected { listings: [] }; got keys:",
      Object.keys(result.data ?? {})
    );
    return res.status(502).json(FRIENDLY_ERROR);
  }

  // Only what our pages need, using THEIR field names exactly.
  res.json(
    result.data.listings.map((l) => ({
      id: l.id,
      title: l.title,
      category: l.category,
      price: l.price,
      unit: l.unit,
      quantity: l.quantity,
      county: l.county,
      sellerName: l.sellerName,
      availableFrom: l.availableFrom,
    }))
  );
});

// GET /api/partner/farmers -> their GET /farmers
// Contract: 200 { farmers: [ {id, fullName, phone, county, focus, createdAt} ] }
partnerRouter.get("/farmers", async (req, res) => {
  const result = await partnerGet(res, "/farmers");
  if (!result) return;

  if (!Array.isArray(result.data?.farmers)) {
    console.error(
      "partner shape mismatch, expected { farmers: [] }; got keys:",
      Object.keys(result.data ?? {})
    );
    return res.status(502).json(FRIENDLY_ERROR);
  }

  // Their farmers' phone numbers are not forwarded.
  res.json(
    result.data.farmers.map((f) => ({
      id: f.id,
      fullName: f.fullName,
      county: f.county,
      focus: f.focus,
    }))
  );
});

// GET /api/partner/farmers/:id -> their GET /farmers/:id
// Contract: 200 { farmer: {...} }
partnerRouter.get("/farmers/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(422).json({ error: "Invalid farmer id." });
  }

  const result = await partnerGet(res, `/farmers/${id}`);
  if (!result) return;
  if (result.status === 404) return res.status(404).json({ error: "Farmer not found." });

  const f = result.data?.farmer;
  if (!f) {
    console.error(
      "partner shape mismatch, expected { farmer }; got keys:",
      Object.keys(result.data ?? {})
    );
    return res.status(502).json(FRIENDLY_ERROR);
  }
  res.json({ id: f.id, fullName: f.fullName, county: f.county, focus: f.focus });
});

// ---------------------------------------------------------------------
// OPTIONAL, WRITE: place an order on the partner's API.
// Needs PARTNER_BUYER_EMAIL / PARTNER_BUYER_PASSWORD in server/.env.
// This changes THEIR live database: agree with Team 6 before using it.
// It does nothing unless someone calls POST /api/partner/orders.
// ---------------------------------------------------------------------
let partnerToken = null;

async function getPartnerToken(force = false) {
  if (partnerToken && !force) return partnerToken;
  const r = await fetch(`${partnerBase()}/auth/login`, {
    method: "POST",
    headers: { ...partnerHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.PARTNER_BUYER_EMAIL,
      password: process.env.PARTNER_BUYER_PASSWORD,
    }),
  });
  if (!r.ok) throw new Error(`partner login returned ${r.status}`);
  const data = await r.json();
  partnerToken = data.token; // expires after 7 days; we re-login on a 401
  return partnerToken;
}

async function postOrder(token, body) {
  return fetch(`${partnerBase()}/orders`, {
    method: "POST",
    headers: {
      ...partnerHeaders(),
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
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
    console.error("partner call failed:", err.cause?.code || err.message);
    res.status(502).json(FRIENDLY_ERROR);
  }
});
