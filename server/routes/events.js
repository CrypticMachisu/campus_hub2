import { Router } from "express";
import { pool } from "../db.js";
import { rowToEvent } from "../rowMappers.js";
import { findCategoryIdByName } from "../queries.js";
import { requireAuth, canManageClub } from "../middleware/auth.js";

export const eventsRouter = Router();

const EVENT_LIST_QUERY = `
  SELECT e.*, cat.name AS category_name, COUNT(s.signup_id) AS signup_count
  FROM events e
  JOIN categories cat ON cat.category_id = e.category_id
  LEFT JOIN event_signups s ON s.event_id = e.event_id
`;

/**
 * Convert the contract's ISO startTime into the MySQL date/time values
 * used by the existing CampusHub database.
 *
 * openapi.yaml's EventInput documents `date` + `time`, while the frontend has
 * always sent `startTime`. Both are accepted: startTime wins when present, and
 * a date/time pair is read as East Africa Time (the app's canonical zone), so
 * either documented or current callers keep working.
 */
function parseStartTime(startTimeOrBody) {
  let startTime = startTimeOrBody;

  if (startTimeOrBody && typeof startTimeOrBody === "object") {
    const { startTime: iso, date, time } = startTimeOrBody;
    if (typeof iso === "string" && iso.trim()) {
      startTime = iso;
    } else if (typeof date === "string" && date.trim()) {
      const clock = typeof time === "string" && time.trim() ? time.trim().slice(0, 5) : "00:00";
      startTime = `${date.trim()}T${clock}:00+03:00`;
    } else {
      return null;
    }
  }

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

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}:${values.second}`,
  };
}

/** Shared title/startTime/category/bringNote/capacity validation. Returns the first error string, or the cleaned fields. */
function validateEventFields(body) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return { error: "Title is required." };
  if (title.length > 150) return { error: "Title is too long." };

  const start = parseStartTime(body);
  if (!start) return { error: "Invalid startTime." };

  const bringNote = typeof body.bringNote === "string" ? body.bringNote.trim().slice(0, 240) : "";

  // Empty/absent capacity = unlimited. Anything else must be a positive whole
  // number, so a typo can't silently cap an event at "0" or "12abc".
  let capacity = null;
  if (body.capacity !== undefined && body.capacity !== null && body.capacity !== "") {
    const parsed = Number(body.capacity);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10000) {
      return { error: "capacity must be a whole number between 1 and 10000." };
    }
    capacity = parsed;
  }

  return { title, start, bringNote, capacity };
}

/** GET /api/events — list all events. */
eventsRouter.get("/", async (req, res) => {
  const [rows] = await pool.query(
    `${EVENT_LIST_QUERY} GROUP BY e.event_id ORDER BY e.event_date, e.event_time`
  );
  res.json({ events: rows.map(rowToEvent) });
});

/**
 * POST /api/events — create a new event.
 * Requires the caller to manage the target club.
 */
eventsRouter.post("/", requireAuth, async (req, res) => {
  const { clubId, description, location, category, imageUrl } = req.body;
  if (!clubId) return res.status(400).json({ error: "clubId is required." });

  // Validate the club exists BEFORE the FK-constrained insert — tier1 can
  // "manage" any id, so a bad clubId used to explode at the DB level (and
  // crash the server back when async rejections were unhandled).
  const [clubRows] = await pool.query("SELECT club_id FROM clubs WHERE club_id = :clubId", {
    clubId,
  });
  if (!clubRows[0]) return res.status(404).json({ error: "Club not found." });

  if (!canManageClub(req.user, clubId)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }

  const validation = validateEventFields(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });
  const { title, start, bringNote, capacity } = validation;

  const categoryId = await findCategoryIdByName(category);
  if (!categoryId) return res.status(400).json({ error: `Unknown category: ${category}` });

  const id = `custom-${Date.now()}`;
  await pool.query(
    `INSERT INTO events
      (event_id, club_id, title, description, category_id,
       event_date, event_time, location, image_url, bring_note, capacity)
     VALUES
      (:id, :clubId, :title, :description, :categoryId,
       :date, :time, :location, :imageUrl, :bringNote, :capacity)`,
    {
      id,
      clubId,
      title,
      description: typeof description === "string" ? description.trim() : "",
      categoryId,
      date: start.date,
      time: start.time,
      location: typeof location === "string" ? location.trim() : "",
      imageUrl: imageUrl || null,
      bringNote: bringNote || null,
      capacity,
    }
  );

  const [rows] = await pool.query(
    `${EVENT_LIST_QUERY} WHERE e.event_id = :id GROUP BY e.event_id`,
    { id }
  );
  res.status(201).json({ event: rowToEvent(rows[0]) });
});

/**
 * PUT /api/events/:id — update an existing custom event.
 */
eventsRouter.put("/:id", requireAuth, async (req, res) => {
  const eventId = req.params.id;

  const [existingRows] = await pool.query("SELECT * FROM events WHERE event_id = :id", {
    id: eventId,
  });
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: "Event not found." });

  // Seed events are read-only.
  if (!eventId.startsWith("custom-")) {
    return res.status(403).json({ error: "Seed events are read-only." });
  }

  if (!canManageClub(req.user, existing.club_id)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }

  const { description, category, location, imageUrl } = req.body;

  const validation = validateEventFields(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });
  const { title, start, bringNote, capacity } = validation;

  const categoryId = await findCategoryIdByName(category);
  if (!categoryId) return res.status(400).json({ error: `Unknown category: ${category}` });

  await pool.query(
    `UPDATE events
     SET title = :title,
         description = :description,
         category_id = :categoryId,
         event_date = :date,
         event_time = :time,
         location = :location,
         image_url = :imageUrl,
         bring_note = :bringNote,
         capacity = :capacity
     WHERE event_id = :id`,
    {
      id: eventId,
      title,
      description: typeof description === "string" ? description.trim() : "",
      categoryId,
      date: start.date,
      time: start.time,
      location: typeof location === "string" ? location.trim() : "",
      imageUrl: imageUrl || null,
      bringNote: bringNote || null,
      capacity,
    }
  );

  const [rows] = await pool.query(
    `${EVENT_LIST_QUERY} WHERE e.event_id = :id GROUP BY e.event_id`,
    { id: eventId }
  );
  res.json({ event: rowToEvent(rows[0]) });
});

/**
 * DELETE /api/events/:id — delete a custom event.
 */
eventsRouter.delete("/:id", requireAuth, async (req, res) => {
  const eventId = req.params.id;

  const [existingRows] = await pool.query("SELECT * FROM events WHERE event_id = :id", {
    id: eventId,
  });
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: "Event not found." });

  // Seed events are read-only.
  if (!eventId.startsWith("custom-")) {
    return res.status(403).json({ error: "Seed events are read-only." });
  }

  if (!canManageClub(req.user, existing.club_id)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }

  await pool.query("DELETE FROM events WHERE event_id = :id", { id: eventId });
  res.status(204).end();
});
