// Commitments — a dated activity a member can actually commit to.
//
// A commitment belongs to one club, has a host, a place, a time and an
// optional capacity. Signups past capacity are waitlisted in arrival order
// (created_at, then id as the tie-break), which is the same rule event RSVPs
// use. Positions are computed on read so a cancellation promotes the next
// person without a background job.
//
// Reads are public: the club page and the commitment page are part of the
// edition. Signed-in readers also get `joined` and their own waitlist
// position. Creating, deleting and viewing the roster require managing the
// owning club.
import { pool } from "../db.js";
import { requireAuth, optionalAuth, canManageClub } from "../middleware/auth.js";
import { createApiRouter } from "../middleware/apiGuards.js";
import { recordAudit } from "../audit.js";
import { parseStartTime } from "./events.js";

export const commitmentsRouter = createApiRouter();

const KINDS = [
  "farm_visit",
  "tree_planting",
  "harvest",
  "volunteering",
  "meeting",
  "workshop",
  "activity",
];

/** Human label for a kind, mirrored in src/utils/commitmentsStore.js. */
export function kindLabel(kind) {
  return (
    {
      farm_visit: "Farm visit",
      tree_planting: "Tree planting",
      harvest: "Harvest",
      volunteering: "Volunteering",
      meeting: "Meeting",
      workshop: "Workshop",
      activity: "Activity",
    }[kind] || "Activity"
  );
}

const COMMITMENT_QUERY = `
  SELECT c.*, DATE_FORMAT(c.starts_at, '%Y-%m-%dT%H:%i') AS starts_local,
         (SELECT COUNT(*) FROM commitment_signups s
           WHERE s.commitment_id = c.commitment_id) AS signup_count
  FROM commitments c
`;

/** Commitment row -> API shape. `startsAt` follows the v2 events convention. */
function rowToCommitment(row, joinedIds = new Set()) {
  return {
    id: row.commitment_id,
    clubId: row.club_id,
    kind: row.kind,
    kindLabel: kindLabel(row.kind),
    title: row.title,
    description: row.description || "",
    location: row.location,
    county: row.county || "",
    // DATE_FORMAT keeps the stored East Africa wall clock; no Date round-trip.
    startsAt: `${String(row.starts_local)}:00+03:00`,
    capacity: row.capacity == null ? null : Number(row.capacity),
    hostName: row.host_name || "",
    source: row.source,
    signupCount: Number(row.signup_count || 0),
    joined: joinedIds.has(row.commitment_id),
  };
}

/** Where this signup sits among the commitment's signups (1-based). */
async function positionOf(commitmentId, signupId) {
  const [rows] = await pool.query(
    `SELECT signup_id FROM commitment_signups
     WHERE commitment_id = :commitmentId
     ORDER BY created_at, signup_id`,
    { commitmentId }
  );
  const index = rows.findIndex((row) => row.signup_id === signupId);
  return index === -1 ? null : index + 1;
}

function waitlistedFor(capacity, position) {
  return capacity != null && position != null && position > Number(capacity);
}

/** The ids of this user's commitment signups, for the `joined` flag. */
async function joinedIdsFor(user) {
  if (!user) return new Set();
  const [rows] = await pool.query(
    "SELECT commitment_id FROM commitment_signups WHERE user_id = :userId",
    { userId: user.id }
  );
  return new Set(rows.map((row) => row.commitment_id));
}

