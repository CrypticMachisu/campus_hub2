// Talks to the Express/MySQL API for real accounts + password auth.
// Shared contract: don't rename exports — Navbar/Login/CommentSection/
// Dashboard/AuthContext all import these directly.
//
// v4: moved off the no-password "pick an account" simulation and off
// localStorage entirely. These are now all async (they make network
// calls), whereas the old versions were synchronous localStorage reads.
// Every caller needs to `await` them now.

import { apiFetch, setToken, clearToken, getToken } from "./api";

/** Log in with email + password. Returns the user, or null on bad credentials. */
export async function login({ email, password }) {
  try {
    const { token, user } = await apiFetch("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    setToken(token);
    return user;
  } catch {
    return null;
  }
}

/** Clears the stored session. (No server-side session to invalidate — JWTs just expire.) */
export function logout() {
  clearToken();
}

/**
 * Create a new member account and log them in immediately.
 * Returns { user, error }: user is null and error is a readable message
 * if signup failed (duplicate email, missing fields, password under 8
 * characters).
 */
export async function signup({ name, email, password }) {
  try {
    const { token, user } = await apiFetch("/auth/register", {
      method: "POST",
      body: { name, email, password },
      auth: false,
    });
    setToken(token);
    return { user, error: null };
  } catch (err) {
    return { user: null, error: err.message };
  }
}

/**
 * Return the full logged-in user object, or null if nobody is logged
 * in or the stored token is no longer valid (handled gracefully).
 */
export async function getCurrentUser() {
  if (!getToken()) return null;
  try {
    const { user } = await apiFetch("/auth/me");
    return user;
  } catch {
    clearToken();
    return null;
  }
}

/**
 * Whether a given user is allowed to manage a given club's dashboard.
 * Pure client-side logic — kept for instant UI decisions (e.g. which nav
 * links to show); the server independently re-checks this on every
 * mutating request, so this is a convenience, not a security boundary.
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

/** Requests a password reset email/link for the given address. */
export async function requestPasswordReset(email) {
  await apiFetch("/auth/forgot-password", { method: "POST", body: { email }, auth: false });
}

/** Sets a new password using a reset token from the forgot-password flow. */
export async function resetPassword({ token, password }) {
  await apiFetch("/auth/reset-password", { method: "POST", body: { token, password }, auth: false });
}
