// Workspace pins are club-wide editorial choices over the merged feed. These
// tests use a real top-level comment so the route validates the source row,
// then clean up that comment and every pin it created.
//
// Run from server/ with the API already running:
//   TEST_BASE_URL=http://localhost:5000/api node --test tests/workspace-pins.test.mjs
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../db.js";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000/api";
const PASSWORD = process.env.TEST_PASSWORD || "campushub123";
const VALID_KEY = (process.env.API_KEYS || "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean)[0];

if (!VALID_KEY) {
  console.error("No API key found. Set API_KEYS in server/.env, then restart the server.");
  process.exit(1);
}

async function api(path, { method = "GET", token, body } = {}) {
  const headers = { "X-API-Key": VALID_KEY };
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function expectJson(res, status, label) {
  const text = await res.text();
  assert.equal(res.status, status, `${label} — expected ${status}, got ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function login(email) {
  const res = await api("/auth/login", {
    method: "POST",
    body: { email, password: PASSWORD },
  });
  if (!res.ok) return null;
  return (await res.json()).token ?? null;
}

test("workspace pins: manager-only, club-scoped, and removable", { timeout: 60_000 }, async (t) => {
  let commentId = null;

  t.after(async () => {
    if (commentId) {
      await pool.query("DELETE FROM workspace_pins WHERE item_type = 'comment' AND item_id = ?", [
        commentId,
      ]);
      await pool.query("DELETE FROM comments WHERE comment_id = ?", [commentId]);
    }
    await pool.end();
  });

  const admin = await login(process.env.TEST_ADMIN_EMAIL || "amara.okafor@campus.edu");
  const member = await login(process.env.TEST_MEMBER_EMAIL || "sofia.ramirez@campus.edu");
  if (!admin || !member) {
    t.skip("seed logins unavailable — run npm run set-passwords first");
    return;
  }

  const comment = await api("/v2/comments", {
    method: "POST",
    token: member,
    body: {
      targetType: "club",
      targetId: "club-01",
      text: `Workspace pin route test ${Date.now()}`,
    },
  });
  commentId = (await expectJson(comment, 201, "create discussion")).comment.id;
  const pinQuery = new URLSearchParams({
    clubId: "club-01",
    itemType: "comment",
    itemId: commentId,
  });

  const unauthenticated = await api("/v2/workspace-pins", {
    method: "POST",
    body: { clubId: "club-01", itemType: "comment", itemId: commentId },
  });
  assert.equal(unauthenticated.status, 401);

  const forbidden = await api("/v2/workspace-pins", {
    method: "POST",
    token: member,
    body: { clubId: "club-01", itemType: "comment", itemId: commentId },
  });
  assert.equal(forbidden.status, 403);

  const pinned = await api("/v2/workspace-pins", {
    method: "POST",
    token: admin,
    body: { clubId: "club-01", itemType: "comment", itemId: commentId },
  });
  const pin = (await expectJson(pinned, 200, "pin workspace item")).pin;
  assert.equal(pin.itemType, "comment");
  assert.equal(pin.itemId, commentId);

  const listed = await expectJson(
    await api(`/v2/workspace-pins?clubId=club-01`),
    200,
    "read workspace pins"
  );
  assert.ok(
    listed.pins.some((entry) => entry.itemType === "comment" && entry.itemId === commentId),
    "the pinned comment should be visible to the whole club"
  );

  const wrongClub = await api("/v2/workspace-pins", {
    method: "POST",
    token: admin,
    body: { clubId: "club-02", itemType: "comment", itemId: commentId },
  });
  assert.equal(wrongClub.status, 404);

  const removed = await api(`/v2/workspace-pins?${pinQuery}`, {
    method: "DELETE",
    token: admin,
  });
  assert.equal(removed.status, 204);

  const after = await expectJson(
    await api(`/v2/workspace-pins?clubId=club-01`),
    200,
    "pins after unpin"
  );
  assert.equal(
    after.pins.some((entry) => entry.itemType === "comment" && entry.itemId === commentId),
    false
  );
});
