// Route-level tests for the member-facing surfaces added with the club
// workspace: signups/capacity/waitlist and threaded comments.
//
// Run from server/ with the API already running:  npm test
// Like the security suite, these use seed accounts and skip quietly when
// their passwords have not been set. Everything they create is deleted again
// in a t.after hook, including on failure, so the demo database is left as
// it was found.
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";

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

/** One request helper with the key, optional bearer token, and 429 backoff. */
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

/**
 * Assert the status and decode the body exactly once. A fetch body can only be
 * read once, so tests must never call .text() and then .json() on the same
 * response — that is what made the first version of this suite fail.
 */
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

const signupFor = (token, eventId) => api("/signups", { method: "POST", token, body: { eventId } });

test(
  "signups: capacity puts the overflow on the waitlist and only the owner can cancel",
  { timeout: 60_000 },
  async (t) => {
    const admin = await login(process.env.TEST_ADMIN_EMAIL || "amara.okafor@campus.edu");
    const sofia = await login(process.env.TEST_MEMBER_EMAIL || "sofia.ramirez@campus.edu");
    const yuki = await login(process.env.TEST_OTHER_MEMBER_EMAIL || "yuki.tanaka@campus.edu");
    if (!admin || !sofia || !yuki) {
      t.skip("seed logins unavailable — run npm run set-passwords first");
      return;
    }

    // Capacity 1 keeps the waitlist deterministic: first signup goes, second waits.
    const created = await api("/events", {
      method: "POST",
      token: admin,
      body: {
        clubId: "club-01",
        title: `Route test: waitlist ${Date.now()}`,
        description: "Created by the route test suite; deleted afterwards.",
        category: "Academic",
        date: "2030-05-01",
        time: "18:00",
        location: "Room 1",
        capacity: 1,
      },
    });
    const event = (await expectJson(created, 201, "create event")).event;
    t.after(async () => {
      await api(`/events/${event.id}`, { method: "DELETE", token: admin });
    });

    const first = await signupFor(sofia, event.id);
    const firstSignup = (await expectJson(first, 201, "first signup")).signup;

    // Signing up twice is idempotent, not an error.
    const repeat = await signupFor(sofia, event.id);
    assert.equal((await expectJson(repeat, 200, "repeat signup")).signup.id, firstSignup.id);

    const second = await signupFor(yuki, event.id);
    await expectJson(second, 201, "second signup");

    const mine = await api("/signups/mine", { token: yuki });
    const mySignup = (await expectJson(mine, 200, "my signups")).signups.find(
      (signup) => signup.eventId === event.id
    );
    assert.ok(mySignup, "the signup should appear in /signups/mine");
    assert.equal(mySignup.position, 2);
    assert.equal(mySignup.waitlisted, true);

    const sofiaMine = await api("/signups/mine", { token: sofia });
    const herSignup = (await expectJson(sofiaMine, 200, "her signups")).signups.find(
      (signup) => signup.eventId === event.id
    );
    assert.equal(herSignup.position, 1);
    assert.equal(herSignup.waitlisted, false);

    // The roster is admin-only.
    const forbiddenRoster = await api(`/signups/event/${event.id}`, { token: sofia });
    assert.equal(forbiddenRoster.status, 403);

    const roster = await api(`/signups/event/${event.id}`, { token: admin });
    assert.equal((await expectJson(roster, 200, "roster")).signups.length, 2);

    // Only the owner can cancel.
    const otherCancel = await api(`/signups/${mySignup.id}`, { method: "DELETE", token: sofia });
    assert.equal(otherCancel.status, 403);

    const ownCancel = await api(`/signups/${mySignup.id}`, { method: "DELETE", token: yuki });
    assert.equal(ownCancel.status, 204);

    const afterCancel = await api(`/signups/event/${event.id}`, { token: admin });
    assert.equal((await expectJson(afterCancel, 200, "roster after cancel")).signups.length, 1);
  }
);

