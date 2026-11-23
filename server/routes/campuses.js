// Campus directory plus the tier-1 campus settings screen.
//
// The public list is intentionally small. Names, slugs, domains and usage
// counts are administration data and live behind requireTier1.
import { pool } from "../db.js";
import {
  isValidCampusDomain,
  isValidCampusSlug,
  listCampusSettings,
  normalizeCampusDomain,
  normalizeCampusSlug,
} from "../campus.js";
import { requireAuth, requireTier1 } from "../middleware/auth.js";
import { recordAudit } from "../audit.js";
import { createApiRouter } from "../middleware/apiGuards.js";

export const campusesRouter = createApiRouter();

function cleanName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanDomains(value) {
  const parts = Array.isArray(value) ? value : String(value || "").split(/[\s,]+/);
  return [...new Set(parts.map(normalizeCampusDomain).filter(Boolean))];
}

function validateDomains(domains) {
  if (domains.length === 0) return "At least one email domain is required.";
  const invalid = domains.find((domain) => !isValidCampusDomain(domain));
  if (invalid) return `"${invalid}" is not a valid email domain.`;
  return "";
}

async function domainOwner(domain) {
  const [rows] = await pool.query(
    "SELECT campus_id FROM campus_email_domains WHERE domain = :domain",
    { domain }
  );
  return rows[0]?.campus_id || null;
}

async function campusRow(campusId) {
  const [rows] = await pool.query(
    "SELECT campus_id AS id, name, slug FROM campuses WHERE campus_id = :campusId",
    { campusId }
  );
  return rows[0] || null;
}

/** GET /campuses — public directory. */
campusesRouter.get("/", async (req, res) => {
  const [rows] = await pool.query("SELECT campus_id AS id, name, slug FROM campuses ORDER BY name");
  res.json({ campuses: rows });
});

/** GET /campuses/manage — tier 1 only: identity, domains and usage counts. */
campusesRouter.get("/manage", requireAuth, requireTier1, async (req, res) => {
  res.json({ campuses: await listCampusSettings() });
});

/**
 * POST /campuses — create a campus with its first email domain(s).
 * Campus ids are stable and generated here; the slug is editable.
 */
campusesRouter.post("/", requireAuth, requireTier1, async (req, res) => {
  const body = req.body || {};
  const name = cleanName(body.name);
  const slug = normalizeCampusSlug(body.slug || body.name);
  const domains = cleanDomains(body.domains ?? body.domain);

  if (!name) return res.status(400).json({ error: "Campus name is required." });
  if (name.length > 150) return res.status(400).json({ error: "Campus name is too long." });
  if (!isValidCampusSlug(slug)) {
    return res
      .status(400)
      .json({ error: "Slug must use lowercase letters, numbers and single hyphens." });
  }

  const domainError = validateDomains(domains);
  if (domainError) return res.status(400).json({ error: domainError });

  const [slugRows] = await pool.query("SELECT campus_id FROM campuses WHERE slug = :slug", {
    slug,
  });
  if (slugRows[0]) return res.status(409).json({ error: "That slug is already in use." });

  for (const domain of domains) {
    const owner = await domainOwner(domain);
    if (owner) return res.status(409).json({ error: `The domain ${domain} is already in use.` });
  }

  const id = `campus-${Date.now()}`;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      "INSERT INTO campuses (campus_id, name, slug) VALUES (:id, :name, :slug)",
      { id, name, slug }
    );
    for (const domain of domains) {
      await connection.query(
        "INSERT INTO campus_email_domains (domain, campus_id) VALUES (:domain, :id)",
        { domain, id }
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "That campus slug or email domain is already in use." });
    }
    throw err;
  } finally {
    connection.release();
  }

  await recordAudit(req, {
    action: "campus.create",
    targetType: "campus",
    targetId: id,
    detail: { name, slug, domains },
  });
  res.status(201).json({
    campus: { id, name, slug, domains, userCount: 0, clubCount: 0 },
  });
});

