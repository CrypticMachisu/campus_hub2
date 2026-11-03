// Week 12 (Part B): request logging.
//
// One JSON line per request: time, method, path, status, response time,
// and a caller label. Registered FIRST in server.js so rejected requests
// (401, 429) are logged too — those are exactly the ones to see later.
//
// Never logged: API keys or tokens (req.path, not req.originalUrl, so no
// query strings), passwords, request or response bodies.
import crypto from "crypto";

const round = (n) => Math.round(n * 10) / 10;

// A label for who called, without ever writing the key itself.
function who(req) {
  if (!req.apiKey) return "none";
  const hash = crypto.createHash("sha256").update(req.apiKey).digest("hex");
  return "key-" + hash.slice(0, 6);
}

// Week 12 (Part C): running totals. Where the log says what happened,
// stats say how much — counts, errors, and response times. In-memory
// only: they reset on restart and do not survive several server copies.
const stats = {
  startedAt: new Date().toISOString(),
  total: 0,
  clientErrors: 0, // 4xx: usually the caller's mistake
  serverErrors: 0, // 5xx: our fault
  totalMs: 0,
  routes: {},
};

function newRoute() {
  return { count: 0, clientErrors: 0, serverErrors: 0, totalMs: 0, maxMs: 0 };
}

function monitor(req, res, next) {
  const start = process.hrtime.bigint();

  // Capture the path NOW, while this middleware runs first in the chain.
  // Express 4 mutates req.url while a mounted router processes (e.g.
  // /api/clubs trims down to "/"), and it stays trimmed after a handler
  // responds without calling next() — so req.path read at 'finish' time
  // would log the mount remainder, not the URL the caller sent.
  const path = req.path; // path only: no query string even now

  res.on("finish", () => {
    // after the response has gone out, so status and timing are final
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(
      JSON.stringify({
        time: new Date().toISOString(),
        method: req.method,
        path: path, // captured at request start (see comment above)
        status: res.statusCode,
        ms: round(ms),
        caller: who(req),
      })
    );

    // Week 12 (Part C): update the totals for every finished request.
    // Grouped by route pattern: /api/clubs/club-1 and /api/clubs/club-2
    // both become GET /api/clubs/:id-family rows, keyed by req.route.path.
    const route = req.route ? req.baseUrl + req.route.path : "(no route)";
    const label = `${req.method} ${route}`;
    const r = stats.routes[label] || newRoute();
    stats.routes[label] = r;
    stats.total += 1;
    stats.totalMs += ms;
    r.count += 1;
    r.totalMs += ms;
    r.maxMs = Math.max(r.maxMs, ms);
    if (res.statusCode >= 500) {
      stats.serverErrors += 1;
      r.serverErrors += 1;
    } else if (res.statusCode >= 400) {
      stats.clientErrors += 1;
      r.clientErrors += 1;
    }
  });
  next();
}

// Week 12 (Part C): serves the running totals. Registered after the key
// check in server.js, so it needs a key like everything else.
function statsHandler(req, res) {
  const routes = {};
  for (const [label, r] of Object.entries(stats.routes)) {
    routes[label] = {
      count: r.count,
      clientErrors: r.clientErrors,
      serverErrors: r.serverErrors,
      avgMs: round(r.totalMs / r.count),
      maxMs: round(r.maxMs),
    };
  }
  const rate = stats.total ? (stats.serverErrors / stats.total) * 100 : 0;
  const avg = stats.total ? stats.totalMs / stats.total : 0;
  res.json({
    startedAt: stats.startedAt,
    uptimeSeconds: Math.round(process.uptime()),
    total: stats.total,
    clientErrors: stats.clientErrors,
    serverErrors: stats.serverErrors,
    errorRatePercent: round(rate),
    avgMs: round(avg),
    routes,
  });
}

export { monitor, statsHandler };
