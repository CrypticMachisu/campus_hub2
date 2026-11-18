import { pool } from "../db.js";
import { rowToClub } from "../rowMappers.js";
import {
  findCategoryIdByName,
  findClubMembers,
  addClubMember,
  removeClubMember,
} from "../queries.js";
import { requireAuth, optionalAuth, canManageClub } from "../middleware/auth.js";
import { campusExists, defaultCampusId, readCampusScope } from "../campus.js";
import { recordAudit } from "../audit.js";
import { createApiRouter } from "../middleware/apiGuards.js";

export const clubsRouter = createApiRouter();

/** GET /api/clubs — clubs the reader is allowed to discover, grouped by campus. */
clubsRouter.get("/", optionalAuth, async (req, res) => {
  const scope = await readCampusScope(req);
  if (scope.error) return res.status(scope.status).json({ error: scope.error });

  const where = [];
  const params = {};
  if (scope.campusId) {
    where.push("c.campus_id = :campusId");
    params.campusId = scope.campusId;
  }

  const [rows] = await pool.query(
    `SELECT c.*, camp.name AS campus_name, cat.name AS category_name,
            GROUP_CONCAT(DISTINCT ct.tag) AS tags
    FROM clubs c
    JOIN campuses camp ON camp.campus_id = c.campus_id
    JOIN categories cat ON cat.category_id = c.category_id
    LEFT JOIN club_tags ct ON ct.club_id = c.club_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY c.club_id, camp.name
    ORDER BY c.name`,
    params
  );
  res.json({ clubs: rows.map(rowToClub) });
});

/**
 * POST /api/clubs — tier1 or a campus admin creates a club.
 * A campus admin is pinned to their own campus; tier1 may name a campus and
 * defaults to the first one. tags can be a comma-separated string or an array;
 * either way it's normalized to a trimmed, deduped list before insert.
 */
clubsRouter.post("/", requireAuth, async (req, res) => {
  if (!["tier1", "campus_admin"].includes(req.user.role)) {
    return res.status(403).json({ error: "Campus admin access required." });
  }

  const { name, description, category, logoUrl, meetingTime, meetingLocation, tags } = req.body;

  const trimmedName = (name || "").trim();
  if (!trimmedName) return res.status(400).json({ error: "Club name is required." });

  const requestedCampusId =
    req.user.role === "tier1" ? req.body.campusId || (await defaultCampusId()) : req.user.campusId;
  if (!requestedCampusId) {
    return res.status(400).json({ error: "campusId is required." });
  }
  if (!(await campusExists(requestedCampusId))) {
    return res.status(404).json({ error: "Campus not found." });
  }

  const categoryId = await findCategoryIdByName(category);
  if (!categoryId) return res.status(400).json({ error: `Unknown category: ${category}` });

  const id = `club-${Date.now()}`;
  await pool.query(
    `INSERT INTO clubs
      (club_id, campus_id, name, category_id, description, logo_url, meeting_time, meeting_location)
    VALUES
      (:id, :campusId, :name, :categoryId, :description, :logoUrl, :meetingTime, :meetingLocation)`,
    {
      id,
      campusId: requestedCampusId,
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
    `SELECT c.*, camp.name AS campus_name, cat.name AS category_name,
            GROUP_CONCAT(DISTINCT ct.tag) AS tags
    FROM clubs c
    JOIN campuses camp ON camp.campus_id = c.campus_id
    JOIN categories cat ON cat.category_id = c.category_id
    LEFT JOIN club_tags ct ON ct.club_id = c.club_id
    WHERE c.club_id = :id
    GROUP BY c.club_id, camp.name`,
    { id }
  );
  res.status(201).json({ club: rowToClub(rows[0]) });
});

const PLAYBOOK_LIMITS = {
  rsvpLabel: 40,
  bringNote: 240,
  focusTitle: 120,
  focusBody: 500,
  focusLink: 300,
};

/** Trim + cap an override string. Anything non-string becomes "" (= no override). */
function cleanOverride(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * PUT /api/clubs/:clubId — set a club's playbook overrides (admins only).
 * Every field is optional: sending an empty string clears the override and
 * the member workspace falls back to the category default.
 */
clubsRouter.put("/:clubId", requireAuth, async (req, res) => {
  const { clubId } = req.params;

  const [clubRows] = await pool.query("SELECT club_id FROM clubs WHERE club_id = :clubId", {
    clubId,
  });
  if (!clubRows[0]) return res.status(404).json({ error: "Club not found." });
  if (!canManageClub(req.user, clubId)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }

  const body = req.body || {};
  const rawItems = Array.isArray(body.focusItems)
    ? body.focusItems
    : String(body.focusItems || "").split("\n");
  const focusItems = rawItems
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((item) => item.slice(0, 120));

  const focusLink = cleanOverride(body.focusLink, PLAYBOOK_LIMITS.focusLink);
  if (focusLink && !/^https?:\/\//i.test(focusLink)) {
    return res.status(400).json({ error: "The link must start with http:// or https://." });
  }

  const overrides = {
    clubId,
    rsvpLabel: cleanOverride(body.rsvpLabel, PLAYBOOK_LIMITS.rsvpLabel),
    bringNote: cleanOverride(body.bringNote, PLAYBOOK_LIMITS.bringNote),
    focusTitle: cleanOverride(body.focusTitle, PLAYBOOK_LIMITS.focusTitle),
    focusBody: cleanOverride(body.focusBody, PLAYBOOK_LIMITS.focusBody),
    focusItems: focusItems.length > 0 ? focusItems.join("\n") : null,
    focusLink: focusLink || null,
  };

  await pool.query(
    `UPDATE clubs
     SET rsvp_label = :rsvpLabel,
         bring_note = :bringNote,
         focus_title = :focusTitle,
         focus_body = :focusBody,
         focus_items = :focusItems,
         focus_link = :focusLink
     WHERE club_id = :clubId`,
    overrides
  );
  await recordAudit(req, {
    action: "club.playbook.update",
    targetType: "club",
    targetId: clubId,
    detail: {
      rsvpLabel: overrides.rsvpLabel,
      bringNote: overrides.bringNote,
      focusTitle: overrides.focusTitle,
      focusBody: overrides.focusBody,
      focusItems,
      focusLink: overrides.focusLink,
    },
  });

  const [rows] = await pool.query(
    `SELECT c.*, camp.name AS campus_name, cat.name AS category_name,
            GROUP_CONCAT(DISTINCT ct.tag) AS tags
    FROM clubs c
    JOIN campuses camp ON camp.campus_id = c.campus_id
    JOIN categories cat ON cat.category_id = c.category_id
    LEFT JOIN club_tags ct ON ct.club_id = c.club_id
    WHERE c.club_id = :clubId
    GROUP BY c.club_id, camp.name`,
    { clubId }
  );
  res.json({ club: rowToClub(rows[0]) });
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

  const [clubRows] = await pool.query(
    "SELECT club_id, campus_id FROM clubs WHERE club_id = :clubId",
    { clubId }
  );
  if (!clubRows[0]) return res.status(404).json({ error: "Club not found." });
  if (req.user.role !== "tier1" && clubRows[0].campus_id !== req.user.campusId) {
    return res.status(403).json({ error: "That club belongs to another campus." });
  }

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
