import { randomUUID } from "crypto";
import { pool } from "../db.js";
import { requireAuth, canManageClub } from "../middleware/auth.js";
import { createApiRouter } from "../middleware/apiGuards.js";

export const agroOpportunitiesRouter = createApiRouter();

const AGRO_CLUB_ID = "club-07";

// GET: Display Agro Club opportunities
agroOpportunitiesRouter.get("/", async (req, res) => {
  const [rows] = await pool.query(
    `SELECT o.*,
      (SELECT COUNT(*) FROM agro_opportunity_signups s
       WHERE s.opportunity_id = o.opportunity_id) AS signup_count
     FROM agro_opportunities o
     WHERE o.club_id = ?
     ORDER BY o.event_date ASC`,
    [AGRO_CLUB_ID]
  );

  res.json(rows);
});

// GET: View the logged-in student's registrations
agroOpportunitiesRouter.get("/mine", requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT s.*, o.title, o.event_date, o.location
     FROM agro_opportunity_signups s
     JOIN agro_opportunities o
       ON o.opportunity_id = s.opportunity_id
     WHERE s.user_id = ?
     ORDER BY o.event_date ASC`,
    [req.user.user_id]
  );

  res.json(rows);
});

// POST: Create an opportunity (Agro Club admins only)
agroOpportunitiesRouter.post("/", requireAuth, async (req, res) => {
  if (!canManageClub(req.user, AGRO_CLUB_ID)) {
    return res.status(403).json({ error: "Not authorized." });
  }

  const { title, description, activity_type, location, event_date, event_time, capacity } =
    req.body;

  if (!title || !activity_type || !location || !event_date) {
    return res.status(400).json({ error: "Please complete all required fields." });
  }

  if (
    capacity !== undefined &&
    capacity !== null &&
    (!Number.isInteger(Number(capacity)) || Number(capacity) < 1)
  ) {
    return res.status(400).json({ error: "Capacity must be a positive whole number." });
  }

  const opportunityId = `agro-${randomUUID()}`;

  await pool.query(
    `INSERT INTO agro_opportunities
     (opportunity_id, club_id, title, description, activity_type,
      location, event_date, event_time, capacity, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      opportunityId,
      AGRO_CLUB_ID,
      title.trim(),
      description || null,
      activity_type,
      location.trim(),
      event_date,
      event_time || null,
      capacity ?? null,
      req.user.user_id,
    ]
  );

  res.status(201).json({ message: "Opportunity created.", opportunityId });
});

// POST: Register for an opportunity
agroOpportunitiesRouter.post("/:id/register", requireAuth, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT * FROM agro_opportunities
       WHERE opportunity_id = ? AND club_id = ?
       FOR UPDATE`,
      [req.params.id, AGRO_CLUB_ID]
    );

    const opportunity = rows[0];

    if (!opportunity || opportunity.status !== "open") {
      await connection.rollback();
      return res.status(404).json({ error: "Opportunity is unavailable." });
    }

    if (opportunity.event_date < new Date().toISOString().slice(0, 10)) {
      await connection.rollback();
      return res.status(400).json({ error: "This opportunity has passed." });
    }

    const [existing] = await connection.query(
      `SELECT signup_id FROM agro_opportunity_signups
       WHERE opportunity_id = ? AND user_id = ?`,
      [req.params.id, req.user.user_id]
    );

    if (existing.length) {
      await connection.rollback();
      return res.status(409).json({ error: "You are already registered." });
    }

    const [countRows] = await connection.query(
      `SELECT COUNT(*) AS total FROM agro_opportunity_signups
       WHERE opportunity_id = ?`,
      [req.params.id]
    );

    if (opportunity.capacity !== null && countRows[0].total >= opportunity.capacity) {
      await connection.rollback();
      return res.status(409).json({ error: "This opportunity is full." });
    }

    await connection.query(
      `INSERT INTO agro_opportunity_signups
       (signup_id, opportunity_id, user_id, name_snapshot, email_snapshot)
       VALUES (?, ?, ?, ?, ?)`,
      [`ags-${randomUUID()}`, req.params.id, req.user.user_id, req.user.name, req.user.email]
    );

    await connection.commit();
    res.status(201).json({ message: "Registration successful." });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

// DELETE: Cancel a student's own registration
agroOpportunitiesRouter.delete("/:id/register", requireAuth, async (req, res) => {
  const [result] = await pool.query(
    `DELETE FROM agro_opportunity_signups
     WHERE opportunity_id = ? AND user_id = ?`,
    [req.params.id, req.user.user_id]
  );

  if (!result.affectedRows) {
    return res.status(404).json({ error: "Registration not found." });
  }

  res.json({ message: "Registration cancelled." });
});
