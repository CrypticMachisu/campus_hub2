import { Router } from "express";
import { pool } from "../db.js";
import { rowToAnnouncement } from "../rowMappers.js";
import { requireAuth, canManageClub } from "../middleware/auth.js";

export const announcementsRouter = Router();

/** GET /api/announcements?clubId=... */
announcementsRouter.get("/", async (req, res) => {
  const { clubId } = req.query;
  if (!clubId) return res.status(400).json({ error: "clubId is required." });

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
