// Clubs moved from the static src/data/mockData.js into MySQL along with
// everything else. CATEGORIES stays a plain frontend constant — it's a
// fixed enum used for filter buttons/selects, not really "data".

import { apiFetch } from "./api";

export const CATEGORIES = [
  "Academic",
  "Arts & Culture",
  "Sports & Fitness",
  "Technology",
  "Community Service",
  "Social",
];

/** All clubs. */
export async function getAllClubs() {
  const { clubs } = await apiFetch("/clubs", { auth: false });
  return clubs;
}

/**
 * Creates a new club — tier1 only. tags can be an array or a
 * comma-separated string; the server normalizes either way.
 */
export async function createClub(fields) {
  const { club } = await apiFetch("/clubs", { method: "POST", body: fields });
  return club;
}