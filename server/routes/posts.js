// Posts — the club's dated noticeboard.
//
// Posts are written by people who manage the club, read publicly, and can be
// hidden or removed by a manager without deleting the row. Comments reuse the
// existing polymorphic thread (`target_type = 'post'`), so there is one
// discussion system, not a second one for this surface.
import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import { requireAuth, optionalAuth, canManageClub } from "../middleware/auth.js";
import { createApiRouter } from "../middleware/apiGuards.js";
import { recordAudit } from "../audit.js";
import {
  mediaStorage,
  allowedMediaMime,
  extensionForMime,
  MAX_MEDIA_BYTES,
  MAX_POST_MEDIA,
} from "../storage.js";

export const postsRouter = createApiRouter();

const MAX_BODY = 2000;
const MAX_ALT = 300;
const STATUSES = ["published", "hidden", "removed"];

const POST_QUERY = `
  SELECT p.*, cl.name AS club_name,
         (SELECT COUNT(*) FROM comments c
           WHERE c.target_type = 'post' AND c.target_id = p.post_id) AS comment_count,
         (SELECT COUNT(*) FROM post_media m
           WHERE m.post_id = p.post_id AND m.status = 'ready') AS photo_count
  FROM posts p
  JOIN clubs cl ON cl.club_id = p.club_id
`;

