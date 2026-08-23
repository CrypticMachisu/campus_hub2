// Shared date/time helpers.
// Added per 00-shared-contracts.md peer review: "Split Date and Time
// Sorting" — combine date (YYYY-MM-DD) + time (HH:MM) into one
// timestamp before comparing, instead of comparing date strings alone
// (which silently ignores time-of-day and can misorder same-day events).

/**
 * Combines an event's date and time fields into a single comparable
 * timestamp (ms since epoch). Returns 0 (oldest possible) if the event
 * has a malformed date/time rather than throwing, so a bad record can't
 * crash a sort.
 * @param {{ date: string, time: string }} event
 * @returns {number}
 */
export function getEventTimestamp(event) {
  const ts = new Date(`${event.date}T${event.time}`).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

/** Whether an event's date+time is already in the past. */
export function isPastEvent(event) {
  return getEventTimestamp(event) < Date.now();
}

/** Sorts a list of events chronologically (soonest first), immutably. */
export function sortByTimestamp(events) {
  return [...events].sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b));
}

/**
 * Explicit Intl.DateTimeFormat formatting for a date-only string, used
 * anywhere we display an event's date (cards, detail pages).
 * @param {string} isoDate
 */
export function formatEventDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
}

/** Returns today's date as YYYY-MM-DD, for date-input defaults/min. */
export function todayIso() {
  return new Date().toISOString().split("T")[0];
}
