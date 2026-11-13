#!/usr/bin/env node
// Re-anchor the Agri club's seeded activities so they are upcoming again.
//
// The seeds in migrations/010_agro_opportunities.sql are dated relative to
// CURDATE() at the moment the migration runs. Apply them a week or two before
// Demo Day and the earliest visits quietly drop off
// GET /v2/agro/opportunities, which only returns upcoming rows — the panel then
// opens with a gap nobody notices until they are on stage.
//
//   npm run refresh:agro
//
// Only rows with source = 'seed' are touched; an activity an admin published
// keeps the date they chose. Each seed keeps its time of day and moves to its
// usual offset from today, so the demo always has four activities ahead of it.
import "dotenv/config";
import { pool } from "../db.js";

const OFFSETS = {
  "agro-opp-01": 3, // farm visit
  "agro-opp-02": 9, // tree planting
  "agro-opp-03": 14, // harvest
  "agro-opp-04": 6, // volunteering
};

const UPCOMING = `SELECT opportunity_id, kind,
       DATE_FORMAT(starts_at, '%Y-%m-%d %H:%i') AS starts
  FROM agro_opportunities
  ORDER BY starts_at`;

try {
  const [before] = await pool.query(UPCOMING);
  if (before.length === 0) {
    console.error("No opportunities found — run `npm run migrate` first.");
    process.exitCode = 1;
  } else {
    for (const [id, days] of Object.entries(OFFSETS)) {
      const [result] = await pool.query(
        `UPDATE agro_opportunities
            SET starts_at = TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL :days DAY), TIME(starts_at))
          WHERE opportunity_id = :id AND source = 'seed'`,
        { id, days }
      );
      if (result.affectedRows === 0) console.warn(`  ${id}: not found, skipped`);
    }

    const [after] = await pool.query(UPCOMING);
    console.log("Before:");
    console.table(before);
    console.log("After:");
    console.table(after);
    console.log("Seeded activities re-anchored; admin-added rows were left alone.");
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
