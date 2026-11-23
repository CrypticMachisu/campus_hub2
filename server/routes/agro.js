// Club opportunities — the Agri-Business & Farming club's activities.
//
// These rows are the club's own: farm visits, tree-planting days, harvest
// mornings and volunteering shifts, seeded below or added by a club admin.
// Nothing is derived from an outside listing — a grower selling tomatoes is
// not a farm visit, and pretending otherwise would put activities in front of
// students that no one ever scheduled. `source` records which local origin a
// row has: 'seed' or 'admin'.
//
// Standalone build: there is no external partner call on this path. Host
// names are typed by the club admin and stored with the activity itself.
import { pool } from "../db.js";
import { requireAuth, canManageClub } from "../middleware/auth.js";
import { createApiRouter } from "../middleware/apiGuards.js";
import { recordAudit } from "../audit.js";
import { parseStartTime } from "./events.js";

// The club row created by migrations/004_add_agriculture_club.sql, and the same
// id the AgriClubSpotlight uses on the client.
const AGRI_CLUB_ID = "club-07";

const OPPORTUNITY_KINDS = ["farm_visit", "tree_planting", "harvest", "volunteering"];

export const agroRouter = createApiRouter();

const OPPORTUNITY_QUERY = `
  SELECT o.opportunity_id, o.kind, o.title, o.description, o.location, o.county,
         DATE_FORMAT(o.starts_at, '%Y-%m-%dT%H:%i') AS starts_local,
         o.capacity, o.host_name, o.source,
         (SELECT COUNT(*) FROM agro_interest i
           WHERE i.opportunity_id = o.opportunity_id) AS interest_count
  FROM agro_opportunities o
`;

/** Opportunity row -> API shape. `startsAt` follows the v2 events convention. */
function rowToOpportunity(row, interestIds = new Set()) {
  const starts = String(row.starts_local);
  return {
    id: row.opportunity_id,
    kind: row.kind,
    title: row.title,
    description: row.description || "",
    location: row.location,
    county: row.county || "",
    // DATE_FORMAT keeps the stored East Africa wall clock; no Date round-trip.
    startsAt: `${starts}:00+03:00`,
    capacity: row.capacity == null ? null : Number(row.capacity),
    hostName: row.host_name || "",
    source: row.source,
    interestCount: Number(row.interest_count || 0),
    interested: interestIds.has(row.opportunity_id),
  };
}

const isAgriMember = (user) =>
  Boolean(
    user &&
    (user.role === "tier1" ||
      canManageClub(user, AGRI_CLUB_ID) ||
      user.memberOfClubs.includes(AGRI_CLUB_ID))
  );

/**
 * GET /api/v2/agro/opportunities — club members and club admins only.
 * A signed-out visitor and a member of another club both get 403; the panel
 * on the public club page turns that into a "members only" note instead of
 * showing the activities to everyone.
 */
agroRouter.get("/opportunities", requireAuth, async (req, res) => {
  if (!isAgriMember(req.user)) {
    return res.status(403).json({
      error: "Only Agri-Business & Farming Club members can see opportunities.",
    });
  }

  const [rows] = await pool.query(
    `${OPPORTUNITY_QUERY} WHERE o.starts_at >= NOW() ORDER BY o.starts_at`
  );

  const [mine] = await pool.query(
    "SELECT opportunity_id FROM agro_interest WHERE user_id = :userId",
    { userId: req.user.id }
  );
  const interestIds = new Set(mine.map((row) => row.opportunity_id));

  res.json({
    opportunities: rows.map((row) => rowToOpportunity(row, interestIds)),
  });
});

/**
 * POST /api/v2/agro/opportunities — an admin of the Agri club adds an
 * activity. It depends only on this database, never on an external service.
 */
agroRouter.post("/opportunities", requireAuth, async (req, res) => {
  if (!canManageClub(req.user, AGRI_CLUB_ID)) {
    return res.status(403).json({ error: "You need club admin access to do that." });
  }

  const body = req.body || {};
  const kind = typeof body.kind === "string" ? body.kind.trim() : "";
  if (!OPPORTUNITY_KINDS.includes(kind)) {
    return res.status(400).json({ error: "Choose a valid opportunity type." });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return res.status(400).json({ error: "Title is required." });
  if (title.length > 150) return res.status(400).json({ error: "Title is too long." });

  const location = typeof body.location === "string" ? body.location.trim() : "";
  if (!location) return res.status(400).json({ error: "Location is required." });
  if (location.length > 150) return res.status(400).json({ error: "Location is too long." });

  const start = parseStartTime({
    startTime: body.startsAt,
    date: body.date,
    time: body.time,
  });
  if (!start) return res.status(400).json({ error: "Choose a valid date and time." });

  let capacity = null;
  if (body.capacity !== undefined && body.capacity !== null && body.capacity !== "") {
    const parsed = Number(body.capacity);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10000) {
      return res
        .status(400)
        .json({ error: "Capacity must be a whole number between 1 and 10,000." });
    }
    capacity = parsed;
  }

  const id = `agro-${Date.now()}`;
  await pool.query(
    `INSERT INTO agro_opportunities
       (opportunity_id, kind, title, description, location, county, starts_at,
        capacity, host_name, source)
     VALUES
       (:id, :kind, :title, :description, :location, :county, :startsAt,
        :capacity, :hostName, 'admin')`,
    {
      id,
      kind,
      title,
      description: typeof body.description === "string" ? body.description.trim() : "",
      location,
      county: typeof body.county === "string" ? body.county.trim() : "",
      startsAt: `${start.date} ${start.time}`,
      capacity,
      hostName: typeof body.hostName === "string" ? body.hostName.trim().slice(0, 120) : "",
    }
  );

  const [rows] = await pool.query(`${OPPORTUNITY_QUERY} WHERE o.opportunity_id = :id`, { id });
  await recordAudit(req, {
    action: "agro.opportunity.create",
    targetType: "opportunity",
    targetId: id,
    detail: { kind, title, startsAt: `${start.date} ${start.time}`, capacity },
  });
  res.status(201).json({ opportunity: rowToOpportunity(rows[0]) });
});

