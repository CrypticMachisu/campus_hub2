import { Router } from "express";
import { pool } from "../db.js";
import { rowToAnnouncement } from "../rowMappers.js";
import { requireAuth, canManageClub } from "../middleware/auth.js";

export const announcementsRouter = Router();

/** GET /api/announcements?clubId=... */
announcementsRouter.get("/", async (req, res) => {
  const { clubId } = req.query;
  if (!clubId) return res.status(400).json({ error: "clubId is required." });

  const [clubRows] = await pool.query("SELECT club_id FROM clubs WHERE club_id = :clubId", { clubId });
  if (!clubRows[0]) return res.status(404).json({ error: "Club not found." });

  const [rows] = await pool.query(
    "SELECT * FROM announcements WHERE club_id = :clubId ORDER BY created_at DESC",
    { clubId }
  );
  res.json({ announcements: rows.map(rowToAnnouncement) });
});

/** POST /api/announcements — post an announcement (club admins only). */
announcementsRouter.post("/", requireAuth, async (req, res) => {
  const { clubId, text } = req.body;
  const trimmed = (text || "").trim();

  // Validate the club exists BEFORE the FK-constrained insert — tier1 can
  // "manage" any id, so without this a bad clubId used to reach the DB and
  // explode (and, before express-async-errors, crash the server).
  const [clubRows] = await pool.query("SELECT club_id FROM clubs WHERE club_id = :clubId", {
    clubId,
  });
  if (!clubRows[0]) return res.status(404).json({ error: "Club not found." });

  if (!canManageClub(req.user, clubId)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }
  if (!trimmed) return res.status(400).json({ error: "Announcement text can't be empty." });

  const id = `announcement-${Date.now()}`;
  await pool.query(
    "INSERT INTO announcements (announcement_id, club_id, announcement_text) VALUES (:id, :clubId, :text)",
    { id, clubId, text: trimmed }
  );

  const [rows] = await pool.query("SELECT * FROM announcements WHERE announcement_id = :id", {
    id,
  });
  res.status(201).json({ announcement: rowToAnnouncement(rows[0]) });
});
