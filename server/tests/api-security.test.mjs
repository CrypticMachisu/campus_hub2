// Week 9 (Part E step 4): API security tests.
//
// Run from server/ with the API already running:  npm test
// Uses only Node's built-in test runner and fetch (Node 18+).
//
// Covers the two required new cases (no key -> 401, valid key -> 200)
// plus the wrong-key 401, the exempt health check, and the 429 with a
// Retry-After header. If a request hits 429 because a previous burst
// filled the rate window, it waits out the Retry-After and retries, so
// the suite can be re-run within the same minute.
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000/api";
const VALID_KEY = (process.env.API_KEYS || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean)[0];

if (!VALID_KEY) {
  console.error(
    "No API key found. Generate one and set API_KEYS in server/.env, then restart the server."
  );
  process.exit(1);
}

// GET with a key, but if the key's rate window is exhausted (429 from a
// previous test burst), wait out the Retry-After and try again.
async function apiGet(path, headers = {}, { retries = 2 } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (retries > 0 && res.status === 429) {
    const wait = (Number(res.headers.get("Retry-After")) || 60) * 1000 + 1000;
    console.log(`  (rate window full — waiting ${wait / 1000}s before retrying ${path})`);
    await new Promise((resolve) => setTimeout(resolve, wait));
    return apiGet(path, headers, { retries: retries - 1 });
  }
  return res;
}

const withValidKey = { "X-API-Key": VALID_KEY };

test("GET /health stays open without an API key (the one justified exception)", async () => {
  const res = await fetch(`${BASE_URL}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test("A request with no API key gets 401", async () => {
  const res = await apiGet("/clubs");
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(typeof body.error, "string");
  assert.match(body.error, /API key/i);
});

test("A request with a wrong API key gets 401", async () => {
  const res = await apiGet("/clubs", { "X-API-Key": "definitely-not-a-real-key" });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(typeof body.error, "string");
});

test("A request with a valid API key gets 200 and data", async () => {
  const res = await apiGet("/clubs", withValidKey);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.clubs));
  // No raw database rows leaking: clubs use the mapped camelCase shape.
  for (const club of body.clubs) {
    assert.ok("id" in club && "name" in club && "category" in club);
    assert.ok(!("category_id" in club), "raw DB column category_id must not leak");
  }
});

test(
  "Rate limiting: bursting past the limit returns 429 with Retry-After and a JSON body",
  { timeout: 120_000 },
  async () => {
    const burst = 105; // default limit is 100 per 60s, so this must trip it
    const codes = [];
    let saw429 = null;

    for (let i = 0; i < burst; i++) {
      const res = await fetch(`${BASE_URL}/clubs`, { headers: withValidKey });
      if (res.status === 429) {
        saw429 = res;
        break; // first 429 is what we need; no need to hammer further
      }
      assert.equal(res.status, 200, `request ${i + 1} of the burst failed before the limit`);
      codes.push(res.status);
    }

    assert.ok(codes.length < burst, "the limit should trigger before 105 requests");
    assert.ok(
      codes.length > 0,
      `a valid key should get 200s first (got a 429 after ${codes.length} allowed requests — was the window already full?)`
    );
    assert.ok(saw429, "expected a 429 once the limit was exceeded");

    assert.equal(
      saw429.headers.get("Retry-After"),
      String(Number(saw429.headers.get("Retry-After")))
    );
    assert.ok(Number(saw429.headers.get("Retry-After")) > 0);
    const body = await saw429.json();
    assert.equal(typeof body.error, "string"); // JSON body, not HTML
  }
);

// --- GET /admin: per-key rate-limit status + last-IP tracking (tier1 only) ---

// Signs in a seed account; set TEST_ADMIN_EMAIL/TEST_MEMBER_EMAIL (and
// *_PASSWORD, default campushub123) to match your seeded data.
async function loginAs(email, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "X-API-Key": VALID_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return (await res.json()).token ?? null;
}

// Skips the admin tests quietly when the seed login isn't available
// (e.g. passwords weren't set yet), like the limiter suite needs.
async function tier1Token() {
  return loginAs(
    process.env.TEST_ADMIN_EMAIL || "amara.okafor@campus.edu",
    process.env.TEST_ADMIN_PASSWORD || "campushub123"
  );
}

test("GET /admin requires a bearer token even with a valid key", async () => {
  const res = await apiGet("/admin", withValidKey);
  assert.equal(res.status, 401); // requireAuth fires before requireTier1
});

test(
  "GET /admin returns per-key rate-limit status and last-IP for a tier1 admin",
  { timeout: 120_000 },
  async () => {
    const token = await tier1Token();
    if (!token) return; // seed logins not set up on this machine

    // Make sure the key has at least one counted request so its row is live.
    await fetch(`${BASE_URL}/clubs`, { headers: withValidKey });

    const res = await apiGet("/admin", { ...withValidKey, Authorization: `Bearer ${token}` });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Number.isInteger(body.windowMs) && body.windowMs > 0);
    assert.ok(Number.isInteger(body.max) && body.max > 0);
    assert.ok(Array.isArray(body.consumers) && body.consumers.length > 0);

    const crypto = await import("node:crypto");
    const expectedId = crypto.createHash("sha256").update(VALID_KEY).digest("hex").slice(0, 12);

    // This very request used the key, so its own key row must be present,
    // active, and fingerprinted — never the raw key. (Other keys may be in
    // the list at higher counts from earlier tests, so match by fingerprint.)
    const self = body.consumers.find((c) => c.keyId === expectedId);
    assert.ok(self, "the caller's own key row should exist under its fingerprint");
    assert.ok(self.count > 0, "the caller's own key should have a positive count");
    assert.notEqual(self.maskedKey, VALID_KEY);
    assert.ok(!self.maskedKey.includes(VALID_KEY), "masked key must not contain the raw key");
    assert.equal(self.limited, self.count > self.max);
    assert.ok(self.remaining >= 0);
    assert.ok(typeof self.lastIp === "string", "last-IP tracking should record the caller");
    assert.ok(self.lastSeenAt, "lastSeenAt should be set for a consumer that was seen");
    // Fingerprint is stable across requests: matches the sha256(key) prefix.
    assert.equal(self.keyId, expectedId);
  }
);

test("GET /admin rejects a non-admin account with 403", async () => {
  const token = await loginAs(
    process.env.TEST_MEMBER_EMAIL || "sofia.ramirez@campus.edu",
    process.env.TEST_MEMBER_PASSWORD || "campushub123"
  );
  if (!token) return; // seed logins not set up on this machine

  const res = await apiGet("/admin", { ...withValidKey, Authorization: `Bearer ${token}` });
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.match(body.error, /Tier 1/i);
});
