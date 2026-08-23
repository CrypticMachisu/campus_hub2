import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireTier1, canManageClub } from "../middleware/auth.js";
import { promoteUserToClubAdmin } from "../queries.js";

export const adminRequestsRouter = Router();

const REQUEST_LIST_QUERY = `
    SELECT r.*, u.name AS user_name, u.email AS user_email, c.name AS club_name
    FROM admin_requests r
    JOIN users u ON u.user_id = r.user_id
    JOIN clubs c ON c.club_id = r.club_id
`;

function rowToAdminRequest(row) {
    return {
        id: row.request_id,
        userId: row.user_id,
        userName: row.user_name,
        userEmail: row.user_email,
        clubId: row.club_id,
        clubName: row.club_name,
        status: row.status,
        createdAt: row.created_at,
    };
}

/** GET /api/admin-requests — tier1 only. Pending requests, oldest first. */
adminRequestsRouter.get("/", requireAuth, requireTier1, async (req, res) => {
    const [rows] = await pool.query(
        `${REQUEST_LIST_QUERY} WHERE r.status = 'pending' ORDER BY r.created_at`
    );
    res.json({ requests: rows.map(rowToAdminRequest) });
});

/**
 * POST /api/admin-requests — any logged-in member.
 * Requests admin access to a club they don't already manage.
 */
adminRequestsRouter.post("/", requireAuth, async (req, res) => {
const { clubId } = req.body;
    if (!clubId) return res.status(400).json({ error: "clubId is required." });

    const [clubRows] = await pool.query("SELECT club_id FROM clubs WHERE club_id = :clubId", { clubId });
    if (!clubRows[0]) return res.status(404).json({ error: "Club not found." });

    if (canManageClub(req.user, clubId)) {
        return res.status(400).json({ error: "You already manage this club." });
    }

    const [existing] = await pool.query(
        `SELECT request_id FROM admin_requests
        WHERE user_id = :userId AND club_id = :clubId AND status = 'pending'`,
        { userId: req.user.id, clubId }
    );
    if (existing[0]) return res.status(409).json({ error: "You already have a pending request for this club." });

    await pool.query(`INSERT INTO admin_requests (user_id, club_id) VALUES (:userId, :clubId)`, { userId: req.user.id, clubId });
    res.status(201).json({ ok: true });
});

/** POST /api/admin-requests/:id/approve — tier1 only. Promotes + marks approved. */
adminRequestsRouter.post("/:id/approve", requireAuth, requireTier1, async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM admin_requests WHERE request_id = :id", { id: req.params.id });
    const request = rows[0];
    if (!request) return res.status(404).json({ error: "Request not found." });
    if (request.status !== "pending") {
        return res.status(400).json({ error: "That request has already been handled." });
    }

    await promoteUserToClubAdmin(request.user_id, request.club_id);
    await pool.query("UPDATE admin_requests SET status = 'approved' WHERE request_id = :id", { id: req.params.id });
    res.json({ ok: true });
});

/** POST /api/admin-requests/:id/deny — tier1 only. */
adminRequestsRouter.post("/:id/deny", requireAuth, requireTier1, async (req, res) => {
    const [result] = await pool.query(`UPDATE admin_requests SET status = 'denied' WHERE request_id = :id AND status = 'pending'`, { 
        id: req.params.id });
    if (result.affectedRows === 0) return res.status(404).json({ error: "Pending request not found." });
    res.json({ ok: true });
});