const MANAGE_QUERY = `
  SELECT p.*, cl.name AS club_name,
         (SELECT COUNT(*) FROM comments c
           WHERE c.target_type = 'post' AND c.target_id = p.post_id) AS comment_count,
         (SELECT COUNT(*) FROM reports r
           WHERE r.target_type = 'post' AND r.target_id = p.post_id
             AND r.status = 'open') AS open_reports,
         (SELECT COUNT(*) FROM post_media m
           WHERE m.post_id = p.post_id AND m.status = 'ready') AS photo_count
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
    pinned: Boolean(row.pinned_at),
    pinnedAt: row.pinned_at,
    commentCount: Number(row.comment_count || 0),
    openReportCount: Number(row.open_reports || 0),
    photoCount: Number(row.photo_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mediaRowToJson(row, url) {
  return {
    id: row.media_id,
    altText: row.alt_text,
    decorative: Boolean(row.decorative),
    width: row.width,
    height: row.height,
    mime: row.mime,
    position: row.position,
    url,
  };
}

/** Attach ready media and fresh delivery URLs to already-shaped posts. */
async function attachMedia(posts) {
  if (!posts.length) return posts;
  const ids = posts.map((post) => post.id);
  const placeholders = ids.map((_, index) => `:id${index}`).join(", ");
  const params = Object.fromEntries(ids.map((id, index) => [`id${index}`, id]));
  const [rows] = await pool.query(
    `SELECT * FROM post_media
     WHERE post_id IN (${placeholders}) AND status = 'ready'
     ORDER BY position ASC, created_at ASC`,
    params
  );

  // Sign in parallel, then assemble in the saved order. Pushing as each
  // signature resolves would let network timing reshuffle the photos.
  const prepared = await Promise.all(
    rows.map(async (row) => {
      let url = null;
      try {
        url = await mediaStorage.getUrl(row.storage_key);
      } catch (err) {
        console.error(`Could not sign photo ${row.media_id}:`, err.message);
      }
      return { postId: row.post_id, entry: mediaRowToJson(row, url) };
    })
  );

  const media = new Map();
  for (const { postId, entry } of prepared) {
    if (!media.has(postId)) media.set(postId, []);
    media.get(postId).push(entry);
  }
  for (const post of posts) post.media = media.get(post.id) || [];
  return posts;
}

function cleanBody(value) {
  const body = typeof value === "string" ? value.trim() : "";
  if (!body) return { error: "Post text can't be empty." };
  if (body.length > MAX_BODY) {
    return { error: `Posts are capped at ${MAX_BODY} characters.` };
  }
  return { body };
}

function cleanAlt(value) {
  return typeof value === "string" ? value.trim().slice(0, MAX_ALT) : "";
}

function cleanDimension(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 20_000 ? number : null;
}

async function discardObject(key) {
  try {
    await mediaStorage.remove(key);
  } catch (err) {
    console.error(`Could not delete photo ${key}:`, err.message);
  }
}

/**
 * POST /posts/media — reserve a pending photo and return a presigned PUT.
 * The browser uploads directly to the bucket; nothing is attached until the
 * post is created and HeadObject confirms the object.
 */
postsRouter.post("/media", requireAuth, async (req, res) => {
  if (!mediaStorage.enabled) {
    return res.status(503).json({ error: "Photo uploads aren't configured on this server." });
  }

  const body = req.body || {};
  const clubId = typeof body.clubId === "string" ? body.clubId.trim() : "";
  const mime = typeof body.mimeType === "string" ? body.mimeType.toLowerCase().trim() : "";
  const size = Number(body.size);
  const decorative = body.decorative === true;
  const altText = cleanAlt(body.altText);
  const width = cleanDimension(body.width);
  const height = cleanDimension(body.height);

  if (!clubId) return res.status(400).json({ error: "clubId is required." });
  if (!(await clubExists(clubId))) return res.status(404).json({ error: "Club not found." });
  if (!canManageClub(req.user, clubId)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }
  if (!allowedMediaMime(mime)) {
    return res.status(400).json({ error: "Photos must be a JPEG, PNG or WebP image." });
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_MEDIA_BYTES) {
    return res
      .status(400)
      .json({ error: `Each photo must be under ${MAX_MEDIA_BYTES / 1024 / 1024} MB.` });
  }
  if (!decorative && !altText) {
    return res.status(400).json({
      error: "Describe the photo for screen readers, or mark it as decorative.",
    });
  }

  const mediaId = `media-${randomUUID()}`;
  const storageKey = `clubs/${clubId}/posts/${mediaId}.${extensionForMime(mime)}`;

  await pool.query(
    `INSERT INTO post_media
       (media_id, club_id, uploader_id, storage_key, alt_text, decorative,
        width, height, mime, status)
     VALUES (:mediaId, :clubId, :uploaderId, :storageKey, :altText, :decorative,
             :width, :height, :mime, 'pending')`,
    {
      mediaId,
      clubId,
      uploaderId: req.user.id,
      storageKey,
      altText,
      decorative: decorative ? 1 : 0,
      width,
      height,
      mime,
    }
  );

  let upload;
  try {
    upload = await mediaStorage.createUploadUrl(storageKey, mime);
  } catch (err) {
    await pool.query("DELETE FROM post_media WHERE media_id = :mediaId", { mediaId });
    throw err;
  }

  await recordAudit(req, {
    action: "post.media.request",
    targetType: "club",
    targetId: clubId,
    detail: { mediaId, mime },
  });

  res.status(201).json({
    media: mediaRowToJson(
      {
        media_id: mediaId,
        alt_text: altText,
        decorative: decorative ? 1 : 0,
        width,
        height,
        mime,
        position: 0,
      },
      null
    ),
    upload,
  });
});

/** DELETE /posts/media/:mediaId — discard a photo uploaded before publishing. */
postsRouter.delete("/media/:mediaId", requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT * FROM post_media WHERE media_id = :mediaId AND status = 'pending'",
    { mediaId: req.params.mediaId }
  );
  const media = rows[0];
  if (!media) return res.status(404).json({ error: "Pending photo not found." });
  if (media.uploader_id !== req.user.id && !canManageClub(req.user, media.club_id)) {
    return res.status(403).json({ error: "You can't remove this photo." });
  }

  await pool.query("DELETE FROM post_media WHERE media_id = :mediaId", {
    mediaId: media.media_id,
  });
  await discardObject(media.storage_key);
  res.status(204).end();
});

/** POST /posts — publish a post, optionally with ready-made photo uploads. */
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

  const mediaIds = Array.isArray(body.mediaIds)
    ? [
        ...new Set(
          body.mediaIds.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean)
        ),
      ]
    : [];
  if (body.mediaIds !== undefined && !Array.isArray(body.mediaIds)) {
    return res.status(400).json({ error: "mediaIds must be a list." });
  }
  if (mediaIds.length > MAX_POST_MEDIA) {
    return res.status(400).json({ error: `A post can have at most ${MAX_POST_MEDIA} photos.` });
  }
  if (mediaIds.length && !mediaStorage.enabled) {
    return res.status(503).json({ error: "Photo uploads aren't configured on this server." });
  }

  let pending = [];
  if (mediaIds.length) {
    const placeholders = mediaIds.map((_, index) => `:id${index}`).join(", ");
    const params = Object.fromEntries(mediaIds.map((id, index) => [`id${index}`, id]));
    const [rows] = await pool.query(
      `SELECT * FROM post_media
       WHERE post_id IS NULL AND status = 'pending'
         AND club_id = :clubId AND uploader_id = :uploaderId
         AND media_id IN (${placeholders})
         AND created_at >= (NOW() - INTERVAL 1 HOUR)`,
      { ...params, clubId, uploaderId: req.user.id }
    );
    if (rows.length !== mediaIds.length) {
      return res.status(400).json({
        error: "A photo upload expired or was already used. Add the photo again.",
      });
    }
    // The IN query has no order; preserve the order the author chose.
    const byId = new Map(rows.map((row) => [row.media_id, row]));
    pending = mediaIds.map((mediaId) => byId.get(mediaId));

    const invalid = [];
    await Promise.all(
      pending.map(async (media) => {
        try {
          const actual = await mediaStorage.inspect(media.storage_key);
          if (actual.size <= 0 || actual.size > MAX_MEDIA_BYTES || actual.mime !== media.mime) {
            invalid.push(media);
          }
        } catch {
          invalid.push(media);
        }
      })
    );
    if (invalid.length) {
      return res.status(400).json({
        error: "One of the photos didn't upload correctly. Remove it and try again.",
        mediaId: invalid[0].media_id,
      });
    }
  }

  const id = `post-${Date.now()}`;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO posts
         (post_id, club_id, author_id, author_name_snapshot, body)
       VALUES (:id, :clubId, :authorId, :authorName, :body)`,
      { id, clubId, authorId: req.user.id, authorName: req.user.name, body: cleaned.body }
    );
    for (const [index, media] of pending.entries()) {
      const [attached] = await connection.query(
        `UPDATE post_media
         SET post_id = :id, status = 'ready', position = :position
         WHERE media_id = :mediaId AND status = 'pending'`,
        { id, position: index, mediaId: media.media_id }
      );
      if (attached.affectedRows !== 1) {
        throw new Error("A photo was already attached to another post.");
      }
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  const [rows] = await pool.query(`${POST_QUERY} WHERE p.post_id = :id`, { id });
  await recordAudit(req, {
    action: "post.create",
    targetType: "post",
    targetId: id,
    detail: { clubId, length: cleaned.body.length, photos: pending.length },
  });
  const [created] = await attachMedia([rowToPost(rows[0])]);
  res.status(201).json({ post: created, mediaEnabled: mediaStorage.enabled });
});

