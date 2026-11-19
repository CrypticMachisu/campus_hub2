// Tier-1 club-family management behind CROSS_UNIVERSITY_ENABLED.
//
// Creates two temporary campuses and three clubs so the chapter-per-campus
// rule can be proven without touching seeded clubs. Everything is removed in
// t.after.
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
  "club families: create, edit, link chapters and enforce one chapter per campus",
  { timeout: 90_000 },
  async (t) => {
    const tier1 = await login(process.env.TEST_ADMIN_EMAIL || "amara.okafor@campus.edu");
    const member = await login(process.env.TEST_MEMBER_EMAIL || "sofia.ramirez@campus.edu");
    if (!tier1 || !member) {
      t.skip("seed logins unavailable — run npm run set-passwords first");
      return;
    }

    const stamp = Date.now();
    const campusA = `campus-fam-a-${stamp}`;
    const campusB = `campus-fam-b-${stamp}`;
    const clubA1 = `club-fam-a1-${stamp}`;
    const clubA2 = `club-fam-a2-${stamp}`;
    const clubB1 = `club-fam-b1-${stamp}`;
    const familyIds = [];

    t.after(async () => {
      try {
        // Also catch an unexpected family created by a failed negative test.
        const [leftover] = await pool.query(
          "SELECT family_id FROM club_families WHERE home_campus_id IN (?, ?)",
          [campusA, campusB]
        );
        const ids = [...new Set([...familyIds, ...leftover.map((row) => row.family_id)])];
        if (ids.length) {
          await pool.query("DELETE FROM audit_log WHERE target_id IN (?)", [ids]);
          await pool.query("DELETE FROM club_families WHERE family_id IN (?)", [ids]);
        }
        await pool.query("DELETE FROM clubs WHERE club_id IN (?, ?, ?)", [clubA1, clubA2, clubB1]);
        await pool.query("DELETE FROM campuses WHERE campus_id IN (?, ?)", [campusA, campusB]);
      } finally {
        await pool.end();
      }
    });

    // The whole resource is unmounted while the flag is off.
    if ((await api("/v2/club-families/manage")).status === 404) {
      t.skip("CROSS_UNIVERSITY_ENABLED is off — start an enabled API to run this flow");
      return;
    }

    await pool.query("INSERT INTO campuses (campus_id, name, slug) VALUES (?, ?, ?)", [
      campusA,
      `Family Campus A ${stamp}`,
      `family-a-${stamp}`,
    ]);
    await pool.query("INSERT INTO campuses (campus_id, name, slug) VALUES (?, ?, ?)", [
      campusB,
      `Family Campus B ${stamp}`,
      `family-b-${stamp}`,
    ]);
    for (const [clubId, campusId, name] of [
      [clubA1, campusA, "Family Chapter A1"],
      [clubA2, campusA, "Family Chapter A2"],
      [clubB1, campusB, "Family Chapter B1"],
    ]) {
      await pool.query(
        `INSERT INTO clubs (club_id, campus_id, name, category_id, description)
         SELECT ?, ?, ?, category_id, 'Temporary family-management club.'
         FROM categories WHERE name = 'Academic'`,
        [clubId, campusId, name]
      );
    }

    assert.equal((await api("/v2/club-families/manage")).status, 401);
    assert.equal((await api("/v2/club-families/manage", { token: member.token })).status, 403);
    assert.equal(
      (
        await api("/v2/club-families", {
          method: "POST",
          token: member.token,
          body: { name: "Nope", slug: "nope", homeCampusId: campusA },
        })
      ).status,
      403
    );

    assert.equal(
      (
        await api("/v2/club-families", {
          method: "POST",
          token: tier1.token,
          body: { name: "Bad slug", slug: "a".repeat(81), homeCampusId: campusA },
        })
      ).status,
      400
    );
    assert.equal(
      (
        await api("/v2/club-families", {
          method: "POST",
          token: tier1.token,
          body: { name: "Missing campus", slug: `missing-${stamp}`, homeCampusId: "nope" },
        })
      ).status,
      404
    );

    const created = await expectJson(
      await api("/v2/club-families", {
        method: "POST",
        token: tier1.token,
        body: {
          name: `Family One ${stamp}`,
          slug: `family-one-${stamp}`,
          homeCampusId: campusA,
          description: "Shared family identity.",
        },
      }),
      201,
      "create family"
    );
    const familyId = created.family.id;
    familyIds.push(familyId);
    assert.equal(created.family.name, `Family One ${stamp}`);
    assert.equal(created.family.homeCampusId, campusA);
    assert.deepEqual(created.family.chapters, []);

    assert.equal(
      (
        await api("/v2/club-families", {
          method: "POST",
          token: tier1.token,
          body: { name: "Duplicate", slug: `family-one-${stamp}`, homeCampusId: campusB },
        })
      ).status,
      409
    );

    const linkedA1 = await expectJson(
      await api(`/v2/club-families/${familyId}/chapters`, {
        method: "POST",
        token: tier1.token,
        body: { clubId: clubA1 },
      }),
      201,
      "link first chapter"
    );
    assert.deepEqual(
      linkedA1.family.chapters.map((chapter) => chapter.id),
      [clubA1]
    );

    assert.equal(
      (
        await api(`/v2/club-families/${familyId}/chapters`, {
          method: "POST",
          token: tier1.token,
          body: { clubId: clubA2 },
        })
      ).status,
      409
    );

    const linkedB1 = await expectJson(
      await api(`/v2/club-families/${familyId}/chapters`, {
        method: "POST",
        token: tier1.token,
        body: { clubId: clubB1 },
      }),
      201,
      "link second campus chapter"
    );
    assert.equal(linkedB1.family.chapters.length, 2);

    const second = await expectJson(
      await api("/v2/club-families", {
        method: "POST",
        token: tier1.token,
        body: {
          name: `Family Two ${stamp}`,
          slug: `family-two-${stamp}`,
          homeCampusId: campusA,
        },
      }),
      201,
      "create second family"
    );
    familyIds.push(second.family.id);
    assert.equal(
      (
        await api(`/v2/club-families/${second.family.id}/chapters`, {
          method: "POST",
          token: tier1.token,
          body: { clubId: clubA2 },
        })
      ).status,
      201
    );
    assert.equal(
      (
        await api(`/v2/club-families/${familyId}/chapters`, {
          method: "POST",
          token: tier1.token,
          body: { clubId: clubA2 },
        })
      ).status,
      409
    );

    const renamed = await expectJson(
      await api(`/v2/club-families/${familyId}`, {
        method: "PATCH",
        token: tier1.token,
        body: {
          name: `Family One Renamed ${stamp}`,
          slug: `family-one-renamed-${stamp}`,
          description: "Updated shared identity.",
        },
      }),
      200,
      "rename family"
    );
    assert.equal(renamed.family.name, `Family One Renamed ${stamp}`);
    assert.equal(renamed.family.description, "Updated shared identity.");

    assert.equal(
      (
        await api(`/v2/club-families/${familyId}`, {
          method: "PATCH",
          token: tier1.token,
          body: { slug: `family-two-${stamp}` },
        })
      ).status,
      409
    );

    const unlinked = await expectJson(
      await api(`/v2/club-families/${familyId}/chapters/${clubB1}`, {
        method: "DELETE",
        token: tier1.token,
      }),
      200,
      "unlink chapter"
    );
    assert.deepEqual(
      unlinked.family.chapters.map((chapter) => chapter.id),
      [clubA1]
    );
    assert.equal(
      (
        await api(`/v2/club-families/${familyId}/chapters/${clubB1}`, {
          method: "DELETE",
          token: tier1.token,
        })
      ).status,
      404
    );

    const managed = await expectJson(
      await api("/v2/club-families/manage", { token: tier1.token }),
      200,
      "family management list"
    );
    assert.ok(managed.families.some((family) => family.id === familyId));
    assert.ok(managed.families.some((family) => family.id === second.family.id));

    const audit = await pool.query(
      "SELECT action FROM audit_log WHERE target_id IN (?) ORDER BY action",
      [familyIds]
    );
    const actions = audit[0].map((row) => row.action);
    for (const action of [
      "club_family.create",
      "club_family.update",
      "club_family.chapter.add",
      "club_family.chapter.remove",
    ]) {
      assert.ok(actions.includes(action), `missing audit action ${action}`);
    }
  }
);
