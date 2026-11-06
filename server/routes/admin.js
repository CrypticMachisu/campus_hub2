import { Router } from "express";
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

  return adminRouter;
}
