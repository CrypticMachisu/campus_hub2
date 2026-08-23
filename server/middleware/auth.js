import jwt from "jsonwebtoken";
import { findUserById } from "../queries.js";

/**
 * Verifies the Bearer token and attaches the full current user (from the
 * DB, not just the JWT payload) to req.user. Responds 401 if missing/bad.
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated." });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: "User no longer exists." });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

/**
 * Like requireAuth, but doesn't reject when there's no token — just
 * leaves req.user undefined. Useful for routes that behave differently
 * for logged-in vs anonymous visitors without requiring login.
 */
export async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await findUserById(payload.sub);
    if (user) req.user = user;
  } catch {
    // Bad/expired token on an optional route — just proceed as anonymous.
  }
  next();
}

/** Same permission logic as the old client-only authStore.canManageClub. */
export function canManageClub(user, clubId) {
  if (!user) return false;
  if (user.role === "tier1") return true;
  if (user.role === "tier2") return user.adminForClubs.includes(clubId);
  return false;
}

/** Rejects with 403 unless the caller is a tier1 (platform) admin. */
export function requireTier1(req, res, next) {
  if (req.user?.role !== "tier1") {
    return res.status(403).json({ error: "Tier 1 admin access required." });
  }
  next();
}