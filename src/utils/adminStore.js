// Talks to the admin-management endpoints: tier1 promoting users to
// tier2 club admins, and members requesting admin access to a club.
// Mirrors the apiFetch pattern used by authStore.js / eventsStore.js.

import { apiFetch } from "./api";

/** All non-tier1 users (members + tier2 admins) — tier1 only. */
export function getAllUsers() {
  return apiFetch("/users").then((data) => data.users);
}

/** Promotes a user to tier2 admin for the given club — tier1 only. */
export function promoteToClubAdmin(userId, clubId) {
  return apiFetch(`/users/${userId}/promote`, { method: "POST", body: { clubId } }).then(
    (data) => data.user
  );
}

/** Pending admin requests — tier1 only. */
export function getPendingAdminRequests() {
  return apiFetch("/admin-requests").then((data) => data.requests);
}

/** Requests admin access to a club, as the current logged-in user. */
export function requestClubAdmin(clubId) {
  return apiFetch("/admin-requests", { method: "POST", body: { clubId } });
}

export function approveAdminRequest(requestId) {
  return apiFetch(`/admin-requests/${requestId}/approve`, { method: "POST" });
}

export function denyAdminRequest(requestId) {
  return apiFetch(`/admin-requests/${requestId}/deny`, { method: "POST" });
}

export function demoteFromClubAdmin(userId, clubId) {
  return apiFetch(`/users/${userId}/demote`, { method: "POST", body: { clubId } }).then(
    (data) => data.user
  );
}