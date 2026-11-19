// Club family management. These routes are mounted only when
// CROSS_UNIVERSITY_ENABLED is on, and only tier 1 can change a family.
//
// A family is shared identity; a chapter is still a normal clubs row. This
// slice deliberately stops at linking existing clubs. It does not expose
// family pages, network audiences or cross-campus content.
import { pool } from "../db.js";
import { requireAuth, requireTier1 } from "../middleware/auth.js";
import { recordAudit } from "../audit.js";
import { createApiRouter } from "../middleware/apiGuards.js";
import { campusExists } from "../campus.js";

export const clubFamiliesRouter = createApiRouter();

function cleanName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidSlug(value) {
  return value.length > 0 && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function cleanDescription(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function loadFamily(familyId) {
  const [familyRows] = await pool.query(
    `SELECT f.*, home.name AS home_campus_name
     FROM club_families f
     JOIN campuses home ON home.campus_id = f.home_campus_id
     WHERE f.family_id = :familyId`,
    { familyId }
  );
  if (!familyRows[0]) return null;

  const [chapterRows] = await pool.query(
    `SELECT c.club_id, c.name, c.campus_id, camp.name AS campus_name
     FROM clubs c
     JOIN campuses camp ON camp.campus_id = c.campus_id
     WHERE c.family_id = :familyId
     ORDER BY camp.name, c.name`,
    { familyId }
  );

  const family = familyRows[0];
  return {
    id: family.family_id,
    name: family.name,
    slug: family.slug,
    description: family.description || "",
    homeCampusId: family.home_campus_id,
    homeCampusName: family.home_campus_name,
    status: family.status,
    createdAt: family.created_at,
    chapters: chapterRows.map((chapter) => ({
      id: chapter.club_id,
      name: chapter.name,
      campusId: chapter.campus_id,
      campusName: chapter.campus_name,
    })),
  };
}

/** GET /club-families/manage — tier 1: every family and its chapters. */
clubFamiliesRouter.get("/manage", requireAuth, requireTier1, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT family_id FROM club_families ORDER BY status, name, family_id`
  );
  const families = [];
  for (const row of rows) {
    families.push(await loadFamily(row.family_id));
  }
  res.json({ families });
});

/** POST /club-families — tier 1: create the shared identity. */
clubFamiliesRouter.post("/", requireAuth, requireTier1, async (req, res) => {
  const body = req.body || {};
  const name = cleanName(body.name);
  const slug = slugify(body.slug || body.name);
  const description = cleanDescription(body.description);
  const homeCampusId = String(body.homeCampusId || "").trim();

  if (!name) return res.status(400).json({ error: "Family name is required." });
  if (name.length > 150) return res.status(400).json({ error: "Family name is too long." });
  if (!isValidSlug(slug)) {
    return res
      .status(400)
      .json({ error: "Slug must use lowercase letters, numbers and single hyphens." });
  }
  if (description.length > 2000) {
    return res.status(400).json({ error: "Description must be 2,000 characters or fewer." });
  }
  if (!homeCampusId) return res.status(400).json({ error: "Home campus is required." });
  if (!(await campusExists(homeCampusId))) {
    return res.status(404).json({ error: "Home campus not found." });
  }

  const [slugRows] = await pool.query("SELECT family_id FROM club_families WHERE slug = :slug", {
    slug,
  });
  if (slugRows[0]) return res.status(409).json({ error: "That family slug is already in use." });

  const id = `family-${Date.now()}`;
  try {
    await pool.query(
      `INSERT INTO club_families
         (family_id, name, slug, description, home_campus_id, created_by)
       VALUES (:id, :name, :slug, :description, :homeCampusId, :createdBy)`,
      {
        id,
        name,
        slug,
        description: description || null,
        homeCampusId,
        createdBy: req.user.id,
      }
    );
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "That family id or slug is already in use." });
    }
    throw err;
  }

  await recordAudit(req, {
    action: "club_family.create",
    targetType: "club_family",
    targetId: id,
    detail: { name, slug, homeCampusId },
  });
  res.status(201).json({ family: await loadFamily(id) });
});

/** PATCH /club-families/:id — tier 1: rename or change the shared URL. */
clubFamiliesRouter.patch("/:id", requireAuth, requireTier1, async (req, res) => {
  const family = await loadFamily(req.params.id);
  if (!family) return res.status(404).json({ error: "Club family not found." });

  const body = req.body || {};
  const name = body.name === undefined ? family.name : cleanName(body.name);
  const slug = body.slug === undefined ? family.slug : slugify(body.slug);
  const description =
    body.description === undefined ? family.description : cleanDescription(body.description);

  if (!name) return res.status(400).json({ error: "Family name is required." });
  if (name.length > 150) return res.status(400).json({ error: "Family name is too long." });
  if (!isValidSlug(slug)) {
    return res
      .status(400)
      .json({ error: "Slug must use lowercase letters, numbers and single hyphens." });
  }
  if (description.length > 2000) {
    return res.status(400).json({ error: "Description must be 2,000 characters or fewer." });
  }

  const [slugRows] = await pool.query(
    "SELECT family_id FROM club_families WHERE slug = :slug AND family_id <> :id",
    { slug, id: family.id }
  );
  if (slugRows[0]) return res.status(409).json({ error: "That family slug is already in use." });

  try {
    await pool.query(
      `UPDATE club_families
       SET name = :name, slug = :slug, description = :description
       WHERE family_id = :id`,
      { name, slug, description: description || null, id: family.id }
    );
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "That family slug is already in use." });
    }
    throw err;
  }

  await recordAudit(req, {
    action: "club_family.update",
    targetType: "club_family",
    targetId: family.id,
    detail: { from: { name: family.name, slug: family.slug }, to: { name, slug } },
  });
  res.json({ family: await loadFamily(family.id) });
});

/** POST /club-families/:id/chapters — tier 1: attach an existing club. */
clubFamiliesRouter.post("/:id/chapters", requireAuth, requireTier1, async (req, res) => {
  const family = await loadFamily(req.params.id);
  if (!family) return res.status(404).json({ error: "Club family not found." });

  const clubId = String(req.body?.clubId || "").trim();
  if (!clubId) return res.status(400).json({ error: "Choose a club." });

  const [clubRows] = await pool.query(
    "SELECT club_id, name, campus_id, family_id FROM clubs WHERE club_id = :clubId",
    { clubId }
  );
  const club = clubRows[0];
  if (!club) return res.status(404).json({ error: "Club not found." });
  if (club.family_id === family.id) {
    return res.status(409).json({ error: "That club is already a chapter of this family." });
  }
  if (club.family_id) {
    return res.status(409).json({ error: "That club already belongs to another family." });
  }

  const [campusChapterRows] = await pool.query(
    `SELECT club_id FROM clubs
     WHERE family_id = :familyId AND campus_id = :campusId`,
    { familyId: family.id, campusId: club.campus_id }
  );
  if (campusChapterRows[0]) {
    return res.status(409).json({ error: "This family already has a chapter on that campus." });
  }

  try {
    const [result] = await pool.query(
      `UPDATE clubs SET family_id = :familyId
       WHERE club_id = :clubId AND family_id IS NULL`,
      { familyId: family.id, clubId: club.club_id }
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ error: "That club was linked by another request." });
    }
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "This family already has a chapter on that campus." });
    }
    throw err;
  }

  await recordAudit(req, {
    action: "club_family.chapter.add",
    targetType: "club_family",
    targetId: family.id,
    detail: { clubId: club.club_id, campusId: club.campus_id },
  });
  res.status(201).json({ family: await loadFamily(family.id) });
});

/** DELETE /club-families/:id/chapters/:clubId — tier 1: detach a chapter. */
clubFamiliesRouter.delete("/:id/chapters/:clubId", requireAuth, requireTier1, async (req, res) => {
  const family = await loadFamily(req.params.id);
  if (!family) return res.status(404).json({ error: "Club family not found." });

  const [result] = await pool.query(
    `UPDATE clubs SET family_id = NULL
       WHERE club_id = :clubId AND family_id = :familyId`,
    { clubId: req.params.clubId, familyId: family.id }
  );
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: "That chapter is not in this family." });
  }

  await recordAudit(req, {
    action: "club_family.chapter.remove",
    targetType: "club_family",
    targetId: family.id,
    detail: { clubId: req.params.clubId },
  });
  res.json({ family: await loadFamily(family.id) });
});
