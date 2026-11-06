import { pool } from "./db.js";
import { rowToUser } from "./rowMappers.js";

/**
 * Fetch one user by id, with their admin_for_clubs list pre-aggregated
 * via a club_admins join (GROUP_CONCAT), already mapped to the API shape.
 * Returns null if no such user.
 */
export async function findUserById(userId) {
  const [rows] = await pool.query(
    `SELECT u.*,
       GROUP_CONCAT(DISTINCT ca.club_id) AS admin_club_ids,
       GROUP_CONCAT(DISTINCT cm.club_id) AS member_club_ids
     FROM users u
     LEFT JOIN club_admins ca ON ca.user_id = u.user_id
     LEFT JOIN club_members cm ON cm.user_id = u.user_id
     WHERE u.user_id = :userId
     GROUP BY u.user_id`,
    { userId }
  );
  return rows[0] ? rowToUser(rows[0]) : null;
}

/**
 * Promotes a user to tier2 admin for a given club: links them in
 * club_admins and bumps their role to
 * 'tier2' only if they're currently a plain 'member'
 * and doesn't touch an existing tier2's role
 * if they're just being added to another club. Returns the updated user.
 */
export async function promoteUserToClubAdmin(userId, clubId) {
  await pool.query(`INSERT IGNORE INTO club_admins (user_id, club_id) VALUES (:userId, :clubId)`, {
    userId,
    clubId,
  });
  await pool.query(`UPDATE users SET role = 'tier2' WHERE user_id = :userId AND role = 'member'`, {
    userId,
  });
  return findUserById(userId);
}

/**
 * Removes a user's admin link to one club. If that was their last
 * club, drops their role back to 'member' — tier1 is never touched
 * here (callers should never pass a tier1's id in). Returns the updated user.
 */
export async function demoteUserFromClubAdmin(userId, clubId) {
  await pool.query(`DELETE FROM club_admins WHERE user_id = :userId AND club_id = :clubId`, {
    userId,
    clubId,
  });

  const [rows] = await pool.query(
    `SELECT COUNT(*) AS remaining FROM club_admins WHERE user_id = :userId`,
    { userId }
  );
  if (rows[0].remaining === 0) {
    await pool.query(
      `UPDATE users SET role = 'member' WHERE user_id = :userId AND role = 'tier2'`,
      {
        userId,
      }
    );
  }

  return findUserById(userId);
}

/** Same as findUserById, but by email (case-insensitive) — used by login. Returns the raw row (includes password_hash), not the mapped shape. */
export async function findUserRowByEmail(email) {
  const [rows] = await pool.query(
    `SELECT u.*,
       GROUP_CONCAT(DISTINCT ca.club_id) AS admin_club_ids,
       GROUP_CONCAT(DISTINCT cm.club_id) AS member_club_ids
     FROM users u
     LEFT JOIN club_admins ca ON ca.user_id = u.user_id
     LEFT JOIN club_members cm ON cm.user_id = u.user_id
     WHERE LOWER(u.email) = LOWER(:email)
     GROUP BY u.user_id`,
    { email }
  );
  return rows[0] || null;
}

/** Look up a category's id by its name (e.g. "Technology"). Returns null if not found. */
export async function findCategoryIdByName(name) {
  const [rows] = await pool.query("SELECT category_id FROM categories WHERE name = :name", {
    name,
  });
  return rows[0]?.category_id ?? null;
}

/** Adds a member<->club link. Idempotent — joining twice is a no-op, not an error. */
export async function addClubMember(userId, clubId) {
  await pool.query(`INSERT IGNORE INTO club_members (user_id, club_id) VALUES (:userId, :clubId)`, {
    userId,
    clubId,
  });
  return findUserById(userId);
}

/** Removes a member<->club link. Also a no-op if they weren't a member. */
export async function removeClubMember(userId, clubId) {
  await pool.query(`DELETE FROM club_members WHERE user_id = :userId AND club_id = :clubId`, {
    userId,
    clubId,
  });
  return findUserById(userId);
}

/** Roster for one club, oldest join first. Includes email only for admins (see route). */
export async function findClubMembers(clubId) {
  const [rows] = await pool.query(
    `SELECT u.user_id, u.name, u.email, u.role, cm.joined_at
     FROM club_members cm
     JOIN users u ON u.user_id = cm.user_id
     WHERE cm.club_id = :clubId
     ORDER BY cm.joined_at`,
    { clubId }
  );
  return rows;
}
