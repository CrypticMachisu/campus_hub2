// Week 13 (Part C): v1 is frozen, v2 has the new shape, only v1 announces
// the sunset.
//
// Runs without MySQL: the events handlers read from the pool, so this suite
// replaces pool.query with the rows the real query would return. Everything
// else is the real thing — the app, both mounts, the key check, the rate
// limiter, the deprecation middleware and the response shaping.
//
//   cd server && node --test tests/versions.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

process.env.API_KEYS = "test-key";
const KEY = { "X-API-Key": "test-key" };

const { app } = await import("../app.js");
const { pool } = await import("../db.js");

// What EVENT_LIST_QUERY returns for two seeded events.
const ROWS = [
  {
    event_id: "event-01",
    club_id: "club-01",
    title: "River Trail 5K",
    description: "A social 5K along the river trail.",
    category_name: "Sports & Fitness",
    event_date: "2026-11-02",
    event_time: "06:30:00",
    location: "Rec Center steps",
    image_url: null,
    bring_note: null,
    capacity: null,
    signup_count: "3",
  },
  {
    event_id: "event-02",
    club_id: "club-02",
    title: "Book Lab Room",
    description: "Reserve the lab for project night.",
    category_name: "Academic",
    event_date: "2026-11-05",
    event_time: "18:00:00",
    location: "Engineering Building, Lab 108",
    image_url: "https://example.invalid/poster.png",
    bring_note: "Laptop",
    capacity: "40",
    signup_count: "7",
  },
];

pool.query = async () => [ROWS];

let server;
let base;

const get = (path, headers = KEY) => fetch(`${base}${path}`, { headers });

before(async () => {
  server = app.listen(0);
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => {
  server.close();
  pool.end();
});

const V1_KEYS = [
  "id",
  "clubId",
  "title",
  "description",
  "category",
  "date",
  "time",
  "location",
  "imageUrl",
  "bringNote",
  "capacity",
  "signupCount",
  "isSeed",
].sort();

const V2_KEYS = [...V1_KEYS.filter((k) => k !== "date" && k !== "time"), "startTime"].sort();

test("v1 keeps the old event shape: date + time, no startTime", async () => {
  const res = await get("/v1/events");
  assert.equal(res.status, 200);

  const { events } = await res.json();
  assert.ok(Array.isArray(events), "v1 still uses the { events: [...] } envelope");
  assert.equal(events.length, 2);

  const first = events[0];
  assert.deepEqual(Object.keys(first).sort(), V1_KEYS, "v1's field set must not drift");
  assert.equal(first.date, "2026-11-02");
  assert.equal(first.time, "06:30");
  assert.equal("startTime" in first, false);
});

test("the old unversioned /api/events answers exactly like /api/v1/events", async () => {
  const [v1, old] = await Promise.all([get("/v1/events"), get("/events")]);
  assert.equal(old.status, 200);
  assert.deepEqual(await old.json(), await v1.json());
});

test("v2 returns one ISO startTime instead of date and time", async () => {
  const res = await get("/v2/events");
  assert.equal(res.status, 200);

  const { events } = await res.json();
  assert.ok(Array.isArray(events));
  assert.equal(events.length, 2);

  const first = events[0];
  assert.deepEqual(Object.keys(first).sort(), V2_KEYS);
  assert.equal(first.startTime, "2026-11-02T06:30:00+03:00");
  assert.equal(Number.isNaN(Date.parse(first.startTime)), false, "startTime must parse as a date");
  assert.equal("date" in first, false, "date is gone in v2");
  assert.equal("time" in first, false, "time is gone in v2");

  // Everything that is not the timed representation is unchanged.
  assert.equal(first.id, "event-01");
  assert.equal(first.clubId, "club-01");
  assert.equal(first.title, "River Trail 5K");
  assert.equal(first.signupCount, 3);
  assert.equal(first.isSeed, true);
  assert.equal(events[1].startTime, "2026-11-05T18:00:00+03:00");
  assert.equal(events[1].capacity, 40);
});

test("v2 needs an API key like every other endpoint", async () => {
  const res = await get("/v2/events", {});
  assert.equal(res.status, 401);

  const bad = await get("/v2/events", { "X-API-Key": "not-a-real-key" });
  assert.equal(bad.status, 401);
});

test("every v2 mount is behind the API key, like v1", async () => {
  const checks = [
    ["GET", "/v2/events"],
    ["GET", "/v2/clubs"],
    ["POST", "/v2/auth/login"],
    ["GET", "/v2/users"],
    ["GET", "/v2/partner/produce"],
  ];
  for (const [method, path] of checks) {
    const res = await fetch(`${base}${path}`, { method });
    assert.equal(res.status, 401, `${method} ${path} should require a key`);
  }
});

test("v1 and the old URLs announce the sunset; v2 and unknown paths do not", async () => {
  for (const path of ["/v1/events", "/events"]) {
    const res = await get(path);
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get("deprecation"), "true", path);
    assert.equal(res.headers.get("sunset"), "Mon, 30 Nov 2026 00:00:00 GMT", path);
    assert.match(res.headers.get("link"), /rel="successor-version"/, path);
  }

  for (const path of ["/v2/events", "/nope"]) {
    const res = await get(path);
    assert.equal(res.headers.get("deprecation"), null, `${path} must not be marked deprecated`);
    assert.equal(res.headers.get("sunset"), null, path);
  }
});

test("an empty list still comes back as { events: [] } in v2", async () => {
  pool.query = async () => [[]]; // no rows
  try {
    const res = await get("/v2/events");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { events: [] });
  } finally {
    pool.query = async () => [ROWS];
  }
});

test("unknown event subpaths still fall through to the JSON 404", async () => {
  for (const path of ["/events/not-a-route", "/v1/events/not-a-route", "/v2/events/not-a-route"]) {
    const res = await get(path, {}); // no key: unmatched, so no auth error
    assert.equal(res.status, 404, path);
    assert.equal((await res.json()).error, "Not found.", path);
  }
});
