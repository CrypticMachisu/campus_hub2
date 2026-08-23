// Maps MySQL rows to the camelCase shapes the frontend expects.
//
// Your schema normalizes a few things mine didn't (categories as their
// own table, tags/admin-club links as junction tables), so several of
// these expect a JOIN/GROUP_CONCAT'd row rather than a plain SELECT * —
// see the comment on each function for the query shape it assumes.
// The queries that produce these rows live in routes/*.js.

/** Expects: users.* + admin_club_ids (comma-separated club_id list from a club_admins join, or NULL). */
export function rowToUser(row) {
  return {
    id: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    adminForClubs: row.admin_club_ids ? row.admin_club_ids.split(",") : [],
  };
}

/** Expects: clubs.* + category_name (from categories join) + tags (comma-separated from a club_tags join, or NULL). */
export function rowToClub(row) {
  return {
    id: row.club_id,
    name: row.name,
    category: row.category_name,
    description: row.description,
    logoUrl: row.logo_url,
    meetingTime: row.meeting_time,
    meetingLocation: row.meeting_location,
    tags: row.tags ? row.tags.split(",") : [],
  };
}

/**
 * Expects: events.* + category_name (from categories join).
 * isSeed is derived from the id prefix, matching the convention your
 * schema's own comment documents ('event-01' for seed rows,
 * 'custom-<timestamp>' for admin-created ones) — there's no separate
 * column for it.
 */
export function rowToEvent(row) {
  return {
    id: row.event_id,
    clubId: row.club_id,
    title: row.title,
    description: row.description,
    category: row.category_name,
    date:
      row.event_date instanceof Date
        ? row.event_date.toISOString().split("T")[0]
        : String(row.event_date).split("T")[0],
    time: formatTime(row.event_time),
    location: row.location,
    imageUrl: row.image_url,
    isSeed: !row.event_id.startsWith("custom-"),
  };
}

/** MySQL TIME columns come back as "HH:MM:SS" strings — trim to "HH:MM". */
function formatTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

/** Expects: event_signups.* as-is. */
export function rowToSignup(row) {
  return {
    id: row.signup_id,
    eventId: row.event_id,
    userId: row.user_id,
    name: row.name_snapshot,
    email: row.email_snapshot,
    createdAt: row.created_at,
  };
}

/** Expects: comments.* as-is. */
export function rowToComment(row) {
  return {
    id: row.comment_id,
    targetType: row.target_type,
    targetId: row.target_id,
    userId: row.user_id,
    userName: row.user_name_snapshot,
    text: row.comment_text,
    createdAt: row.created_at,
  };
}

/** Expects: announcements.* as-is. */
export function rowToAnnouncement(row) {
  return {
    id: row.announcement_id,
    clubId: row.club_id,
    text: row.announcement_text,
    createdAt: row.created_at,
  };
}
