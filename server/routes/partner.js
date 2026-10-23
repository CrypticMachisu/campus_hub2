import { Router } from "express";

// Calls Team 6's AgroConnect API from the SERVER so the browser never
// talks to the partner directly. Their GET /produce is public (no key).
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
