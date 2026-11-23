// Remove the temporary rows created by seed-network-preview.mjs.
import "dotenv/config";

import { pool } from "../db.js";

const CAMPUS_ID = "preview-campus-b";
const FAMILY_ID = "preview-family";
const CLUB_A = "preview-club-a";
const CLUB_B = "preview-club-b";
const EVENT_ID = "preview-event-b";
const POST_ID = "preview-post-b";
const COMMITMENT_ID = "preview-commitment-b";

try {
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
  console.log("Preview network removed.");
} finally {
  await pool.end();
}
