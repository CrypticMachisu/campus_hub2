// Membership API calls. Separate from clubsStore (which owns club listing)
// because joining/leaving changes the *user*, not the club.
//
// Every call returns the refreshed user from the server so the caller can
// push it into AuthContext and the member workspace appears/disappears
// without a reload.

import { apiFetch } from "./api";

/** Join a club as the logged-in user. Returns the updated user. */
export async function joinClub(clubId) {
  const { user } = await apiFetch(`/clubs/${clubId}/members`, { method: "POST" });
  return user;
}

/** Leave a club. Returns the updated user. */
export async function leaveClub(clubId) {
  const { user } = await apiFetch(`/clubs/${clubId}/members/me`, { method: "DELETE" });
  return user;
}

/** Roster for a club the user belongs to (or admins). */
export async function getClubMembers(clubId) {
  const { members } = await apiFetch(`/clubs/${clubId}/members`);
  return members;
}
