import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { findUserById, findUserRowByEmail } from "../queries.js";
import { rowToUser } from "../rowMappers.js";
import { requireAuth } from "../middleware/auth.js";
import { isValidEmail } from "../validation.js";


export const authRouter = Router();

function signToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

/**
 * POST /api/auth/register
 * Creates a new member account. Mirrors the old authStore.signup():
 * trims name/email, rejects if either is empty, rejects duplicate
 * emails (case-insensitive) — but now also requires + hashes a password.
 */
authRouter.post("/register", async (req, res) => {
  const name = (req.body.name || "").trim();
  const email = (req.body.email || "").trim();
  const password = req.body.password || "";

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const existing = await findUserRowByEmail(email);
  if (existing) {
    return res.status(409).json({ error: "That email is already registered." });
  }

  const id = `user-${Date.now()}`;
  const passwordHash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO users (user_id, name, email, password_hash, role)
    VALUES (:id, :name, :email, :passwordHash, 'member')`,
    { id, name, email, passwordHash }
  );

  const user = await findUserById(id);
  res.status(201).json({ token: signToken(user), user });
});

/** POST /api/auth/login */
authRouter.post("/login", async (req, res) => {
  const email = (req.body.email || "").trim();
  const password = req.body.password || "";

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const row = await findUserRowByEmail(email);
  if (!row) return res.status(401).json({ error: "Invalid email or password." });

  // A blank password_hash means this seed account hasn't had a password
  // assigned yet (run `npm run set-passwords` in server/) — treat it the
  // same as a wrong password rather than letting bcrypt.compare error out.
  const valid = row.password_hash && (await bcrypt.compare(password, row.password_hash));
  if (!valid) return res.status(401).json({ error: "Invalid email or password." });

  const user = rowToUser(row);
  res.json({ token: signToken(user), user });
});

/** GET /api/auth/me — returns the logged-in user for the current token. */
authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/**
 * POST /api/auth/forgot-password
 * Always responds the same way whether or not the email is registered,
 * so this can't be used to check which emails exist. No email service
 * is wired up yet — the reset link is printed to the server console.
 */
authRouter.post("/forgot-password", async (req, res) => {
  const email = (req.body.email || "").trim();
  if (!email) return res.status(400).json({ error: "Email is required." });
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  const row = await findUserRowByEmail(email);
  if (row) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      `UPDATE users SET reset_token_hash = :tokenHash, reset_token_expires = :expires
      WHERE user_id = :userId`,
      { tokenHash, expires, userId: row.user_id }
    );

    console.log(`\nPassword reset requested for ${email}.`);
    console.log(`Reset link: http://localhost:5173/reset-password?token=${rawToken}\n`);
  }

  res.json({ ok: true });
});

/** POST /api/auth/reset-password — sets a new password given a valid, unexpired token. */
authRouter.post("/reset-password", async (req, res) => {
  const token = req.body.token || "";
  const password = req.body.password || "";

  if (!token) return res.status(400).json({ error: "Reset token is required." });
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const [rows] = await pool.query(
    `SELECT user_id, reset_token_expires FROM users WHERE reset_token_hash = :tokenHash`,
    { tokenHash }
  );
  const row = rows[0];
  if (!row || !row.reset_token_expires || new Date(row.reset_token_expires) < new Date()) {
    return res.status(400).json({ error: "That reset link is invalid or has expired." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    `UPDATE users
     SET password_hash = :passwordHash, reset_token_hash = NULL, reset_token_expires = NULL
     WHERE user_id = :userId`,
    { passwordHash, userId: row.user_id }
  );

  res.json({ ok: true });
});