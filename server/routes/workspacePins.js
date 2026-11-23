import { pool } from "../db.js";
import { requireAuth, canManageClub } from "../middleware/auth.js";
import { recordAudit } from "../audit.js";
import { createApiRouter } from "../middleware/apiGuards.js";

export const workspacePinsRouter = createApiRouter();

const ITEM_TYPES = new Set(["announcement", "comment"]);
const MAX_PINS = 6;

function shapePin(row) {
  return {
    itemType: row.item_type,
    itemId: row.item_id,
    pinnedAt: row.pinned_at,
  };
}

function validType(value) {
  return ITEM_TYPES.has(value);
}

async function clubExists(clubId) {
  const [rows] = await pool.query("SELECT club_id FROM clubs WHERE club_id = :clubId", {
    clubId,
  });
  return Boolean(rows[0]);
}

/**
 * The pin points at a source row, so refuse ids that are not in this club.
 * Comments must be top-level club comments: reply threads do not appear in the
 * workspace feed and should not become standing notices.
 */
async function itemBelongsToClub({ clubId, itemType, itemId }) {
  if (itemType === "announcement") {
    const [rows] = await pool.query(
      "SELECT announcement_id FROM announcements WHERE announcement_id = :itemId AND club_id = :clubId",
      { itemId, clubId }
    );
    return Boolean(rows[0]);
  }
  const [rows] = await pool.query(
    `SELECT comment_id FROM comments
      WHERE comment_id = :itemId
        AND target_type = 'club'
        AND target_id = :clubId
        AND parent_id IS NULL`,
    { itemId, clubId }
  );
  return Boolean(rows[0]);
}

/** GET /workspace-pins?clubId=... — visible to the club's workspace. */
workspacePinsRouter.get("/", async (req, res) => {
  const clubId = String(req.query.clubId || "").trim();
  if (!clubId) return res.status(400).json({ error: "Choose a club first." });
  if (!(await clubExists(clubId))) {
    return res.status(404).json({ error: "Club not found." });
  }

  const [rows] = await pool.query(
    `SELECT item_type, item_id, pinned_at
       FROM workspace_pins
      WHERE club_id = :clubId
      ORDER BY pinned_at DESC, pin_id DESC`,
    { clubId }
  );
  res.json({ pins: rows.map(shapePin) });
});

/** POST /workspace-pins — pin an announcement or top-level discussion. */
workspacePinsRouter.post("/", requireAuth, async (req, res) => {
  const clubId = String(req.body?.clubId || "").trim();
  const itemType = String(req.body?.itemType || "").trim();
  const itemId = String(req.body?.itemId || "").trim();

  if (!clubId || !validType(itemType) || !itemId) {
    return res.status(400).json({ error: "Choose a club and an item to pin." });
  }
  if (!(await clubExists(clubId))) {
    return res.status(404).json({ error: "Club not found." });
  }
  if (!canManageClub(req.user, clubId)) {
    return res.status(403).json({ error: "Only club admins can pin workspace items." });
  }
  if (!(await itemBelongsToClub({ clubId, itemType, itemId }))) {
    return res.status(404).json({ error: "That feed item is not in this club." });
  }

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM workspace_pins
      WHERE club_id = :clubId
        AND NOT (item_type = :itemType AND item_id = :itemId)`,
    { clubId, itemType, itemId }
  );
  if (Number(countRows[0]?.total || 0) >= MAX_PINS) {
    return res.status(400).json({ error: `A workspace can keep up to ${MAX_PINS} pins.` });
  }

  await pool.query(
    `INSERT INTO workspace_pins (club_id, item_type, item_id, pinned_by, pinned_at)
     VALUES (:clubId, :itemType, :itemId, :pinnedBy, NOW())
     ON DUPLICATE KEY UPDATE pinned_at = NOW(), pinned_by = VALUES(pinned_by)`,
    { clubId, itemType, itemId, pinnedBy: req.user.id }
  );

  const [rows] = await pool.query(
    `SELECT item_type, item_id, pinned_at
       FROM workspace_pins
      WHERE club_id = :clubId AND item_type = :itemType AND item_id = :itemId`,
    { clubId, itemType, itemId }
  );

  await recordAudit(req, {
    action: "workspace.pin",
    targetType: "club",
    targetId: clubId,
    detail: { itemType, itemId },
  });
  res.json({ pin: shapePin(rows[0]) });
});

/** DELETE /workspace-pins?clubId=&itemType=&itemId= */
workspacePinsRouter.delete("/", requireAuth, async (req, res) => {
  const clubId = String(req.query.clubId || "").trim();
  const itemType = String(req.query.itemType || "").trim();
  const itemId = String(req.query.itemId || "").trim();

  if (!clubId || !validType(itemType) || !itemId) {
    return res.status(400).json({ error: "Choose a club and an item to pin." });
  }
  if (!(await clubExists(clubId))) {
    return res.status(404).json({ error: "Club not found." });
  }
  if (!canManageClub(req.user, clubId)) {
    return res.status(403).json({ error: "Only club admins can unpin workspace items." });
  }

  await pool.query(
    `DELETE FROM workspace_pins
      WHERE club_id = :clubId AND item_type = :itemType AND item_id = :itemId`,
    { clubId, itemType, itemId }
  );
  await recordAudit(req, {
    action: "workspace.unpin",
    targetType: "club",
    targetId: clubId,
    detail: { itemType, itemId },
  });
  res.status(204).end();
});
