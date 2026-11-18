import { pool } from "./db.js";

/** The only campus on a fresh Phase 4 install. */
export const DEFAULT_CAMPUS_ID = "campus-01";

/** Resolve a registration email to its campus, or null when the domain is unknown. */
export async function findCampusByEmailDomain(email) {
  const domain = String(email || "")
    .trim()
    .toLowerCase()
    .split("@")
    .pop();
  if (!domain) return null;

  const [rows] = await pool.query(
    `SELECT c.campus_id AS id, c.name, c.slug
     FROM campus_email_domains d
     JOIN campuses c ON c.campus_id = d.campus_id
     WHERE d.domain = :domain`,
    { domain }
  );
  return rows[0] || null;
}

/** Public campus directory for the campus label and, later, a switcher. */
export async function listCampuses() {
  const [rows] = await pool.query("SELECT campus_id AS id, name, slug FROM campuses ORDER BY name");
  return rows;
}

export async function defaultCampusId() {
  const [rows] = await pool.query(
    `SELECT campus_id FROM campuses
     ORDER BY (campus_id = :defaultCampusId) DESC,
              (slug = 'strathmore') DESC,
              campus_id
     LIMIT 1`,
    { defaultCampusId: DEFAULT_CAMPUS_ID }
  );
  return rows[0]?.campus_id ?? null;
}

export async function campusExists(campusId) {
  if (!campusId) return false;
  const [rows] = await pool.query("SELECT campus_id FROM campuses WHERE campus_id = :campusId", {
    campusId,
  });
  return Boolean(rows[0]);
}

/**
 * What campus should this reader see?
 *
 * - tier 1 may ask for any campus, or omit the filter to see every campus.
 * - everyone else is pinned to their own campus. A request for another campus
 *   is rejected rather than silently ignored, so a stale link is visible.
 * - signed-out readers get the default (Strathmore) campus. Cross-campus
 *   browsing is a later phase, not a public free-for-all.
 */
export async function readCampusScope(req) {
  const requested = typeof req.query.campusId === "string" ? req.query.campusId.trim() : "";

  if (req.user?.role === "tier1") {
    if (!requested) return { campusId: null };
    if (!(await campusExists(requested))) {
      return { error: "Campus not found.", status: 404 };
    }
    return { campusId: requested };
  }

  if (req.user) {
    if (!req.user.campusId) {
      return { error: "Your account is not attached to a campus yet.", status: 403 };
    }
    if (requested && requested !== req.user.campusId) {
      return { error: "You can only browse your own campus.", status: 403 };
    }
    return { campusId: req.user.campusId };
  }

  const fallback = await defaultCampusId();
  if (!fallback) return { campusId: null };
  if (requested && requested !== fallback) {
    return { error: "Campus discovery is not open yet.", status: 403 };
  }
  return { campusId: fallback };
}