// GET /commitments/mine — the signed-in member's commitments, with position.
// Registered before /:id so "mine" is never read as an id.
commitmentsRouter.get("/mine", requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.*, DATE_FORMAT(c.starts_at, '%Y-%m-%dT%H:%i') AS starts_local,
            (SELECT COUNT(*) FROM commitment_signups s
              WHERE s.commitment_id = c.commitment_id) AS signup_count,
            s.signup_id, s.created_at AS signed_at,
            (SELECT COUNT(*) FROM commitment_signups o
              WHERE o.commitment_id = c.commitment_id
                AND (o.created_at < s.created_at
                     OR (o.created_at = s.created_at AND o.signup_id < s.signup_id))) AS ahead_count
     FROM commitment_signups s
     JOIN commitments c ON c.commitment_id = s.commitment_id
     WHERE s.user_id = :userId
     ORDER BY c.starts_at, c.commitment_id`,
    { userId: req.user.id }
  );

  res.json({
    commitments: rows.map((row) => {
      const position = Number(row.ahead_count) + 1;
      const joined = new Set([row.commitment_id]);
      return {
        ...rowToCommitment(row, joined),
        signup: {
          id: row.signup_id,
          commitmentId: row.commitment_id,
          position,
          waitlisted: waitlistedFor(row.capacity, position),
          createdAt: row.signed_at,
        },
      };
    }),
  });
});

/**
 * GET /commitments?clubId=…&upcoming=0
 * Public list, earliest first. `upcoming=0` includes past commitments for the
 * officer view; the edition defaults to upcoming only.
 */
commitmentsRouter.get("/", optionalAuth, async (req, res) => {
  const clubId = typeof req.query.clubId === "string" ? req.query.clubId.trim() : "";
  const includePast = req.query.upcoming === "0";

  const where = [];
  const params = {};
  if (clubId) {
    where.push("c.club_id = :clubId");
    params.clubId = clubId;
  }
  if (!includePast) where.push("c.starts_at >= NOW()");

  const [rows] = await pool.query(
    `${COMMITMENT_QUERY}
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY c.starts_at, c.commitment_id`,
    params
  );

  const joinedIds = await joinedIdsFor(req.user);
  res.json({ commitments: rows.map((row) => rowToCommitment(row, joinedIds)) });
});

/** GET /commitments/:id — one commitment, plus the reader's own signup. */
commitmentsRouter.get("/:id", optionalAuth, async (req, res) => {
  const [rows] = await pool.query(`${COMMITMENT_QUERY} WHERE c.commitment_id = :id`, {
    id: req.params.id,
  });
  if (!rows[0]) return res.status(404).json({ error: "Commitment not found." });

  const commitment = rowToCommitment(rows[0], await joinedIdsFor(req.user));
  let signup = null;

  if (req.user) {
    const [mine] = await pool.query(
      "SELECT * FROM commitment_signups WHERE commitment_id = :id AND user_id = :userId",
      { id: req.params.id, userId: req.user.id }
    );
    if (mine[0]) {
      const position = await positionOf(req.params.id, mine[0].signup_id);
      signup = {
        id: mine[0].signup_id,
        commitmentId: req.params.id,
        position,
        waitlisted: waitlistedFor(commitment.capacity, position),
        createdAt: mine[0].created_at,
      };
    }
  }

  res.json({ commitment, signup });
});

/**
 * POST /commitments — publish a commitment.
 * Managers of the target club only, checked against the club's own admins.
 */
commitmentsRouter.post("/", requireAuth, async (req, res) => {
  const body = req.body || {};
  const clubId = typeof body.clubId === "string" ? body.clubId.trim() : "";
  if (!clubId) return res.status(400).json({ error: "clubId is required." });

  const [clubRows] = await pool.query("SELECT club_id FROM clubs WHERE club_id = :clubId", {
    clubId,
  });
  if (!clubRows[0]) return res.status(404).json({ error: "Club not found." });
  if (!canManageClub(req.user, clubId)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }

  const kind = typeof body.kind === "string" ? body.kind.trim() : "activity";
  if (!KINDS.includes(kind)) {
    return res.status(400).json({ error: `kind must be one of: ${KINDS.join(", ")}.` });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return res.status(400).json({ error: "Title is required." });
  if (title.length > 150) return res.status(400).json({ error: "Title is too long." });

  const location = typeof body.location === "string" ? body.location.trim() : "";
  if (!location) return res.status(400).json({ error: "Location is required." });
  if (location.length > 150) return res.status(400).json({ error: "Location is too long." });

  const start = parseStartTime({ startTime: body.startsAt, date: body.date, time: body.time });
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

  const id = `commit-${Date.now()}`;
  await pool.query(
    `INSERT INTO commitments
       (commitment_id, club_id, kind, title, description, location, county,
        starts_at, capacity, host_name, source, created_by)
     VALUES
       (:id, :clubId, :kind, :title, :description, :location, :county,
        :startsAt, :capacity, :hostName, 'admin', :createdBy)`,
    {
      id,
      clubId,
      kind,
      title,
      description: typeof body.description === "string" ? body.description.trim() : "",
      location,
      county: typeof body.county === "string" ? body.county.trim().slice(0, 80) : "",
      startsAt: `${start.date} ${start.time}`,
      capacity,
      hostName: typeof body.hostName === "string" ? body.hostName.trim().slice(0, 120) : "",
      createdBy: req.user.id,
    }
  );

  const [rows] = await pool.query(`${COMMITMENT_QUERY} WHERE c.commitment_id = :id`, { id });
  await recordAudit(req, {
    action: "commitment.create",
    targetType: "commitment",
    targetId: id,
    detail: { clubId, kind, title, startsAt: `${start.date} ${start.time}`, capacity },
  });
  res.status(201).json({ commitment: rowToCommitment(rows[0]) });
});

/** DELETE /commitments/:id — managers only; signups cascade. */
commitmentsRouter.delete("/:id", requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT commitment_id, club_id, title FROM commitments WHERE commitment_id = :id",
    { id: req.params.id }
  );
  const commitment = rows[0];
  if (!commitment) return res.status(404).json({ error: "Commitment not found." });
  if (!canManageClub(req.user, commitment.club_id)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }

  await pool.query("DELETE FROM commitments WHERE commitment_id = :id", { id: req.params.id });
  await recordAudit(req, {
    action: "commitment.delete",
    targetType: "commitment",
    targetId: req.params.id,
    detail: { clubId: commitment.club_id, title: commitment.title },
  });
  res.status(204).end();
});

/**
 * POST /commitments/:id/signup — commit to showing up.
 * Idempotent. The response carries the new count, the position and whether
 * that position is a waitlisted one, so the UI never has to guess.
 */
commitmentsRouter.post("/:id/signup", requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT commitment_id, capacity FROM commitments WHERE commitment_id = :id",
    { id: req.params.id }
  );
  const commitment = rows[0];
  if (!commitment) return res.status(404).json({ error: "Commitment not found." });

  const [existing] = await pool.query(
    "SELECT * FROM commitment_signups WHERE commitment_id = :id AND user_id = :userId",
    { id: req.params.id, userId: req.user.id }
  );

  let signupId = existing[0]?.signup_id;
  if (!signupId) {
    signupId = `cs-${Date.now()}-${req.user.id}`;
    await pool.query(
      `INSERT INTO commitment_signups
         (signup_id, commitment_id, user_id, name_snapshot, email_snapshot)
       VALUES (:signupId, :id, :userId, :name, :email)`,
      {
        signupId,
        id: req.params.id,
        userId: req.user.id,
        name: req.user.name,
        email: req.user.email,
      }
    );
  }

  const position = await positionOf(req.params.id, signupId);
  const [[{ count }]] = await pool.query(
    "SELECT COUNT(*) AS count FROM commitment_signups WHERE commitment_id = :id",
    { id: req.params.id }
  );

  res.status(existing[0] ? 200 : 201).json({
    signup: {
      id: signupId,
      commitmentId: req.params.id,
      position,
      waitlisted: waitlistedFor(commitment.capacity, position),
      createdAt: existing[0]?.created_at ?? new Date().toISOString(),
    },
    signupCount: Number(count),
  });
});

/** DELETE /commitments/:id/signup — withdraw your own commitment. */
commitmentsRouter.delete("/:id/signup", requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT commitment_id FROM commitments WHERE commitment_id = :id",
    { id: req.params.id }
  );
  if (!rows[0]) return res.status(404).json({ error: "Commitment not found." });

  await pool.query(
    "DELETE FROM commitment_signups WHERE commitment_id = :id AND user_id = :userId",
    { id: req.params.id, userId: req.user.id }
  );
  const [[{ count }]] = await pool.query(
    "SELECT COUNT(*) AS count FROM commitment_signups WHERE commitment_id = :id",
    { id: req.params.id }
  );
  res.json({ signup: null, signupCount: Number(count) });
});

/**
 * GET /commitments/:id/roster — managers see who is going and who waits.
 * Position and waitlist state are computed here, so the officer view and the
 * member's own ticket can never disagree.
 */
commitmentsRouter.get("/:id/roster", requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT commitment_id, club_id, capacity, title FROM commitments WHERE commitment_id = :id",
    { id: req.params.id }
  );
  const commitment = rows[0];
  if (!commitment) return res.status(404).json({ error: "Commitment not found." });
  if (!canManageClub(req.user, commitment.club_id)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }

  const [people] = await pool.query(
    `SELECT s.signup_id, s.user_id, s.created_at, s.name_snapshot, s.email_snapshot
     FROM commitment_signups s
     WHERE s.commitment_id = :id
     ORDER BY s.created_at, s.signup_id`,
    { id: req.params.id }
  );

  const capacity = commitment.capacity == null ? null : Number(commitment.capacity);
  res.json({
    commitment: { id: commitment.commitment_id, title: commitment.title, capacity },
    roster: people.map((person, index) => {
      const position = index + 1;
      return {
        id: person.signup_id,
        userId: person.user_id,
        name: person.name_snapshot,
        email: person.email_snapshot,
        position,
        waitlisted: capacity != null && position > capacity,
        signedUpAt: person.created_at,
      };
    }),
    summary: {
      going: capacity == null ? people.length : Math.min(people.length, capacity),
      waitlisted: capacity == null ? 0 : Math.max(0, people.length - capacity),
      capacity,
    },
  });
});
