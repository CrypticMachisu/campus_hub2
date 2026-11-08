import { pool } from "../db.js";
import { rowToComment } from "../rowMappers.js";
import { requireAuth, optionalAuth, canManageClub } from "../middleware/auth.js";
import { recordAudit } from "../audit.js";
import { createApiRouter } from "../middleware/apiGuards.js";

export const commentsRouter = createApiRouter();

/** The reactions we support. Kept small on purpose — a wall of emoji is noise. */
const REACTIONS = ["👍", "❤️", "🎉", "😂"];

/** Text cap, so one comment can't become a chapter. */
const MAX_TEXT = 1000;

/** Which club does this comment target belong to? null when it can't be resolved. */
async function clubForTarget(targetType, targetId) {
  if (targetType === "club") return targetId;
  if (targetType !== "event") return null;
  const [rows] = await pool.query("SELECT club_id FROM events WHERE event_id = :targetId", {
    targetId,
  });
  return rows[0]?.club_id ?? null;
}

/**
 * Reactions grouped per comment for one target: [{ emoji, count, mine }].
 * `mine` is false for anonymous readers, which is why GET stays optional-auth.
 */
async function reactionsForTarget(targetType, targetId, userId) {
  const [rows] = await pool.query(
    `SELECT r.comment_id, r.emoji,
       COUNT(*) AS reaction_count,
       MAX(CASE WHEN r.user_id = :userId THEN 1 ELSE 0 END) AS mine
     FROM comment_reactions r
     JOIN comments c ON c.comment_id = r.comment_id
     WHERE c.target_type = :targetType AND c.target_id = :targetId
     GROUP BY r.comment_id, r.emoji`,
    { targetType, targetId, userId: userId || "" }
  );

  const byComment = new Map();
  for (const row of rows) {
    if (!byComment.has(row.comment_id)) byComment.set(row.comment_id, []);
    byComment.get(row.comment_id).push({
      emoji: row.emoji,
      count: Number(row.reaction_count),
      mine: Boolean(row.mine),
    });
  }
  return byComment;
}

/**
 * GET /api/comments?targetType=event|club&targetId=...
 * Public. Pinned comments first, then oldest-first; `canModerate` and each
 * reaction's `mine` need the caller's token, so the route reads it optionally
 * rather than requiring login to read a discussion.
 */
commentsRouter.get("/", optionalAuth, async (req, res) => {
  const { targetType, targetId } = req.query;
  if (!targetType || !targetId) {
    return res.status(400).json({ error: "targetType and targetId are required." });
  }

  const [rows] = await pool.query(
    `SELECT * FROM comments WHERE target_type = :targetType AND target_id = :targetId
     ORDER BY pinned DESC, created_at ASC`,
    { targetType, targetId }
  );

  const reactions = await reactionsForTarget(targetType, targetId, req.user?.id);
  const clubId = await clubForTarget(targetType, targetId);
  const canModerate = canManageClub(req.user, clubId);

  res.json({
    comments: rows.map((row) => ({
      ...rowToComment(row),
      reactions: reactions.get(row.comment_id) || [],
      canModerate,
    })),
  });
});

/**
 * POST /api/comments — post a comment or a reply (one level deep).
 * target_id is polymorphic (event or club), so it's validated against whichever
 * table targetType points at before inserting.
 */
commentsRouter.post("/", requireAuth, async (req, res) => {
  const { targetType, targetId, parentId } = req.body;
  const trimmed = (req.body.text || "").trim();

  if (!["event", "club"].includes(targetType) || !targetId) {
    return res.status(400).json({ error: "Valid targetType and targetId are required." });
  }
  if (!trimmed) return res.status(400).json({ error: "Comment text can't be empty." });
  if (trimmed.length > MAX_TEXT) {
    return res.status(400).json({ error: `Comments are capped at ${MAX_TEXT} characters.` });
  }

  const table = targetType === "event" ? "events" : "clubs";
  const idColumn = targetType === "event" ? "event_id" : "club_id";
  const [targetRows] = await pool.query(`SELECT 1 FROM ${table} WHERE ${idColumn} = :targetId`, {
    targetId,
  });
  if (!targetRows[0]) {
    return res.status(404).json({ error: `No ${targetType} with that id.` });
  }

  let parent = null;
  if (parentId) {
    const [parentRows] = await pool.query("SELECT * FROM comments WHERE comment_id = :parentId", {
      parentId,
    });
    parent = parentRows[0];
    if (!parent) return res.status(404).json({ error: "The comment you're replying to is gone." });
    if (parent.target_type !== targetType || parent.target_id !== targetId) {
      return res.status(400).json({ error: "A reply has to stay in the same thread." });
    }
    if (parent.parent_id) {
      return res.status(400).json({ error: "Replies can only go one level deep." });
    }
  }

  const id = `comment-${Date.now()}`;
  await pool.query(
    `INSERT INTO comments
       (comment_id, target_type, target_id, user_id, user_name_snapshot, comment_text, parent_id)
     VALUES (:id, :targetType, :targetId, :userId, :userName, :text, :parentId)`,
    {
      id,
      targetType,
      targetId,
      userId: req.user.id,
      userName: req.user.name,
      text: trimmed,
      parentId: parent ? parent.comment_id : null,
    }
  );

  const [rows] = await pool.query("SELECT * FROM comments WHERE comment_id = :id", { id });
  res.status(201).json({
    comment: {
      ...rowToComment(rows[0]),
      reactions: [],
      canModerate: canManageClub(req.user, await clubForTarget(targetType, targetId)),
    },
  });
});

