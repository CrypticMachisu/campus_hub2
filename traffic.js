// traffic.js: sends a mix of requests to the CampusHub API, to give it data.
// Run: API=http://localhost:5000 KEY=<your-key> node traffic.js
//
// The mix is deliberately imperfect — valid calls, calls that need a login,
// one with no key at all, one path that was never routed, and a query string
// the log must not keep. Raise the volume with N=200 to trip the Week 9 rate
// limit on purpose.
//
// Note: CampusHub has no GET /api/events/:id (only list, POST, PUT and
// DELETE), so the two "same pattern, different id" calls use the signups
// route instead: both land in one GET /api/signups/event/:eventId row.
const API = process.env.API || "http://localhost:5000";
const KEY = process.env.KEY;
const N = Number(process.env.N || 60);

const mix = [
  { method: "GET", path: "/api/events", key: true },
  { method: "GET", path: "/api/events", key: true },
  { method: "GET", path: "/api/clubs", key: true },
  { method: "GET", path: "/api/signups/event/event-05", key: true }, // needs a login
  { method: "GET", path: "/api/signups/event/event-13", key: true }, // same route pattern
  { method: "GET", path: "/api/events", key: false }, // no key at all
  { method: "GET", path: "/api/not-a-route", key: true }, // no such path
  { method: "GET", path: "/api/comments?targetType=club&targetId=club-07", key: true }, // query string
];

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  if (!KEY) {
    console.error("Set KEY to an API key from server/.env (API_KEYS).");
    process.exit(1);
  }
  const counts = {};
  for (let i = 0; i < N; i += 1) {
    const request = mix[Math.floor(Math.random() * mix.length)];
    try {
      const res = await fetch(API + request.path, {
        method: request.method,
        headers: request.key ? { "X-API-Key": KEY } : {},
      });
      counts[res.status] = (counts[res.status] || 0) + 1;
    } catch {
      counts.failed = (counts.failed || 0) + 1;
    }
    await pause(50);
  }
  console.log("Status codes received:", counts);
})();
