import "dotenv/config";
import express from "express";
// Express 4 doesn't catch rejected async route handlers, so any thrown DB
// error (e.g. a FK violation from a bad clubId) used to escape the router,
// go unhandled and crash the whole server. This tiny shim simply routes
// async rejections into Express's normal error chain, which is what our
// JSON 500 handler below assumes.
import "express-async-errors";
import cors from "cors";
import { assertDbConnection } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { adminRequestsRouter } from "./routes/adminRequests.js";
import { clubsRouter } from "./routes/clubs.js";
import { eventsRouter } from "./routes/events.js";
import { signupsRouter } from "./routes/signups.js";
import { requireApiKey, validApiKeyCount } from "./middleware/apiKey.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { createAdminRouter } from "./routes/admin.js";
import { commentsRouter } from "./routes/comments.js";
import { announcementsRouter } from "./routes/announcements.js";
import { partnerRouter } from "./routes/partner.js"; // NEW: Team 6 AgroConnect integration

const app = express();

app.use(cors());
app.use(express.json());

// Week 9 (Part B) — the only endpoint left without an API key. It
// reveals no data and exists so external uptime checks (and partners
// checking we're alive before spending their quota) get a cheap answer.
// Registered BEFORE the auth middleware, which is what exempts it.
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Every other endpoint requires a valid consumer key ...
app.use(requireApiKey);

// ... and no consumer may exceed its rate limit (Week 9 Part C).
// 100 requests per consumer per 60 seconds — see SECURITY_AUDIT.md.
// The limiter instance is kept so GET /api/admin can read its stats.
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.RATE_LIMIT_MAX || 100),
});
app.use(limiter);

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/admin-requests", adminRequestsRouter);
app.use("/api/clubs", clubsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/signups", signupsRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/announcements", announcementsRouter);
app.use("/api/partner", partnerRouter); // NEW: calls the partner's API from our server
app.use("/api/admin", createAdminRouter(limiter));

// Week 9 (Part D) fix: unknown URLs used to return Express's default HTML
// 404 page, which leaks what framework/version the server runs and
// contradicted our "all responses are JSON" promise. Now a clean JSON 404.
app.use((req, res) => {
  res.status(404).json({ error: "Not found." });
});

// Centralized error handler so a thrown/rejected error in any route
// returns clean JSON instead of an HTML stack trace or a hung request.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

const PORT = process.env.PORT || 5000;
app.use(cors({ origin: "https://effortless-shortbread-2ec7ef.netlify.app" }));
assertDbConnection()
  .then(() => {
    app.listen(PORT, () => {
      const publicUrl = process.env.PUBLIC_URL;
      console.log(`CampusHub API listening on port ${PORT}`);
      // Log the COUNT of loaded keys at startup — never the keys themselves.
      console.log(`API keys loaded: ${validApiKeyCount()}`);
      if (validApiKeyCount() === 0) {
        console.warn(
          "No API keys configured (set API_KEYS in server/.env) — every request will get 401."
        );
      }
      console.log(
        `Rate limit: ${process.env.RATE_LIMIT_MAX || 100} requests per ${process.env.RATE_LIMIT_WINDOW_MS || 60000} ms per key`
      );
      if (publicUrl) console.log(`Public URL: ${publicUrl}/api`);
    });
  })
  .catch((err) => {
    console.error("\nCouldn't connect to MySQL. Is XAMPP's MySQL running,");
    console.error("and does server/.env match your setup?\n");
    console.error(err.message);
    process.exit(1);
  });
