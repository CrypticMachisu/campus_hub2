// Route-level tests for the Phase 4 campus boundary.
//
// A second campus is inserted for the duration of the test so scoping is
// proven, not just exercised against Strathmore. Everything this file creates
// is removed in t.after, including the temporary account and its audit rows.
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

async function login(email, password = PASSWORD) {
  const res = await api("/auth/login", { method: "POST", body: { email, password } });
  if (!res.ok) return null;
  return res.json();
}

test(
  "campuses: domains assign a campus, discovery is scoped, campus admins manage their own campus",
  { timeout: 120_000 },
  async (t) => {
    const admin = await login(process.env.TEST_ADMIN_EMAIL || "amara.okafor@campus.edu");
    const sofia = await login(process.env.TEST_MEMBER_EMAIL || "sofia.ramirez@campus.edu");
    if (!admin || !sofia) {
      t.skip("seed logins unavailable — run npm run set-passwords first");
      return;
    }

    const stamp = Date.now();
    const campusId = `campus-test-${stamp}`;
    const clubId = `club-test-${stamp}`;
    const eventId = `event-test-${stamp}`;
    const commitmentId = `commit-test-${stamp}`;
    const accountEmail = `campus.tester.${stamp}@strathmore.edu`;
    let accountId = null;

    const cleanupEventIds = [];

    t.after(async () => {
      for (const id of cleanupEventIds) {
        await pool.query("DELETE FROM audit_log WHERE action = 'event.create' AND target_id = ?", [
          id,
        ]);
        await pool.query("DELETE FROM events WHERE event_id = ?", [id]);
      }
      await pool.query("DELETE FROM events WHERE event_id = ? OR club_id = ?", [eventId, clubId]);
      await pool.query("DELETE FROM commitments WHERE commitment_id = ? OR club_id = ?", [
        commitmentId,
        clubId,
      ]);
      await pool.query("DELETE FROM club_tags WHERE club_id = ?", [clubId]);
      await pool.query("DELETE FROM club_admins WHERE club_id = ?", [clubId]);
      await pool.query("DELETE FROM club_members WHERE club_id = ?", [clubId]);
      await pool.query("DELETE FROM clubs WHERE club_id = ?", [clubId]);
      await pool.query("DELETE FROM campuses WHERE campus_id = ?", [campusId]);
      if (accountId) {
        await pool.query("DELETE FROM notifications WHERE user_id = ?", [accountId]);
        await pool.query("DELETE FROM audit_log WHERE actor_id = ?", [accountId]);
        await pool.query("DELETE FROM audit_log WHERE target_id = ?", [accountId]);
        await pool.query("DELETE FROM users WHERE user_id = ?", [accountId]);
      }
      await pool.end();
    });

    await pool.query("INSERT INTO campuses (campus_id, name, slug) VALUES (?, ?, ?)", [
      campusId,
      `Test Campus ${stamp}`,
      `test-${stamp}`,
    ]);
    await pool.query(
      `INSERT INTO clubs (club_id, campus_id, name, category_id, description)
       SELECT ?, ?, ?, category_id, 'Temporary campus-scope test club.'
       FROM categories WHERE name = 'Academic'`,
      [clubId, campusId, `Test Club ${stamp}`]
    );
    await pool.query(
      `INSERT INTO events (event_id, club_id, title, description, category_id, event_date, event_time, location)
       SELECT ?, ?, 'Campus scope event', 'Temporary test event.', category_id, '2030-08-01', '10:00', 'Room T1'
       FROM categories WHERE name = 'Academic'`,
      [eventId, clubId]
    );
    await pool.query(
      `INSERT INTO commitments
         (commitment_id, club_id, kind, title, description, location, starts_at, source, created_by)
       VALUES (?, ?, 'meeting', 'Campus scope commitment', 'Temporary test commitment.', 'Room T2', '2030-08-02 09:00:00', 'admin', ?)`,
      [commitmentId, clubId, admin.user.id]
    );

    // An unknown email domain must not create a campus-less account.
    const unknown = await api("/auth/register", {
      method: "POST",
      body: {
        name: "Unknown Domain",
        email: `unknown.${stamp}@not-a-campus.test`,
        password: "campushub123",
      },
    });
    assert.equal(unknown.status, 400);

    // A known domain joins Strathmore automatically.
    const registered = await api("/auth/register", {
      method: "POST",
      body: { name: "Campus Tester", email: accountEmail, password: "campushub123" },
    });
    const registeredBody = await expectJson(registered, 201, "campus registration");
    accountId = registeredBody.user.id;
    assert.equal(registeredBody.user.campusId, "campus-01");
    assert.equal(registeredBody.user.campusName, "Strathmore University");

    const memberLogin = await login(accountEmail);
    assert.equal(memberLogin.user.campusId, "campus-01");

    const directory = await expectJson(await api("/v2/campuses"), 200, "campus directory");
    assert.ok(
      directory.campuses.some(
        (campus) => campus.id === "campus-01" && campus.name === "Strathmore University"
      )
    );

    // Signed-out readers and members see Strathmore only.
    const anonClubs = await expectJson(await api("/clubs"), 200, "anonymous clubs");
    assert.ok(!anonClubs.clubs.some((club) => club.id === clubId));
    const memberClubs = await expectJson(
      await api("/clubs", { token: sofia.token }),
      200,
      "member clubs"
    );
    assert.ok(!memberClubs.clubs.some((club) => club.id === clubId));

    // A member cannot browse another campus, and tier 1 can filter to it.
    const crossCampus = await api(`/clubs?campusId=${campusId}`, {
      token: memberLogin.token,
    });
    assert.equal(crossCampus.status, 403);

    const campusClubs = await expectJson(
      await api(`/clubs?campusId=${campusId}`, { token: admin.token }),
      200,
      "tier1 campus filter"
    );
    assert.deepEqual(
      campusClubs.clubs.map((club) => club.id),
      [clubId]
    );

    // Events and commitments inherit the club boundary too.
    const anonEvents = await expectJson(await api("/events"), 200, "anonymous events");
    assert.ok(!anonEvents.events.some((event) => event.id === eventId));
    const campusEvents = await expectJson(
      await api(`/events?campusId=${campusId}`, { token: admin.token }),
      200,
      "tier1 campus events"
    );
    assert.ok(campusEvents.events.some((event) => event.id === eventId));

    const anonCommitments = await expectJson(
      await api("/v2/commitments"),
      200,
      "anonymous commitments"
    );
    assert.ok(!anonCommitments.commitments.some((commitment) => commitment.id === commitmentId));
    const campusCommitments = await expectJson(
      await api(`/v2/commitments?campusId=${campusId}`, { token: admin.token }),
      200,
      "tier1 campus commitments"
    );
    assert.ok(campusCommitments.commitments.some((commitment) => commitment.id === commitmentId));

    // A direct commitment permalink is campus-gated too.
    const anonCommitment = await api(`/v2/commitments/${commitmentId}`);
    assert.equal(anonCommitment.status, 404);
    const tier1Commitment = await api(`/v2/commitments/${commitmentId}`, {
      token: admin.token,
    });
    assert.equal(tier1Commitment.status, 200);

    // Promote the temporary account to campus admin and log in again so the
    // refreshed user carries every Strathmore club in adminForClubs.
    await pool.query("UPDATE users SET role = 'campus_admin' WHERE user_id = ?", [accountId]);
    const campusAdmin = await login(accountEmail);
    assert.equal(campusAdmin.user.role, "campus_admin");
    assert.ok(campusAdmin.user.adminForClubs.includes("club-02"));

    const created = await api("/events", {
      method: "POST",
      token: campusAdmin.token,
      body: {
        clubId: "club-02",
        title: `Campus admin event ${stamp}`,
        description: "Created by the campus test; deleted afterwards.",
        category: "Academic",
        date: "2030-08-03",
        time: "11:00",
        location: "Room T3",
      },
    });
    const createdEvent = await expectJson(created, 201, "campus admin event");
    cleanupEventIds.push(createdEvent.event.id);
    await pool.query("DELETE FROM audit_log WHERE action = 'event.create' AND target_id = ?", [
      createdEvent.event.id,
    ]);

    const crossCampusEvent = await api("/events", {
      method: "POST",
      token: campusAdmin.token,
      body: {
        clubId,
        title: "Campus admin should not cross the boundary",
        description: "Temporary test.",
        category: "Academic",
        date: "2030-08-04",
        time: "12:00",
        location: "Room T4",
      },
    });
    assert.equal(crossCampusEvent.status, 403);

    const queue = await api("/v2/reports", { token: campusAdmin.token });
    assert.equal(queue.status, 200);

    const users = await expectJson(
      await api("/users", { token: campusAdmin.token }),
      200,
      "campus admin users"
    );
    assert.ok(users.users.every((user) => user.campusId === "campus-01"));

    const tier1Only = await api(`/users/${accountId}/campus-admin`, {
      method: "POST",
      token: campusAdmin.token,
    });
    assert.equal(tier1Only.status, 403);

    // Tier 1 owns the role assignment.
    const removed = await api(`/users/${accountId}/campus-admin`, {
      method: "DELETE",
      token: admin.token,
    });
    assert.equal((await expectJson(removed, 200, "remove campus admin")).user.role, "member");
    const readded = await api(`/users/${accountId}/campus-admin`, {
      method: "POST",
      token: admin.token,
    });
    assert.equal(
      (await expectJson(readded, 200, "restore campus admin")).user.role,
      "campus_admin"
    );
  }
);
