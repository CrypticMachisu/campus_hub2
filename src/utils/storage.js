// Wraps localStorage for managing event sign-ups.
// Shared contract: 00-shared-contracts.md §4 — don't rename exports,

//
// v2: sign-ups are keyed to a logged-in account's userId instead of a
// free-typed name/email. Name/email are snapshotted at signup time so
// historical signups still display correctly even if account data
// changes later.
//
// v3: looks users up via authStore.getAllUsers() instead of importing
// the static mockUsers list directly — accounts created at runtime via
// the sign-up form only exist in authStore's custom-users storage, so
// importing mockUsers here would silently fail to find them and
// saveSignup() would return null for every brand-new member.

import { getAllUsers } from "./authStore";

const SIGNUPS_KEY = "campushub_signups";

function readSignups() {
  try {
    const raw = localStorage.getItem(SIGNUPS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSignups(signups) {
  localStorage.setItem(SIGNUPS_KEY, JSON.stringify(signups));
}

/**
 * Save a new signup for a logged-in user. Looks the user up across
 * both seed and runtime-created accounts, snapshots their name/email
 * onto the signup, generates id + createdAt, persists it, and returns
 * the full saved object.
 * Returns null (does not throw) if userId doesn't match a real user.
 * If the user is already signed up for this event, returns the
 * existing signup instead of creating a duplicate (peer review:
 * "Preventing Duplicate Signups").
 * @param {{ eventId: string, userId: string }} signup
 */
export function saveSignup({ eventId, userId }) {
  const user = getAllUsers().find((u) => u.id === userId);
  if (!user) return null;

  const signups = readSignups();

  const existing = signups.find((s) => s.eventId === eventId && s.userId === userId);
  if (existing) return existing;

  const newSignup = {
    id: `signup-${Date.now()}`,
    eventId,
    userId,
    name: user.name,
    email: user.email,
    createdAt: new Date().toISOString(),
  };
  signups.push(newSignup);
  writeSignups(signups);
  return newSignup;
}

/**
 * Removes signups whose event no longer exists (e.g. a custom event
 * that got deleted from the Dashboard). Peer review: "Orphaned
 * Signups." Pass the current full event list; returns the pruned
 * signups array and persists the result.
 * @param {Array<{id: string}>} allEvents
 */
export function pruneOrphanedSignups(allEvents) {
  const validEventIds = new Set(allEvents.map((e) => e.id));
  const remaining = readSignups().filter((s) => validEventIds.has(s.eventId));
  writeSignups(remaining);
  return remaining;
}

/** Return signups belonging to a single user. */
export function getSignups(userId) {
  return readSignups().filter((s) => s.userId === userId);
}

/** Return signups for a single event, across all users (admin dashboard). */
export function getSignupsByEvent(eventId) {
  return readSignups().filter((s) => s.eventId === eventId);
}

/** Whether a specific user is already signed up for a specific event. */
export function isSignedUp(eventId, userId) {
  return readSignups().some((s) => s.eventId === eventId && s.userId === userId);
}

/** Delete a signup by its id, persisting the result. */
export function deleteSignup(signupId) {
  const remaining = readSignups().filter((s) => s.id !== signupId);
  writeSignups(remaining);
  return remaining;
}
