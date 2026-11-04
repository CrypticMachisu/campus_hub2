import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const harvestWatchRouter = Router();

/**
 * Harvest Watch — the Agri club's own record of producer listings worth
 * following. The listing fields come from Team 6's AgroConnect API, but the
 * partner feed rotates and its cold starts are slow, so each pin snapshots
 * what the member saw. Scoped to the logged-in user at every step.
 */

const SELECT_FIELDS = `
  listing_id,
  title,
  seller,
  county,
  price,
  unit,
  quantity,
  DATE_FORMAT(available_from, '%Y-%m-%d %H:%i:%s') AS available_from,
  created_at`;

function rowToWatch(row) {
  return {
    listingId: row.listing_id,
    title: row.title,
    seller: row.seller ?? "",
    county: row.county ?? "",
    price: row.price === null ? null : Number(row.price),
    unit: row.unit ?? "",
    quantity: row.quantity ?? null,
    availableFrom: row.available_from ?? null,
    createdAt: row.created_at,
  };
}

const clean = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) || null : null;

/** GET /api/harvest-watch — my pinned listings, newest first. */
harvestWatchRouter.get("/", requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT ${SELECT_FIELDS} FROM harvest_watch WHERE user_id = :userId
     ORDER BY created_at DESC, listing_id ASC`,
    { userId: req.user.id }
  );
  res.json({ watch: rows.map(rowToWatch) });
});

/**
 * POST /api/harvest-watch — pin a listing. Re-pinning an already saved
 * listing refreshes its snapshot instead of failing, so a member who taps
 * twice (or after prices change) ends up with one row and current details.
 */
harvestWatchRouter.post("/", requireAuth, async (req, res) => {
  const body = req.body || {};
  const listingId = clean(body.listingId, 64);
  const title = clean(body.title, 150);
  if (!listingId || !title) {
    return res.status(400).json({ error: "listingId and title are required." });
  }

  const quantity = Number.isFinite(Number(body.quantity)) ? Number(body.quantity) : null;
  const price = Number.isFinite(Number(body.price)) ? Number(body.price) : null;
  const availableFrom = clean(body.availableFrom, 19); // "YYYY-MM-DD HH:MM:SS"

  const watchId = `watch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;

  await pool.query(
    `INSERT INTO harvest_watch
       (watch_id, user_id, listing_id, title, seller, county, price, unit, quantity, available_from)
     VALUES
       (:watchId, :userId, :listingId, :title, :seller, :county, :price, :unit, :quantity, :availableFrom)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       seller = VALUES(seller),
       county = VALUES(county),
       price = VALUES(price),
       unit = VALUES(unit),
       quantity = VALUES(quantity),
       available_from = VALUES(available_from)`,
    {
      watchId,
      userId: req.user.id,
      listingId,
      title,
      seller: clean(body.seller, 150),
      county: clean(body.county, 100),
      price,
      unit: clean(body.unit, 30),
      quantity,
      availableFrom,
    }
  );

  const [rows] = await pool.query(
    `SELECT ${SELECT_FIELDS} FROM harvest_watch
     WHERE user_id = :userId AND listing_id = :listingId`,
    { userId: req.user.id, listingId }
  );
  res.status(201).json({ watch: rowToWatch(rows[0]) });
});

/** DELETE /api/harvest-watch/:listingId — unpin one of my listings. */
harvestWatchRouter.delete("/:listingId", requireAuth, async (req, res) => {
  await pool.query(
    "DELETE FROM harvest_watch WHERE user_id = :userId AND listing_id = :listingId",
    { userId: req.user.id, listingId: req.params.listingId }
  );
  res.status(204).end();
});
