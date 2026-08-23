// Fetches events (seed + club-admin-created, already combined by the
// API) from MySQL via the Express backend. Everyone should read events
// through this file — same rule as before, just backed by a database
// instead of localStorage now.
//
// All exports are async now (network calls instead of sync localStorage
// reads). Components that used to call these synchronously need to
// fetch into state via useEffect instead — see Home/ClubProfile/
// Dashboard/EventDetail/MyEvents for the pattern.

import { apiFetch } from "./api";

/** All events — seed events (read-only) + custom events, combined. */
export async function getAllEvents() {
  const { events } = await apiFetch("/events", { auth: false });
  return events;
}

/**
 * Create or update a custom event and persist it to MySQL.
 * If `event.id` is set, updates that event (must be a non-seed event
 * the caller manages); otherwise creates a new one.
 */
export async function saveCustomEvent(event) {
  const { id, ...fields } = event;
  const { event: saved } = id
    ? await apiFetch(`/events/${id}`, { method: "PUT", body: fields })
    : await apiFetch("/events", { method: "POST", body: event });
  return saved;
}

/** Delete a custom event by id (does nothing to seed events — the API rejects it). */
export async function deleteCustomEvent(eventId) {
  await apiFetch(`/events/${eventId}`, { method: "DELETE" });
}
