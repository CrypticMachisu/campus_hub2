// Reports — a member's flag on a post or comment, and the officer's queue.
//
// Reporting requires a session and is deliberately one-per-person-per-target.
// Managers only see reports for clubs they manage; tier 1 sees every club's
// queue. Reporter identity is not returned to club managers — the queue carries
// the reason, the note and how many people flagged the same item.
import { pool } from "../db.js";
import { requireAuth, canManageClub } from "../middleware/auth.js";
import { createApiRouter } from "../middleware/apiGuards.js";
import { recordAudit } from "../audit.js";
import { notifyUsers } from "../notify.js";

export const reportsRouter = createApiRouter();

const REASONS = ["spam", "harassment", "off_topic", "other"];
const ACTIONS = ["dismiss", "hide", "remove"];

function reasonLabel(reason) {
  return (
    {
      spam: "Spam",
      harassment: "Harassment",
      off_topic: "Off topic",
      other: "Other",
    }[reason] || "Reported"
  );
}

/**
 * Resolve the thing being reported to the club that owns it.
 * Returns null when the target is missing or no longer publicly readable.
 */
async function resolveTarget(targetType, targetId) {
  if (targetType === "post") {
    const [rows] = await pool.query(
      "SELECT post_id AS id, club_id, body AS text, status FROM posts WHERE post_id = :targetId",
      { targetId }
    );
    const post = rows[0];
    if (!post || post.status !== "published") return null;
    return {
      id: post.id,
      clubId: post.club_id,
      text: post.text,
      status: post.status,
      targetType: "post",
    };
  }

  if (targetType !== "comment") return null;

  const [rows] = await pool.query(
    `SELECT c.comment_id AS id, c.comment_text AS text, c.target_type, c.target_id
     FROM comments c WHERE c.comment_id = :targetId`,
    { targetId }
  );
  const comment = rows[0];
  if (!comment) return null;

  let clubId = null;
  let visible = true;
  if (comment.target_type === "club") {
    clubId = comment.target_id;
  } else if (comment.target_type === "post") {
    const [posts] = await pool.query("SELECT club_id, status FROM posts WHERE post_id = :postId", {
      postId: comment.target_id,
    });
    clubId = posts[0]?.club_id ?? null;
    visible = posts[0]?.status === "published";
  } else {
    const table = comment.target_type === "event" ? "events" : "commitments";
    const idColumn = comment.target_type === "event" ? "event_id" : "commitment_id";
    const [targets] = await pool.query(
      `SELECT club_id FROM ${table} WHERE ${idColumn} = :targetId`,
      { targetId: comment.target_id }
    );
    clubId = targets[0]?.club_id ?? null;
  }

  if (!clubId || !visible) return null;
  return { id: comment.id, text: comment.text, status: "published", clubId, targetType: "comment" };
}

function rowToReport(row) {
  return {
    id: row.report_id,
    targetType: row.target_type,
    targetId: row.target_id,
    clubId: row.club_id,
    clubName: row.club_name,
    targetText: row.target_text || "",
    targetStatus: row.target_status || null,
    reason: row.reason,
    reasonLabel: reasonLabel(row.reason),
    note: row.note || "",
    reportCount: Number(row.report_count || 1),
    status: row.status,
    resolution: row.resolution || null,
    createdAt: row.created_at,
  };
}

/**
 * POST /reports — flag a post or comment.
 * A second report by the same person on the same item returns 409 instead of
 * silently piling rows into the queue.
 */
reportsRouter.post("/", requireAuth, async (req, res) => {
  const body = req.body || {};
  const targetType = typeof body.targetType === "string" ? body.targetType : "";
  const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  if (!["post", "comment"].includes(targetType) || !targetId) {
    return res.status(400).json({ error: "targetType and targetId are required." });
  }
  if (!REASONS.includes(reason)) {
    return res.status(400).json({ error: `reason must be one of: ${REASONS.join(", ")}.` });
  }

  const target = await resolveTarget(targetType, targetId);
  if (!target) return res.status(404).json({ error: "That content is no longer available." });

  try {
    await pool.query(
      `INSERT INTO reports
         (target_type, target_id, club_id, reporter_id, reason, note)
       VALUES (:targetType, :targetId, :clubId, :reporterId, :reason, :note)`,
      {
        targetType,
        targetId,
        clubId: target.clubId,
        reporterId: req.user.id,
        reason,
        note,
      }
    );
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "You've already reported this." });
    }
    throw err;
  }

  const [managers] = await pool.query("SELECT user_id FROM club_admins WHERE club_id = :clubId", {
    clubId: target.clubId,
  });
  try {
    await notifyUsers(
      managers.map((row) => row.user_id),
      {
        kind: "content_reported",
        title: `A ${targetType} was reported`,
        body: `${reasonLabel(reason)}. Review it from the club desk.`,
        link: `/dashboard/${target.clubId}`,
      }
    );
  } catch (err) {
    console.error("Could not notify managers about a report:", err.message);
  }

  await recordAudit(req, {
    action: "report.create",
    targetType,
    targetId,
    detail: { clubId: target.clubId, reason },
  });
  res.status(201).json({ reported: true });
});

