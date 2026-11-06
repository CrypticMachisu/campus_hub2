// Comments that can attach to either an event or a club, now stored in
// MySQL via the Express API. Shared contract: don't rename exports,
// CommentSection.jsx imports these directly.
//
// v5: threads + reactions + moderation. Comment reads are authenticated when a
// token exists so the API can tell us `canModerate` and which reactions are
// ours; anonymous readers still get the thread, just without those flags.

import { apiFetch } from "./api";

/**
 * Return comments for a single target (an event or a club), pinned first then
 * oldest first. Each comment carries `parentId`, `pinned`, `reactions[]` and
 * `canModerate`.
 */
export async function getComments(targetType, targetId) {
  const params = new URLSearchParams({ targetType, targetId });
  const { comments } = await apiFetch(`/comments?${params}`);
  return comments;
}

/**
 * Save a new comment, or a reply when `parentId` is given (one level deep).
 * userId/userName come from the auth token server-side.
 */
export async function saveComment({ targetType, targetId, text, parentId = null }) {
  const { comment } = await apiFetch("/comments", {
    method: "POST",
    body: { targetType, targetId, text, parentId },
  });
  return comment;
}

/** Toggle one emoji on a comment. Returns that comment's full reaction list. */
export async function toggleReaction(commentId, emoji) {
  const { reactions } = await apiFetch(`/comments/${encodeURIComponent(commentId)}/reactions`, {
    method: "POST",
    body: { emoji },
  });
  return reactions;
}

/** Pin/unpin a top-level comment (club admins and tier1 only). */
export async function setCommentPinned(commentId, pinned) {
  const { comment } = await apiFetch(`/comments/${encodeURIComponent(commentId)}/pin`, {
    method: "PATCH",
    body: { pinned },
  });
  return comment;
}

/** Delete a comment (author, or a club admin moderating their club's threads). */
export async function deleteComment(commentId) {
  await apiFetch(`/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" });
}
