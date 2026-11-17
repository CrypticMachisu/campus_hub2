// Route-level tests for the Phase 3a noticeboard: officer publishing, public
// reads, comments on posts, reports and the moderation queue.
//
// Run from server/ with the API already running:
//   DB_NAME=campushub_standalone TEST_BASE_URL=http://localhost:5002/api \
//     node --test --test-concurrency=1 tests/posts.test.mjs
//
// Cleanup is direct SQL because a post has no delete endpoint: the design keeps
// removed rows for the record. Only rows this test creates are deleted.
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
  console.error(
    "No API key found. Generate one and set API_KEYS in server/.env, then restart the server."
  );
  process.exit(1);
}

async function api(path, { method = "GET", token, body } = {}, retries = 2) {
  const headers = { "X-API-Key": VALID_KEY };
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (retries > 0 && res.status === 429) {
    const wait = (Number(res.headers.get("retry-after")) || 60) * 1000 + 500;
    await new Promise((resolve) => setTimeout(resolve, wait));
    return api(path, { method, token, body }, retries - 1);
  }
  return res;
}

async function expectJson(res, status, label) {
  const text = await res.text();
  assert.equal(res.status, status, `${label} — expected ${status}, got ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function login(email) {
  const res = await api("/auth/login", { method: "POST", body: { email, password: PASSWORD } });
  if (!res.ok) return null;
  return (await res.json()).token ?? null;
}

test("posts: publish, comment, report and moderate", { timeout: 60_000 }, async (t) => {
  const admin = await login(process.env.TEST_ADMIN_EMAIL || "amara.okafor@campus.edu");
  const sofia = await login(process.env.TEST_MEMBER_EMAIL || "sofia.ramirez@campus.edu");
  const yuki = await login(process.env.TEST_OTHER_MEMBER_EMAIL || "yuki.tanaka@campus.edu");
  if (!admin || !sofia || !yuki) {
    t.skip("seed logins unavailable — run npm run set-passwords first");
    return;
  }

  const postIds = [];
  const commentIds = [];

  t.after(async () => {
    for (const id of postIds) {
      await pool.query("DELETE FROM reports WHERE target_type = 'post' AND target_id = ?", [id]);
    }
    for (const id of commentIds) {
      await pool.query("DELETE FROM reports WHERE target_type = 'comment' AND target_id = ?", [id]);
    }
    for (const id of postIds) {
      await pool.query("DELETE FROM comments WHERE target_type = 'post' AND target_id = ?", [id]);
      await pool.query("DELETE FROM posts WHERE post_id = ?", [id]);
    }
    await pool.query(
      "DELETE FROM notifications WHERE kind = 'content_reported' AND link = '/dashboard/club-01'"
    );
    await pool.end();
  });

  // Text posts must keep working when photo storage is not configured.
  const firstFeed = await expectJson(await api("/v2/posts?clubId=club-01"), 200, "feed");
  assert.equal(typeof firstFeed.mediaEnabled, "boolean");
  if (!firstFeed.mediaEnabled) {
    const noUpload = await api("/v2/posts/media", {
      method: "POST",
      token: admin,
      body: {
        clubId: "club-01",
        mimeType: "image/jpeg",
        size: 1024,
        altText: "A seedling in a tray",
      },
    });
    assert.equal(noUpload.status, 503);
    const noPhotoPost = await api("/v2/posts", {
      method: "POST",
      token: admin,
      body: { clubId: "club-01", text: "No storage, no photo post.", mediaIds: ["media-fake"] },
    });
    assert.equal(noPhotoPost.status, 503);
  }

  // Publishing is an officer action.
  const forbiddenCreate = await api("/v2/posts", {
    method: "POST",
    token: sofia,
    body: { clubId: "club-01", text: "A member should not be able to publish this." },
  });
  assert.equal(forbiddenCreate.status, 403);

  const created = await api("/v2/posts", {
    method: "POST",
    token: admin,
    body: {
      clubId: "club-01",
      text: `Route test dispatch ${Date.now()}\nA second line stays a second line.`,
    },
  });
  const post = (await expectJson(created, 201, "create post")).post;
  postIds.push(post.id);
  assert.equal(post.clubId, "club-01");
  assert.equal(post.status, "published");
  assert.equal(post.authorName, "Amara Okafor");
  assert.equal(post.commentCount, 0);

  // Public feed and permalink.
  const list = await api("/v2/posts?clubId=club-01");
  const listed = (await expectJson(list, 200, "club posts")).posts.find(
    (entry) => entry.id === post.id
  );
  assert.ok(listed, "the new post should be on the club page");

  const page = await api("/v2/posts?clubId=club-01&limit=1");
  const pageBody = await expectJson(page, 200, "first page");
  assert.equal(pageBody.posts.length, 1);
  assert.ok(pageBody.nextCursor, "a one-item page should carry a cursor when there is more");

  const detail = await api(`/v2/posts/${post.id}`);
  assert.equal((await expectJson(detail, 200, "post permalink")).post.body, post.body);

  // Posts have a real comment thread through the existing comments route.
  const comment = await api("/v2/comments", {
    method: "POST",
    token: sofia,
    body: {
      targetType: "post",
      targetId: post.id,
      text: "Thanks for the update — is this open to new members?",
    },
  });
  const commentBody = await expectJson(comment, 201, "comment on post");
  commentIds.push(commentBody.comment.id);

  const thread = await api(`/v2/comments?targetType=post&targetId=${post.id}`);
  const threadBody = await expectJson(thread, 200, "post comments");
  assert.equal(threadBody.comments.length, 1);
  assert.equal(threadBody.comments[0].text, commentBody.comment.text);
  assert.equal(threadBody.comments[0].canModerate, false);

  const withComment = await api(`/v2/posts/${post.id}`);
  assert.equal((await expectJson(withComment, 200, "post with comment")).post.commentCount, 1);

  // Pinning is a manager choice and there is only one standing notice per club.
  const forbiddenPin = await api(`/v2/posts/${post.id}/pin`, {
    method: "PATCH",
    token: sofia,
    body: { pinned: true },
  });
  assert.equal(forbiddenPin.status, 403);

  const pinned = await api(`/v2/posts/${post.id}/pin`, {
    method: "PATCH",
    token: admin,
    body: { pinned: true },
  });
  const pinnedPost = (await expectJson(pinned, 200, "pin post")).post;
  assert.equal(pinnedPost.pinned, true);
  assert.ok(pinnedPost.pinnedAt);

  const pinnedFeed = await expectJson(
    await api("/v2/posts?clubId=club-01"),
    200,
    "feed with pinned post"
  );
  assert.equal(pinnedFeed.pinned.id, post.id);
  assert.equal(
    pinnedFeed.posts.some((entry) => entry.id === post.id),
    false,
    "the pinned post must not repeat in the dated list"
  );
  assert.equal(
    (await expectJson(await api(`/v2/posts/${post.id}`), 200, "pinned detail")).post.pinned,
    true
  );
  const pinnedManaged = await expectJson(
    await api("/v2/posts/manage?clubId=club-01", { token: admin }),
    200,
    "managed pinned post"
  );
  assert.equal(pinnedManaged.posts.find((entry) => entry.id === post.id).pinned, true);

  const unpinned = await api(`/v2/posts/${post.id}/pin`, {
    method: "PATCH",
    token: admin,
    body: { pinned: false },
  });
  assert.equal((await expectJson(unpinned, 200, "unpin post")).post.pinned, false);
  const unpinnedFeed = await expectJson(
    await api("/v2/posts?clubId=club-01"),
    200,
    "feed after unpin"
  );
  assert.notEqual(unpinnedFeed.pinned?.id, post.id);
  assert.equal(
    unpinnedFeed.posts.some((entry) => entry.id === post.id),
    true,
    "an unpinned post returns to the dated list"
  );

  // Report once; the same member cannot stack a duplicate.
  const reported = await api("/v2/reports", {
    method: "POST",
    token: sofia,
    body: {
      targetType: "post",
      targetId: post.id,
      reason: "spam",
      note: "This looks like an advert.",
    },
  });
  assert.equal(reported.status, 201);

  const duplicate = await api("/v2/reports", {
    method: "POST",
    token: sofia,
    body: { targetType: "post", targetId: post.id, reason: "spam" },
  });
  assert.equal(duplicate.status, 409);

  // The queue is manager-only and never carries reporter identity.
  const forbiddenQueue = await api("/v2/reports?clubId=club-01", { token: sofia });
  assert.equal(forbiddenQueue.status, 403);

  const queue = await api("/v2/reports?clubId=club-01", { token: admin });
  const queueBody = await expectJson(queue, 200, "report queue");
  const queueItem = queueBody.reports.find((entry) => entry.targetId === post.id);
  assert.ok(queueItem, "the reported post should be in the queue");
  assert.equal(queueItem.targetType, "post");
  assert.equal(queueItem.reason, "spam");
  assert.equal(queueItem.reportCount, 1);
  assert.equal(queueItem.reporterId, undefined);
  assert.equal(Object.hasOwn(queueItem, "reporter_id"), false);

  // Hide closes the public post and its thread; the desk still sees it.
  const hidden = await api(`/v2/reports/${queueItem.id}/resolve`, {
    method: "PATCH",
    token: admin,
    body: { action: "hide" },
  });
  const hiddenBody = await expectJson(hidden, 200, "hide reported post");
  assert.equal(hiddenBody.resolved, 1);

  assert.equal((await api(`/v2/posts/${post.id}`)).status, 404);
  assert.equal((await api(`/v2/comments?targetType=post&targetId=${post.id}`)).status, 404);
  const closedQueue = await api("/v2/reports?clubId=club-01", { token: admin });
  assert.equal(
    (await expectJson(closedQueue, 200, "queue after hide")).reports.some(
      (entry) => entry.targetId === post.id
    ),
    false
  );

  const managed = await api("/v2/posts/manage?clubId=club-01", { token: admin });
  const managedPost = (await expectJson(managed, 200, "managed posts")).posts.find(
    (entry) => entry.id === post.id
  );
  assert.equal(managedPost.status, "hidden");
  assert.equal(managedPost.openReportCount, 0);

  const restored = await api(`/v2/posts/${post.id}/status`, {
    method: "PATCH",
    token: admin,
    body: { status: "published" },
  });
  assert.equal((await expectJson(restored, 200, "restore post")).post.status, "published");

  // Hiding straight from the desk closes reports too, not just the queue path.
  const deskReport = await api("/v2/reports", {
    method: "POST",
    token: yuki,
    body: { targetType: "post", targetId: post.id, reason: "off_topic" },
  });
  assert.equal(deskReport.status, 201);
  const deskHidden = await api(`/v2/posts/${post.id}/status`, {
    method: "PATCH",
    token: admin,
    body: { status: "hidden" },
  });
  assert.equal((await expectJson(deskHidden, 200, "desk hide")).post.status, "hidden");
  const queueAfterDeskHide = await api("/v2/reports?clubId=club-01", { token: admin });
  assert.equal(
    (await expectJson(queueAfterDeskHide, 200, "queue after desk hide")).reports.some(
      (entry) => entry.targetId === post.id
    ),
    false
  );
  const publicAgain = await api(`/v2/posts/${post.id}/status`, {
    method: "PATCH",
    token: admin,
    body: { status: "published" },
  });
  assert.equal((await expectJson(publicAgain, 200, "publish again")).post.status, "published");

  // Editing: another member cannot, the manager can.
  const forbiddenEdit = await api(`/v2/posts/${post.id}`, {
    method: "PATCH",
    token: sofia,
    body: { text: "Not mine to edit." },
  });
  assert.equal(forbiddenEdit.status, 403);

  const edited = await api(`/v2/posts/${post.id}`, {
    method: "PATCH",
    token: admin,
    body: { text: "Edited by the route test." },
  });
  assert.equal((await expectJson(edited, 200, "edit post")).post.body, "Edited by the route test.");

  const badStatus = await api(`/v2/posts/${post.id}/status`, {
    method: "PATCH",
    token: admin,
    body: { status: "deleted" },
  });
  assert.equal(badStatus.status, 400);

  // A reported comment can be removed; that closes every open report on it.
  const secondComment = await api("/v2/comments", {
    method: "POST",
    token: sofia,
    body: { targetType: "post", targetId: post.id, text: "Comment to be moderated." },
  });
  const secondCommentBody = await expectJson(secondComment, 201, "second comment");
  commentIds.push(secondCommentBody.comment.id);

  const reportComment = await api("/v2/reports", {
    method: "POST",
    token: yuki,
    body: { targetType: "comment", targetId: secondCommentBody.comment.id, reason: "harassment" },
  });
  assert.equal(reportComment.status, 201);

  const commentQueue = await api("/v2/reports?clubId=club-01", { token: admin });
  const commentReport = (await expectJson(commentQueue, 200, "comment report queue")).reports.find(
    (entry) => entry.targetId === secondCommentBody.comment.id
  );
  assert.ok(commentReport);
  assert.equal(commentReport.targetType, "comment");

  const removedComment = await api(`/v2/reports/${commentReport.id}/resolve`, {
    method: "PATCH",
    token: admin,
    body: { action: "remove" },
  });
  assert.equal((await expectJson(removedComment, 200, "remove comment")).action, "remove");

  const afterComment = await api(`/v2/comments?targetType=post&targetId=${post.id}`);
  const afterCommentBody = await expectJson(afterComment, 200, "thread after remove");
  assert.equal(
    afterCommentBody.comments.some((entry) => entry.id === secondCommentBody.comment.id),
    false
  );
});
