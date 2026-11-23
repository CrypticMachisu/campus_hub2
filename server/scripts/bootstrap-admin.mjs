// Create the first campus and tier 1 operator on a schema-only deployment.
//
// Run from server/:
//   npm run bootstrap:admin
//
// Required environment:
//   BOOTSTRAP_ADMIN_EMAIL
//   BOOTSTRAP_ADMIN_PASSWORD
//   BOOTSTRAP_CAMPUS_NAME
//
// Optional:
//   BOOTSTRAP_ADMIN_NAME       (default: Campus operator)
//   BOOTSTRAP_CAMPUS_SLUG      (default: slugified campus name)
//   BOOTSTRAP_CAMPUS_DOMAIN    (default: the admin email domain)
//
// Idempotent: if the email already exists, it reports the account and changes
// nothing. It never prints the password.

import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool, assertDbConnection } from "../db.js";

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function main() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  const name = (process.env.BOOTSTRAP_ADMIN_NAME || "Campus operator").trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
  const campusName = (process.env.BOOTSTRAP_CAMPUS_NAME || "").trim();

  if (!email || !password || !campusName) {
    fail(
      "Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD and BOOTSTRAP_CAMPUS_NAME before running."
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail("BOOTSTRAP_ADMIN_EMAIL must be a valid email address.");
  }
  if (password.length < 8) {
    fail("BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters.");
  }

  const emailDomain = email.split("@")[1];
  const domain = (process.env.BOOTSTRAP_CAMPUS_DOMAIN || emailDomain)
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
  const slug = (process.env.BOOTSTRAP_CAMPUS_SLUG || slugify(campusName)).trim();

  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) {
    fail("BOOTSTRAP_CAMPUS_SLUG must contain only lowercase letters, numbers and hyphens.");
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    fail("BOOTSTRAP_CAMPUS_DOMAIN must be a valid email domain.");
  }

  await assertDbConnection();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existingUsers] = await conn.query(
      "SELECT user_id, email, role, campus_id FROM users WHERE email = :email FOR UPDATE",
      { email }
    );
    if (existingUsers.length > 0) {
      const existing = existingUsers[0];
      await conn.rollback();
      console.log(`\nAccount already exists: ${existing.email} (${existing.role}).`);
      console.log(`Campus: ${existing.campus_id}. Nothing changed.\n`);
      return;
    }

    const [domainRows] = await conn.query(
      "SELECT campus_id FROM campus_email_domains WHERE domain = :domain FOR UPDATE",
      { domain }
    );
    if (domainRows.length > 0) {
      throw new Error(
        `The domain ${domain} is already assigned to campus ${domainRows[0].campus_id}. ` +
          "Choose another domain or create the operator for that campus."
      );
    }

    let [campuses] = await conn.query(
      "SELECT campus_id FROM campuses WHERE slug = :slug FOR UPDATE",
      { slug }
    );
    let campusId;
    if (campuses.length > 0) {
      campusId = campuses[0].campus_id;
    } else {
      campusId = `campus-${Date.now()}`;
      await conn.query(
        "INSERT INTO campuses (campus_id, name, slug) VALUES (:campusId, :campusName, :slug)",
        { campusId, campusName, slug }
      );
    }

    await conn.query(
      "INSERT INTO campus_email_domains (domain, campus_id) VALUES (:domain, :campusId)",
      { domain, campusId }
    );

    const userId = `user-${Date.now() + 1}`;
    const passwordHash = await bcrypt.hash(password, 12);
    await conn.query(
      `INSERT INTO users (user_id, name, email, role, campus_id, password_hash)
       VALUES (:userId, :name, :email, 'tier1', :campusId, :passwordHash)`,
      { userId, name, email, campusId, passwordHash }
    );
    await conn.query(
      `INSERT INTO user_campus_affiliations
         (user_id, campus_id, kind, status, requested_at, decided_at)
       VALUES (:userId, :campusId, 'home', 'active', NOW(), NOW())`,
      { userId, campusId }
    );

    await conn.commit();
    console.log(`\nCreated tier 1 operator ${email} (${userId}).`);
    console.log(`Campus: ${campusName} (${campusId}), email domain ${domain}.`);
    console.log(
      "Sign in with the password you supplied. It was not printed or stored in plain text.\n"
    );
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      /* the connection may already be gone */
    }
    throw error;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("\nFailed to create the operator:", error.message);
  process.exit(1);
});
