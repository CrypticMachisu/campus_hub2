// Route-level tests for commitments: capacity, waitlist order, promotion on
// cancellation, and the manager-only roster.
//
// Run from server/ with the API already running:
//   TEST_BASE_URL=http://localhost:5002/api node --test tests/commitments.test.mjs
//
// The suite creates one commitment on club-01 and deletes it in t.after, so
// the demo database is left as it was found (including on failure).
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

const signupFor = (token, id) => api(`/v2/commitments/${id}/signup`, { method: "POST", token });

test(
  "commitments: capacity waitlists, idempotent signup, promotion and roster permissions",
  { timeout: 60_000 },
  async (t) => {
    const admin = await login(process.env.TEST_ADMIN_EMAIL || "amara.okafor@campus.edu");
    const sofia = await login(process.env.TEST_MEMBER_EMAIL || "sofia.ramirez@campus.edu");
    const yuki = await login(process.env.TEST_OTHER_MEMBER_EMAIL || "yuki.tanaka@campus.edu");
    if (!admin || !sofia || !yuki) {
      t.skip("seed logins unavailable — run npm run set-passwords first");
      return;
    }

    // Capacity 1 makes the waitlist deterministic: first signup goes, second waits.
    const created = await api("/v2/commitments", {
      method: "POST",
      token: admin,
      body: {
        clubId: "club-01",
        kind: "workshop",
        title: `Route test commitment ${Date.now()}`,
        description: "Created by the commitments route test; deleted afterwards.",
        date: "2030-06-02",
        time: "09:00",
        location: "Block C",
        hostName: "Amara Okafor",
        capacity: 1,
      },
    });
    const commitment = (await expectJson(created, 201, "create commitment")).commitment;
    assert.equal(commitment.clubId, "club-01");
    assert.equal(commitment.capacity, 1);
    assert.equal(commitment.kindLabel, "Workshop");
    assert.equal(commitment.signupCount, 0);

    t.after(async () => {
      await api(`/v2/commitments/${commitment.id}`, { method: "DELETE", token: admin });
      // Notices have no FK to the commitment, so clear the ones this run made.
      for (const token of [sofia, yuki]) {
        const res = await api("/v2/notifications", { token });
        if (!res.ok) continue;
        const { notifications } = await res.json();
        for (const notice of notifications) {
          if (notice.title.startsWith(commitment.title)) {
            await api(`/v2/notifications/${notice.id}`, { method: "DELETE", token });
          }
        }
      }
    });

    // Commitments accept comments like events and clubs do.
    const comment = await api("/comments", {
      method: "POST",
      token: sofia,
      body: {
        targetType: "commitment",
        targetId: commitment.id,
        text: "Is there a rain date for this one?",
      },
    });
    assert.equal(comment.status, 201, "a commitment should accept a comment");
    const thread = await api(
      `/comments?targetType=commitment&targetId=${encodeURIComponent(commitment.id)}`
    );
    const threadBody = await expectJson(thread, 200, "commitment comments");
    assert.equal(threadBody.comments.length, 1);
    assert.equal(threadBody.comments[0].text, "Is there a rain date for this one?");
    // Comments have no FK to their target, so remove it explicitly.
    await api(`/comments/${threadBody.comments[0].id}`, { method: "DELETE", token: sofia });

    // Public list: no login needed, and the new row is there.
    const list = await api(`/v2/commitments?clubId=club-01`);
    const listed = (await expectJson(list, 200, "public list")).commitments.find(
      (entry) => entry.id === commitment.id
    );
    assert.ok(listed, "the commitment should be publicly listed");
    assert.equal(listed.joined, false, "an anonymous reader is not joined");

    const first = await signupFor(sofia, commitment.id);
    const firstSignup = (await expectJson(first, 201, "first signup")).signup;
    assert.equal(firstSignup.position, 1);
    assert.equal(firstSignup.waitlisted, false);

    // Signing up twice is idempotent, not an error.
    const repeat = await signupFor(sofia, commitment.id);
    const repeated = await expectJson(repeat, 200, "repeat signup");
    assert.equal(repeated.signup.id, firstSignup.id);
    assert.equal(repeated.signupCount, 1);

    const second = await signupFor(yuki, commitment.id);
    const secondBody = await expectJson(second, 201, "second signup");
    assert.equal(secondBody.signup.position, 2);
    assert.equal(secondBody.signup.waitlisted, true);

    // The member's own list carries the waitlist state.
    const mine = await api("/v2/commitments/mine", { token: yuki });
    const myCommitment = (await expectJson(mine, 200, "my commitments")).commitments.find(
      (entry) => entry.id === commitment.id
    );
    assert.ok(myCommitment, "the commitment should appear in /commitments/mine");
    assert.equal(myCommitment.signup.position, 2);
    assert.equal(myCommitment.signup.waitlisted, true);
    assert.equal(myCommitment.joined, true);

    // Detail is public, but a signed-in reader gets their own signup.
    const detail = await api(`/v2/commitments/${commitment.id}`, { token: yuki });
    const detailBody = await expectJson(detail, 200, "commitment detail");
    assert.equal(detailBody.commitment.id, commitment.id);
    assert.equal(detailBody.signup.waitlisted, true);

    // Roster is manager-only.
    const forbiddenRoster = await api(`/v2/commitments/${commitment.id}/roster`, { token: sofia });
    assert.equal(forbiddenRoster.status, 403);

    const roster = await api(`/v2/commitments/${commitment.id}/roster`, { token: admin });
    const rosterBody = await expectJson(roster, 200, "roster");
    assert.equal(rosterBody.roster.length, 2);
    assert.equal(rosterBody.roster[0].position, 1);
    assert.equal(rosterBody.roster[0].waitlisted, false);
    assert.equal(rosterBody.roster[1].position, 2);
    assert.equal(rosterBody.roster[1].waitlisted, true);
    assert.equal(rosterBody.summary.going, 1);
    assert.equal(rosterBody.summary.waitlisted, 1);
    assert.equal(rosterBody.summary.attended, 0);

    // Check-in is an officer action, on a signup that belongs to the notice.
    const forbiddenAttendance = await api(
      `/v2/commitments/${commitment.id}/signups/${firstSignup.id}/attendance`,
      { method: "PATCH", token: sofia, body: { status: "attended" } }
    );
    assert.equal(forbiddenAttendance.status, 403);

    const badAttendance = await api(
      `/v2/commitments/${commitment.id}/signups/${firstSignup.id}/attendance`,
      { method: "PATCH", token: admin, body: { status: "maybe" } }
    );
    assert.equal(badAttendance.status, 400);

    const checkedIn = await api(
      `/v2/commitments/${commitment.id}/signups/${firstSignup.id}/attendance`,
      { method: "PATCH", token: admin, body: { status: "attended" } }
    );
    assert.equal((await expectJson(checkedIn, 200, "check in")).status, "attended");
    const withAttendance = await api(`/v2/commitments/${commitment.id}/roster`, {
      token: admin,
    });
    const attendanceBody = await expectJson(withAttendance, 200, "roster with attendance");
    assert.equal(attendanceBody.roster[0].attendance, "attended");
    assert.equal(attendanceBody.summary.attended, 1);

    const cleared = await api(
      `/v2/commitments/${commitment.id}/signups/${firstSignup.id}/attendance`,
      { method: "PATCH", token: admin, body: { status: "unknown" } }
    );
    assert.equal((await expectJson(cleared, 200, "clear attendance")).status, "unknown");

    // A member cannot delete someone else's commitment record.
    const memberDelete = await api(`/v2/commitments/${commitment.id}`, {
      method: "DELETE",
      token: sofia,
    });
    assert.equal(memberDelete.status, 403);

    // Capacity is an officer lever: raising it removes the waitlist, lowering
    // it pushes the newest signup back onto it, without deleting anyone.
    const forbiddenCapacity = await api(`/v2/commitments/${commitment.id}`, {
      method: "PATCH",
      token: sofia,
      body: { capacity: 5 },
    });
    assert.equal(forbiddenCapacity.status, 403);

    const badCapacity = await api(`/v2/commitments/${commitment.id}`, {
      method: "PATCH",
      token: admin,
      body: { capacity: 0 },
    });
    assert.equal(badCapacity.status, 400);

    const roomier = await api(`/v2/commitments/${commitment.id}`, {
      method: "PATCH",
      token: admin,
      body: { capacity: 2 },
    });
    assert.equal((await expectJson(roomier, 200, "raise capacity")).commitment.capacity, 2);
    const nowGoing = await api(`/v2/commitments/${commitment.id}`, { token: yuki });
    assert.equal((await expectJson(nowGoing, 200, "raised detail")).signup.waitlisted, false);

    const tighter = await api(`/v2/commitments/${commitment.id}`, {
      method: "PATCH",
      token: admin,
      body: { capacity: 1 },
    });
    assert.equal((await expectJson(tighter, 200, "lower capacity")).commitment.capacity, 1);
    const waitingAgain = await api(`/v2/commitments/${commitment.id}`, { token: yuki });
    assert.equal((await expectJson(waitingAgain, 200, "lowered detail")).signup.waitlisted, true);

    // Officers can edit the whole notice, not just the seat count.
    const badEdit = await api(`/v2/commitments/${commitment.id}`, {
      method: "PATCH",
      token: admin,
      body: {},
    });
    assert.equal(badEdit.status, 400, "an empty edit should be rejected");

    const halfDate = await api(`/v2/commitments/${commitment.id}`, {
      method: "PATCH",
      token: admin,
      body: { date: "2030-06-03" },
    });
    assert.equal(halfDate.status, 400, "a date without a time is not a valid reschedule");

    const edit = await api(`/v2/commitments/${commitment.id}`, {
      method: "PATCH",
      token: admin,
      body: {
        kind: "farm_visit",
        title: `${commitment.title} (edited)`,
        description: "Rescheduled by the route test.",
        date: "2030-06-03",
        time: "10:30",
        location: "Block D",
        county: "Nairobi",
        hostName: "Daniel Kamau",
        capacity: 2,
      },
    });
    const edited = (await expectJson(edit, 200, "edit commitment")).commitment;
    assert.equal(edited.title, `${commitment.title} (edited)`);
    assert.equal(edited.kind, "farm_visit");
    assert.equal(edited.kindLabel, "Farm visit");
    assert.equal(edited.startsAt, "2030-06-03T10:30:00+03:00");
    assert.equal(edited.location, "Block D");
    assert.equal(edited.county, "Nairobi");
    assert.equal(edited.hostName, "Daniel Kamau");
    assert.equal(edited.capacity, 2);

    // A moved notice reaches the people who signed up, and is theirs to read.
    const yukiNotices = await api("/v2/notifications", { token: yuki });
    const yukiInbox = await expectJson(yukiNotices, 200, "yuki notices");
    const moved = yukiInbox.notifications.find(
      (notice) =>
        notice.kind === "commitment_rescheduled" && notice.title.startsWith(commitment.title)
    );
    assert.ok(moved, "a reschedule should notify signed-up members");
    assert.match(moved.title, /moved$/);
    assert.match(moved.body, /it is now/);
    assert.ok(yukiInbox.unreadCount >= 1);

    const read = await api(`/v2/notifications/${moved.id}/read`, {
      method: "PATCH",
      token: yuki,
    });
    const readBody = await expectJson(read, 200, "mark notice read");
    assert.ok(readBody.unreadCount < yukiInbox.unreadCount);

    // Someone else cannot read or dismiss another member's notice.
    const foreignRead = await api(`/v2/notifications/${moved.id}/read`, {
      method: "PATCH",
      token: sofia,
    });
    assert.equal(foreignRead.status, 404);

    // A member cannot remove another person from the roster.
    const memberRemove = await api(`/v2/commitments/${commitment.id}/signups/${firstSignup.id}`, {
      method: "DELETE",
      token: yuki,
    });
    assert.equal(memberRemove.status, 403);

    // Cancelling the going member promotes the waitlisted one.
    const cancel = await api(`/v2/commitments/${commitment.id}/signup`, {
      method: "DELETE",
      token: sofia,
    });
    const afterCancel = await expectJson(cancel, 200, "cancel signup");
    assert.equal(afterCancel.signupCount, 1);

    const promoted = await api("/v2/commitments/mine", { token: yuki });
    const promotedBody = (await expectJson(promoted, 200, "promoted")).commitments.find(
      (entry) => entry.id === commitment.id
    );
    assert.equal(promotedBody.signup.position, 1);
    assert.equal(promotedBody.signup.waitlisted, false);

    // The officer can also take someone off the list (a withdrawal by phone).
    const rosterAfterPromote = await api(`/v2/commitments/${commitment.id}/roster`, {
      token: admin,
    });
    const remaining = await expectJson(rosterAfterPromote, 200, "roster after promote");
    const removed = await api(
      `/v2/commitments/${commitment.id}/signups/${remaining.roster[0].id}`,
      { method: "DELETE", token: admin }
    );
    assert.equal((await expectJson(removed, 200, "remove roster entry")).signupCount, 0);

    const emptyRoster = await api(`/v2/commitments/${commitment.id}/roster`, { token: admin });
    assert.equal((await expectJson(emptyRoster, 200, "empty roster")).summary.going, 0);

    // Cancelling tells whoever was still signed up, then removes the notice.
    const lateSignup = await signupFor(sofia, commitment.id);
    assert.equal(lateSignup.status, 201);

    const cancelled = await api(`/v2/commitments/${commitment.id}`, {
      method: "DELETE",
      token: admin,
    });
    assert.equal(cancelled.status, 204);
    const gone = await api(`/v2/commitments/${commitment.id}`);
    assert.equal(gone.status, 404, "a cancelled commitment should no longer be readable");

    const sofiaNotices = await api("/v2/notifications", { token: sofia });
    const sofiaInbox = await expectJson(sofiaNotices, 200, "sofia notices");
    const cancellation = sofiaInbox.notifications.find(
      (notice) =>
        notice.kind === "commitment_cancelled" && notice.title.startsWith(commitment.title)
    );
    assert.ok(cancellation, "a cancellation should notify the people signed up");
    assert.match(cancellation.title, /was cancelled$/);
  }
);
