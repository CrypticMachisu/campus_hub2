// Event sign-ups, now stored in MySQL via the Express API.
// Shared contract: don't rename exports.
//
// v4: moved off localStorage. Note pruneOrphanedSignups() is gone —
// signups.event_id has ON DELETE CASCADE in the schema, so deleting a
// custom event now deletes its signups automatically. There's no more
// "orphaned signup" state to clean up client-side.

import { apiFetch } from "./api";

/**
 * Save a new signup for the logged-in user (userId comes from the auth
 * token server-side; kept in the signature for backward compatibility
 * with old call sites). Idempotent — signing up twice returns the
 * existing signup instead of creating a duplicate.
 * @param {{ eventId: string }} signup
 */
export async function saveSignup({ eventId }) {
  const { signup } = await apiFetch("/signups", { method: "POST", body: { eventId } });
  return signup;
}

/** Return signups belonging to the logged-in user. */
export async function getSignups() {
  const { signups } = await apiFetch("/signups/mine");
  return signups;
}

/** Return signups for a single event, across all users (admin dashboard only). */
export async function getSignupsByEvent(eventId) {
  const { signups } = await apiFetch(`/signups/event/${eventId}`);
  return signups;
}

/** Whether the logged-in user is already signed up for a specific event. */
export async function isSignedUp(eventId) {
  const mine = await getSignups();
  return mine.some((s) => s.eventId === eventId);
}

/** Delete a signup by its id (must belong to the logged-in user). */
export async function deleteSignup(signupId) {
  await apiFetch(`/signups/${signupId}`, { method: "DELETE" });
}
