// src/utils/dashboardStorage.js
// Announcements only, now stored in MySQL via the Express API.

import { apiFetch } from "./api";

export async function getAnnouncements(clubId) {
  const params = new URLSearchParams({ clubId });
  const { announcements } = await apiFetch(`/announcements?${params}`, { auth: false });
  return announcements;
}

/**
 * Trims whitespace and refuses to save an empty announcement.
 * Returns the saved announcement, or null if the text was empty/whitespace.
 */
export async function saveAnnouncement({ clubId, text }) {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;

  const { announcement } = await apiFetch("/announcements", {
    method: "POST",
    body: { clubId, text: trimmed },
  });
  return announcement;
}
