// traffic.js: sends a mix of requests to your API, to give you data.
// Run: API=http://localhost:5000 KEY=<your-key> node traffic.js
// Adapt the paths in `mix` to your own API.
const API = process.env.API || "http://localhost:5000";
const KEY = process.env.KEY;
const N = Number(process.env.N || 60);

const mix = [
  // Good reads — our most-used endpoints
  { method: "GET", path: "/api/events", key: true },
  { method: "GET", path: "/api/events", key: true },
  { method: "GET", path: "/api/clubs", key: true },

  // Id group — two different ids map to the same route pattern row in /stats.
  // With CampusHub's route that means GET /api/signups/event/:eventId.
  { method: "GET", path: "/api/signups/event/event-05", key: true },
  { method: "GET", path: "/api/signups/event/event-13", key: true },

  // No key at all — should be a 401, and should be logged with caller none.
  { method: "GET", path: "/api/events", key: false },

  // A path that does not exist at all — 404, and should land in the
  // (no route) row of /stats.
  { method: "GET", path: "/api/not-a-route", key: true },

  // A query string on a real route. The path logged must be the route only
  // (no query string), so /api/clubs?status=open and /api/clubs share a row.
  { method: "GET", path: "/api/clubs?status=open", key: true },
];

// Note: GET /api/events/:id does not exist on this API (no single-event read),
// so there is no "missing id" slot here. Id-grouping is shown instead with the
// two signup-by-event paths above.

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const counts = {};
  for (let i = 0; i < N; i++) {
    const r = mix[Math.floor(Math.random() * mix.length)];
    try {
      const res = await fetch(API + r.path, {
        method: r.method,
        headers: r.key ? { "X-API-Key": KEY } : {},
      });
      counts[res.status] = (counts[res.status] || 0) + 1;
    } catch (err) {
      counts.failed = (counts.failed || 0) + 1;
    }
    await pause(50);
  }
  console.log("Status codes received:", counts);
})();
