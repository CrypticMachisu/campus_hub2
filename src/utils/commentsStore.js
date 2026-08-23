// Comments that can attach to either an event or a club, now stored in
// MySQL via the Express API. Shared contract: don't rename exports,
// CommentSection.jsx imports these directly.

import { apiFetch } from "./api";

/**
 * Return comments for a single target (an event or a club), oldest
 * first by createdAt.
 * @param {"event"|"club"} targetType
 * @param {string} targetId
 */
export async function getComments(targetType, targetId) {
  const params = new URLSearchParams({ targetType, targetId });
  const { comments } = await apiFetch(`/comments?${params}`, { auth: false });
  return comments;
}

/**
 * Save a new comment as the logged-in user (userId/userName come from
 * the auth token server-side, not from the arguments, so they can't be
 * spoofed — kept in the signature for backward compatibility with the
 * old localStorage version's call sites).
 * @param {{ targetType: "event"|"club", targetId: string, text: string }} comment
 */
export async function saveComment({ targetType, targetId, text }) {
  const { comment } = await apiFetch("/comments", {
    method: "POST",
    body: { targetType, targetId, text },
  });
  return comment;
}
