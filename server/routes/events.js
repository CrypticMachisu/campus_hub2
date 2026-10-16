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

/**
 * Convert the contract's ISO startTime into the MySQL date/time values
 * used by the existing CampusHub database.
 */
function parseStartTime(startTime) {
  if (typeof startTime !== "string" || !startTime.trim()) return null;

  const parsed = new Date(startTime);

  if (Number.isNaN(parsed.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}:${values.second}`,
  };
}

/** GET /api/events — list all events. */
eventsRouter.get("/", async (req, res) => {
  const [rows] = await pool.query(
    `${EVENT_LIST_QUERY} ORDER BY e.event_date, e.event_time`
  );

  res.json({
    events: rows.map(rowToEvent),
  });
});

/**
 * POST /api/events — create a new event.
 * Requires the caller to manage the target club.
 */
eventsRouter.post("/", requireAuth, async (req, res) => {
  const {
    clubId,
    title,
    description,
    startTime,
    location,
    category,
    imageUrl,
  } = req.body;

  if (!canManageClub(req.user, clubId)) {
    return res.status(403).json({
      error: "You don't have admin access to that club.",
    });
  }

  const trimmedTitle = typeof title === "string" ? title.trim() : "";

  if (!trimmedTitle) {
    return res.status(400).json({
      error: "Title is required.",
    });
  }

  if (trimmedTitle.length > 150) {
    return res.status(400).json({
      error: "Title is too long.",
    });
  }

  const start = parseStartTime(startTime);

  if (!start) {
    return res.status(400).json({
      error: "Invalid startTime.",
    });
  }

  const categoryId = await findCategoryIdByName(category);

  if (!categoryId) {
    return res.status(400).json({
      error: `Unknown category: ${category}`,
    });
  }

  const id = `custom-${Date.now()}`;

  await pool.query(
    `INSERT INTO events
      (event_id, club_id, title, description, category_id,
       event_date, event_time, location, image_url)
     VALUES
      (:id, :clubId, :title, :description, :categoryId,
       :date, :time, :location, :imageUrl)`,
    {
      id,
      clubId,
      title: trimmedTitle,
      description:
        typeof description === "string" ? description.trim() : "",
      categoryId,
      date: start.date,
      time: start.time,
      location: typeof location === "string" ? location.trim() : "",
      imageUrl: imageUrl || null,
    }
  );

  const [rows] = await pool.query(
    `${EVENT_LIST_QUERY} WHERE e.event_id = :id`,
    { id }
  );

  return res.status(201).json({
    event: rowToEvent(rows[0]),
  });
});

/**
 * PUT /api/events/:id — update an existing custom event.
 */
eventsRouter.put("/:id", requireAuth, async (req, res) => {
  const eventId = req.params.id;

  const [existingRows] = await pool.query(
    "SELECT * FROM events WHERE event_id = :id",
    { id: eventId }
  );

  const existing = existingRows[0];

  if (!existing) {
    return res.status(404).json({
      error: "Event not found.",
    });
  }

  // Seed events are read-only.
  if (!eventId.startsWith("custom-")) {
    return res.status(403).json({
      error: "Seed events are read-only.",
    });
  }

  if (!canManageClub(req.user, existing.club_id)) {
    return res.status(403).json({
      error: "You don't have admin access to that club.",
    });
  }

  const {
    title,
    description,
    category,
    startTime,
    location,
    imageUrl,
  } = req.body;

  const trimmedTitle =
    typeof title === "string" ? title.trim() : "";

  if (!trimmedTitle) {
    return res.status(400).json({
      error: "Title is required.",
    });
  }

  if (trimmedTitle.length > 150) {
    return res.status(400).json({
      error: "Title is too long.",
    });
  }

  const start = parseStartTime(startTime);

  if (!start) {
    return res.status(400).json({
      error: "Invalid startTime.",
    });
  }

  const categoryId = await findCategoryIdByName(category);

  if (!categoryId) {
    return res.status(400).json({
      error: `Unknown category: ${category}`,
    });
  }

  await pool.query(
    `UPDATE events
     SET title = :title,
         description = :description,
         category_id = :categoryId,
         event_date = :date,
         event_time = :time,
         location = :location,
         image_url = :imageUrl
     WHERE event_id = :id`,
    {
      id: eventId,
      title: trimmedTitle,
      description:
        typeof description === "string" ? description : "",
      categoryId,
      date: start.date,
      time: start.time,
      location:
        typeof location === "string" ? location : "",
      imageUrl: imageUrl || null,
    }
  );

  const [rows] = await pool.query(
    `${EVENT_LIST_QUERY} WHERE e.event_id = :id`,
    { id: eventId }
  );

  return res.json({
    event: rowToEvent(rows[0]),
  });
});

/**
 * DELETE /api/events/:id — delete a custom event.
 */
eventsRouter.delete("/:id", requireAuth, async (req, res) => {
  const eventId = req.params.id;

  const [existingRows] = await pool.query(
    "SELECT * FROM events WHERE event_id = :id",
    { id: eventId }
  );

  const existing = existingRows[0];

  if (!existing) {
    return res.status(404).json({
      error: "Event not found.",
    });
  }

  // Seed events are read-only.
  if (!eventId.startsWith("custom-")) {
    return res.status(403).json({
      error: "Seed events are read-only.",
    });
  }

  if (!canManageClub(req.user, existing.club_id)) {
    return res.status(403).json({
      error: "You don't have admin access to that club.",
    });
  }

  await pool.query(
    "DELETE FROM events WHERE event_id = :id",
    { id: eventId }
  );

  return res.status(204).end();
});
