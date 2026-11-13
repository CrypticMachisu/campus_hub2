// AgroConnect opportunities — the Agri-Business & Farming club's activities.
//
// Team 6's contract has no opportunities resource, so these rows are OURS:
// farm visits, tree-planting days, harvest mornings and volunteering shifts,
// seeded below or added by a club admin. We never derive an opportunity from
// a farmer or produce record — a grower listing tomatoes is not a farm visit,
// and pretending otherwise would put activities in front of students that no
// one ever scheduled. `source` records which local origin a row has:'seed' or
// 'admin'; neither comes from the partner.
//
// AgroConnect supplies context only (the matched grower's name and county),
// which means the list still works when it is down — the last farmer list we
// received is stored in `partner_snapshots` and served with an asOf stamp.
import { pool } from "../db.js";
import { requireAuth, canManageClub } from "../middleware/auth.js";
import { createApiRouter } from "../middleware/apiGuards.js";
import { recordAudit } from "../audit.js";
import { partnerGet } from "./partner.js";
import { parseStartTime } from "./events.js";

// The club row created by migrations/004_add_agriculture_club.sql, and the same
// id the AgriClubSpotlight uses on the client.
const AGRI_CLUB_ID = "club-07";

const OPPORTUNITY_KINDS = ["farm_visit", "tree_planting", "harvest", "volunteering"];

export const agroRouter = createApiRouter();

