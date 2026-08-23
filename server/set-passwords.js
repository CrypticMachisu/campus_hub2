// Your campushub_database.sql already inserts the 8 demo users — this
// script just hashes a password and fills in the password_hash column
// the migration added, for each of them by email. Safe to re-run
// (it always overwrites with a fresh hash of the current SEED_PASSWORD).
//
// Run with: npm run set-passwords   (inside server/)

import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool, assertDbConnection } from "./db.js";

const demoEmails = [
  "amara.okafor@campus.edu",
  "leo.fischer@campus.edu",
  "priya.nair@campus.edu",
  "denis.mwangi@campus.edu",
  "sofia.ramirez@campus.edu",
  "jamal.green@campus.edu",
  "yuki.tanaka@campus.edu",
  "nadia.haddad@campus.edu",
];

async function run() {
  await assertDbConnection();

  const seedPassword = process.env.SEED_PASSWORD || "campushub123";
  const passwordHash = await bcrypt.hash(seedPassword, 10);

  let updated = 0;
  for (const email of demoEmails) {
    const [result] = await pool.query(
      "UPDATE users SET password_hash = :passwordHash WHERE email = :email",
      { passwordHash, email }
    );
    if (result.affectedRows === 0) {
      console.warn(`No user found with email ${email} — skipped (did the SQL import run?).`);
    } else {
      updated += 1;
    }
  }

  console.log(`\nSet a password on ${updated} of ${demoEmails.length} demo accounts.`);
  console.log(`They can all log in with: "${seedPassword}"`);
  console.log(`(set SEED_PASSWORD in .env before running this again to change it)\n`);

  await pool.end();
}

run().catch((err) => {
  console.error("Failed to set passwords:", err);
  process.exit(1);
});
