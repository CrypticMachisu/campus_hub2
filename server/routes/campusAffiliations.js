// Campus affiliation requests.
//
// A member's users.campus_id remains their home campus. This resource holds
// additional campuses: a request is pending until that campus's admin (or
// tier 1) approves or denies it. An active affiliation unlocks the read-only
// My network club directory; events, posts and commitments remain campus-local.
import { pool } from "../db.js";
import { requireAuth, requireCampusAdmin } from "../middleware/auth.js";
import { recordAudit } from "../audit.js";
import { createApiRouter } from "../middleware/apiGuards.js";

export const campusAffiliationsRouter = createApiRouter();

const REQUEST_KINDS = new Set(["exchange", "dual", "staff", "alumni", "other"]);
const STATUSES = new Set(["pending", "active", "denied", "revoked"]);

const AFFILIATION_SELECT = `
  SELECT a.affiliation_id, a.user_id, a.campus_id, a.kind, a.status, a.note,
    a.requested_at, a.decided_at, a.decided_by,
    c.name AS campus_name, c.slug AS campus_slug,
    u.name AS user_name, u.email AS user_email,
    home.name AS home_campus_name,
    d.name AS decided_by_name
  FROM user_campus_affiliations a
  JOIN users u ON u.user_id = a.user_id
  JOIN campuses c ON c.campus_id = a.campus_id
  JOIN campuses home ON home.campus_id = u.campus_id
  LEFT JOIN users d ON d.user_id = a.decided_by`;

function rowToAffiliation(row) {
  return {
    id: row.affiliation_id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    homeCampusName: row.home_campus_name,
    campusId: row.campus_id,
    campusName: row.campus_name,
    campusSlug: row.campus_slug,
    kind: row.kind,
    status: row.status,
    note: row.note,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    decidedByName: row.decided_by_name,
  };
}

async function loadAffiliation(affiliationId) {
  const [rows] = await pool.query(`${AFFILIATION_SELECT} WHERE a.affiliation_id = :affiliationId`, {
    affiliationId,
  });
  return rows[0] ? rowToAffiliation(rows[0]) : null;
}

/** GET /campus-affiliations/me — home plus every request the member has made. */
campusAffiliationsRouter.get("/me", requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `${AFFILIATION_SELECT}
     WHERE a.user_id = :userId
     ORDER BY FIELD(a.status, 'active', 'pending', 'denied', 'revoked'),
       FIELD(a.kind, 'home', 'exchange', 'dual', 'staff', 'alumni', 'other'),
       c.name`,
    { userId: req.user.id }
  );
  res.json({
    homeCampusId: req.user.campusId,
    homeCampusName: req.user.campusName,
    affiliations: rows.map(rowToAffiliation),
  });
});

/** POST /campus-affiliations/me — request an additional campus. */
campusAffiliationsRouter.post("/me", requireAuth, async (req, res) => {
  const body = req.body || {};
  const campusId = String(body.campusId || "").trim();
  const kind = String(body.kind || "other").trim();
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!campusId) return res.status(400).json({ error: "Choose a campus." });
  if (campusId === req.user.campusId) {
    return res.status(400).json({ error: "That is already your home campus." });
  }
  if (!REQUEST_KINDS.has(kind)) {
    return res.status(400).json({ error: "Choose a valid affiliation type." });
  }
  if (note.length > 500) {
    return res.status(400).json({ error: "Keep the note under 500 characters." });
  }

  const [campusRows] = await pool.query(
    "SELECT campus_id FROM campuses WHERE campus_id = :campusId",
    { campusId }
  );
  if (!campusRows[0]) return res.status(404).json({ error: "Campus not found." });

  const [existingRows] = await pool.query(
    `SELECT affiliation_id, status FROM user_campus_affiliations
     WHERE user_id = :userId AND campus_id = :campusId`,
    { userId: req.user.id, campusId }
  );
  const existing = existingRows[0];
  if (existing?.status === "active") {
    return res.status(409).json({ error: "You already belong to that campus." });
  }
  if (existing?.status === "pending") {
    return res.status(409).json({ error: "That campus request is already pending." });
  }

  let affiliationId;
  if (existing) {
    // A denied or revoked request can be retried without losing the row's
    // history in the audit log.
    await pool.query(
      `UPDATE user_campus_affiliations
       SET kind = :kind, status = 'pending', note = :note,
         requested_at = NOW(), decided_at = NULL, decided_by = NULL
       WHERE affiliation_id = :affiliationId`,
      { kind, note: note || null, affiliationId: existing.affiliation_id }
    );
    affiliationId = existing.affiliation_id;
  } else {
    const [result] = await pool.query(
      `INSERT INTO user_campus_affiliations (user_id, campus_id, kind, note)
       VALUES (:userId, :campusId, :kind, :note)`,
      { userId: req.user.id, campusId, kind, note: note || null }
    );
    affiliationId = result.insertId;
  }

  await recordAudit(req, {
    action: "campus.affiliation.request",
    targetType: "campus_affiliation",
    targetId: affiliationId,
    detail: { campusId, kind },
  });
  res.status(201).json({ affiliation: await loadAffiliation(affiliationId) });
});

