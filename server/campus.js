import { pool } from "./db.js";
import { crossUniversityEnabled } from "./features.js";

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

/** Trim and lowercase a domain, and strip a pasted leading @. */
export function normalizeCampusDomain(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
}

/** A domain needs at least one dot; no wildcards, paths or unicode here. */
export function isValidCampusDomain(domain) {
  return (
    domain.length <= 190 &&
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)
  );
}

/** "My Campus" -> "my-campus". */
export function normalizeCampusSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export function isValidCampusSlug(slug) {
  return slug.length > 0 && slug.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/** Tier-1 view: campus identity plus its domains and basic usage counts. */
export async function listCampusSettings() {
  const [campuses] = await pool.query(
    `SELECT c.campus_id AS id, c.name, c.slug,
       (SELECT COUNT(*) FROM users u WHERE u.campus_id = c.campus_id) AS user_count,
       (SELECT COUNT(*) FROM clubs cl WHERE cl.campus_id = c.campus_id) AS club_count
     FROM campuses c
     ORDER BY c.name`
  );
  const [domains] = await pool.query(
    "SELECT campus_id, domain FROM campus_email_domains ORDER BY domain"
  );
  const byCampus = new Map();
  for (const row of domains) {
    if (!byCampus.has(row.campus_id)) byCampus.set(row.campus_id, []);
    byCampus.get(row.campus_id).push(row.domain);
  }

  return campuses.map((campus) => ({
    id: campus.id,
    name: campus.name,
    slug: campus.slug,
    domains: byCampus.get(campus.id) || [],
    userCount: Number(campus.user_count),
    clubCount: Number(campus.club_count),
  }));
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
  const requestedScope =
    typeof req.query.scope === "string" ? req.query.scope.trim().toLowerCase() : "";

  if (requestedScope && !["local", "network"].includes(requestedScope)) {
    return { error: "Unknown discovery scope.", status: 400 };
  }
  if (requestedScope === "network") {
    if (requested) {
      return { error: "Choose a campus or the network scope, not both.", status: 400 };
    }
    if (!crossUniversityEnabled()) {
      return { error: "Network discovery is not enabled.", status: 404 };
    }
    if (!req.user) {
      return { error: "Sign in to browse your network.", status: 401 };
    }
    if (req.user.role === "tier1") {
      return { error: "Use the campus edition to browse every campus.", status: 403 };
    }

    const [rows] = await pool.query(
      `SELECT a.campus_id, c.name
       FROM user_campus_affiliations a
       JOIN campuses c ON c.campus_id = a.campus_id
       WHERE a.user_id = :userId AND a.status = 'active'
       ORDER BY c.name`,
      { userId: req.user.id }
    );
    const additional = rows.filter((row) => row.campus_id !== req.user.campusId);
    if (additional.length === 0) {
      return { error: "No approved campus affiliations yet.", status: 403 };
    }
    return {
      scope: "network",
      campusIds: [req.user.campusId, ...additional.map((row) => row.campus_id)],
    };
  }

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
