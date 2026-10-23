import { Router } from "express";
import { requireAuth } from "../middleware/auth.js"; // NEW: for the order route

// Calls Team 6's AgroConnect API from the SERVER so the browser never
// talks to the partner directly. Their GET routes are public (no key).
// If they ever add a key, put it in PARTNER_API_KEY and it is sent below.
export const partnerRouter = Router();

const FRIENDLY_ERROR = { error: "Partner data unavailable" };

partnerRouter.get("/produce", async (req, res) => {
  const base = process.env.PARTNER_URL;
  if (!base) {
    console.error("PARTNER_URL is not set in server/.env");
    return res.status(502).json(FRIENDLY_ERROR);
  }

  // Pass through only the filters their contract documents (search, county, category).
  const url = new URL(`${base.replace(/\/$/, "")}/produce`);
  for (const name of ["search", "county", "category"]) {
    const v = req.query[name];
    if (typeof v === "string" && v.trim()) url.searchParams.set(name, v.trim());
  }

  const headers = { Accept: "application/json" };
  if (process.env.PARTNER_API_KEY) headers["X-API-Key"] = process.env.PARTNER_API_KEY;

  try {
    const r = await fetch(url, { headers });
    if (!r.ok) {
      console.error("partner returned", r.status); // status only, never the key
      return res.status(502).json(FRIENDLY_ERROR);
    }
    const data = await r.json();

    // While building: uncomment once to see the real shape, then REMOVE before committing.
    // console.log("RAW partner response:", JSON.stringify(data).slice(0, 500));

    // Shape check. Their contract: 200 { listings: [ ... ] }
    if (!Array.isArray(data.listings)) {
      console.error("partner shape mismatch, expected { listings: [] }; got keys:", Object.keys(data));
      return res.status(502).json(FRIENDLY_ERROR);
    }

    // Return only what our page needs, using THEIR field names exactly.
    res.json(
      data.listings.map((l) => ({
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
  } catch (err) {
    // ECONNREFUSED = nothing listening; ENOTFOUND = hostname wrong
    console.error("partner call failed:", err.cause?.code || err.message);
    res.status(502).json(FRIENDLY_ERROR);
  }
});

// GET /api/partner/farmers -> their GET /farmers (public).
// Contract: 200 { farmers: [ {id, fullName, phone, county, focus, createdAt} ] }
partnerRouter.get("/farmers", async (req, res) => {
  const base = process.env.PARTNER_URL;
  if (!base) {
    console.error("PARTNER_URL is not set in server/.env");
    return res.status(502).json(FRIENDLY_ERROR);
  }

  const headers = { Accept: "application/json" };
  if (process.env.PARTNER_API_KEY) headers["X-API-Key"] = process.env.PARTNER_API_KEY;

  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/farmers`, { headers });
    if (!r.ok) {
      console.error("partner returned", r.status);
      return res.status(502).json(FRIENDLY_ERROR);
    }
    const data = await r.json();

    // console.log("RAW partner response:", JSON.stringify(data).slice(0, 500)); // remove before commit

    if (!Array.isArray(data.farmers)) {
      console.error("partner shape mismatch, expected { farmers: [] }; got keys:", Object.keys(data));
      return res.status(502).json(FRIENDLY_ERROR);
    }

    // Only what the page needs. Their farmers' phone numbers are not forwarded.
    res.json(
      data.farmers.map((f) => ({
        id: f.id,
        fullName: f.fullName,
        county: f.county,
        focus: f.focus,
      }))
    );
  } catch (err) {
    console.error("partner call failed:", err.cause?.code || err.message);
    res.status(502).json(FRIENDLY_ERROR);
  }
});

// NEW: GET /api/partner/farmers/:id -> their GET /farmers/:id
// Contract: 200 { farmer: {...} }
partnerRouter.get("/farmers/:id", async (req, res) => {
  const base = process.env.PARTNER_URL;
  const id = Number(req.params.id);
  if (!base || !Number.isInteger(id) || id < 1) {
    return res.status(422).json({ error: "Invalid farmer id." });
  }

  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/farmers/${id}`, {
      headers: { Accept: "application/json" },
    });
    if (r.status === 404) return res.status(404).json({ error: "Farmer not found." });
    if (!r.ok) {
      console.error("partner returned", r.status);
      return res.status(502).json(FRIENDLY_ERROR);
    }
    const data = await r.json();
    if (!data.farmer) {
      console.error("partner shape mismatch, expected { farmer }; got keys:", Object.keys(data));
      return res.status(502).json(FRIENDLY_ERROR);
    }
    const f = data.farmer;
    res.json({ id: f.id, fullName: f.fullName, county: f.county, focus: f.focus });
  } catch (err) {
    console.error("partner call failed:", err.cause?.code || err.message);
    res.status(502).json(FRIENDLY_ERROR);
  }
});

// ---------------------------------------------------------------------
// NEW (OPTIONAL, WRITE): place an order on the partner's API.
// Needs PARTNER_BUYER_EMAIL / PARTNER_BUYER_PASSWORD in server/.env.
// This changes THEIR live database: agree with Team 6 before using it.
// It does nothing unless someone calls POST /api/partner/orders.
// ---------------------------------------------------------------------
let partnerToken = null;

async function getPartnerToken(force = false) {
  if (partnerToken && !force) return partnerToken;
  const r = await fetch(`${process.env.PARTNER_URL.replace(/\/$/, "")}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  return fetch(`${process.env.PARTNER_URL.replace(/\/$/, "")}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
  const body = { items: [{ id: listingId, type: "produce", quantity }] }; // only what we allow

  try {
    let r = await postOrder(await getPartnerToken(), body);
    if (r.status === 401) r = await postOrder(await getPartnerToken(true), body); // token expired
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("partner order returned", r.status);
      return res
        .status(r.status === 409 || r.status === 422 ? r.status : 502)
        .json({ error: data.message || "Partner data unavailable" });
    }
    res.status(201).json({ orderId: data.order.id, total: data.order.total, status: data.order.status });
  } catch (err) {
    console.error("partner call failed:", err.cause?.code || err.message);
    res.status(502).json(FRIENDLY_ERROR);
  }
});