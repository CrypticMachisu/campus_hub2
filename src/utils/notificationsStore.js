import { apiFetch } from "./api";

/** The signed-in member's latest notices and unread count. */
export async function getNotifications() {
  return apiFetch("/notifications");
}

/** Mark one notice read; resolves with the fresh unread count. */
export async function markNotificationRead(notificationId) {
  return apiFetch(`/notifications/${encodeURIComponent(notificationId)}/read`, { method: "PATCH" });
}

/** Clear every unread notice in one action. */
export async function markAllNotificationsRead() {
  return apiFetch("/notifications/read-all", { method: "POST" });
}
