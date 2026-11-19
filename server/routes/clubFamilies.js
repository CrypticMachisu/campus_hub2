// Club family management. These routes are mounted only when
// CROSS_UNIVERSITY_ENABLED is on. Tier 1 owns the chapter list; delegated
// family admins may edit shared identity but never chapter content.
//
// A family is shared identity; a chapter is still a normal clubs row. Network
// audiences and cross-campus participation remain later slices.
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

function hasInvalidLogoUrl(value) {
  return Boolean(value) && (value.length > 500 || !/^https?:\/\//i.test(value));
}

async function canEditFamily(user, familyId) {
  if (!user) return false;
  if (user.role === "tier1") return true;
  const [rows] = await pool.query(
    "SELECT 1 FROM club_family_admins WHERE family_id = :familyId AND user_id = :userId",
    { familyId, userId: user.id }
  );
  return Boolean(rows[0]);
}

async function loadFamily(familyId, { withAdmins = false } = {}) {
  const [familyRows] = await pool.query(
    `SELECT f.*, home.name AS home_campus_name
     FROM club_families f
     JOIN campuses home ON home.campus_id = f.home_campus_id
     WHERE f.family_id = :familyId`,
    { familyId }
  );
  if (!familyRows[0]) return null;

  const [chapterRows] = await pool.query(
    `SELECT c.club_id, c.name, c.description, c.meeting_time, c.meeting_location,
            c.campus_id, camp.name AS campus_name
     FROM clubs c
     JOIN campuses camp ON camp.campus_id = c.campus_id
     WHERE c.family_id = :familyId
     ORDER BY camp.name, c.name`,
    { familyId }
  );

  const family = familyRows[0];
  const result = {
    id: family.family_id,
    name: family.name,
    slug: family.slug,
    description: family.description || "",
    logoUrl: family.logo_url || "",
    homeCampusId: family.home_campus_id,
    homeCampusName: family.home_campus_name,
    status: family.status,
    createdAt: family.created_at,
    chapters: chapterRows.map((chapter) => ({
      id: chapter.club_id,
      name: chapter.name,
      description: chapter.description || "",
      meetingTime: chapter.meeting_time || "",
      meetingLocation: chapter.meeting_location || "",
      campusId: chapter.campus_id,
      campusName: chapter.campus_name,
    })),
  };

  if (withAdmins) {
    const [adminRows] = await pool.query(
      `SELECT a.user_id, a.role, u.name, u.email
       FROM club_family_admins a
       JOIN users u ON u.user_id = a.user_id
       WHERE a.family_id = :familyId
       ORDER BY u.name, u.user_id`,
      { familyId }
    );
    result.admins = adminRows.map((admin) => ({
      id: admin.user_id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    }));
  }

  return result;
}

/** GET /club-families/manage — tier 1: every family; family editors: their own. */
clubFamiliesRouter.get("/manage", requireAuth, async (req, res) => {
  let familyIds;
  if (req.user.role === "tier1") {
    const [rows] = await pool.query(
      `SELECT family_id FROM club_families ORDER BY status, name, family_id`
    );
    familyIds = rows.map((row) => row.family_id);
  } else {
    const [rows] = await pool.query(
      `SELECT a.family_id
       FROM club_family_admins a
       JOIN club_families f ON f.family_id = a.family_id
       WHERE a.user_id = :userId
       ORDER BY f.status, f.name, f.family_id`,
      { userId: req.user.id }
    );
    if (rows.length === 0) {
      return res.status(403).json({ error: "Family admin access required." });
    }
    familyIds = rows.map((row) => row.family_id);
  }

  const families = [];
  for (const familyId of familyIds) {
    families.push(await loadFamily(familyId, { withAdmins: true }));
  }
  res.json({ families });
});

/** GET /club-families — public read-only list of active families. */
clubFamiliesRouter.get("/", async (req, res) => {
  const [rows] = await pool.query(
    "SELECT family_id FROM club_families WHERE status = 'active' ORDER BY name, family_id"
  );
  const families = [];
  for (const row of rows) {
    families.push(await loadFamily(row.family_id));
  }
  res.json({ families });
});

/** GET /club-families/:id — public read-only family page with chapters. */
clubFamiliesRouter.get("/:id", async (req, res) => {
  const family = await loadFamily(req.params.id);
  if (!family || family.status !== "active") {
    return res.status(404).json({ error: "Club family not found." });
  }
  res.json({ family });
});

/** POST /club-families — tier 1: create the shared identity. */
clubFamiliesRouter.post("/", requireAuth, requireTier1, async (req, res) => {
  const body = req.body || {};
  const name = cleanName(body.name);
  const slug = slugify(body.slug || body.name);
  const description = cleanDescription(body.description);
  const logoUrl = typeof body.logoUrl === "string" ? body.logoUrl.trim() : "";
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
  if (hasInvalidLogoUrl(logoUrl)) {
    return res
      .status(400)
      .json({ error: "Family mark must be an http(s) URL under 500 characters." });
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
         (family_id, name, slug, description, logo_url, home_campus_id, created_by)
       VALUES (:id, :name, :slug, :description, :logoUrl, :homeCampusId, :createdBy)`,
      {
        id,
        name,
        slug,
        description: description || null,
        logoUrl: logoUrl || null,
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
    detail: { name, slug, logoUrl, homeCampusId },
  });
  res.status(201).json({ family: await loadFamily(id) });
});

/** PATCH /club-families/:id — tier 1 or a delegated editor: shared identity. */
clubFamiliesRouter.patch("/:id", requireAuth, async (req, res) => {
  const family = await loadFamily(req.params.id);
  if (!family) return res.status(404).json({ error: "Club family not found." });
  if (!(await canEditFamily(req.user, family.id))) {
    return res.status(403).json({ error: "Family editor access required." });
  }

  const body = req.body || {};
  const name = body.name === undefined ? family.name : cleanName(body.name);
  const slug = body.slug === undefined ? family.slug : slugify(body.slug);
  const description =
    body.description === undefined ? family.description : cleanDescription(body.description);
  const logoUrl =
    body.logoUrl === undefined
      ? family.logoUrl
      : typeof body.logoUrl === "string"
        ? body.logoUrl.trim()
        : "";

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
  if (hasInvalidLogoUrl(logoUrl)) {
    return res
      .status(400)
      .json({ error: "Family mark must be an http(s) URL under 500 characters." });
  }

  const [slugRows] = await pool.query(
    "SELECT family_id FROM club_families WHERE slug = :slug AND family_id <> :id",
    { slug, id: family.id }
  );
  if (slugRows[0]) return res.status(409).json({ error: "That family slug is already in use." });

  try {
    await pool.query(
      `UPDATE club_families
       SET name = :name, slug = :slug, description = :description, logo_url = :logoUrl
       WHERE family_id = :id`,
      { name, slug, description: description || null, logoUrl: logoUrl || null, id: family.id }
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
    detail: {
      from: { name: family.name, slug: family.slug, logoUrl: family.logoUrl },
      to: { name, slug, logoUrl },
    },
  });
  res.json({ family: await loadFamily(family.id, { withAdmins: true }) });
});

/** POST /club-families/:id/admins — tier 1: delegate identity editing. */
clubFamiliesRouter.post("/:id/admins", requireAuth, requireTier1, async (req, res) => {
  const family = await loadFamily(req.params.id);
  if (!family) return res.status(404).json({ error: "Club family not found." });

  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const role = req.body?.role === "editor" ? "editor" : "lead";
  if (!email) return res.status(400).json({ error: "A user email is required." });

  const [userRows] = await pool.query(
    `SELECT user_id, name, email, role FROM users WHERE LOWER(email) = LOWER(:email)`,
    { email }
  );
  const target = userRows[0];
  if (!target) return res.status(404).json({ error: "No account uses that email." });
  if (target.role === "tier1") {
    return res.status(400).json({ error: "Tier 1 already manages every family." });
  }

  await pool.query(
    `INSERT INTO club_family_admins (family_id, user_id, role)
     VALUES (:familyId, :userId, :role)
     ON DUPLICATE KEY UPDATE role = VALUES(role)`,
    { familyId: family.id, userId: target.user_id, role }
  );
  await recordAudit(req, {
    action: "club_family.admin.add",
    targetType: "club_family",
    targetId: family.id,
    detail: { family: family.name, userId: target.user_id, email: target.email, role },
  });
  res.status(201).json({ family: await loadFamily(family.id, { withAdmins: true }) });
});

/** DELETE /club-families/:id/admins/:userId — tier 1: remove delegated access. */
clubFamiliesRouter.delete("/:id/admins/:userId", requireAuth, requireTier1, async (req, res) => {
  const family = await loadFamily(req.params.id);
  if (!family) return res.status(404).json({ error: "Club family not found." });

  const [result] = await pool.query(
    `DELETE FROM club_family_admins
       WHERE family_id = :familyId AND user_id = :userId`,
    { familyId: family.id, userId: req.params.userId }
  );
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: "That family admin was not found." });
  }

  await recordAudit(req, {
    action: "club_family.admin.remove",
    targetType: "club_family",
    targetId: family.id,
    detail: { family: family.name, userId: req.params.userId },
  });
  res.json({ family: await loadFamily(family.id, { withAdmins: true }) });
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

/**
 * POST /club-families/:id/chapters/:clubId/move — tier 1: move a chapter
 * from the family named in `fromFamilyId` to this family. Requiring the source
 * makes a stale screen fail instead of moving a club unexpectedly.
 */
clubFamiliesRouter.post(
  "/:id/chapters/:clubId/move",
  requireAuth,
  requireTier1,
  async (req, res) => {
    const target = await loadFamily(req.params.id);
    if (!target) return res.status(404).json({ error: "Club family not found." });

    const fromFamilyId = String(req.body?.fromFamilyId || "").trim();
    if (!fromFamilyId) {
      return res.status(400).json({ error: "The source family is required." });
    }
    if (fromFamilyId === target.id) {
      return res.status(400).json({ error: "Choose a different target family." });
    }

    const source = await loadFamily(fromFamilyId);
    if (!source) return res.status(404).json({ error: "Source family not found." });

    const [clubRows] = await pool.query(
      "SELECT club_id, name, campus_id, family_id FROM clubs WHERE club_id = :clubId",
      { clubId: req.params.clubId }
    );
    const club = clubRows[0];
    if (!club) return res.status(404).json({ error: "Club not found." });
    if (!club.family_id) {
      return res.status(409).json({ error: "That club is not currently in a family." });
    }
    if (club.family_id !== source.id) {
      return res
        .status(409)
        .json({ error: "That chapter is no longer in the expected source family." });
    }

    const [campusChapterRows] = await pool.query(
      `SELECT club_id FROM clubs
       WHERE family_id = :targetId AND campus_id = :campusId AND club_id <> :clubId`,
      { targetId: target.id, campusId: club.campus_id, clubId: club.club_id }
    );
    if (campusChapterRows[0]) {
      return res
        .status(409)
        .json({ error: "The target family already has a chapter on that campus." });
    }

    try {
      const [result] = await pool.query(
        `UPDATE clubs SET family_id = :targetId
         WHERE club_id = :clubId AND family_id = :sourceId`,
        { targetId: target.id, clubId: club.club_id, sourceId: source.id }
      );
      if (result.affectedRows === 0) {
        return res.status(409).json({ error: "That chapter moved before this request completed." });
      }
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        return res
          .status(409)
          .json({ error: "The target family already has a chapter on that campus." });
      }
      throw err;
    }

    await recordAudit(req, {
      action: "club_family.chapter.move",
      targetType: "club_family",
      targetId: target.id,
      detail: {
        clubId: club.club_id,
        clubName: club.name,
        campusId: club.campus_id,
        fromFamilyId: source.id,
        fromFamilyName: source.name,
        toFamilyId: target.id,
        toFamilyName: target.name,
      },
    });
    res.json({ family: await loadFamily(target.id) });
  }
);

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
