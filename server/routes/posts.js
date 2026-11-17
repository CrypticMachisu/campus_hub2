// Posts — the club's dated noticeboard.
//
// Posts are written by people who manage the club, read publicly, and can be
// hidden or removed by a manager without deleting the row. Comments reuse the
// existing polymorphic thread (`target_type = 'post'`), so there is one
// discussion system, not a second one for this surface.
import { pool } from "../db.js";
import { requireAuth, optionalAuth, canManageClub } from "../middleware/auth.js";
import { createApiRouter } from "../middleware/apiGuards.js";
import { recordAudit } from "../audit.js";

export const postsRouter = createApiRouter();

const MAX_BODY = 2000;
const STATUSES = ["published", "hidden", "removed"];

const POST_QUERY = `
  SELECT p.*, cl.name AS club_name,
         (SELECT COUNT(*) FROM comments c
           WHERE c.target_type = 'post' AND c.target_id = p.post_id) AS comment_count
  FROM posts p
  JOIN clubs cl ON cl.club_id = p.club_id
`;

const MANAGE_QUERY = `
  SELECT p.*, cl.name AS club_name,
         (SELECT COUNT(*) FROM comments c
           WHERE c.target_type = 'post' AND c.target_id = p.post_id) AS comment_count,
         (SELECT COUNT(*) FROM reports r
           WHERE r.target_type = 'post' AND r.target_id = p.post_id
             AND r.status = 'open') AS open_reports
  FROM posts p
  JOIN clubs cl ON cl.club_id = p.club_id
`;

function rowToPost(row) {
  return {
    id: row.post_id,
    clubId: row.club_id,
    clubName: row.club_name,
    authorId: row.author_id,
    authorName: row.author_name_snapshot,
    body: row.body,
    status: row.status,
    commentCount: Number(row.comment_count || 0),
    openReportCount: Number(row.open_reports || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cleanBody(value) {
  const body = typeof value === "string" ? value.trim() : "";
  if (!body) return { error: "Post text can't be empty." };
  if (body.length > MAX_BODY) {
    return { error: `Posts are capped at ${MAX_BODY} characters.` };
  }
  return { body };
}

async function clubExists(clubId) {
  const [rows] = await pool.query("SELECT club_id FROM clubs WHERE club_id = :clubId", {
    clubId,
  });
  return Boolean(rows[0]);
}

/**
 * GET /posts?clubId=…&before=…&limit=10
 * Public, published posts only, newest first. `before` is the last post id the
 * reader already has; `nextCursor` is null when the page was short.
 */
postsRouter.get("/", async (req, res) => {
  const clubId = typeof req.query.clubId === "string" ? req.query.clubId.trim() : "";
  if (!clubId) return res.status(400).json({ error: "clubId is required." });
  if (!(await clubExists(clubId))) return res.status(404).json({ error: "Club not found." });

  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
  const before = typeof req.query.before === "string" ? req.query.before.trim() : "";
  const params = { clubId };
  let cursorClause = "";

  if (before) {
    const [cursorRows] = await pool.query(
      "SELECT created_at FROM posts WHERE post_id = :before AND club_id = :clubId",
      { before, clubId }
    );
    if (!cursorRows[0]) return res.status(400).json({ error: "Unknown page cursor." });
    params.beforeCreated = cursorRows[0].created_at;
    params.before = before;
    cursorClause = `AND (p.created_at < :beforeCreated
                        OR (p.created_at = :beforeCreated AND p.post_id < :before))`;
  }

  const [rows] = await pool.query(
    `${POST_QUERY}
     WHERE p.club_id = :clubId AND p.status = 'published' ${cursorClause}
     ORDER BY p.created_at DESC, p.post_id DESC
     LIMIT ${limit}`,
    params
  );

  res.json({
    posts: rows.map(rowToPost),
    nextCursor: rows.length === limit ? rows[rows.length - 1].post_id : null,
  });
});

/**
 * GET /posts/manage?clubId=… — every status, for the officer desk.
 * Managers only. Includes the number of open reports on each post.
 */
postsRouter.get("/manage", requireAuth, async (req, res) => {
  const clubId = typeof req.query.clubId === "string" ? req.query.clubId.trim() : "";
  if (!clubId) return res.status(400).json({ error: "clubId is required." });
  if (!(await clubExists(clubId))) return res.status(404).json({ error: "Club not found." });
  if (!canManageClub(req.user, clubId)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }

  const [rows] = await pool.query(
    `${MANAGE_QUERY}
     WHERE p.club_id = :clubId
     ORDER BY p.created_at DESC, p.post_id DESC
     LIMIT 100`,
    { clubId }
  );
  res.json({ posts: rows.map(rowToPost) });
});

/** GET /posts/:id — public while published; managers can read hidden rows. */
postsRouter.get("/:id", optionalAuth, async (req, res) => {
  const [rows] = await pool.query(`${POST_QUERY} WHERE p.post_id = :id`, { id: req.params.id });
  const row = rows[0];
  if (!row) return res.status(404).json({ error: "Post not found." });

  const canManage = canManageClub(req.user, row.club_id);
  if (row.status !== "published" && !canManage) {
    return res.status(404).json({ error: "Post not found." });
  }

  res.json({ post: { ...rowToPost(row), canManage } });
});

/** POST /posts — publish a text post. Club managers only. */
postsRouter.post("/", requireAuth, async (req, res) => {
  const body = req.body || {};
  const clubId = typeof body.clubId === "string" ? body.clubId.trim() : "";
  if (!clubId) return res.status(400).json({ error: "clubId is required." });
  if (!(await clubExists(clubId))) return res.status(404).json({ error: "Club not found." });
  if (!canManageClub(req.user, clubId)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }

  const cleaned = cleanBody(body.text);
  if (cleaned.error) return res.status(400).json({ error: cleaned.error });

  const id = `post-${Date.now()}`;
  await pool.query(
    `INSERT INTO posts
       (post_id, club_id, author_id, author_name_snapshot, body)
     VALUES (:id, :clubId, :authorId, :authorName, :body)`,
    { id, clubId, authorId: req.user.id, authorName: req.user.name, body: cleaned.body }
  );

  const [rows] = await pool.query(`${POST_QUERY} WHERE p.post_id = :id`, { id });
  await recordAudit(req, {
    action: "post.create",
    targetType: "post",
    targetId: id,
    detail: { clubId, length: cleaned.body.length },
  });
  res.status(201).json({ post: rowToPost(rows[0]) });
});

/** PATCH /posts/:id — edit the text. The author or a club manager. */
postsRouter.patch("/:id", requireAuth, async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM posts WHERE post_id = :id", {
    id: req.params.id,
  });
  const post = rows[0];
  if (!post) return res.status(404).json({ error: "Post not found." });

  const canManage = canManageClub(req.user, post.club_id);
  const isAuthor = post.author_id === req.user.id;
  if (!canManage && !isAuthor) {
    return res.status(403).json({ error: "You can only edit your own posts." });
  }
  if (post.status === "removed" && !canManage) {
    return res.status(403).json({ error: "This post has been removed." });
  }

  const cleaned = cleanBody(req.body?.text);
  if (cleaned.error) return res.status(400).json({ error: cleaned.error });

  await pool.query("UPDATE posts SET body = :body WHERE post_id = :id", {
    body: cleaned.body,
    id: req.params.id,
  });
  const [updated] = await pool.query(`${POST_QUERY} WHERE p.post_id = :id`, {
    id: req.params.id,
  });
  await recordAudit(req, {
    action: "post.update",
    targetType: "post",
    targetId: req.params.id,
    detail: { clubId: post.club_id, length: cleaned.body.length },
  });
  res.json({ post: rowToPost(updated[0]) });
});

