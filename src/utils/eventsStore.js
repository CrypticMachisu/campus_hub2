import { apiFetch } from "./api";

/** All events — seed events and custom events from the backend. */
export async function getAllEvents() {
  const { events } = await apiFetch("/events", { auth: false });
  return events;
}

/**
 * Convert dashboard date and time fields into the
 * startTime format expected by the backend.
 */
export async function saveCustomEvent(event) {
  const { id, date, time, ...fields } = event;

  const payload = {
    ...fields,
    startTime: `${date}T${time}:00+03:00`,
  };

  const { event: saved } = id
    ? await apiFetch(`/events/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: payload,
      })
    : await apiFetch("/events", {
        method: "POST",
        body: payload,
      });

  return saved;
}

/** Delete a custom event by its ID. */
export async function deleteCustomEvent(eventId) {
  await apiFetch(`/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
  });
}