/** DELETE /campus-affiliations/me/:id — cancel only your own pending request. */
campusAffiliationsRouter.delete("/me/:id", requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT affiliation_id, user_id, campus_id, status
     FROM user_campus_affiliations WHERE affiliation_id = :id`,
    { id: req.params.id }
  );
  const row = rows[0];
  if (!row || row.user_id !== req.user.id) {
    return res.status(404).json({ error: "Affiliation request not found." });
  }
  if (row.status !== "pending") {
    return res.status(400).json({ error: "Only a pending request can be cancelled." });
  }

  await pool.query("DELETE FROM user_campus_affiliations WHERE affiliation_id = :id", {
    id: row.affiliation_id,
  });
  await recordAudit(req, {
    action: "campus.affiliation.cancel",
    targetType: "campus_affiliation",
    targetId: row.affiliation_id,
    detail: { campusId: row.campus_id },
  });
  res.json({ cancelled: true });
});

/**
 * GET /campus-affiliations?status=pending — the approval queue.
 * A campus admin sees only their campus; tier 1 may filter or see everything.
 */
campusAffiliationsRouter.get("/", requireAuth, requireCampusAdmin, async (req, res) => {
  const status = String(req.query.status || "pending");
  if (!STATUSES.has(status)) {
    return res.status(400).json({ error: "Unknown affiliation status." });
  }

  const where = ["a.status = :status"];
  const params = { status };
  if (req.user.role === "campus_admin") {
    where.push("a.campus_id = :campusId");
    params.campusId = req.user.campusId;
  } else if (req.query.campusId) {
    where.push("a.campus_id = :campusId");
    params.campusId = req.query.campusId;
  }

  const [rows] = await pool.query(
    `${AFFILIATION_SELECT}
     WHERE ${where.join(" AND ")}
     ORDER BY a.requested_at, a.affiliation_id`,
    params
  );
  res.json({ affiliations: rows.map(rowToAffiliation) });
});

async function decide(req, res, status, action) {
  const [rows] = await pool.query(
    `SELECT affiliation_id, user_id, campus_id, kind, status
     FROM user_campus_affiliations WHERE affiliation_id = :id`,
    { id: req.params.id }
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: "Affiliation request not found." });
  if (req.user.role === "campus_admin" && row.campus_id !== req.user.campusId) {
    return res.status(403).json({ error: "That request belongs to another campus." });
  }
  if (row.user_id === req.user.id) {
    return res.status(403).json({ error: "You cannot decide your own campus affiliation." });
  }
  if (row.status !== "pending") {
    return res.status(409).json({ error: "That request has already been decided." });
  }

  const [result] = await pool.query(
    `UPDATE user_campus_affiliations
     SET status = :status, decided_at = NOW(), decided_by = :decidedBy
     WHERE affiliation_id = :id AND status = 'pending'`,
    { status, decidedBy: req.user.id, id: row.affiliation_id }
  );
  if (result.affectedRows === 0) {
    return res.status(409).json({ error: "That request has already been decided." });
  }

  await recordAudit(req, {
    action,
    targetType: "campus_affiliation",
    targetId: row.affiliation_id,
    detail: { campusId: row.campus_id, userId: row.user_id, kind: row.kind },
  });
  res.json({ affiliation: await loadAffiliation(row.affiliation_id) });
}

/** POST /campus-affiliations/:id/approve */
campusAffiliationsRouter.post("/:id/approve", requireAuth, requireCampusAdmin, async (req, res) => {
  return decide(req, res, "active", "campus.affiliation.approve");
});

/** POST /campus-affiliations/:id/deny */
campusAffiliationsRouter.post("/:id/deny", requireAuth, requireCampusAdmin, async (req, res) => {
  return decide(req, res, "denied", "campus.affiliation.deny");
});
