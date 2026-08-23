import { Router } from "express";
import { pool } from "../db.js";
import { rowToClub } from "../rowMappers.js";
import { findCategoryIdByName } from "../queries.js";
import { requireAuth, requireTier1 } from "../middleware/auth.js";

export const clubsRouter = Router();

/** GET /api/clubs — all clubs, with category name and tags joined in. */
clubsRouter.get("/", async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.*, cat.name AS category_name, GROUP_CONCAT(DISTINCT ct.tag) AS tags
    FROM clubs c
    JOIN categories cat ON cat.category_id = c.category_id
    LEFT JOIN club_tags ct ON ct.club_id = c.club_id
    GROUP BY c.club_id
    ORDER BY c.name`
  );
  res.json({ clubs: rows.map(rowToClub) });
});

/**
 * POST /api/clubs — tier1 only. Creates a new club (+ optional tags).
 * tags can be a comma-separated string or an array; either way it's
 * normalized to a trimmed, deduped list before insert.
 */
clubsRouter.post("/", requireAuth, requireTier1, async (req, res) => {
  const { name, description, category, logoUrl, meetingTime, meetingLocation, tags } = req.body;

  const trimmedName = (name || "").trim();
  if (!trimmedName) return res.status(400).json({ error: "Club name is required." });

  const categoryId = await findCategoryIdByName(category);
  if (!categoryId) return res.status(400).json({ error: `Unknown category: ${category}` });

  const id = `club-${Date.now()}`;
  await pool.query(
    `INSERT INTO clubs (club_id, name, category_id, description, logo_url, meeting_time, meeting_location)
    VALUES (:id, :name, :categoryId, :description, :logoUrl, :meetingTime, :meetingLocation)`,
    {
      id,
      name: trimmedName,
      categoryId,
      description: (description || "").trim(),
      logoUrl: logoUrl || null,
      meetingTime: (meetingTime || "").trim(),
      meetingLocation: (meetingLocation || "").trim(),
    }
  );

  const tagList = Array.isArray(tags)
    ? tags
    : (tags || "").split(",").map((t) => t.trim()).filter(Boolean);

  for (const tag of tagList) {
    await pool.query(`INSERT IGNORE INTO club_tags (club_id, tag) VALUES (:id, :tag)`, {
      id,
      tag,
    });
  }

  const [rows] = await pool.query(
    `SELECT c.*, cat.name AS category_name, GROUP_CONCAT(DISTINCT ct.tag) AS tags
    FROM clubs c
    JOIN categories cat ON cat.category_id = c.category_id
    LEFT JOIN club_tags ct ON ct.club_id = c.club_id
    WHERE c.club_id = :id
    GROUP BY c.club_id`,
    { id }
  );
  res.status(201).json({ club: rowToClub(rows[0]) });
});