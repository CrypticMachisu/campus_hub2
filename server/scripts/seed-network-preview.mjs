// Preview-only two-campus state. It creates temporary rows with a `preview-`
// prefix, then can be removed with `npm run cleanup:preview`.
//
// This is intentionally local and non-production: it refuses to run against a
// database other than campushub_standalone unless PREVIEW_SEED_FORCE=true.
import "dotenv/config";

import { pool } from "../db.js";

const MEMBER_EMAIL = process.env.PREVIEW_MEMBER_EMAIL || "sofia.ramirez@campus.edu";
const ADMIN_EMAIL = process.env.PREVIEW_ADMIN_EMAIL || "amara.okafor@campus.edu";
const CAMPUS_ID = "preview-campus-b";
const FAMILY_ID = "preview-family";
const CLUB_A = "preview-club-a";
const CLUB_B = "preview-club-b";
const EVENT_ID = "preview-event-b";
const POST_ID = "preview-post-b";
const COMMITMENT_ID = "preview-commitment-b";

if (
  process.env.DB_NAME &&
  process.env.DB_NAME !== "campushub_standalone" &&
  process.env.PREVIEW_SEED_FORCE !== "true"
) {
  throw new Error("Preview seed refused: DB_NAME is not campushub_standalone.");
}

async function cleanup() {
  await pool.query(
    "DELETE FROM comments WHERE (target_type = 'event' AND target_id = ?) OR (target_type = 'post' AND target_id = ?) OR (target_type = 'commitment' AND target_id = ?)",
    [EVENT_ID, POST_ID, COMMITMENT_ID]
  );
  await pool.query("DELETE FROM commitment_signups WHERE commitment_id = ?", [COMMITMENT_ID]);
  await pool.query("DELETE FROM audit_log WHERE target_id IN (?, ?, ?, ?, ?)", [
    EVENT_ID,
    POST_ID,
    COMMITMENT_ID,
    FAMILY_ID,
    CLUB_B,
  ]);
  await pool.query("DELETE FROM posts WHERE post_id = ?", [POST_ID]);
  await pool.query("DELETE FROM events WHERE event_id = ?", [EVENT_ID]);
  await pool.query("DELETE FROM commitments WHERE commitment_id = ?", [COMMITMENT_ID]);
  await pool.query("DELETE FROM clubs WHERE club_id IN (?, ?)", [CLUB_A, CLUB_B]);
  await pool.query("DELETE FROM user_campus_affiliations WHERE campus_id = ?", [CAMPUS_ID]);
  await pool.query("DELETE FROM club_families WHERE family_id = ?", [FAMILY_ID]);
  await pool.query("DELETE FROM campuses WHERE campus_id = ?", [CAMPUS_ID]);
}

try {
  const [[member]] = await pool.query("SELECT user_id FROM users WHERE email = ?", [MEMBER_EMAIL]);
  const [[admin]] = await pool.query("SELECT user_id FROM users WHERE email = ?", [ADMIN_EMAIL]);
  if (!member || !admin) {
    throw new Error("Preview seed needs the demo member and admin accounts.");
  }

  const [[category]] = await pool.query("SELECT category_id FROM categories WHERE name = 'Academic'");
  if (!category) throw new Error("Academic category is missing.");

  await cleanup();

  await pool.query(
    "INSERT INTO campuses (campus_id, name, slug) VALUES (?, 'Riverside University', 'preview-riverside')",
    [CAMPUS_ID]
  );
  await pool.query(
    `INSERT INTO club_families
       (family_id, name, slug, description, home_campus_id, status, created_by)
     VALUES (?, 'Debate Across Campuses', 'preview-debate',
             'A shared debate family between Strathmore and Riverside.',
             'campus-01', 'active', ?)`,
    [FAMILY_ID, admin.user_id]
  );
  await pool.query(
    `INSERT INTO clubs
       (club_id, campus_id, family_id, name, category_id, description, meeting_time, meeting_location)
     VALUES
       (?, 'campus-01', ?, 'Debate & Rhetoric Society — Strathmore', ?,
        'The Strathmore chapter of the shared debate family.',
        'Tuesdays, 6:00 PM', 'Humanities Hall, Room 214'),
       (?, ?, ?, 'Debate & Rhetoric Society — Riverside', ?,
        'The Riverside chapter of the shared debate family.',
        'Thursdays, 5:00 PM', 'Riverside Library, Room 4')`,
    [CLUB_A, FAMILY_ID, category.category_id, CLUB_B, CAMPUS_ID, FAMILY_ID, category.category_id]
  );
  await pool.query(
    `INSERT INTO user_campus_affiliations
       (user_id, campus_id, kind, status, requested_at, decided_at)
     VALUES (?, ?, 'exchange', 'active', NOW(), NOW())`,
    [member.user_id, CAMPUS_ID]
  );
  await pool.query(
    `INSERT INTO events
       (event_id, club_id, title, description, category_id, event_date, event_time,
        location, bring_note, capacity, audience)
     VALUES (?, ?, 'Riverside–Strathmore Open Debate',
             'A cross-campus debate night for the shared family.', ?,
             DATE_ADD(CURDATE(), INTERVAL 3 DAY), '17:30:00',
             'Riverside Library, Room 4', 'Bring a notebook.', 60, 'network')`,
    [EVENT_ID, CLUB_B, category.category_id]
  );
  await pool.query(
    `INSERT INTO posts (post_id, club_id, author_id, author_name_snapshot, body, audience)
     VALUES (?, ?, ?, 'Amara Okafor',
             'Riverside chapter welcomes the Strathmore debaters for a joint practice round.',
             'network')`,
    [POST_ID, CLUB_B, admin.user_id]
  );
  await pool.query(
    `INSERT INTO commitments
       (commitment_id, club_id, kind, title, description, location, starts_at,
        capacity, host_name, source, audience, created_by)
     VALUES (?, ?, 'workshop', 'Joint debate practice',
             'Two rounds, mixed teams, open to the network.',
             'Riverside Library, Room 4', DATE_ADD(NOW(), INTERVAL 2 DAY),
             20, 'Riverside debate chapter', 'admin', 'network', ?)`,
    [COMMITMENT_ID, CLUB_B, admin.user_id]
  );

  console.log("Preview network seeded.");
  console.log(`  Campus:      ${CAMPUS_ID}`);
  console.log(`  Family:      /families/${FAMILY_ID}`);
  console.log(`  Member:      ${MEMBER_EMAIL}`);
  console.log(`  Network:     http://127.0.0.1:5173/network`);
  console.log("Remove it with: npm run cleanup:preview");
} finally {
  await pool.end();
}