/**
 * PATCH /posts/:id/media/:mediaId — change a published photo's description.
 * The author or a club manager may edit it; a decorative choice clears the
 * description instead of leaving stale prose behind.
 */
postsRouter.patch("/:id/media/:mediaId", requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT m.*, p.author_id, p.status AS post_status
     FROM post_media m
     JOIN posts p ON p.post_id = m.post_id
     WHERE m.media_id = :mediaId AND m.post_id = :postId AND m.status = 'ready'`,
    { mediaId: req.params.mediaId, postId: req.params.id }
  );
  const media = rows[0];
  if (!media) return res.status(404).json({ error: "Photo not found on this post." });
  if (!canManageClub(req.user, media.club_id) && media.author_id !== req.user.id) {
    return res.status(403).json({ error: "You can't edit this photo's description." });
  }
  if (media.post_status === "removed" && !canManageClub(req.user, media.club_id)) {
    return res.status(403).json({ error: "This post has been removed." });
  }

  const decorative = req.body?.decorative;
  if (typeof decorative !== "boolean") {
    return res.status(400).json({ error: "decorative must be true or false." });
  }
  const altText = decorative ? "" : cleanAlt(req.body?.altText);
  if (!decorative && !altText) {
    return res.status(400).json({
      error: "Describe the photo for screen readers, or mark it as decorative.",
    });
  }

  await pool.query(
    `UPDATE post_media
     SET alt_text = :altText, decorative = :decorative
     WHERE media_id = :mediaId`,
    { altText, decorative: decorative ? 1 : 0, mediaId: media.media_id }
  );
  await recordAudit(req, {
    action: "post.media.update",
    targetType: "post",
    targetId: req.params.id,
    detail: {
      clubId: media.club_id,
      mediaId: media.media_id,
      decorative,
      altLength: altText.length,
    },
  });

  let url = null;
  try {
    url = await mediaStorage.getUrl(media.storage_key);
  } catch (err) {
    console.error(`Could not sign photo ${media.media_id}:`, err.message);
  }
  res.json({
    media: mediaRowToJson({ ...media, alt_text: altText, decorative: decorative ? 1 : 0 }, url),
  });
});

/** DELETE /posts/:id/media/:mediaId — detach and delete one ready photo. */
postsRouter.delete("/:id/media/:mediaId", requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT m.*, p.author_id, p.status AS post_status
     FROM post_media m
     JOIN posts p ON p.post_id = m.post_id
     WHERE m.media_id = :mediaId AND m.post_id = :postId AND m.status = 'ready'`,
    { mediaId: req.params.mediaId, postId: req.params.id }
  );
  const media = rows[0];
  if (!media) return res.status(404).json({ error: "Photo not found on this post." });
  if (!canManageClub(req.user, media.club_id) && media.author_id !== req.user.id) {
    return res.status(403).json({ error: "You can't remove this photo." });
  }
  if (media.post_status === "removed" && !canManageClub(req.user, media.club_id)) {
    return res.status(403).json({ error: "This post has been removed." });
  }

  await pool.query("DELETE FROM post_media WHERE media_id = :mediaId", {
    mediaId: media.media_id,
  });
  await discardObject(media.storage_key);
  await recordAudit(req, {
    action: "post.media.remove",
    targetType: "post",
    targetId: req.params.id,
    detail: { clubId: media.club_id, mediaId: media.media_id },
  });
  res.json({ removed: true });
});

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

  const [pinnedRows] = await pool.query(
    `${POST_QUERY}
     WHERE p.club_id = :clubId AND p.status = 'published' AND p.pinned_at IS NOT NULL
     ORDER BY p.pinned_at DESC
     LIMIT 1`,
    { clubId }
  );
  const pinned = pinnedRows[0] ? rowToPost(pinnedRows[0]) : null;
  let pinnedClause = "";
  if (pinned) {
    params.pinnedId = pinned.id;
    pinnedClause = "AND p.post_id <> :pinnedId";
  }

  const [rows] = await pool.query(
    `${POST_QUERY}
     WHERE p.club_id = :clubId AND p.status = 'published'
       ${pinnedClause} ${cursorClause}
     ORDER BY p.created_at DESC, p.post_id DESC
     LIMIT ${limit}`,
    params
  );

  const shaped = rows.map(rowToPost);
  await attachMedia(shaped);
  if (pinned) await attachMedia([pinned]);
  res.json({
    posts: shaped,
    pinned,
    nextCursor: rows.length === limit ? rows[rows.length - 1].post_id : null,
    mediaEnabled: mediaStorage.enabled,
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
  const shaped = rows.map(rowToPost);
  await attachMedia(shaped);
  res.json({ posts: shaped, mediaEnabled: mediaStorage.enabled });
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

  const [post] = await attachMedia([rowToPost(row)]);
  res.json({ post: { ...post, canManage }, mediaEnabled: mediaStorage.enabled });
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
  const [shaped] = await attachMedia([rowToPost(updated[0])]);
  res.json({ post: shaped, mediaEnabled: mediaStorage.enabled });
});

