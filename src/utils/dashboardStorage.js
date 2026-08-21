

// src/utils/dashboardStorage.js
// announcements only, per 00-shared-contracts.md §2.

const ANNOUNCEMENTS_KEY = "campushub_announcements";

function readAnnouncements() {
  try {
    const raw = JSON.parse(localStorage.getItem(ANNOUNCEMENTS_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function getAnnouncements(clubId) {
  return readAnnouncements().filter((a) => a.clubId === clubId);
}

/**
 * Trims whitespace and refuses to save an empty announcement
 * (peer review: form validation standard).
 * Returns the saved announcement, or null if the text was empty/whitespace.
 */
export function saveAnnouncement({ clubId, text }) {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;

  const all = readAnnouncements();
  const announcement = {
    id: `announcement-${Date.now()}`,
    clubId,
    text: trimmed,
    createdAt: new Date().toISOString(),
  };
  all.push(announcement);
  localStorage.setItem(ANNOUNCEMENTS_KEY, JSON.stringify(all));
  return announcement;
}