/** PATCH /campuses/:id — rename or change the slug. The id never changes. */
campusesRouter.patch("/:id", requireAuth, requireTier1, async (req, res) => {
  const campus = await campusRow(req.params.id);
  if (!campus) return res.status(404).json({ error: "Campus not found." });

  const body = req.body || {};
  const name = body.name === undefined ? campus.name : cleanName(body.name);
  const slug = body.slug === undefined ? campus.slug : normalizeCampusSlug(body.slug);

  if (!name) return res.status(400).json({ error: "Campus name is required." });
  if (name.length > 150) return res.status(400).json({ error: "Campus name is too long." });
  if (!isValidCampusSlug(slug)) {
    return res
      .status(400)
      .json({ error: "Slug must use lowercase letters, numbers and single hyphens." });
  }

  const [slugRows] = await pool.query(
    "SELECT campus_id FROM campuses WHERE slug = :slug AND campus_id <> :id",
    { slug, id: campus.id }
  );
  if (slugRows[0]) return res.status(409).json({ error: "That slug is already in use." });

  try {
    await pool.query("UPDATE campuses SET name = :name, slug = :slug WHERE campus_id = :id", {
      name,
      slug,
      id: campus.id,
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "That slug is already in use." });
    }
    throw err;
  }
  await recordAudit(req, {
    action: "campus.update",
    targetType: "campus",
    targetId: campus.id,
    detail: { from: campus, to: { name, slug } },
  });
  res.json({ campus: { ...campus, name, slug } });
});

/** POST /campuses/:id/domains — add one registration domain. */
campusesRouter.post("/:id/domains", requireAuth, requireTier1, async (req, res) => {
  const campus = await campusRow(req.params.id);
  if (!campus) return res.status(404).json({ error: "Campus not found." });

  const domain = normalizeCampusDomain(req.body?.domain);
  if (!domain) return res.status(400).json({ error: "Email domain is required." });
  if (!isValidCampusDomain(domain)) {
    return res.status(400).json({ error: "Enter a valid email domain, like strathmore.edu." });
  }

  const owner = await domainOwner(domain);
  if (owner === campus.id) {
    return res.status(409).json({ error: "That domain already belongs to this campus." });
  }
  if (owner) {
    return res.status(409).json({ error: "That domain already belongs to another campus." });
  }

  try {
    await pool.query(
      "INSERT INTO campus_email_domains (domain, campus_id) VALUES (:domain, :campusId)",
      { domain, campusId: campus.id }
    );
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "That domain is already in use." });
    }
    throw err;
  }
  await recordAudit(req, {
    action: "campus.domain.add",
    targetType: "campus",
    targetId: campus.id,
    detail: { domain },
  });
  res.status(201).json({ domain });
});

/** DELETE /campuses/:id/domains/:domain — remove a domain, never the last one. */
campusesRouter.delete("/:id/domains/:domain", requireAuth, requireTier1, async (req, res) => {
  const campus = await campusRow(req.params.id);
  if (!campus) return res.status(404).json({ error: "Campus not found." });

  const domain = normalizeCampusDomain(req.params.domain);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      "SELECT domain FROM campus_email_domains WHERE campus_id = :campusId FOR UPDATE",
      { campusId: campus.id }
    );
    if (!rows.some((row) => row.domain === domain)) {
      await connection.rollback();
      return res.status(404).json({ error: "Domain not found on this campus." });
    }
    if (rows.length <= 1) {
      await connection.rollback();
      return res.status(400).json({ error: "A campus needs at least one email domain." });
    }

    await connection.query(
      "DELETE FROM campus_email_domains WHERE campus_id = :campusId AND domain = :domain",
      { campusId: campus.id, domain }
    );
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
  await recordAudit(req, {
    action: "campus.domain.remove",
    targetType: "campus",
    targetId: campus.id,
    detail: { domain },
  });
  res.json({ removed: domain });
});
