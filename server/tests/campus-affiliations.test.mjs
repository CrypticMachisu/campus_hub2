// Campus affiliation request and approval flow.
//
// Creates a temporary second campus, a member, and a campus admin for that
// campus. Every account, affiliation, audit row and campus is removed in
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
  "campus affiliations: request, cancel, deny, re-request and approve",
  { timeout: 90_000 },
  async (t) => {
    const tier1 = await login(process.env.TEST_ADMIN_EMAIL || "amara.okafor@campus.edu");
    if (!tier1) {
      t.skip("seed admin login unavailable — run npm run set-passwords first");
      return;
    }

    const stamp = Date.now();
    const campusId = `campus-aff-${stamp}`;
    const otherCampusId = `campus-aff-other-${stamp}`;
    const domain = `aff-${stamp}.edu`;
    const requesterEmail = `aff.requester.${stamp}@strathmore.edu`;
    const adminEmail = `aff.admin.${stamp}@${domain}`;
    let requesterId = null;
    let adminId = null;
    let requesterToken = null;
    let adminToken = null;
    const affiliationIds = [];

    t.after(async () => {
      const ids = [requesterId, adminId].filter(Boolean);
      if (affiliationIds.length) {
        await pool.query("DELETE FROM audit_log WHERE target_id IN (?)", [affiliationIds]);
      }
      if (ids.length) {
        await pool.query("DELETE FROM audit_log WHERE actor_id IN (?)", [ids]);
        await pool.query("DELETE FROM notifications WHERE user_id IN (?)", [ids]);
        await pool.query("DELETE FROM user_campus_affiliations WHERE user_id IN (?)", [ids]);
        await pool.query("DELETE FROM users WHERE user_id IN (?)", [ids]);
      }
      await pool.query("DELETE FROM campuses WHERE campus_id IN (?, ?)", [campusId, otherCampusId]);
      await pool.end();
    });

    await pool.query("INSERT INTO campuses (campus_id, name, slug) VALUES (?, ?, ?)", [
      campusId,
      `Affiliation Campus ${stamp}`,
      `affiliation-${stamp}`,
    ]);
    await pool.query("INSERT INTO campuses (campus_id, name, slug) VALUES (?, ?, ?)", [
      otherCampusId,
      `Other Affiliation Campus ${stamp}`,
      `affiliation-other-${stamp}`,
    ]);
    await pool.query("INSERT INTO campus_email_domains (domain, campus_id) VALUES (?, ?)", [
      domain,
      campusId,
    ]);

    const requester = await expectJson(
      await api("/auth/register", {
        method: "POST",
        body: { name: "Affiliation Requester", email: requesterEmail, password: PASSWORD },
      }),
      201,
      "requester registration"
    );
    requesterId = requester.user.id;
    requesterToken = requester.token;
    assert.equal(requester.user.campusId, "campus-01");

    const adminRegistration = await expectJson(
      await api("/auth/register", {
        method: "POST",
        body: { name: "Affiliation Admin", email: adminEmail, password: PASSWORD },
      }),
      201,
      "admin registration"
    );
    adminId = adminRegistration.user.id;
    assert.equal(adminRegistration.user.campusId, campusId);
    await pool.query("UPDATE users SET role = 'campus_admin' WHERE user_id = ?", [adminId]);
    const campusAdmin = await login(adminEmail);
    adminToken = campusAdmin.token;
    assert.equal(campusAdmin.user.role, "campus_admin");
    assert.equal(campusAdmin.user.campusId, campusId);

    // A home affiliation is already active and is returned without a request.
    const initial = await expectJson(
      await api("/v2/campus-affiliations/me", { token: requesterToken }),
      200,
      "initial affiliations"
    );
    assert.equal(initial.homeCampusId, "campus-01");
    assert.equal(initial.affiliations.length, 1);
    assert.equal(initial.affiliations[0].kind, "home");
    assert.equal(initial.affiliations[0].status, "active");

    assert.equal(
      (
        await api("/v2/campus-affiliations/me", {
          method: "POST",
          token: requesterToken,
          body: { campusId: "campus-01", kind: "exchange" },
        })
      ).status,
      400
    );
    assert.equal(
      (
        await api("/v2/campus-affiliations/me", {
          method: "POST",
          token: requesterToken,
          body: { campusId, kind: "not-a-kind" },
        })
      ).status,
      400
    );
    assert.equal(
      (
        await api("/v2/campus-affiliations/me", {
          method: "POST",
          token: requesterToken,
          body: { campusId: "campus-does-not-exist", kind: "exchange" },
        })
      ).status,
      404
    );

    const requested = await expectJson(
      await api("/v2/campus-affiliations/me", {
        method: "POST",
        token: requesterToken,
        body: {
          campusId,
          kind: "exchange",
          note: "Exchange student in the Faculty of Computing.",
        },
      }),
      201,
      "request affiliation"
    );
    const requestId = requested.affiliation.id;
    affiliationIds.push(requestId);
    assert.equal(requested.affiliation.status, "pending");
    assert.equal(requested.affiliation.campusId, campusId);
    assert.equal(requested.affiliation.userId, requesterId);

    // The same campus cannot be requested twice while pending.
    assert.equal(
      (
        await api("/v2/campus-affiliations/me", {
          method: "POST",
          token: requesterToken,
          body: { campusId, kind: "exchange" },
        })
      ).status,
      409
    );

    // Members cannot see the approval queue or decide requests.
    assert.equal(
      (await api("/v2/campus-affiliations?status=pending", { token: requesterToken })).status,
      403
    );
    assert.equal(
      (
        await api(`/v2/campus-affiliations/${requestId}/approve`, {
          method: "POST",
          token: requesterToken,
        })
      ).status,
      403
    );

    const queue = await expectJson(
      await api("/v2/campus-affiliations?status=pending", { token: adminToken }),
      200,
      "campus admin queue"
    );
    const pending = queue.affiliations.find((row) => row.id === requestId);
    assert.ok(pending);
    assert.equal(pending.campusName, `Affiliation Campus ${stamp}`);
    assert.equal(pending.userEmail, requesterEmail);
    assert.equal(pending.note, "Exchange student in the Faculty of Computing.");

    // Tier 1 can also see it, and cannot approve a request they made themselves.
    const tier1Request = await expectJson(
      await api("/v2/campus-affiliations/me", {
        method: "POST",
        token: tier1.token,
        body: { campusId, kind: "staff", note: "Temporary platform test." },
      }),
      201,
      "tier 1 request"
    );
    affiliationIds.push(tier1Request.affiliation.id);
    assert.equal(
      (
        await api(`/v2/campus-affiliations/${tier1Request.affiliation.id}/approve`, {
          method: "POST",
          token: tier1.token,
        })
      ).status,
      403
    );
    assert.equal(
      (
        await api(`/v2/campus-affiliations/me/${tier1Request.affiliation.id}`, {
          method: "DELETE",
          token: tier1.token,
        })
      ).status,
      200
    );

    // Deny, then let the member retry the same campus.
    const denied = await expectJson(
      await api(`/v2/campus-affiliations/${requestId}/deny`, {
        method: "POST",
        token: adminToken,
      }),
      200,
      "deny affiliation"
    );
    assert.equal(denied.affiliation.status, "denied");
    assert.equal(denied.affiliation.decidedByName, "Affiliation Admin");
    assert.equal(
      (
        await api(`/v2/campus-affiliations/${requestId}/approve`, {
          method: "POST",
          token: adminToken,
        })
      ).status,
      409
    );

    const afterDeny = await expectJson(
      await api("/v2/campus-affiliations/me", { token: requesterToken }),
      200,
      "affiliations after denial"
    );
    assert.equal(afterDeny.affiliations.find((row) => row.campusId === campusId).status, "denied");

    const retried = await expectJson(
      await api("/v2/campus-affiliations/me", {
        method: "POST",
        token: requesterToken,
        body: { campusId, kind: "exchange", note: "Retry after adding a reference." },
      }),
      201,
      "retry affiliation"
    );
    assert.equal(retried.affiliation.id, requestId);
    assert.equal(retried.affiliation.status, "pending");

    // A member may cancel their own pending request.
    assert.equal(
      (
        await api(`/v2/campus-affiliations/me/${requestId}`, {
          method: "DELETE",
          token: requesterToken,
        })
      ).status,
      200
    );
    const cancelled = await expectJson(
      await api("/v2/campus-affiliations/me", { token: requesterToken }),
      200,
      "affiliations after cancel"
    );
    assert.ok(!cancelled.affiliations.some((row) => row.campusId === campusId));

    const finalRequest = await expectJson(
      await api("/v2/campus-affiliations/me", {
        method: "POST",
        token: requesterToken,
        body: { campusId, kind: "dual", note: "Dual programme registration." },
      }),
      201,
      "final affiliation request"
    );
    const finalId = finalRequest.affiliation.id;
    affiliationIds.push(finalId);

    assert.equal(
      (
        await api(`/v2/campus-affiliations/${finalId}/approve`, {
          method: "POST",
          token: adminToken,
        })
      ).status,
      200
    );

    const active = await expectJson(
      await api("/v2/campus-affiliations/me", { token: requesterToken }),
      200,
      "active affiliation"
    );
    const activeRow = active.affiliations.find((row) => row.campusId === campusId);
    assert.equal(activeRow.status, "active");
    assert.equal(activeRow.kind, "dual");
    assert.equal(activeRow.decidedByName, "Affiliation Admin");

    assert.equal(
      (
        await api("/v2/campus-affiliations/me", {
          method: "POST",
          token: requesterToken,
          body: { campusId, kind: "exchange" },
        })
      ).status,
      409
    );

    const audit = await pool.query(
      "SELECT action FROM audit_log WHERE actor_id IN (?) AND action LIKE 'campus.affiliation.%'",
      [[requesterId, adminId]]
    );
    const actions = audit[0].map((row) => row.action);
    for (const action of [
      "campus.affiliation.request",
      "campus.affiliation.cancel",
      "campus.affiliation.approve",
      "campus.affiliation.deny",
    ]) {
      assert.ok(actions.includes(action), `missing audit action ${action}`);
    }

    // A campus admin cannot decide a request for a different campus.
    const otherRequest = await expectJson(
      await api("/v2/campus-affiliations/me", {
        method: "POST",
        token: requesterToken,
        body: { campusId: otherCampusId, kind: "other", note: "Campus boundary check." },
      }),
      201,
      "other campus request"
    );
    affiliationIds.push(otherRequest.affiliation.id);
    assert.equal(
      (
        await api(`/v2/campus-affiliations/${otherRequest.affiliation.id}/deny`, {
          method: "POST",
          token: adminToken,
        })
      ).status,
      403
    );
    assert.equal(
      (
        await api(`/v2/campus-affiliations/me/${otherRequest.affiliation.id}`, {
          method: "DELETE",
          token: requesterToken,
        })
      ).status,
      200
    );
  }
);
