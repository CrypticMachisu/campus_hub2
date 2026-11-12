// Week 13 (Part C): v1 is frozen, v2 has the new shape, only v1 announces the
// sunset.
//
// Runs without MySQL: the events handlers read from the pool, so this suite
// replaces pool.query with the rows the real query would return. Everything
// else is the real thing — the app, both mounts, the key check, the rate
// limiter, the deprecation middleware and the response shaping.
//
//   npx jest
//
// Ported from server/tests/versions.test.mjs to Jest + supertest, as the
// handout asks, keeping every assertion. Babel compiles this file and the
// server's ESM sources to CommonJS (see babel.config.cjs).
process.env.API_KEYS = "test-key"; // read per request, so hoisted imports are fine

import request from "supertest";
import { app } from "../server/app.js";
import { pool } from "../server/db.js";

const KEY = { "X-API-Key": "test-key" };

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

const eventRows = () => [ROWS];

beforeEach(() => {
  pool.query = async () => eventRows();
});

afterAll(async () => {
  await pool.end();
});

// supertest drives the app directly, so requests need the /api prefix that a
// caller would send over HTTP.
const get = (path, headers = KEY) => request(app).get(`/api${path}`).set(headers);

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

describe("v1 is frozen", () => {
  test("v1 keeps the old event shape: date + time, no startTime", async () => {
    const res = await get("/v1/events");
    expect(res.status).toBe(200);

    const { events } = res.body;
    expect(Array.isArray(events)).toBe(true);
    expect(events).toHaveLength(2);

    const first = events[0];
    expect(Object.keys(first).sort()).toEqual(V1_KEYS); // v1's field set must not drift
    expect(first.date).toBe("2026-11-02");
    expect(first.time).toBe("06:30");
    expect("startTime" in first).toBe(false);
  });

  test("the old unversioned /api/events answers exactly like /api/v1/events", async () => {
    const [v1, old] = await Promise.all([get("/v1/events"), get("/events")]);
    expect(old.status).toBe(200);
    expect(old.body).toEqual(v1.body);
  });
});

describe("v2 has the new shape", () => {
  test("v2 returns one ISO startTime instead of date and time", async () => {
    const res = await get("/v2/events");
    expect(res.status).toBe(200);

    const { events } = res.body;
    expect(Array.isArray(events)).toBe(true);
    expect(events).toHaveLength(2);

    const first = events[0];
    expect(Object.keys(first).sort()).toEqual(V2_KEYS);
    expect(first.startTime).toBe("2026-11-02T06:30:00+03:00");
    expect(Number.isNaN(Date.parse(first.startTime))).toBe(false);
    expect("date" in first).toBe(false); // date is gone in v2
    expect("time" in first).toBe(false); // time is gone in v2

    // Everything that is not the timed representation is unchanged.
    expect(first.id).toBe("event-01");
    expect(first.clubId).toBe("club-01");
    expect(first.title).toBe("River Trail 5K");
    expect(first.signupCount).toBe(3);
    expect(first.isSeed).toBe(true);
    expect(events[1].startTime).toBe("2026-11-05T18:00:00+03:00");
    expect(events[1].capacity).toBe(40);
  });

  test("an empty list still comes back as { events: [] } in v2", async () => {
    pool.query = async () => [[]];
    const res = await get("/v2/events");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ events: [] });
  });
});

describe("v2 needs an API key like every other endpoint", () => {
  test("v2 rejects a missing or wrong key", async () => {
    expect((await get("/v2/events", {})).status).toBe(401);
    expect((await get("/v2/events", { "X-API-Key": "not-a-real-key" })).status).toBe(401);
  });

  test("every v2 mount is behind the API key, like v1", async () => {
    const checks = [
      ["get", "/v2/events"],
      ["get", "/v2/clubs"],
      ["post", "/v2/auth/login"],
      ["get", "/v2/users"],
      ["get", "/v2/partner/produce"],
    ];
    for (const [method, path] of checks) {
      const res = await request(app)[method](`/api${path}`);
      expect(res.status).toBe(401);
    }
  });
});

describe("deprecation headers", () => {
  test("v1 and the old URLs announce the sunset; v2 and unknown paths do not", async () => {
    for (const path of ["/v1/events", "/events"]) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(res.headers.deprecation).toBe("true");
      expect(res.headers.sunset).toBe("Mon, 30 Nov 2026 00:00:00 GMT");
      expect(res.headers.link).toContain('rel="successor-version"');
    }

    for (const path of ["/v2/events", "/nope"]) {
      const res = await get(path);
      expect(res.headers.deprecation).toBeUndefined();
      expect(res.headers.sunset).toBeUndefined();
    }
  });

  test("v1 and v2 return the same error body, so callers' error handling survives", async () => {
    const post = (path) =>
      request(app).post(`/api${path}`).set(KEY).set("Content-Type", "application/json").send("{}");

    const [v1, v2] = await Promise.all([post("/v1/events"), post("/v2/events")]);
    expect(v1.status).toBe(401); // a write without a session is rejected in v1
    expect(v2.status).toBe(v1.status); // v2 must reject it the same way
    expect(typeof v1.body.error).toBe("string");
    expect(v2.body).toEqual(v1.body); // the error envelope is not versioned
  });
});

describe("routing", () => {
  test("unknown event subpaths still fall through to the JSON 404", async () => {
    for (const path of [
      "/events/not-a-route",
      "/v1/events/not-a-route",
      "/v2/events/not-a-route",
    ]) {
      const res = await get(path, {}); // no key: unmatched, so no auth error
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Not found.");
    }
  });
});