const OPPORTUNITY_QUERY = `
  SELECT o.opportunity_id, o.kind, o.title, o.description, o.location, o.county,
         DATE_FORMAT(o.starts_at, '%Y-%m-%dT%H:%i') AS starts_local,
         o.capacity, o.host_name, o.farmer_id, o.source,
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
    farmerId: row.farmer_id == null ? null : Number(row.farmer_id),
    source: row.source,
    interestCount: Number(row.interest_count || 0),
    interested: interestIds.has(row.opportunity_id),
  };
}

const FARMERS_SNAPSHOT = "agroconnect:farmers";
const PRODUCE_SNAPSHOT = "agroconnect:produce";

/** Last list we successfully fetched for one partner feed, or null. */
async function readSnapshot(key) {
  const [rows] = await pool.query(
    "SELECT payload, as_of FROM partner_snapshots WHERE cache_key = :key",
    { key }
  );
  const row = rows[0];
  if (!row) return null;
  try {
    const items = JSON.parse(row.payload);
    if (!Array.isArray(items)) return null;
    return { items, asOf: new Date(row.as_of).toISOString() };
  } catch {
    return null;
  }
}

/** Save a feed on every success, so a restart does not erase it. */
async function writeSnapshot(key, items, asOf) {
  await pool.query(
    `INSERT INTO partner_snapshots (cache_key, payload, as_of)
     VALUES (:key, :payload, :asOf)
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), as_of = VALUES(as_of)`,
    { key, payload: JSON.stringify(items), asOf: new Date(asOf) }
  );
}

/**
 * Live -> saved copy -> nothing, the same rule for every partner list.
 * Nothing here is turned into an opportunity; these lists only decorate a
 * card the club already created.
 */
async function cachedFeed(path, key, shape, map) {
  const result = await partnerGet(path);
  if (result.ok && shape(result.data)) {
    const items = map(result.data);
    try {
      await writeSnapshot(key, items, result.asOf);
    } catch (err) {
      console.error(`could not save the ${key} snapshot:`, err.message);
    }
    return { items, live: true, asOf: result.asOf };
  }

  const saved = await readSnapshot(key).catch((err) => {
    console.error(`could not read the ${key} snapshot:`, err.message);
    return null;
  });
  return saved
    ? { items: saved.items, live: false, asOf: saved.asOf }
    : { items: [], live: false, asOf: null };
}

/**
 * Both partner feeds for the cards, fetched together: one timeout budget
 * (~5.1 s worst case) rather than two, which keeps the page inside its 10 s
 * client fetch.
 */
async function partnerFeeds() {
  const [farmers, produce] = await Promise.all([
    cachedFeed(
      "/farmers",
      FARMERS_SNAPSHOT,
      (data) => Array.isArray(data?.farmers),
      (data) =>
        data.farmers.map((farmer) => ({
          id: farmer.id,
          fullName: farmer.fullName,
          county: farmer.county,
          focus: farmer.focus,
        }))
    ),
    cachedFeed(
      "/produce",
      PRODUCE_SNAPSHOT,
      (data) => Array.isArray(data?.listings),
      (data) =>
        data.listings.map((listing) => ({
          id: listing.id,
          title: listing.title,
          price: listing.price,
          unit: listing.unit,
          quantity: listing.quantity,
          county: listing.county,
          sellerName: listing.sellerName,
        }))
    ),
  ]);
  return { farmers, produce };
}

/**
 * Attach the matched grower and their current listings. The opportunity stays
 * ours; the partner data is shown beside it and labelled as theirs.
 */
function withGrower(opportunity, farmers, produce) {
  const host = opportunity.hostName.trim().toLowerCase();
  const match = farmers.find(
    (farmer) =>
      (opportunity.farmerId != null && Number(farmer.id) === opportunity.farmerId) ||
      (host && String(farmer.fullName).toLowerCase() === host)
  );
  if (!match) return opportunity;

  // Their listings identify the seller only by name, so this is a name match
  // rather than an id join. A miss simply shows no stall, never a wrong one.
  const listings = produce
    .filter(
      (listing) => String(listing.sellerName).toLowerCase() === String(match.fullName).toLowerCase()
    )
    .slice(0, 3);

  return {
    ...opportunity,
    grower: {
      id: match.id,
      name: match.fullName,
      county: match.county || "",
      focus: match.focus || "",
      listings,
    },
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

  const feeds = await partnerFeeds();
  res.json({
    opportunities: rows.map((row) =>
      withGrower(rowToOpportunity(row, interestIds), feeds.farmers.items, feeds.produce.items)
    ),
    partner: {
      live: feeds.farmers.live,
      asOf: feeds.farmers.asOf,
      stale: !feeds.farmers.live && Boolean(feeds.farmers.asOf),
      growerCount: feeds.farmers.items.length,
      produce: {
        live: feeds.produce.live,
        asOf: feeds.produce.asOf,
        stale: !feeds.produce.live && Boolean(feeds.produce.asOf),
        count: feeds.produce.items.length,
      },
      // Team 6 publishes growers and produce, not activities. Report the
      // opportunities feed as unavailable rather than deriving rows from a
      // grower or produce listing — that would put activities in front of
      // students that nobody scheduled. When they expose a feed, it is read
      // here and this stops being false, without changing the local rows.
      opportunities: [],
      opportunitiesAvailable: false,
    },
  });
});

/**
 * POST /api/v2/agro/opportunities — an admin of the Agri club adds an
 * activity. This is the "admin-added" half of the fallback story: it never
 * depends on the partner being reachable.
 */
agroRouter.post("/opportunities", requireAuth, async (req, res) => {
  if (!canManageClub(req.user, AGRI_CLUB_ID)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }

  const body = req.body || {};
  const kind = typeof body.kind === "string" ? body.kind.trim() : "";
  if (!OPPORTUNITY_KINDS.includes(kind)) {
    return res.status(400).json({ error: `kind must be one of: ${OPPORTUNITY_KINDS.join(", ")}.` });
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
  if (!start) return res.status(400).json({ error: "Invalid startsAt." });

  let capacity = null;
  if (body.capacity !== undefined && body.capacity !== null && body.capacity !== "") {
    const parsed = Number(body.capacity);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10000) {
      return res
        .status(400)
        .json({ error: "capacity must be a whole number between 1 and 10000." });
    }
    capacity = parsed;
  }

  let farmerId = null;
  if (body.farmerId !== undefined && body.farmerId !== null && body.farmerId !== "") {
    const parsed = Number(body.farmerId);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return res.status(400).json({ error: "farmerId must be a positive whole number." });
    }
    farmerId = parsed;
  }

  const id = `agro-${Date.now()}`;
  await pool.query(
    `INSERT INTO agro_opportunities
       (opportunity_id, kind, title, description, location, county, starts_at,
        capacity, host_name, farmer_id, source)
     VALUES
       (:id, :kind, :title, :description, :location, :county, :startsAt,
        :capacity, :hostName, :farmerId, 'admin')`,
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
      farmerId,
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
    return res.status(403).json({ error: "You don't have admin access to that club." });
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
    return res.status(403).json({ error: "You don't have admin access to that club." });
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
