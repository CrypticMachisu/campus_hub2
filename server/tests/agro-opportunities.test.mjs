// Route-level tests for the AgroConnect opportunities surface.
//
// Run from server/ with the API already running:  npm test
// Like the other suites, this uses seed accounts and skips quietly when
// their passwords have not been set. Everything it creates is removed again
// in a t.after hook, including on failure.
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

test(
  "agro opportunities: list, register interest, and admin-managed activities",
  { timeout: 60_000 },
  async (t) => {
    const admin = await login(process.env.TEST_ADMIN_EMAIL || "amara.okafor@campus.edu");
    // Sofia is a member of club-07 in the seed data, so she is the "member"
    // case; the "not a member" case needs another club's account (yuki).
    const agriMember = await login(process.env.TEST_MEMBER_EMAIL || "sofia.ramirez@campus.edu");
    const nonMember = await login(process.env.TEST_OTHER_MEMBER_EMAIL || "yuki.tanaka@campus.edu");
    if (!admin || !agriMember || !nonMember) {
      t.skip("seed logins unavailable — run npm run set-passwords first");
      return;
    }

    // Only club members and admins may see the list. A missing token is 401,
    // another club's member is 403, and the club's own member gets 200.
    assert.equal((await api("/v2/agro/opportunities")).status, 401);
    assert.equal(
      (await api("/v2/agro/opportunities", { token: nonMember })).status,
      403,
      "a member of a different club must not see the activities"
    );

    const listed = await api("/v2/agro/opportunities", { token: agriMember });
    const body = await expectJson(listed, 200, "list opportunities");
    assert.ok(Array.isArray(body.opportunities), "opportunities should be an array");
    assert.ok(body.opportunities.length >= 1, "seeded opportunities should be listed");
    const seeded = body.opportunities[0];
    assert.match(seeded.startsAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+03:00$/);
    assert.equal(typeof seeded.interestCount, "number");
    assert.ok(body.partner && typeof body.partner.live === "boolean");
    assert.ok(
      body.partner.live || body.partner.asOf === null || body.partner.stale,
      "partner block should describe live, saved, or missing data"
    );
    // Every activity is a local record; none is pulled from the partner.
    for (const opportunity of body.opportunities) {
      assert.ok(
        ["seed", "admin"].includes(opportunity.source),
        "opportunities may only originate from the seeds or an admin"
      );
    }

    // A non-member cannot register interest.
    const refused = await api(`/v2/agro/opportunities/${seeded.id}/interest`, {
      method: "POST",
      token: nonMember,
    });
    assert.equal(refused.status, 403);

    // A tier1 admin can. Registering twice is idempotent (201, then 200).
    const first = await api(`/v2/agro/opportunities/${seeded.id}/interest`, {
      method: "POST",
      token: admin,
    });
    const firstInterest = (await expectJson(first, 201, "first interest")).interest;
    assert.equal(firstInterest.interested, true);

    const repeat = await api(`/v2/agro/opportunities/${seeded.id}/interest`, {
      method: "POST",
      token: admin,
    });
    assert.equal((await expectJson(repeat, 200, "repeat interest")).interest.interested, true);

    const listedForAdmin = await api("/v2/agro/opportunities", { token: admin });
    const withInterest = (
      await expectJson(listedForAdmin, 200, "list with token")
    ).opportunities.find((entry) => entry.id === seeded.id);
    assert.equal(withInterest.interested, true, "the caller's own interest should be flagged");
    assert.ok(withInterest.interestCount >= 1);

    const withdrawn = await api(`/v2/agro/opportunities/${seeded.id}/interest`, {
      method: "DELETE",
      token: admin,
    });
    assert.equal((await expectJson(withdrawn, 200, "withdraw")).interest.interested, false);

    // Only a club admin may publish or delete activities.
    const memberCreate = await api("/v2/agro/opportunities", {
      method: "POST",
      token: nonMember,
      body: {
        kind: "farm_visit",
        title: "Route test: member should not publish",
        location: "Nowhere",
        date: "2030-05-01",
        time: "09:00",
      },
    });
    assert.equal(memberCreate.status, 403);

    const created = await api("/v2/agro/opportunities", {
      method: "POST",
      token: admin,
      body: {
        kind: "tree_planting",
        title: `Route test: planting ${Date.now()}`,
        description: "Created by the route test suite; deleted afterwards.",
        location: "Test plot",
        county: "Nairobi",
        date: "2030-05-01",
        time: "09:00",
        capacity: 10,
        hostName: "Route Test Grower",
      },
    });
    const opportunity = (await expectJson(created, 201, "create opportunity")).opportunity;
    t.after(async () => {
      await api(`/v2/agro/opportunities/${opportunity.id}`, { method: "DELETE", token: admin });
    });

    assert.equal(opportunity.kind, "tree_planting");
    assert.equal(opportunity.capacity, 10);
    assert.equal(opportunity.source, "admin");
    assert.equal(opportunity.startsAt, "2030-05-01T09:00:00+03:00");

    const afterCreate = await api("/v2/agro/opportunities", { token: agriMember });
    assert.ok(
      (await expectJson(afterCreate, 200, "list after create")).opportunities.some(
        (entry) => entry.id === opportunity.id
      )
    );

    const deleted = await api(`/v2/agro/opportunities/${opportunity.id}`, {
      method: "DELETE",
      token: admin,
    });
    assert.equal(deleted.status, 204);

    const afterDelete = await api("/v2/agro/opportunities", { token: agriMember });
    assert.ok(
      !(await expectJson(afterDelete, 200, "list after delete")).opportunities.some(
        (entry) => entry.id === opportunity.id
      )
    );
  }
);
