import { pool } from "../db.js";
import { rowToUser } from "../rowMappers.js";
import { findUserById, promoteUserToClubAdmin, demoteUserFromClubAdmin } from "../queries.js";
import { requireAuth, requireCampusAdmin, requireTier1 } from "../middleware/auth.js";
import { recordAudit } from "../audit.js";
import { createApiRouter } from "../middleware/apiGuards.js";

export const usersRouter = createApiRouter();

/** GET /api/users — tier1 sees everyone; a campus admin sees their campus only. */
usersRouter.get("/", requireAuth, requireCampusAdmin, async (req, res) => {
  const where = ["u.role != 'tier1'"];
  const params = {};
  if (req.user.role === "campus_admin") {
    where.push("u.campus_id = :campusId");
    params.campusId = req.user.campusId;
  }

  const [rows] = await pool.query(
    `SELECT u.*, camp.name AS campus_name, camp.slug AS campus_slug,
      GROUP_CONCAT(DISTINCT ca.club_id) AS admin_club_ids,
      GROUP_CONCAT(DISTINCT cm.club_id) AS member_club_ids
    FROM users u
    LEFT JOIN campuses camp ON camp.campus_id = u.campus_id
    LEFT JOIN club_admins ca ON ca.user_id = u.user_id
    LEFT JOIN club_members cm ON cm.user_id = u.user_id
    WHERE ${where.join(" AND ")}
    GROUP BY u.user_id, camp.name, camp.slug
    ORDER BY u.name`,
    params
  );
  res.json({ users: rows.map(rowToUser) });
});

/**
 * POST /api/users/:id/promote — tier1 or a campus admin.
 * Makes the target user a tier2 admin for the given club. Both the caller and
 * the target user must be on the club's campus; one campus per account is the
 * Phase 4 rule.
 */
usersRouter.post("/:id/promote", requireAuth, requireCampusAdmin, async (req, res) => {
  const { clubId } = req.body;
  if (!clubId) return res.status(400).json({ error: "Choose a club first." });

  const [clubRows] = await pool.query(
    "SELECT club_id, campus_id FROM clubs WHERE club_id = :clubId",
    { clubId }
  );
  const club = clubRows[0];
  if (!club) return res.status(404).json({ error: "Club not found." });
  if (req.user.role === "campus_admin" && club.campus_id !== req.user.campusId) {
    return res.status(403).json({ error: "That club belongs to another campus." });
  }

  const [userRows] = await pool.query(
    "SELECT user_id, role, campus_id FROM users WHERE user_id = :id",
    { id: req.params.id }
  );
  const target = userRows[0];
  if (!target) return res.status(404).json({ error: "User not found." });

  if (target.role === "tier1") {
    return res.status(400).json({ error: "That person is already a platform admin." });
  }
  if (target.campus_id !== club.campus_id) {
    return res.status(400).json({ error: "That user belongs to another campus." });
  }

  const updatedUser = await promoteUserToClubAdmin(req.params.id, clubId);
  await recordAudit(req, {
    action: "user.promote",
    targetType: "user",
    targetId: req.params.id,
    detail: { clubId },
  });
  res.json({ user: updatedUser });
});

/**
 * POST /api/users/:id/campus-admin — tier1 only.
 * Promotes a user to campus admin for their existing campus. A campus admin
 * manages every club on that campus, so no club link is required.
 */
usersRouter.post("/:id/campus-admin", requireAuth, requireTier1, async (req, res) => {
  const [userRows] = await pool.query(
    "SELECT user_id, role, campus_id FROM users WHERE user_id = :id",
    { id: req.params.id }
  );
  const target = userRows[0];
  if (!target) return res.status(404).json({ error: "User not found." });
  if (target.role === "tier1") {
    return res.status(400).json({ error: "Platform admins already have access to every campus." });
  }

  await pool.query("UPDATE users SET role = 'campus_admin' WHERE user_id = :id", {
    id: req.params.id,
  });
  const user = await findUserById(req.params.id);
  await recordAudit(req, {
    action: "user.campus_admin.promote",
    targetType: "user",
    targetId: req.params.id,
    detail: { campusId: target.campus_id },
  });
  res.json({ user });
});

/** POST /api/users/:id/campus-admin/remove — tier1 only. */
usersRouter.delete("/:id/campus-admin", requireAuth, requireTier1, async (req, res) => {
  const [userRows] = await pool.query("SELECT user_id, role FROM users WHERE user_id = :id", {
    id: req.params.id,
  });
  const target = userRows[0];
  if (!target) return res.status(404).json({ error: "User not found." });
  if (target.role !== "campus_admin") {
    return res.status(400).json({ error: "That user is not a campus admin." });
  }

  const [links] = await pool.query(
    "SELECT COUNT(*) AS count FROM club_admins WHERE user_id = :id",
    { id: req.params.id }
  );
  const nextRole = Number(links[0].count) > 0 ? "tier2" : "member";
  await pool.query("UPDATE users SET role = :role WHERE user_id = :id", {
    role: nextRole,
    id: req.params.id,
  });
  const user = await findUserById(req.params.id);
  await recordAudit(req, {
    action: "user.campus_admin.demote",
    targetType: "user",
    targetId: req.params.id,
    detail: { role: nextRole },
  });
  res.json({ user });
});

/**
 * POST /api/users/:id/demote — tier1 or a campus admin.
 * Removes the target user's admin access to the given club.
 */
usersRouter.post("/:id/demote", requireAuth, requireCampusAdmin, async (req, res) => {
  const { clubId } = req.body;
  if (!clubId) return res.status(400).json({ error: "Choose a club first." });

  const [clubRows] = await pool.query(
    "SELECT club_id, campus_id FROM clubs WHERE club_id = :clubId",
    { clubId }
  );
  if (!clubRows[0]) return res.status(404).json({ error: "Club not found." });
  if (req.user.role === "campus_admin" && clubRows[0].campus_id !== req.user.campusId) {
    return res.status(403).json({ error: "That club belongs to another campus." });
  }

  const [userRows] = await pool.query("SELECT user_id, role FROM users WHERE user_id = :id", {
    id: req.params.id,
  });
  if (!userRows[0]) return res.status(404).json({ error: "User not found." });
  if (userRows[0].role === "tier1") {
    return res.status(400).json({ error: "Platform admins can't be demoted here." });
  }

  const user = await demoteUserFromClubAdmin(req.params.id, clubId);
  await recordAudit(req, {
    action: "user.demote",
    targetType: "user",
    targetId: req.params.id,
    detail: { clubId },
  });
  res.json({ user });
});
