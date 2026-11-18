import { pool } from "../db.js";
import { requireAuth, requireCampusAdmin, canManageClub } from "../middleware/auth.js";
import { promoteUserToClubAdmin } from "../queries.js";
import { recordAudit } from "../audit.js";
import { createApiRouter } from "../middleware/apiGuards.js";

export const adminRequestsRouter = createApiRouter();

const REQUEST_LIST_QUERY = `
    SELECT r.*, u.name AS user_name, u.email AS user_email, c.name AS club_name
    FROM admin_requests r
    JOIN users u ON u.user_id = r.user_id
    JOIN clubs c ON c.club_id = r.club_id
`;

function rowToAdminRequest(row) {
  return {
    id: row.request_id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    clubId: row.club_id,
    clubName: row.club_name,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** GET /api/admin-requests — tier1 sees everyone; a campus admin sees their campus. */
adminRequestsRouter.get("/", requireAuth, requireCampusAdmin, async (req, res) => {
  const where = ["r.status = 'pending'"];
  const params = {};
  if (req.user.role === "campus_admin") {
    where.push("c.campus_id = :campusId");
    params.campusId = req.user.campusId;
  }

  const [rows] = await pool.query(
    `${REQUEST_LIST_QUERY} WHERE ${where.join(" AND ")} ORDER BY r.created_at`,
    params
  );
  res.json({ requests: rows.map(rowToAdminRequest) });
});

/**
 * POST /api/admin-requests — any logged-in member.
 * Requests admin access to a club they don't already manage.
 */
adminRequestsRouter.post("/", requireAuth, async (req, res) => {
  const { clubId } = req.body;
  if (!clubId) return res.status(400).json({ error: "clubId is required." });

  const [clubRows] = await pool.query(
    "SELECT club_id, campus_id FROM clubs WHERE club_id = :clubId",
    { clubId }
  );
  if (!clubRows[0]) return res.status(404).json({ error: "Club not found." });
  if (req.user.role !== "tier1" && clubRows[0].campus_id !== req.user.campusId) {
    return res.status(403).json({ error: "That club belongs to another campus." });
  }

  if (canManageClub(req.user, clubId)) {
    return res.status(400).json({ error: "You already manage this club." });
  }

  const [existing] = await pool.query(
    `SELECT request_id FROM admin_requests
        WHERE user_id = :userId AND club_id = :clubId AND status = 'pending'`,
    { userId: req.user.id, clubId }
  );
  if (existing[0])
    return res.status(409).json({ error: "You already have a pending request for this club." });

  await pool.query(`INSERT INTO admin_requests (user_id, club_id) VALUES (:userId, :clubId)`, {
    userId: req.user.id,
    clubId,
  });
  res.status(201).json({ ok: true });
});

/** POST /api/admin-requests/:id/approve — tier1 or the club's campus admin. */
adminRequestsRouter.post("/:id/approve", requireAuth, requireCampusAdmin, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.*, c.campus_id
     FROM admin_requests r
     JOIN clubs c ON c.club_id = r.club_id
     WHERE r.request_id = :id`,
    { id: req.params.id }
  );
  const request = rows[0];
  if (!request) return res.status(404).json({ error: "Request not found." });
  if (req.user.role === "campus_admin" && request.campus_id !== req.user.campusId) {
    return res.status(403).json({ error: "That request belongs to another campus." });
  }
  if (request.status !== "pending") {
    return res.status(400).json({ error: "That request has already been handled." });
  }

  await promoteUserToClubAdmin(request.user_id, request.club_id);
  await pool.query("UPDATE admin_requests SET status = 'approved' WHERE request_id = :id", {
    id: req.params.id,
  });
  await recordAudit(req, {
    action: "admin_request.approve",
    targetType: "club",
    targetId: request.club_id,
    detail: { requestId: request.request_id, userId: request.user_id },
  });
  res.json({ ok: true });
});

/** POST /api/admin-requests/:id/deny — tier1 or the club's campus admin. */
adminRequestsRouter.post("/:id/deny", requireAuth, requireCampusAdmin, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.request_id, r.status, c.campus_id
     FROM admin_requests r
     JOIN clubs c ON c.club_id = r.club_id
     WHERE r.request_id = :id`,
    { id: req.params.id }
  );
  const request = rows[0];
  if (!request) return res.status(404).json({ error: "Pending request not found." });
  if (req.user.role === "campus_admin" && request.campus_id !== req.user.campusId) {
    return res.status(403).json({ error: "That request belongs to another campus." });
  }

  const [result] = await pool.query(
    `UPDATE admin_requests SET status = 'denied' WHERE request_id = :id AND status = 'pending'`,
    {
      id: req.params.id,
    }
  );
  if (result.affectedRows === 0)
    return res.status(404).json({ error: "Pending request not found." });
  await recordAudit(req, {
    action: "admin_request.deny",
    targetType: "club",
    targetId: null,
    detail: { requestId: req.params.id },
  });
  res.json({ ok: true });
});