/** DELETE /api/v2/agro/opportunities/:id — admins only; interests cascade. */
agroRouter.delete("/opportunities/:id", requireAuth, async (req, res) => {
  if (!canManageClub(req.user, AGRI_CLUB_ID)) {
    return res.status(403).json({ error: "You need club admin access to do that." });
  }
  const [rows] = await pool.query(
    "SELECT opportunity_id, title FROM agro_opportunities WHERE opportunity_id = :id",
    { id: req.params.id }
  );
  if (!rows[0]) return res.status(404).json({ error: "Opportunity not found." });

  await pool.query("DELETE FROM agro_opportunities WHERE opportunity_id = :id", {
    id: req.params.id,
  });
  await recordAudit(req, {
    action: "agro.opportunity.delete",
    targetType: "opportunity",
    targetId: req.params.id,
    detail: { title: rows[0].title },
  });
  res.status(204).end();
});

/**
 * GET /api/v2/agro/opportunities/:id/interested — admins see who to contact.
 * A count is not actionable: the point of registering interest is that the
 * club can follow up, so this is the one place an email is returned, and only
 * to someone who can manage club-07.
 */
agroRouter.get("/opportunities/:id/interested", requireAuth, async (req, res) => {
  if (!canManageClub(req.user, AGRI_CLUB_ID)) {
    return res.status(403).json({ error: "You need club admin access to do that." });
  }

  const [opportunities] = await pool.query(
    "SELECT opportunity_id FROM agro_opportunities WHERE opportunity_id = :id",
    { id: req.params.id }
  );
  if (!opportunities[0]) return res.status(404).json({ error: "Opportunity not found." });

  const [rows] = await pool.query(
    `SELECT i.user_id, i.created_at, u.name, u.email
     FROM agro_interest i
     JOIN users u ON u.user_id = i.user_id
     WHERE i.opportunity_id = :id
     ORDER BY i.created_at, i.user_id`,
    { id: req.params.id }
  );

  res.json({
    interested: rows.map((row) => ({
      id: row.user_id,
      name: row.name,
      email: row.email,
      interestedAt: row.created_at,
    })),
  });
});

/**
 * POST /api/v2/agro/opportunities/:id/interest — a club member registers
 * interest. Idempotent: registering twice returns 200 with the same count,
 * the first time returns 201.
 */
agroRouter.post("/opportunities/:id/interest", requireAuth, async (req, res) => {
  if (!isAgriMember(req.user)) {
    return res
      .status(403)
      .json({ error: "Join the Agri-Business & Farming Club to register interest." });
  }

  const [opportunities] = await pool.query(
    "SELECT opportunity_id FROM agro_opportunities WHERE opportunity_id = :id",
    { id: req.params.id }
  );
  if (!opportunities[0]) return res.status(404).json({ error: "Opportunity not found." });

  const [result] = await pool.query(
    "INSERT IGNORE INTO agro_interest (opportunity_id, user_id) VALUES (:id, :userId)",
    { id: req.params.id, userId: req.user.id }
  );
  const [[{ count }]] = await pool.query(
    "SELECT COUNT(*) AS count FROM agro_interest WHERE opportunity_id = :id",
    { id: req.params.id }
  );

  res.status(result.affectedRows === 0 ? 200 : 201).json({
    interest: {
      opportunityId: req.params.id,
      interested: true,
      interestCount: Number(count),
    },
  });
});

/** DELETE /api/v2/agro/opportunities/:id/interest — withdraw your interest. */
agroRouter.delete("/opportunities/:id/interest", requireAuth, async (req, res) => {
  const [opportunities] = await pool.query(
    "SELECT opportunity_id FROM agro_opportunities WHERE opportunity_id = :id",
    { id: req.params.id }
  );
  if (!opportunities[0]) return res.status(404).json({ error: "Opportunity not found." });

  await pool.query("DELETE FROM agro_interest WHERE opportunity_id = :id AND user_id = :userId", {
    id: req.params.id,
    userId: req.user.id,
  });
  const [[{ count }]] = await pool.query(
    "SELECT COUNT(*) AS count FROM agro_interest WHERE opportunity_id = :id",
    { id: req.params.id }
  );

  res.json({
    interest: {
      opportunityId: req.params.id,
      interested: false,
      interestCount: Number(count),
    },
  });
});