/**
 * PATCH /posts/:id/pin — set or clear the club's one standing notice.
 * Managers only. Pinning is a club-scoped editorial choice, not a reaction:
 * pinning one post clears the previous pin in the same club.
 */
postsRouter.patch("/:id/pin", requireAuth, async (req, res) => {
  const pinned = req.body?.pinned;
  if (typeof pinned !== "boolean") {
    return res.status(400).json({ error: "pinned must be true or false." });
  }

  const [rows] = await pool.query("SELECT * FROM posts WHERE post_id = :id", {
    id: req.params.id,
  });
  const post = rows[0];
  if (!post) return res.status(404).json({ error: "Post not found." });
  if (!canManageClub(req.user, post.club_id)) {
    return res.status(403).json({ error: "You don't have admin access to that club." });
  }
  if (pinned && post.status !== "published") {
    return res.status(400).json({ error: "Publish this post before pinning it." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Serialize pin changes per club. Without the club lock, two managers
    // pinning different posts at once could leave two pins behind.
    await connection.query("SELECT club_id FROM clubs WHERE club_id = :clubId FOR UPDATE", {
      clubId: post.club_id,
    });
    const [locked] = await connection.query(
      "SELECT status FROM posts WHERE post_id = :id FOR UPDATE",
      { id: post.post_id }
    );
    if (!locked[0] || (pinned && locked[0].status !== "published")) {
      await connection.rollback();
      return res.status(400).json({ error: "Publish this post before pinning it." });
    }

    if (pinned) {
      await connection.query(
        "UPDATE posts SET pinned_at = NULL WHERE club_id = :clubId AND pinned_at IS NOT NULL",
        { clubId: post.club_id }
      );
      await connection.query("UPDATE posts SET pinned_at = NOW() WHERE post_id = :id", {
        id: post.post_id,
      });
    } else {
      await connection.query("UPDATE posts SET pinned_at = NULL WHERE post_id = :id", {
        id: post.post_id,
      });
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  const [updated] = await pool.query(`${POST_QUERY} WHERE p.post_id = :id`, {
    id: post.post_id,
  });
  await recordAudit(req, {
    action: pinned ? "post.pin" : "post.unpin",
    targetType: "post",
    targetId: post.post_id,
    detail: { clubId: post.club_id, from: Boolean(post.pinned_at), to: pinned },
  });
  const [shaped] = await attachMedia([rowToPost(updated[0])]);
  res.json({ post: shaped, mediaEnabled: mediaStorage.enabled });
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

  await pool.query(
    `UPDATE posts
     SET status = :status${status === "removed" ? ", pinned_at = NULL" : ""}
     WHERE post_id = :id`,
    { status, id: req.params.id }
  );

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
  const [shaped] = await attachMedia([rowToPost(updated[0])]);
  res.json({ post: shaped, mediaEnabled: mediaStorage.enabled });
});