test(
  "comments: replies stay one level deep, reactions toggle, only admins pin",
  { timeout: 60_000 },
  async (t) => {
    const admin = await login(process.env.TEST_ADMIN_EMAIL || "amara.okafor@campus.edu");
    const sofia = await login(process.env.TEST_MEMBER_EMAIL || "sofia.ramirez@campus.edu");
    if (!admin || !sofia) {
      t.skip("seed logins unavailable — run npm run set-passwords first");
      return;
    }

    const target = { targetType: "club", targetId: "club-01" };
    const created = await api("/comments", {
      method: "POST",
      token: sofia,
      body: { ...target, text: `Route test comment ${Date.now()}` },
    });
    const comment = (await expectJson(created, 201, "create comment")).comment;
    t.after(async () => {
      // 204 on the happy path; 404 is fine if the test already deleted it.
      await api(`/comments/${comment.id}`, { method: "DELETE", token: admin });
    });

    const replied = await api("/comments", {
      method: "POST",
      token: admin,
      body: { ...target, text: "Route test reply", parentId: comment.id },
    });
    const reply = (await expectJson(replied, 201, "reply")).comment;
    assert.equal(reply.parentId, comment.id);

    const nested = await api("/comments", {
      method: "POST",
      token: admin,
      body: { ...target, text: "Route test nested reply", parentId: reply.id },
    });
    assert.equal(nested.status, 400);

    const thread = await api("/comments?targetType=club&targetId=club-01");
    const threadBody = await expectJson(thread, 200, "thread");
    const listed = threadBody.comments.find((entry) => entry.id === comment.id);
    assert.ok(listed, "the new comment should be in the thread");
    assert.equal(listed.canModerate, false, "anonymous readers cannot moderate");
    assert.ok(threadBody.comments.some((entry) => entry.id === reply.id));

    const reacted = await api(`/comments/${comment.id}/reactions`, {
      method: "POST",
      token: sofia,
      body: { emoji: "🎉" },
    });
    const reactions = (await expectJson(reacted, 200, "react")).reactions;
    assert.equal(reactions.length, 1);
    assert.equal(reactions[0].count, 1);
    assert.equal(reactions[0].mine, true);

    const unreacted = await api(`/comments/${comment.id}/reactions`, {
      method: "POST",
      token: sofia,
      body: { emoji: "🎉" },
    });
    assert.deepEqual((await expectJson(unreacted, 200, "unreact")).reactions, []);

    const unsupported = await api(`/comments/${comment.id}/reactions`, {
      method: "POST",
      token: sofia,
      body: { emoji: "🚀" },
    });
    assert.equal(unsupported.status, 400);

    // Members cannot pin, and replies cannot be pinned at all.
    const memberPin = await api(`/comments/${comment.id}/pin`, {
      method: "PATCH",
      token: sofia,
      body: { pinned: true },
    });
    assert.equal(memberPin.status, 403);

    const replyPin = await api(`/comments/${reply.id}/pin`, {
      method: "PATCH",
      token: admin,
      body: { pinned: true },
    });
    assert.equal(replyPin.status, 400);

    const adminPin = await api(`/comments/${comment.id}/pin`, {
      method: "PATCH",
      token: admin,
      body: { pinned: true },
    });
    assert.equal((await expectJson(adminPin, 200, "admin pin")).comment.pinned, true);

    const pinned = await api("/comments?targetType=club&targetId=club-01");
    const pinnedListed = (await expectJson(pinned, 200, "pinned thread")).comments.find(
      (entry) => entry.id === comment.id
    );
    assert.equal(pinnedListed.pinned, true);

    const deleted = await api(`/comments/${comment.id}`, { method: "DELETE", token: sofia });
    assert.equal(deleted.status, 204);

    const remaining = await api("/comments?targetType=club&targetId=club-01");
    const ids = (await expectJson(remaining, 200, "thread after delete")).comments.map(
      (entry) => entry.id
    );
    assert.ok(!ids.includes(comment.id), "the comment should be gone");
    assert.ok(!ids.includes(reply.id), "deleting a parent should cascade to its reply");
  }
);
