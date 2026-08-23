import { Router } from "express";
import { pool } from "../db.js";
import { rowToEvent } from "../rowMappers.js";
import { findCategoryIdByName } from "../queries.js";
import { requireAuth, canManageClub } from "../middleware/auth.js";

export const eventsRouter = Router();

const EVENT_LIST_QUERY = `
  SELECT e.*, cat.name AS category_name
  FROM events e
  JOIN categories cat ON cat.category_id = e.category_id
`;

/** GET /api/events — seed events + club-admin-created events, combined. */
eventsRouter.get("/", async (req, res) => {
  const [rows] = await pool.query(`${EVENT_LIST_QUERY} ORDER BY e.event_date, e.event_time`);
  res.json({ events: rows.map(rowToEvent) });
});

/**
 * POST /api/events — create a new (non-seed) event.
 * Requires the caller to manage the target club.
 */
eventsRouter.post("/", requireAuth, async (req, res) => {
  const { clubId, title, description, date, time, location, category, imageUrl } = req.body;

  if (!canManageClub(req.user, clubId)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }
  const trimmedTitle = (title || "").trim();
  if (!trimmedTitle) return res.status(400).json({ error: "Title is required." });

  const categoryId = await findCategoryIdByName(category);
  if (!categoryId) return res.status(400).json({ error: `Unknown category: ${category}` });

  // Prefix convention from your schema's own comment: 'event-*' is seed
  // data, 'custom-*' is admin-created. rowToEvent derives isSeed from this.
  const id = `custom-${Date.now()}`;
  await pool.query(
    `INSERT INTO events (event_id, club_id, title, description, category_id, event_date, event_time, location, image_url)
     VALUES (:id, :clubId, :title, :description, :categoryId, :date, :time, :location, :imageUrl)`,
    {
      id,
      clubId,
      title: trimmedTitle,
      description: (description || "").trim(),
      categoryId,
      date,
      time,
      location: (location || "").trim(),
      imageUrl: imageUrl || null,
    }
  );

  const [rows] = await pool.query(`${EVENT_LIST_QUERY} WHERE e.event_id = :id`, { id });
  res.status(201).json({ event: rowToEvent(rows[0]) });
});

/**
 * PUT /api/events/:id — update an existing non-seed event.
 * Requires the caller to manage the event's club; seed events can't be edited.
 */
eventsRouter.put("/:id", requireAuth, async (req, res) => {
  const eventId = req.params.id;
  const [existingRows] = await pool.query("SELECT * FROM events WHERE event_id = :id", {
    id: eventId,
  });
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: "Event not found." });
  if (!eventId.startsWith("custom-")) {
    return res.status(403).json({ error: "Seed events are read-only." });
  }
  if (!canManageClub(req.user, existing.club_id)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }

  const { title, description, date, time, location, category, imageUrl } = req.body;
  const trimmedTitle = (title || "").trim();
  if (!trimmedTitle) return res.status(400).json({ error: "Title is required." });

  const categoryId = await findCategoryIdByName(category);
  if (!categoryId) return res.status(400).json({ error: `Unknown category: ${category}` });

  await pool.query(
    `UPDATE events
     SET title = :title, description = :description, category_id = :categoryId,
         event_date = :date, event_time = :time, location = :location, image_url = :imageUrl
     WHERE event_id = :id`,
    {
      id: eventId,
      title: trimmedTitle,
      description: (description || "").trim(),
      categoryId,
      date,
      time,
      location: (location || "").trim(),
      imageUrl: imageUrl || null,
    }
  );

  const [rows] = await pool.query(`${EVENT_LIST_QUERY} WHERE e.event_id = :id`, { id: eventId });
  res.json({ event: rowToEvent(rows[0]) });
});

/** DELETE /api/events/:id — delete a non-seed event (cascades to its signups). */
eventsRouter.delete("/:id", requireAuth, async (req, res) => {
  const eventId = req.params.id;
  const [existingRows] = await pool.query("SELECT * FROM events WHERE event_id = :id", {
    id: eventId,
  });
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: "Event not found." });
  if (!eventId.startsWith("custom-")) {
    return res.status(403).json({ error: "Seed events are read-only." });
  }
  if (!canManageClub(req.user, existing.club_id)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }

  await pool.query("DELETE FROM events WHERE event_id = :id", { id: eventId });
  res.status(204).end();
});