/** PATCH /posts/:id/status — hide, restore or remove. Managers only. */
postsRouter.patch("/:id/status", requireAuth, async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM posts WHERE post_id = :id", {
    id: req.params.id,
  });
  const post = rows[0];
  if (!post) return res.status(404).json({ error: "Post not found." });
  if (!canManageClub(req.user, post.club_id)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }

  const status = typeof req.body?.status === "string" ? req.body.status : "";
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${STATUSES.join(", ")}.` });
  }

  await pool.query("UPDATE posts SET status = :status WHERE post_id = :id", {
    status,
    id: req.params.id,
  });

  // Hiding from the desk and hiding through the report queue must leave the
  // queue in the same state: no open reports on content that is no longer
  // public.
  if (status !== "published") {
    await pool.query(
      `UPDATE reports
       SET status = 'actioned', resolution = :resolution,
           resolved_at = NOW(), resolved_by = :userId
       WHERE target_type = 'post' AND target_id = :id AND status = 'open'`,
      {
        resolution: status === "removed" ? "removed" : "hidden",
        userId: req.user.id,
        id: req.params.id,
      }
    );
  }

  const [updated] = await pool.query(`${POST_QUERY} WHERE p.post_id = :id`, {
    id: req.params.id,
  });
  await recordAudit(req, {
    action: `post.${status === "published" ? "restore" : status}`,
    targetType: "post",
    targetId: req.params.id,
    detail: { clubId: post.club_id, from: post.status, to: status },
  });
  res.json({ post: rowToPost(updated[0]) });
});
