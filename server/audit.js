import { pool } from "./db.js";

/**
 * Records who changed what, for actions a request log can't describe.
 *
 * Request monitoring already says "PATCH /api/comments/:id/pin returned 200";
 * it cannot say which comment, in which club, or that the caller was Amara.
 * This does. Writes are best-effort: if the log insert fails, the action it
 * describes still succeeds — history is valuable, but not worth failing a
 * moderation action over.
 */
export async function recordAudit(req, { action, targetType, targetId = null, detail = null }) {
  try {
    await pool.query(
      `INSERT INTO audit_log (actor_id, actor_name, action, target_type, target_id, detail)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user?.id ?? null,
        req.user?.name ?? null,
        action,
        targetType,
        targetId,
        detail ? JSON.stringify(detail) : null,
      ]
    );
  } catch (err) {
    console.error("audit log write failed:", err.message);
  }
}
