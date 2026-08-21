// Wraps localStorage for comments that can attach to either an event
// or a club. Shared contract: 00-shared-contracts.md — don't rename
// exports, CommentSection.jsx imports these directly.

const COMMENTS_KEY = "campushub_comments";

function readComments() {
  try {
    const raw = localStorage.getItem(COMMENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeComments(comments) {
  localStorage.setItem(COMMENTS_KEY, JSON.stringify(comments));
}

/**
 * Return comments for a single target (an event or a club), oldest
 * first by createdAt.
 * @param {"event"|"club"} targetType
 * @param {string} targetId
 */
export function getComments(targetType, targetId) {
  return readComments()
    .filter((c) => c.targetType === targetType && c.targetId === targetId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

/**
 * Save a new comment. Generates id + createdAt, persists it, and
 * returns the full saved object.
 * @param {{ targetType: "event"|"club", targetId: string, userId: string, userName: string, text: string }} comment
 */
export function saveComment({ targetType, targetId, userId, userName, text }) {
  const comments = readComments();
  const newComment = {
    id: `comment-${Date.now()}`,
    targetType,
    targetId,
    userId,
    userName,
    text,
    createdAt: new Date().toISOString(),
  };
  comments.push(newComment);
  writeComments(comments);
  return newComment;
}
