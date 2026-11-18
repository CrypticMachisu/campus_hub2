// Tier-1 campus settings: names, slugs and registration domains.
//
// The test creates its own campus through the API and removes it in t.after.
// No seeded campus is renamed or given a temporary domain.
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
  "campus settings: tier 1 edits names, slugs and domains safely",
  { timeout: 60_000 },
  async (t) => {
    const admin = await login(process.env.TEST_ADMIN_EMAIL || "amara.okafor@campus.edu");
    const member = await login(process.env.TEST_MEMBER_EMAIL || "sofia.ramirez@campus.edu");
    if (!admin || !member) {
      t.skip("seed logins unavailable — run npm run set-passwords first");
      return;
    }

    const stamp = Date.now();
    const name = `Settings Campus ${stamp}`;
    const slug = `settings-${stamp}`;
    const secondSlug = `settings-updated-${stamp}`;
    const firstDomain = `settings-${stamp}.edu`;
    const secondDomain = `settings-two-${stamp}.edu`;
    const thirdDomain = `settings-three-${stamp}.edu`;
    let campusId = null;

    t.after(async () => {
      if (campusId) {
        await pool.query("DELETE FROM audit_log WHERE target_id = ?", [campusId]);
        await pool.query("DELETE FROM campuses WHERE campus_id = ?", [campusId]);
      }
      await pool.end();
    });

    // Only tier 1 can read or change campus identity.
    assert.equal((await api("/v2/campuses/manage")).status, 401);
    assert.equal((await api("/v2/campuses/manage", { token: member.token })).status, 403);
    const initial = await expectJson(
      await api("/v2/campuses/manage", { token: admin.token }),
      200,
      "tier 1 campus settings"
    );
    assert.ok(initial.campuses.some((campus) => campus.id === "campus-01"));

    const badSlug = await api("/v2/campuses", {
      method: "POST",
      token: admin.token,
      body: { name, slug: "bad_slug!", domains: [firstDomain] },
    });
    assert.equal(badSlug.status, 400);

    const badDomain = await api("/v2/campuses", {
      method: "POST",
      token: admin.token,
      body: { name, slug, domains: ["not-a-domain"] },
    });
    assert.equal(badDomain.status, 400);

    const created = await expectJson(
      await api("/v2/campuses", {
        method: "POST",
        token: admin.token,
        body: { name, slug, domains: [firstDomain, secondDomain] },
      }),
      201,
      "create campus"
    );
    campusId = created.campus.id;
    assert.equal(created.campus.name, name);
    assert.deepEqual(created.campus.domains, [firstDomain, secondDomain]);

    assert.equal(
      (
        await api("/v2/campuses", {
          method: "POST",
          token: admin.token,
          body: { name: "Duplicate slug", slug, domains: [thirdDomain] },
        })
      ).status,
      409
    );
    assert.equal(
      (
        await api("/v2/campuses", {
          method: "POST",
          token: admin.token,
          body: {
            name: "Duplicate domain",
            slug: `settings-duplicate-${stamp}`,
            domains: [firstDomain],
          },
        })
      ).status,
      409
    );

    const renamed = await expectJson(
      await api(`/v2/campuses/${campusId}`, {
        method: "PATCH",
        token: admin.token,
        body: { name: `${name} renamed`, slug: secondSlug },
      }),
      200,
      "rename campus"
    );
    assert.equal(renamed.campus.name, `${name} renamed`);
    assert.equal(renamed.campus.slug, secondSlug);

    assert.equal(
      (
        await api(`/v2/campuses/${campusId}`, {
          method: "PATCH",
          token: admin.token,
          body: { name: "Taken slug", slug: "strathmore" },
        })
      ).status,
      409
    );

    const added = await api(`/v2/campuses/${campusId}/domains`, {
      method: "POST",
      token: admin.token,
      body: { domain: `@${thirdDomain.toUpperCase()}` },
    });
    assert.equal((await expectJson(added, 201, "add domain")).domain, thirdDomain);

    assert.equal(
      (
        await api(`/v2/campuses/${campusId}/domains`, {
          method: "POST",
          token: admin.token,
          body: { domain: "strathmore.edu" },
        })
      ).status,
      409
    );

    assert.equal(
      (
        await api(`/v2/campuses/${campusId}/domains/${firstDomain}`, {
          method: "DELETE",
          token: admin.token,
        })
      ).status,
      200
    );
    assert.equal(
      (
        await api(`/v2/campuses/${campusId}/domains/${secondDomain}`, {
          method: "DELETE",
          token: admin.token,
        })
      ).status,
      200
    );
    assert.equal(
      (
        await api(`/v2/campuses/${campusId}/domains/${thirdDomain}`, {
          method: "DELETE",
          token: admin.token,
        })
      ).status,
      400
    );

    const final = await expectJson(
      await api("/v2/campuses/manage", { token: admin.token }),
      200,
      "final campus settings"
    );
    const saved = final.campuses.find((campus) => campus.id === campusId);
    assert.equal(saved.name, `${name} renamed`);
    assert.equal(saved.slug, secondSlug);
    assert.deepEqual(saved.domains, [thirdDomain]);
    assert.equal(saved.userCount, 0);
    assert.equal(saved.clubCount, 0);

    const audits = await pool.query(
      "SELECT action FROM audit_log WHERE target_id = ? ORDER BY action",
      [campusId]
    );
    const actions = audits[0].map((row) => row.action);
    for (const action of [
      "campus.create",
      "campus.update",
      "campus.domain.add",
      "campus.domain.remove",
    ]) {
      assert.ok(actions.includes(action), `missing audit action ${action}`);
    }
  }
);
