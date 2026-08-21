// Simulates a login system with no backend and no passwords — "logging
// in" just means selecting an account from a static list (mockUsers),
// or one created at runtime via signup().
// Shared contract: 00-shared-contracts.md — don't rename exports,
// Navbar/Login/CommentSection/Dashboard all import these directly.

import { users as seedUsers } from "../data/mockUsers";

const CURRENT_USER_KEY = "campushub_current_user";
const CUSTOM_USERS_KEY = "campushub_custom_users";

function readCustomUsers() {
  try {
    const raw = localStorage.getItem(CUSTOM_USERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCustomUsers(list) {
  localStorage.setItem(CUSTOM_USERS_KEY, JSON.stringify(list));
}

/** Static seed accounts + anyone who has signed up at runtime, combined. */
export function getAllUsers() {
  return [...seedUsers, ...readCustomUsers()];
}

/** Log in as a given user id (no password — just stores the id). */
export function login(userId) {
  localStorage.setItem(CURRENT_USER_KEY, userId);
}

/** Log out the current user. */
export function logout() {
  localStorage.removeItem(CURRENT_USER_KEY);
}

/**
 * Return the full logged-in user object, or null if nobody is logged
 * in or the stored id doesn't match anyone (handled gracefully).
 */
export function getCurrentUser() {
  try {
    const id = localStorage.getItem(CURRENT_USER_KEY);
    if (!id) return null;
    return getAllUsers().find((u) => u.id === id) || null;
  } catch {
    return null;
  }
}

/**
 * Create a new member account and persist it alongside the seed users.
 * Does NOT log the new user in — callers decide whether to follow up
 * with login(newUser.id).
 * Returns the new user object, or null if name/email are missing or
 * the email is already taken (case-insensitive) by an existing account.
 * @param {{ name: string, email: string }} fields
 */
export function signup({ name, email }) {
  const trimmedName = (name || "").trim();
  const trimmedEmail = (email || "").trim();
  if (!trimmedName || !trimmedEmail) return null;

  const emailTaken = getAllUsers().some(
    (u) => u.email.toLowerCase() === trimmedEmail.toLowerCase()
  );
  if (emailTaken) return null;

  const newUser = {
    id: `user-${Date.now()}`,
    name: trimmedName,
    email: trimmedEmail,
    role: "member",
    adminForClubs: [],
  };

  const customUsers = readCustomUsers();
  customUsers.push(newUser);
  writeCustomUsers(customUsers);

  return newUser;
}

/**
 * Whether a given user is allowed to manage a given club's dashboard.
 * - tier1: can manage any club.
 * - tier2: can manage only clubs listed in their adminForClubs.
 * - member or missing user: never.
 */
export function canManageClub(user, clubId) {
  if (!user) return false;
  if (user.role === "tier1") return true;
  if (user.role === "tier2") return user.adminForClubs.includes(clubId);
  return false;
}
