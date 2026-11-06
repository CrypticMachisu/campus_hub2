// Maps MySQL rows to the camelCase shapes the frontend expects.
//
// Your schema normalizes a few things mine didn't (categories as their
// own table, tags/admin-club links as junction tables), so several of
// these expect a JOIN/GROUP_CONCAT'd row rather than a plain SELECT * —
// see the comment on each function for the query shape it assumes.
// The queries that produce these rows live in routes/*.js.

/**
 * Expects: users.* + admin_club_ids and member_club_ids (comma-separated
 * club_id lists from club_admins / club_members joins, or NULL).
 */
export function rowToUser(row) {
  return {
    id: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    adminForClubs: splitIds(row.admin_club_ids),
    memberOfClubs: splitIds(row.member_club_ids),
  };
}

/** "club-01,club-02" -> ["club-01", "club-02"]; NULL/empty -> []. */
function splitIds(value) {
  return value ? String(value).split(",").filter(Boolean) : [];
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
    // Empty strings mean "no override" — the frontend then falls back to the
    // category's playbook, so the old shape still renders the same defaults.
    playbookOverrides: {
      rsvpLabel: row.rsvp_label || "",
      bringNote: row.bring_note || "",
      focusTitle: row.focus_title || "",
      focusBody: row.focus_body || "",
      focusItems: row.focus_items
        ? String(row.focus_items)
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
      focusLink: row.focus_link || "",
    },
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
    bringNote: row.bring_note || "",
    // NULL/absent capacity means "no limit" — keep the frontend check simple.
    capacity: row.capacity == null ? null : Number(row.capacity),
    // Present whenever the query joins event_signups (all /api/events reads do).
    signupCount: row.signup_count == null ? 0 : Number(row.signup_count),
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

/** Expects: comments.* as-is (parent_id/pinned come from migration 007). */
export function rowToComment(row) {
  return {
    id: row.comment_id,
    targetType: row.target_type,
    targetId: row.target_id,
    userId: row.user_id,
    userName: row.user_name_snapshot,
    text: row.comment_text,
    parentId: row.parent_id || null,
    pinned: Boolean(row.pinned),
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
