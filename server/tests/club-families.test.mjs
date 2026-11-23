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
    const eventIds = [];
    const postIds = [];
    const commitmentIds = [];

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
        if (eventIds.length) {
          await pool.query("DELETE FROM audit_log WHERE target_id IN (?)", [eventIds]);
          await pool.query("DELETE FROM events WHERE event_id IN (?)", [eventIds]);
        }
        if (postIds.length) {
          await pool.query("DELETE FROM audit_log WHERE target_id IN (?)", [postIds]);
          await pool.query("DELETE FROM posts WHERE post_id IN (?)", [postIds]);
        }
        if (commitmentIds.length) {
          await pool.query("DELETE FROM audit_log WHERE target_id IN (?)", [commitmentIds]);
          await pool.query("DELETE FROM commitments WHERE commitment_id IN (?)", [commitmentIds]);
        }
        await pool.query(
          "DELETE FROM notifications WHERE user_id = ? AND kind = 'family_admin' AND title LIKE ?",
          [member.user.id, `%${stamp}%`]
        );
        await pool.query("DELETE FROM clubs WHERE club_id IN (?, ?, ?)", [clubA1, clubA2, clubB1]);
        await pool.query("DELETE FROM user_campus_affiliations WHERE campus_id IN (?, ?)", [
          campusA,
          campusB,
        ]);
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
          logoUrl: "https://example.com/family-mark.png",
        },
      }),
      201,
      "create family"
    );
    const familyId = created.family.id;
    familyIds.push(familyId);
    assert.equal(created.family.name, `Family One ${stamp}`);
    assert.equal(created.family.homeCampusId, campusA);
    assert.equal(created.family.logoUrl, "https://example.com/family-mark.png");
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
          logoUrl: "https://example.com/family-mark-v2.png",
        },
      }),
      200,
      "rename family"
    );
    assert.equal(renamed.family.name, `Family One Renamed ${stamp}`);
    assert.equal(renamed.family.description, "Updated shared identity.");
    assert.equal(renamed.family.logoUrl, "https://example.com/family-mark-v2.png");
    assert.equal(renamed.family.lastIdentityChange.actorName, tier1.user.name);
    assert.equal(renamed.family.lastIdentityChange.detail.to.name, renamed.family.name);

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

    // Moving requires the expected source family, so a stale screen cannot
    // silently steal a chapter. The target must have a free campus slot.
    {
      const moved = await expectJson(
        await api(`/v2/club-families/${second.family.id}/chapters/${clubB1}/move`, {
          method: "POST",
          token: tier1.token,
          body: { fromFamilyId: familyId },
        }),
        200,
        "move chapter to second family"
      );
      assert.ok(moved.family.chapters.some((chapter) => chapter.id === clubB1));
      assert.ok(moved.family.chapters.some((chapter) => chapter.id === clubA2));
      assert.equal(moved.family.lastChapterMove.detail.clubName, "Family Chapter B1");
      assert.equal(moved.family.lastChapterMove.actorName, tier1.user.name);

      const afterMove = await expectJson(
        await api("/v2/club-families/manage", { token: tier1.token }),
        200,
        "families after move"
      );
      const source = afterMove.families.find((family) => family.id === familyId);
      assert.deepEqual(
        source.chapters.map((chapter) => chapter.id),
        [clubA1]
      );

      assert.equal(
        (
          await api(`/v2/club-families/${second.family.id}/chapters/${clubB1}/move`, {
            method: "POST",
            token: member.token,
            body: { fromFamilyId: familyId },
          })
        ).status,
        403
      );
      assert.equal(
        (
          await api(`/v2/club-families/${second.family.id}/chapters/${clubB1}/move`, {
            method: "POST",
            token: tier1.token,
            body: {},
          })
        ).status,
        400
      );
      assert.equal(
        (
          await api(`/v2/club-families/${second.family.id}/chapters/${clubB1}/move`, {
            method: "POST",
            token: tier1.token,
            body: { fromFamilyId: familyId },
          })
        ).status,
        409
      );

      // Family two already has clubA2 on campus A.
      assert.equal(
        (
          await api(`/v2/club-families/${second.family.id}/chapters/${clubA1}/move`, {
            method: "POST",
            token: tier1.token,
            body: { fromFamilyId: familyId },
          })
        ).status,
        409
      );

      const movedBack = await expectJson(
        await api(`/v2/club-families/${familyId}/chapters/${clubB1}/move`, {
          method: "POST",
          token: tier1.token,
          body: { fromFamilyId: second.family.id },
        }),
        200,
        "move chapter back"
      );
      assert.ok(movedBack.family.chapters.some((chapter) => chapter.id === clubB1));

      const [moveAudit] = await pool.query(
        `SELECT target_id, detail FROM audit_log
         WHERE action = 'club_family.chapter.move' AND target_id IN (?)
         ORDER BY audit_id`,
        [familyIds]
      );
      assert.equal(moveAudit.length, 2);
      const detail =
        typeof moveAudit[0].detail === "string"
          ? JSON.parse(moveAudit[0].detail)
          : moveAudit[0].detail;
      assert.equal(detail.clubId, clubB1);
      assert.equal(detail.fromFamilyId, familyId);
      assert.equal(detail.toFamilyId, second.family.id);
      assert.ok(detail.fromFamilyName);
      assert.ok(detail.toFamilyName);
    }

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

    const publicList = await expectJson(await api("/v2/club-families"), 200, "public family list");
    assert.ok(publicList.families.some((family) => family.id === familyId));
    assert.ok(publicList.families.some((family) => family.id === second.family.id));

    const publicFamily = await expectJson(
      await api(`/v2/club-families/${familyId}`),
      200,
      "public family page"
    );
    assert.equal(publicFamily.family.name, `Family One Renamed ${stamp}`);
    assert.deepEqual(
      publicFamily.family.chapters.map((chapter) => chapter.id),
      [clubA1]
    );
    assert.equal((await api("/v2/club-families/does-not-exist")).status, 404);

    // Network discovery is affiliated-only and must never include campus A.
    assert.equal((await api("/clubs?scope=network")).status, 401);
    assert.equal((await api("/clubs?scope=network", { token: tier1.token })).status, 403);
    assert.equal((await api("/clubs?scope=network", { token: member.token })).status, 403);
    await pool.query(
      `INSERT INTO user_campus_affiliations
         (user_id, campus_id, kind, status, requested_at, decided_at)
       VALUES (?, ?, 'exchange', 'active', NOW(), NOW())`,
      [member.user.id, campusB]
    );

    const network = await expectJson(
      await api("/clubs?scope=network", { token: member.token }),
      200,
      "network club directory"
    );
    const networkIds = network.clubs.map((club) => club.id);
    assert.ok(networkIds.includes(clubB1), "affiliated campus B club is visible");
    assert.ok(!networkIds.includes(clubA1), "unaffiliated campus A club is hidden");
    assert.ok(!networkIds.includes(clubA2), "unaffiliated campus A club is hidden");

    assert.equal(
      (await api(`/clubs/${clubB1}?scope=network`, { token: member.token })).status,
      200
    );
    assert.equal(
      (await api(`/clubs/${clubA1}?scope=network`, { token: member.token })).status,
      404
    );
    assert.equal(
      (await api(`/clubs?scope=network&campusId=${campusB}`, { token: member.token })).status,
      400
    );
    const localIds = (
      await expectJson(await api("/clubs", { token: member.token }), 200)
    ).clubs.map((club) => club.id);
    assert.ok(!localIds.includes(clubB1), "local discovery stays on the home campus");

    // Audience begins campus-only. Only an event deliberately published to the
    // network crosses into a member's network feed.
    await expectJson(
      await api(`/v2/club-families/${second.family.id}/chapters`, {
        method: "POST",
        token: tier1.token,
        body: { clubId: clubB1 },
      }),
      201,
      "relink network event chapter"
    );

    // Family identity is public: an anonymous reader can see that the chapter
    // exists, but its campus activity still requires that campus's scope.
    const publicSecond = await expectJson(
      await api(`/v2/club-families/${second.family.id}`),
      200,
      "public family identity"
    );
    assert.ok(publicSecond.family.chapters.some((chapter) => chapter.id === clubB1));
    assert.equal((await api(`/clubs/${clubB1}`)).status, 404);
    const networkEvent = await expectJson(
      await api("/events", {
        method: "POST",
        token: tier1.token,
        body: {
          clubId: clubB1,
          title: `Network event ${stamp}`,
          description: "Visible only to the club network.",
          category: "Academic",
          date: "2030-09-12",
          time: "10:00",
          location: "Campus B Hall",
          audience: "network",
        },
      }),
      201,
      "create network event"
    );
    eventIds.push(networkEvent.event.id);
    assert.equal(networkEvent.event.audience, "network");
    assert.equal(networkEvent.event.date, "2030-09-12");
    const networkEventV2 = await expectJson(
      await api("/v2/events?scope=network", { token: member.token }),
      200,
      "network events v2"
    );
    assert.equal(
      networkEventV2.events.find((event) => event.id === networkEvent.event.id)?.startTime,
      "2030-09-12T10:00:00+03:00"
    );
    const familyWithEvent = await expectJson(
      await api(`/v2/club-families/${second.family.id}`),
      200,
      "family next event"
    );
    const teaserChapter = familyWithEvent.family.chapters.find((chapter) => chapter.id === clubB1);
    assert.equal(teaserChapter.nextEvent?.id, networkEvent.event.id);
    assert.equal(teaserChapter.nextEvent?.date, "2030-09-12");

    const campusEvent = await expectJson(
      await api("/events", {
        method: "POST",
        token: tier1.token,
        body: {
          clubId: clubB1,
          title: `Campus event ${stamp}`,
          description: "Stays on Campus B.",
          category: "Academic",
          date: "2030-09-13",
          time: "11:00",
          location: "Campus B Hall",
          audience: "campus",
        },
      }),
      201,
      "create campus event"
    );
    eventIds.push(campusEvent.event.id);
    assert.equal(campusEvent.event.audience, "campus");

    const networkEvents = await expectJson(
      await api("/events?scope=network", { token: member.token }),
      200,
      "network events"
    );
    const networkEventIds = networkEvents.events.map((event) => event.id);
    assert.ok(networkEventIds.includes(networkEvent.event.id));
    assert.ok(!networkEventIds.includes(campusEvent.event.id));

    assert.equal(
      (
        await api("/signups", {
          method: "POST",
          token: member.token,
          body: { eventId: networkEvent.event.id },
        })
      ).status,
      201
    );
    assert.equal(
      (
        await api("/signups", {
          method: "POST",
          token: member.token,
          body: { eventId: campusEvent.event.id },
        })
      ).status,
      403
    );
    assert.equal(
      (await api(`/signups/event/${networkEvent.event.id}`, { token: member.token })).status,
      403
    );

    const campusBEvents = await expectJson(
      await api(`/events?campusId=${campusB}`, { token: tier1.token }),
      200,
      "campus B events"
    );
    const campusBIds = campusBEvents.events.map((event) => event.id);
    assert.ok(campusBIds.includes(networkEvent.event.id));
    assert.ok(campusBIds.includes(campusEvent.event.id));

    assert.equal(
      (
        await api("/events", {
          method: "POST",
          token: tier1.token,
          body: {
            clubId: clubB1,
            title: "Public should be rejected",
            category: "Academic",
            date: "2030-09-14",
            time: "12:00",
            audience: "public",
          },
        })
      ).status,
      400
    );
    assert.equal(
      (
        await api("/events", {
          method: "POST",
          token: tier1.token,
          body: {
            clubId: "club-01",
            title: "Non-family network event",
            category: "Academic",
            date: "2030-09-15",
            time: "12:00",
            audience: "network",
          },
        })
      ).status,
      400
    );

    assert.equal((await api("/v2/posts/network?scope=network")).status, 401);
    assert.equal((await api("/v2/posts/network", { token: member.token })).status, 403);
    const networkPost = await expectJson(
      await api("/v2/posts", {
        method: "POST",
        token: tier1.token,
        body: {
          clubId: clubB1,
          text: `Network notice ${stamp}`,
          audience: "network",
        },
      }),
      201,
      "create network post"
    );
    postIds.push(networkPost.post.id);
    assert.equal(networkPost.post.audience, "network");

    const campusPost = await expectJson(
      await api("/v2/posts", {
        method: "POST",
        token: tier1.token,
        body: {
          clubId: clubB1,
          text: `Campus notice ${stamp}`,
          audience: "campus",
        },
      }),
      201,
      "create campus post"
    );
    postIds.push(campusPost.post.id);
    assert.equal(campusPost.post.audience, "campus");

    const networkPosts = await expectJson(
      await api("/v2/posts/network?scope=network", { token: member.token }),
      200,
      "network posts"
    );
    const networkPostIds = networkPosts.posts.map((post) => post.id);
    assert.ok(networkPostIds.includes(networkPost.post.id));
    assert.ok(!networkPostIds.includes(campusPost.post.id));
    assert.equal(
      (await api(`/v2/posts/${networkPost.post.id}?scope=network`, { token: member.token })).status,
      200
    );
    assert.equal(
      (await api(`/v2/posts/${campusPost.post.id}?scope=network`, { token: member.token })).status,
      404
    );

    assert.equal(
      (
        await api("/v2/posts", {
          method: "POST",
          token: tier1.token,
          body: { clubId: clubB1, text: "Public should be rejected", audience: "public" },
        })
      ).status,
      400
    );
    assert.equal(
      (
        await api("/v2/posts", {
          method: "POST",
          token: tier1.token,
          body: { clubId: "club-01", text: "No family network", audience: "network" },
        })
      ).status,
      400
    );

    assert.equal(
      (
        await api("/v2/commitments", {
          method: "POST",
          token: tier1.token,
          body: {
            clubId: "club-01",
            title: "Non-family network commitment",
            date: "2030-09-15",
            time: "12:00",
            location: "Hall",
            audience: "network",
          },
        })
      ).status,
      400
    );

    const networkCommitment = await expectJson(
      await api("/v2/commitments", {
        method: "POST",
        token: tier1.token,
        body: {
          clubId: clubB1,
          title: `Network commitment ${stamp}`,
          date: "2030-09-15",
          time: "12:00",
          location: "Network hall",
          capacity: 10,
          audience: "network",
        },
      }),
      201,
      "create network commitment"
    );
    commitmentIds.push(networkCommitment.commitment.id);
    assert.equal(networkCommitment.commitment.audience, "network");

    const campusCommitment = await expectJson(
      await api("/v2/commitments", {
        method: "POST",
        token: tier1.token,
        body: {
          clubId: clubB1,
          title: `Campus commitment ${stamp}`,
          date: "2030-09-16",
          time: "12:00",
          location: "Campus hall",
          audience: "campus",
        },
      }),
      201,
      "create campus commitment"
    );
    commitmentIds.push(campusCommitment.commitment.id);

    const networkCommitments = await expectJson(
      await api("/v2/commitments?scope=network", { token: member.token }),
      200,
      "network commitments"
    );
    const networkCommitmentIds = networkCommitments.commitments.map((row) => row.id);
    assert.ok(networkCommitmentIds.includes(networkCommitment.commitment.id));
    assert.ok(!networkCommitmentIds.includes(campusCommitment.commitment.id));
    assert.equal(
      (
        await api(`/v2/commitments/${networkCommitment.commitment.id}?scope=network`, {
          token: member.token,
        })
      ).status,
      200
    );
    assert.equal(
      (
        await api(`/v2/commitments/${campusCommitment.commitment.id}?scope=network`, {
          token: member.token,
        })
      ).status,
      404
    );

    const networkSignup = await expectJson(
      await api(`/v2/commitments/${networkCommitment.commitment.id}/signup`, {
        method: "POST",
        token: member.token,
      }),
      201,
      "join network commitment"
    );
    assert.equal(networkSignup.signup.position, 1);
    assert.equal(
      (
        await api(`/v2/commitments/${campusCommitment.commitment.id}/signup`, {
          method: "POST",
          token: member.token,
        })
      ).status,
      403
    );
    const roster = await expectJson(
      await api(`/v2/commitments/${networkCommitment.commitment.id}/roster`, {
        token: tier1.token,
      }),
      200,
      "network commitment roster"
    );
    assert.equal(roster.roster.length, 1);
    assert.equal(roster.roster[0].userId, member.user.id);

    assert.equal(
      (
        await api("/v2/commitments", {
          method: "POST",
          token: tier1.token,
          body: {
            clubId: clubB1,
            title: "Public commitment",
            date: "2030-09-15",
            time: "12:00",
            location: "Hall",
            audience: "public",
          },
        })
      ).status,
      400
    );
    assert.equal(
      (
        await api("/v2/commitments", {
          method: "POST",
          token: tier1.token,
          body: {
            clubId: "club-01",
            title: "No family network commitment",
            date: "2030-09-15",
            time: "12:00",
            location: "Hall",
            audience: "network",
          },
        })
      ).status,
      400
    );

    // Delegated identity editors can edit the family but never its chapters.
    const withAdmin = await expectJson(
      await api(`/v2/club-families/${familyId}/admins`, {
        method: "POST",
        token: tier1.token,
        body: { email: member.user.email, role: "editor" },
      }),
      201,
      "appoint family editor"
    );
    assert.ok(withAdmin.family.admins.some((admin) => admin.email === member.user.email));
    const [familyNotices] = await pool.query(
      "SELECT title FROM notifications WHERE user_id = ? AND kind = 'family_admin' AND title LIKE ?",
      [member.user.id, `%${stamp}%`]
    );
    assert.equal(familyNotices.length, 1);
    assert.match(familyNotices[0].title, /You can now edit/);

    const adminManage = await expectJson(
      await api("/v2/club-families/manage", { token: member.token }),
      200,
      "family editor management list"
    );
    assert.deepEqual(
      adminManage.families.map((family) => family.id),
      [familyId]
    );

    const adminEdit = await expectJson(
      await api(`/v2/club-families/${familyId}`, {
        method: "PATCH",
        token: member.token,
        body: { description: "Edited by a delegated family editor." },
      }),
      200,
      "family editor updates identity"
    );
    assert.equal(adminEdit.family.description, "Edited by a delegated family editor.");
    assert.equal(
      (
        await api(`/v2/club-families/${familyId}/chapters`, {
          method: "POST",
          token: member.token,
          body: { clubId: clubB1 },
        })
      ).status,
      403
    );

    const memberMe = await expectJson(
      await api("/auth/me", { token: member.token }),
      200,
      "family editor session"
    );
    assert.ok(memberMe.user.familyAdminOf.includes(familyId));

    const withoutAdmin = await expectJson(
      await api(`/v2/club-families/${familyId}/admins/${member.user.id}`, {
        method: "DELETE",
        token: tier1.token,
      }),
      200,
      "remove family editor"
    );
    assert.ok(!withoutAdmin.family.admins.some((admin) => admin.id === member.user.id));
    assert.equal(
      (
        await api(`/v2/club-families/${familyId}`, {
          method: "PATCH",
          token: member.token,
          body: { description: "Should be rejected." },
        })
      ).status,
      403
    );

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
      "club_family.admin.add",
      "club_family.admin.remove",
    ]) {
      assert.ok(actions.includes(action), `missing audit action ${action}`);
    }
  }
);
