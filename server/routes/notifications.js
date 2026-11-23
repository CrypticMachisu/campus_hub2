// Notifications — targeted in-app notices for the signed-in reader.
//
// Only the owner can read or mark their rows. There is no create endpoint:
// notices are written by the action that caused them (a commitment moving or
// being cancelled) so a client cannot invent one for someone else.
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { createApiRouter } from "../middleware/apiGuards.js";

export const notificationsRouter = createApiRouter();

function rowToNotification(row) {
  return {
    id: row.notification_id,
    kind: row.kind,
    title: row.title,
    body: row.body || "",
    link: row.link || null,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

async function unreadCountFor(userId) {
  const [[{ count }]] = await pool.query(
    "SELECT COUNT(*) AS count FROM notifications WHERE user_id = :userId AND read_at IS NULL",
    { userId }
  );
  return Number(count);
}

/** GET /notifications — latest 30 notices plus the unread count. */
notificationsRouter.get("/", requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT notification_id, kind, title, body, link, created_at, read_at
     FROM notifications
     WHERE user_id = :userId
     ORDER BY created_at DESC, notification_id DESC
     LIMIT 30`,
    { userId: req.user.id }
  );

  res.json({
    notifications: rows.map(rowToNotification),
    unreadCount: await unreadCountFor(req.user.id),
  });
});

/** PATCH /notifications/:id/read — idempotent, owner only. */
notificationsRouter.patch("/:id/read", requireAuth, async (req, res) => {
  const [result] = await pool.query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE notification_id = :id AND user_id = :userId`,
    { id: req.params.id, userId: req.user.id }
  );
  if (result.affectedRows === 0) return res.status(404).json({ error: "Notice not found." });

  res.json({ unreadCount: await unreadCountFor(req.user.id) });
});

/** DELETE /notifications/:id — owner only; dismissal is permanent. */
notificationsRouter.delete("/:id", requireAuth, async (req, res) => {
  const [result] = await pool.query(
    "DELETE FROM notifications WHERE notification_id = :id AND user_id = :userId",
    { id: req.params.id, userId: req.user.id }
  );
  if (result.affectedRows === 0) return res.status(404).json({ error: "Notice not found." });
  res.json({ unreadCount: await unreadCountFor(req.user.id) });
});

/** POST /notifications/read-all — clears the badge in one action. */
notificationsRouter.post("/read-all", requireAuth, async (req, res) => {
  await pool.query(
    "UPDATE notifications SET read_at = NOW() WHERE user_id = :userId AND read_at IS NULL",
    { userId: req.user.id }
  );
  res.json({ unreadCount: 0 });
});
