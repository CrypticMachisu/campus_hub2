import { Router } from "express";
import { pool } from "../db.js";
import { rowToClub } from "../rowMappers.js";
import {
  findCategoryIdByName,
  findClubMembers,
  addClubMember,
  removeClubMember,
} from "../queries.js";
import { requireAuth, requireTier1, canManageClub } from "../middleware/auth.js";

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
    : (tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

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
/**
 * GET /api/clubs/:clubId/members — the club's roster.
 * Visible to that club's own members and admins only. Email addresses are
 * only included for admins; everyone else gets name/join date.
 */
clubsRouter.get("/:clubId/members", requireAuth, async (req, res) => {
  const { clubId } = req.params;
  const isAdmin = canManageClub(req.user, clubId);
  const isMember = req.user.memberOfClubs.includes(clubId);

  if (!isAdmin && !isMember) {
    return res.status(403).json({ error: "You're not a member of that club." });
  }

  const rows = await findClubMembers(clubId);
  res.json({
    members: rows.map((row) => ({
      id: row.user_id,
      name: row.name,
      role: row.role,
      joinedAt: row.joined_at,
      ...(isAdmin ? { email: row.email } : {}),
    })),
  });
});

/**
 * POST /api/clubs/:clubId/members — join a club as the current user.
 * Idempotent: joining one you're already in just returns the user again.
 * Returns the refreshed user so the client can flip views immediately.
 */
clubsRouter.post("/:clubId/members", requireAuth, async (req, res) => {
  const { clubId } = req.params;

  const [clubRows] = await pool.query("SELECT club_id FROM clubs WHERE club_id = :clubId", {
    clubId,
  });
  if (!clubRows[0]) return res.status(404).json({ error: "Club not found." });

  const user = await addClubMember(req.user.id, clubId);
  res.status(201).json({ user });
});

/**
 * DELETE /api/clubs/:clubId/members/me — leave a club.
 * Club admins keep their admin link, so they still get the club view until
 * a tier 1 admin revokes that separately; this only drops membership.
 */
clubsRouter.delete("/:clubId/members/me", requireAuth, async (req, res) => {
  const user = await removeClubMember(req.user.id, req.params.clubId);
  res.json({ user });
});
