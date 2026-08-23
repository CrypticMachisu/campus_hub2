import { Router } from "express";
import { pool } from "../db.js";
import { rowToUser } from "../rowMappers.js";
import { promoteUserToClubAdmin, demoteUserFromClubAdmin } from "../queries.js";
import { requireAuth, requireTier1 } from "../middleware/auth.js";

export const usersRouter = Router();

/** GET /api/users — tier1 only. Every non-tier1 user, for the promote picker. */
usersRouter.get("/", requireAuth, requireTier1, async (req, res) => {
        const [rows] = await pool.query(
            `SELECT u.*, GROUP_CONCAT(ca.club_id) AS admin_club_ids
            FROM users u
            LEFT JOIN club_admins ca ON ca.user_id = u.user_id
            WHERE u.role != 'tier1'
            GROUP BY u.user_id
            ORDER BY u.name`
        );
    res.json({ users: rows.map(rowToUser) });
});

/**
 * POST /api/users/:id/promote — tier1 only.
 * Makes the target user a tier2 admin for the given club.
 */
usersRouter.post("/:id/promote", requireAuth, requireTier1, async (req, res) => {
    const { clubId } = req.body;
    if (!clubId) return res.status(400).json({ error: "clubId is required." });

    const [clubRows] = await pool.query("SELECT club_id FROM clubs WHERE club_id = :clubId", {
        clubId,
    });
    if (!clubRows[0]) return res.status(404).json({ error: "Club not found." });

    const [userRows] = await pool.query("SELECT user_id, role FROM users WHERE user_id = :id", {
        id: req.params.id,
    });
    if (!userRows[0]) return res.status(404).json({ error: "User not found." });

    if (userRows[0].role === "tier1") {
        return res.status(400).json({ error: "That user is already a tier 1 admin." });
    }

    const updatedUser = await promoteUserToClubAdmin(req.params.id, clubId);
    res.json({ user: updatedUser });
});

/**
 * POST /api/users/:id/demote — tier1 only.
 * Removes the target user's admin access to the given club.
 */
usersRouter.post("/:id/demote", requireAuth, requireTier1, async (req, res) => {
    const { clubId } = req.body;
    if (!clubId) return res.status(400).json({ error: "clubId is required." });

    const [userRows] = await pool.query("SELECT user_id, role FROM users WHERE user_id = :id", {
        id: req.params.id,
    });
    if (!userRows[0]) return res.status(404).json({ error: "User not found." });
    if (userRows[0].role === "tier1") {
        return res.status(400).json({ error: "Tier 1 admins can't be demoted here." });
    }

    const user = await demoteUserFromClubAdmin(req.params.id, clubId);
    res.json({ user });
});