/**
 * GET /reports?clubId=… — open reports for one club, or every club for tier 1.
 * Club managers must name a club they manage.
 */
reportsRouter.get("/", requireAuth, async (req, res) => {
  const clubId = typeof req.query.clubId === "string" ? req.query.clubId.trim() : "";

  if (clubId) {
    if (!canManageClub(req.user, clubId)) {
      return res.status(403).json({ error: "You don't have admin access to that club." });
    }
  } else if (req.user.role !== "tier1") {
    return res.status(400).json({ error: "clubId is required." });
  }

  const where = ["r.status = 'open'"];
  const params = {};
  if (clubId) {
    where.push("r.club_id = :clubId");
    params.clubId = clubId;
  }

  const [rows] = await pool.query(
    `SELECT r.*, cl.name AS club_name,
            CASE WHEN r.target_type = 'post' THEN p.body ELSE c.comment_text END AS target_text,
            CASE WHEN r.target_type = 'post' THEN p.status ELSE 'published' END AS target_status,
            (SELECT COUNT(*) FROM reports r2
              WHERE r2.target_type = r.target_type AND r2.target_id = r.target_id
                AND r2.status = 'open') AS report_count
     FROM reports r
     JOIN clubs cl ON cl.club_id = r.club_id
     LEFT JOIN posts p ON r.target_type = 'post' AND p.post_id = r.target_id
     LEFT JOIN comments c ON r.target_type = 'comment' AND c.comment_id = r.target_id
     WHERE ${where.join(" AND ")}
       AND ((r.target_type = 'post' AND p.post_id IS NOT NULL)
         OR (r.target_type = 'comment' AND c.comment_id IS NOT NULL))
     ORDER BY r.created_at ASC, r.report_id ASC
     LIMIT 100`,
    params
  );

  res.json({ reports: rows.map(rowToReport) });
});

/**
 * PATCH /reports/:id/resolve — dismiss, hide or remove the reported item.
 * One action closes every open report on that item, not just the row clicked.
 */
reportsRouter.patch("/:id/resolve", requireAuth, async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM reports WHERE report_id = :id", {
    id: req.params.id,
  });
  const report = rows[0];
  if (!report) return res.status(404).json({ error: "Report not found." });
  if (!canManageClub(req.user, report.club_id)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }

  const action = typeof req.body?.action === "string" ? req.body.action : "";
  if (!ACTIONS.includes(action)) {
    return res.status(400).json({ error: `action must be one of: ${ACTIONS.join(", ")}.` });
  }
  if (action === "hide" && report.target_type === "comment") {
    return res.status(400).json({ error: "Comments can be removed, not hidden." });
  }

  if (action === "dismiss") {
    await pool.query(
      `UPDATE reports
       SET status = 'dismissed', resolution = 'dismissed',
           resolved_at = NOW(), resolved_by = :userId
       WHERE report_id = :id`,
      { id: report.report_id, userId: req.user.id }
    );
  } else {
    if (report.target_type === "post") {
      await pool.query("UPDATE posts SET status = :status WHERE post_id = :id", {
        status: action === "hide" ? "hidden" : "removed",
        id: report.target_id,
      });
    } else {
      const [comments] = await pool.query(
        "SELECT comment_id FROM comments WHERE comment_id = :id",
        { id: report.target_id }
      );
      if (!comments[0]) {
        return res.status(409).json({ error: "That comment has already been removed." });
      }
      await pool.query("DELETE FROM comments WHERE comment_id = :id", { id: report.target_id });
    }

    const [result] = await pool.query(
      `UPDATE reports
       SET status = 'actioned', resolution = :resolution,
           resolved_at = NOW(), resolved_by = :userId
       WHERE target_type = :targetType AND target_id = :targetId AND status = 'open'`,
      {
        resolution: action === "hide" ? "hidden" : "removed",
        userId: req.user.id,
        targetType: report.target_type,
        targetId: report.target_id,
      }
    );
    await recordAudit(req, {
      action: `report.${action}`,
      targetType: report.target_type,
      targetId: report.target_id,
      detail: { clubId: report.club_id, reportId: report.report_id },
    });
    return res.json({ resolved: Number(result.affectedRows), action });
  }

  await recordAudit(req, {
    action: "report.dismiss",
    targetType: report.target_type,
    targetId: report.target_id,
    detail: { clubId: report.club_id, reportId: report.report_id },
  });
  res.json({ resolved: 1, action });
});
