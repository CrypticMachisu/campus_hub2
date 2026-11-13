import { apiFetch } from "./api";

/**
 * v2 replaced the separate `date` / `time` strings with one ISO `startTime`
 * ("2026-11-13T06:30:00+03:00"). The UI renders wall-clock date and time, so
 * the conversion happens once, here, at the data boundary.
 *
 * The string is sliced rather than passed through Date: the stored clock is
 * already East Africa Time wall-clock, and converting it to the browser's
 * zone would move the event to another day for anyone outside EAT — the bug
 * v2 exists to fix.
 */
export function toUiEvent(event) {
  if (!event || !event.startTime) return event;
  const { startTime, ...rest } = event;
  const [date, clock = "00:00"] = startTime.split("T");
  return { ...rest, date, time: clock.slice(0, 5) };
}

/** All events — seed events and custom events from the backend. */
export async function getAllEvents() {
  const { events } = await apiFetch("/events", { auth: false });
  return events.map(toUiEvent);
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

  return toUiEvent(saved);
}

/** Delete a custom event by its ID. */
export async function deleteCustomEvent(eventId) {
  await apiFetch(`/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
  });
}
