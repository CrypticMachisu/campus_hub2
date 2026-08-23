import { Router } from "express";
import { pool } from "../db.js";
import { rowToComment } from "../rowMappers.js";
import { requireAuth } from "../middleware/auth.js";

export const commentsRouter = Router();

/** GET /api/comments?targetType=event|club&targetId=... */
commentsRouter.get("/", async (req, res) => {
  const { targetType, targetId } = req.query;
  if (!targetType || !targetId) {
    return res.status(400).json({ error: "targetType and targetId are required." });
  }

  const [rows] = await pool.query(
    `SELECT * FROM comments WHERE target_type = :targetType AND target_id = :targetId
     ORDER BY created_at ASC`,
    { targetType, targetId }
  );
  res.json({ comments: rows.map(rowToComment) });
});

/**
 * POST /api/comments — post a comment as the logged-in user.
 * target_id is intentionally not FK-enforced in your schema (it's
 * polymorphic — event or club), so this validates it against whichever
 * table targetType points at before inserting.
 */
commentsRouter.post("/", requireAuth, async (req, res) => {
  const { targetType, targetId, text } = req.body;
  const trimmed = (text || "").trim();

  if (!["event", "club"].includes(targetType) || !targetId) {
    return res.status(400).json({ error: "Valid targetType and targetId are required." });
  }
  if (!trimmed) return res.status(400).json({ error: "Comment text can't be empty." });

  const table = targetType === "event" ? "events" : "clubs";
  const idColumn = targetType === "event" ? "event_id" : "club_id";
  const [targetRows] = await pool.query(
    `SELECT 1 FROM ${table} WHERE ${idColumn} = :targetId`,
    { targetId }
  );
  if (!targetRows[0]) {
    return res.status(404).json({ error: `No ${targetType} with that id.` });
  }

  const id = `comment-${Date.now()}`;
  await pool.query(
    `INSERT INTO comments (comment_id, target_type, target_id, user_id, user_name_snapshot, comment_text)
     VALUES (:id, :targetType, :targetId, :userId, :userName, :text)`,
    { id, targetType, targetId, userId: req.user.id, userName: req.user.name, text: trimmed }
  );

  const [rows] = await pool.query("SELECT * FROM comments WHERE comment_id = :id", { id });
  res.status(201).json({ comment: rowToComment(rows[0]) });
});
