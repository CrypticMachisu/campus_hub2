// Combines the static seed events with "custom" events a club admin creates
// at runtime on the Dashboard, so they show up everywhere else too.
// Everyone should read events through this file — never import the raw
// `events` array from mockData.js directly.

import { events as mockEvents } from "../data/mockData";

const CUSTOM_EVENTS_KEY = "campushub_custom_events";

function readCustomEvents() {
  try {
    const raw = localStorage.getItem(CUSTOM_EVENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCustomEvents(list) {
  localStorage.setItem(CUSTOM_EVENTS_KEY, JSON.stringify(list));
  // The native "storage" event only fires in *other* tabs, not the one
  // that made the change, so we also dispatch a same-tab custom event.
  // Components that want to stay in sync with edits/deletes made
  // elsewhere (e.g. the Dashboard) can do:
  //   useEffect(() => {
  //     const onUpdate = () => setEvents(getAllEvents());
  //     window.addEventListener("campushub:events-updated", onUpdate);
  //     return () => window.removeEventListener("campushub:events-updated", onUpdate);
  //   }, []);
  window.dispatchEvent(new CustomEvent("campushub:events-updated"));
}

/** Just the admin-created events. */
export function getCustomEvents() {
  return readCustomEvents();
}

/** Static seed events + custom events, combined. */
export function getAllEvents() {
  return [...mockEvents, ...readCustomEvents()];
}

/**
 * Create or update a custom event and persist it.
 * If `event.id` matches an existing custom event, it's updated in place;
 * otherwise a new one is created with id `custom-${Date.now()}`.
 */
export function saveCustomEvent(event) {
  const all = readCustomEvents();
  const existingIndex = all.findIndex((e) => e.id === event.id);
  const eventToSave = { ...event, id: event.id || `custom-${Date.now()}` };

  if (existingIndex >= 0) {
    all[existingIndex] = eventToSave;
  } else {
    all.push(eventToSave);
  }

  writeCustomEvents(all);
  return eventToSave;
}

/** Delete a custom event by id (does nothing to seed events). */
export function deleteCustomEvent(eventId) {
  const remaining = readCustomEvents().filter((e) => e.id !== eventId);
  writeCustomEvents(remaining);
  return remaining;
}
