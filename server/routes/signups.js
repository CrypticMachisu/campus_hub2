import { Router } from "express";
import { pool } from "../db.js";
import { rowToSignup } from "../rowMappers.js";
import { requireAuth, canManageClub } from "../middleware/auth.js";

export const signupsRouter = Router();

/** GET /api/signups/mine — the logged-in user's own signups. */
signupsRouter.get("/mine", requireAuth, async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM event_signups WHERE user_id = :userId", {
    userId: req.user.id,
  });
  res.json({ signups: rows.map(rowToSignup) });
});

/**
 * GET /api/signups/event/:eventId — everyone signed up for an event.
 * Requires admin access to the event's club (this is the Dashboard view).
 */
signupsRouter.get("/event/:eventId", requireAuth, async (req, res) => {
  const [eventRows] = await pool.query("SELECT club_id FROM events WHERE event_id = :id", {
    id: req.params.eventId,
  });
  const event = eventRows[0];
  if (!event) return res.status(404).json({ error: "Event not found." });
  if (!canManageClub(req.user, event.club_id)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }

  const [rows] = await pool.query("SELECT * FROM event_signups WHERE event_id = :eventId", {
    eventId: req.params.eventId,
  });
  res.json({ signups: rows.map(rowToSignup) });
});

/**
 * POST /api/signups — sign the logged-in user up for an event.
 * Idempotent: if they're already signed up, returns the existing row
 * instead of erroring (the table's uq_event_user constraint backs this
 * up at the DB level too).
 */
signupsRouter.post("/", requireAuth, async (req, res) => {
  const { eventId } = req.body;
  if (!eventId) return res.status(400).json({ error: "eventId is required." });

  const [eventRows] = await pool.query("SELECT event_id FROM events WHERE event_id = :eventId", {
    eventId,
  });
  if (!eventRows[0]) return res.status(404).json({ error: "Event not found." });

  const [existing] = await pool.query(
    "SELECT * FROM event_signups WHERE event_id = :eventId AND user_id = :userId",
    { eventId, userId: req.user.id }
  );
  if (existing[0]) return res.status(200).json({ signup: rowToSignup(existing[0]) });

  const id = `signup-${Date.now()}`;
  await pool.query(
    `INSERT INTO event_signups (signup_id, event_id, user_id, name_snapshot, email_snapshot)
     VALUES (:id, :eventId, :userId, :name, :email)`,
    { id, eventId, userId: req.user.id, name: req.user.name, email: req.user.email }
  );

  const [rows] = await pool.query("SELECT * FROM event_signups WHERE signup_id = :id", { id });
  res.status(201).json({ signup: rowToSignup(rows[0]) });
});

/** DELETE /api/signups/:id — cancel a signup. Only the owner can cancel it. */
signupsRouter.delete("/:id", requireAuth, async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM event_signups WHERE signup_id = :id", {
    id: req.params.id,
  });
  const signup = rows[0];
  if (!signup) return res.status(404).json({ error: "Signup not found." });
  if (signup.user_id !== req.user.id) {
    return res.status(403).json({ error: "You can only cancel your own signups." });
  }

  await pool.query("DELETE FROM event_signups WHERE signup_id = :id", { id: req.params.id });
  res.status(204).end();
});
