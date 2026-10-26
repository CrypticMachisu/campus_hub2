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
const VALID_KEY = (process.env.API_KEYS || "").split(",").map((k) => k.trim()).filter(Boolean)[0];

if (!VALID_KEY) {
  console.error("No API key found. Generate one and set API_KEYS in server/.env, then restart the server.");
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

test("Rate limiting: bursting past the limit returns 429 with Retry-After and a JSON body", { timeout: 120_000 }, async () => {
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
  assert.ok(codes.length > 0, `a valid key should get 200s first (got a 429 after ${codes.length} allowed requests — was the window already full?)`);
  assert.ok(saw429, "expected a 429 once the limit was exceeded");

  assert.equal(saw429.headers.get("Retry-After"), String(Number(saw429.headers.get("Retry-After"))));
  assert.ok(Number(saw429.headers.get("Retry-After")) > 0);
  const body = await saw429.json();
  assert.equal(typeof body.error, "string"); // JSON body, not HTML
});
