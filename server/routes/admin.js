import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireTier1 } from "../middleware/auth.js";

/**
 * Operational dashboard for tier1 admins. The global API-key check has
 * already run by the time this mounts; requireAuth+requireTier1 then
 * gate the sensitive part down to platform admins (JWT, server-checked
 * role — not the API key itself).
 */
export function createAdminRouter(limiter) {
  const adminRouter = Router();

  /**
   * GET /api/admin — per-key rate-limit status and last-IP tracking.
   * Reads the limiter's live state; every key is shown only as its
   * fingerprint (hashed keyId + masked tail), never the raw key. Note
   * this call itself counts against the caller's own key's window.
   */
  adminRouter.get("/", requireAuth, requireTier1, (req, res) => {
    res.json(limiter.stats());
  });

  /**
   * GET /api/admin/audit — who changed what, newest first.
   *
   * Written by server/audit.js from the moderation and administration
   * routes (comment pin/delete, playbook edits, event edits, promote and
   * demote, admin-request decisions, announcements). `detail` is stored as
   * JSON text; it is parsed here so consumers get an object rather than a
   * string. Newest first, capped so one request can't return the whole log.
   */
  adminRouter.get("/audit", requireAuth, requireTier1, async (req, res) => {
    const requested = Number(req.query.limit);
    const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 200) : 50;

    const [rows] = await pool.query(
      `SELECT audit_id, actor_id, actor_name, action, target_type, target_id, detail, created_at
       FROM audit_log
       ORDER BY audit_id DESC
       LIMIT ?`,
      [limit]
    );

    res.json({
      entries: rows.map((row) => {
        let detail = null;
        if (row.detail) {
          try {
            detail = JSON.parse(row.detail);
          } catch {
            detail = row.detail;
          }
        }
        return {
          id: Number(row.audit_id),
          actorId: row.actor_id,
          actorName: row.actor_name,
          action: row.action,
          targetType: row.target_type,
          targetId: row.target_id,
          detail,
          createdAt: row.created_at,
        };
      }),
    });
  });

  return adminRouter;
}