/**
 * POST /api/comments/:id/reactions — toggle one emoji for the current user.
 * Returns that comment's full reaction list so the UI never has to guess.
 */
commentsRouter.post("/:id/reactions", requireAuth, async (req, res) => {
  const { id } = req.params;
  const emoji = String(req.body.emoji || "");

  if (!REACTIONS.includes(emoji)) {
    return res.status(400).json({ error: "That reaction isn't supported." });
  }

  const [commentRows] = await pool.query("SELECT comment_id FROM comments WHERE comment_id = :id", {
    id,
  });
  if (!commentRows[0]) return res.status(404).json({ error: "Comment not found." });

  const [existing] = await pool.query(
    `SELECT 1 FROM comment_reactions
     WHERE comment_id = :id AND user_id = :userId AND emoji = :emoji`,
    { id, userId: req.user.id, emoji }
  );

  if (existing[0]) {
    await pool.query(
      `DELETE FROM comment_reactions
       WHERE comment_id = :id AND user_id = :userId AND emoji = :emoji`,
      { id, userId: req.user.id, emoji }
    );
  } else {
    await pool.query(
      `INSERT INTO comment_reactions (comment_id, user_id, emoji)
       VALUES (:id, :userId, :emoji)`,
      { id, userId: req.user.id, emoji }
    );
  }

  const [rows] = await pool.query(
    `SELECT emoji, COUNT(*) AS reaction_count,
       MAX(CASE WHEN user_id = :userId THEN 1 ELSE 0 END) AS mine
     FROM comment_reactions WHERE comment_id = :id
     GROUP BY emoji`,
    { id, userId: req.user.id }
  );

  res.json({
    reactions: rows.map((row) => ({
      emoji: row.emoji,
      count: Number(row.reaction_count),
      mine: Boolean(row.mine),
    })),
  });
});

/**
 * PATCH /api/comments/:id/pin — club admins (or tier1) pin/unpin a top-level
 * comment. Pinned comments lead the thread.
 */
commentsRouter.patch("/:id/pin", requireAuth, async (req, res) => {
  const { id } = req.params;

  const [rows] = await pool.query("SELECT * FROM comments WHERE comment_id = :id", { id });
  const comment = rows[0];
  if (!comment) return res.status(404).json({ error: "Comment not found." });
  if (comment.parent_id) {
    return res.status(400).json({ error: "Only top-level comments can be pinned." });
  }

  const clubId = await clubForTarget(comment.target_type, comment.target_id);
  if (!canManageClub(req.user, clubId)) {
    return res.status(403).json({ error: "Only club admins can pin comments." });
  }

  const pinned = req.body.pinned === false ? 0 : 1;
  await pool.query("UPDATE comments SET pinned = :pinned WHERE comment_id = :id", { pinned, id });
  await recordAudit(req, {
    action: pinned ? "comment.pin" : "comment.unpin",
    targetType: comment.target_type,
    targetId: comment.target_id,
    detail: { commentId: id, authorId: comment.user_id, pinned: Boolean(pinned) },
  });

  res.json({ comment: { ...rowToComment({ ...comment, pinned }) } });
});

/**
 * DELETE /api/comments/:id — the author can remove their own comment; club
 * admins can remove any in their club's threads. Replies and reactions cascade.
 */
commentsRouter.delete("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  const [rows] = await pool.query("SELECT * FROM comments WHERE comment_id = :id", { id });
  const comment = rows[0];
  if (!comment) return res.status(404).json({ error: "Comment not found." });

  const isAuthor = comment.user_id === req.user.id;
  if (!isAuthor) {
    const clubId = await clubForTarget(comment.target_type, comment.target_id);
    if (!canManageClub(req.user, clubId)) {
      return res.status(403).json({ error: "You can only delete your own comments." });
    }
  }

  await pool.query("DELETE FROM comments WHERE comment_id = :id", { id });
  await recordAudit(req, {
    action: "comment.delete",
    targetType: comment.target_type,
    targetId: comment.target_id,
    detail: { commentId: id, authorId: comment.user_id, parentId: comment.parent_id || null },
  });
  res.status(204).end();
});
