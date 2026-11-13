import "dotenv/config";
import express from "express";
// Express 4 doesn't catch rejected async route handlers, so any thrown DB
// error (e.g. a FK violation from a bad clubId) used to escape the router,
// go unhandled and crash the whole server. This tiny shim simply routes
// async rejections into Express's normal error chain, which is what our
// JSON 500 handler below assumes.
import "express-async-errors";
import cors from "cors";
import { isV1Retired, v1Router } from "./v1.js";
import { v2Router } from "./v2.js";
import { apiGuards } from "./middleware/apiGuards.js";
import { monitor, statsHandler } from "./monitoring.js";
import { agroOpportunitiesRouter } from "./routes/agroOpportunities.js"; // Week 12 (Parts B & C): logging + stats

// The app is built here and exported WITHOUT listening, so tests can import
// it and drive it with supertest (Week 13 requires that for the version
// tests). server.js is the only file that calls listen().
//  // `now` is a clock function so a test can stand on either side of the sunset
// without waiting for it (see __tests__/versions.test.js). Nothing else
// passes it, and the default reads the real clock on every request.
export function createApp({ now = () => new Date() } = {}) {
  const app = express();

  // Week 12 (Part B): request logging. Registered FIRST so rejected requests
  // (401, 429) are logged too. One JSON line per request â€” see monitoring.js.
  app.use(monitor);

  // Browser origins allowed to call the API. Server-to-server callers (our
  // partner, curl, the test suites) send no Origin header and are unaffected.
  // Set CORS_ORIGINS as a comma-separated list; "*" allows any browser origin.
  //
  // This replaces two earlier middlewares â€” an unconditional cors() plus a
  // second one pinned to a single deployment URL. Together they sent duplicate
  // ACAO headers for that one origin and allowed every other origin anyway.
  const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
    })
  );
  app.use(express.json());

  // Week 9 (Part B) â€” the only endpoint left without an API key. It
  // reveals no data and exists so external uptime checks (and partners
  // checking we're alive before spending their quota) get a cheap answer.
  // Registered BEFORE the auth middleware, which is what exempts it.
  app.get("/api/health", (req, res) => res.json({ ok: true }));

  // Week 12 (Part C): the /stats endpoint. After the key check on purpose â€”
  // it needs a key like every other endpoint. Unversioned: it reports on the
  // server, not on one API shape, and it is how you answer "who still calls v1?".
  app.get("/api/stats", ...apiGuards, statsHandler);

  // Week 13 (Part B): both versions run side by side.
  //
  //   1. /api/v2/...  the new version
  //   2. /api/v1/...  the old version, until its sunset
  //   3. /api/...     old URLs with no version, pointed at v1
  //
  // Order matters. v2 is mounted before the unversioned mount so /api/v2 is not
  // swallowed by the catch-all v1 mount, and both are below the key check â€”
  // the guards live per route inside each router (see middleware/apiGuards.js),
  // so /api/v2/events needs an API key exactly like /api/events does.
  //
  // The last mount is the one people forget: our downstream partner calls
  // /api/events today. Mounting v1 only at /api/v1 would have broken them the
  // moment this deployed, with no warning â€” the exact thing versioning exists
  // to prevent.
  app.use("/api/v2", v2Router);

  // Week 13 follow-up: the sunset enforces itself. This sits in front of the
  // v1 mounts and reads the clock on every request, so from 2026-11-30T00:00:00Z
  // the old events paths answer `404 {"error":"Not found."}` â€” the exact status
  // and body DEPRECATION_NOTICE.md promises â€” even in a process that started
  // before the date. Nobody has to delete a mount, and a long-running server
  // cannot outlive its own notice.
  //
  // Scoped to /events on purpose: the notice retires the events endpoints, and
  // says the other resources are unchanged. Killing every unversioned path here
  // would break `/api/clubs` for a caller who read the notice literally, which
  // is the failure this week is about.
  app.use(["/api/events", "/api/v1/events"], (req, res, next) => {
    if (!isV1Retired(now())) return next();
    res.status(404).json({ error: "Not found." });
  });

  app.use("/api/v1", v1Router);
  app.use("/api", v1Router);
  app.use("/api/agro-opportunities", agroOpportunitiesRouter);

  // Week 9 (Part D) fix: unknown URLs used to return Express's default HTML
  // 404 page, which leaks what framework/version the server runs and
  // contradicted our "all responses are JSON" promise. Now a clean JSON 404.
  app.use((req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  // Centralized error handler so a thrown/rejected error in any route
  // returns clean JSON instead of an HTML stack trace or a hung request.
  app.use((err, req, res, next) => {
    // Malformed request bodies are a client error, not a server failure.
    // Express marks JSON parser failures with this type.
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Invalid JSON body." });
    }

    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server." });
  });

  return app;
}

export const app = createApp();
