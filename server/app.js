import "dotenv/config";
import express from "express";
// Express 4 doesn't catch rejected async route handlers, so any thrown DB
// error (e.g. a FK violation from a bad clubId) used to escape the router,
// go unhandled and crash the whole server. This tiny shim simply routes
// async rejections into Express's normal error chain, which is what our
// JSON 500 handler below assumes.
import "express-async-errors";
import cors from "cors";
import { v1Router } from "./v1.js";
import { v2Router } from "./v2.js";
import { apiGuards } from "./middleware/apiGuards.js";
import { monitor, statsHandler } from "./monitoring.js"; // Week 12 (Parts B & C): logging + stats

// The app is built here and exported WITHOUT listening, so tests can import
// it and drive it with supertest (Week 13 requires that for the version
// tests). server.js is the only file that calls listen().
export const app = express();

// Week 12 (Part B): request logging. Registered FIRST so rejected requests
// (401, 429) are logged too. One JSON line per request — see monitoring.js.
app.use(monitor);

// Browser origins allowed to call the API. Server-to-server callers (our
// partner, curl, the test suites) send no Origin header and are unaffected.
// Set CORS_ORIGINS as a comma-separated list; "*" allows any browser origin.
//
// This replaces two earlier middlewares — an unconditional cors() plus a
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

// Week 9 (Part B) — the only endpoint left without an API key. It
// reveals no data and exists so external uptime checks (and partners
// checking we're alive before spending their quota) get a cheap answer.
// Registered BEFORE the auth middleware, which is what exempts it.
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Week 12 (Part C): the /stats endpoint. After the key check on purpose —
// it needs a key like every other endpoint. Unversioned: it reports on the
// server, not on one API shape, and it is how you answer "who still calls v1?".
app.get("/api/stats", ...apiGuards, statsHandler);

// Week 13 (Part B): both versions run side by side.
//
//   1. /api/v1/...  the old version, still running, now announcing its sunset
//   2. /api/v2/...  the new version
//   3. /api/...     old URLs with no version, pointed at v1
//
// Order matters. v2 is mounted before the unversioned mount so /api/v2 is not
// swallowed by the catch-all v1 mount, and both are below the key check —
// the guards live per route inside each router (see middleware/apiGuards.js),
// so /api/v2/events needs an API key exactly like /api/events does.
//
// The last mount is the one people forget: our downstream partner calls
// /api/events today. Mounting v1 only at /api/v1 would have broken them the
// moment this deployed, with no warning — the exact thing versioning exists
// to prevent.
app.use("/api/v1", v1Router);
app.use("/api/v2", v2Router);
app.use("/api", v1Router);

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
