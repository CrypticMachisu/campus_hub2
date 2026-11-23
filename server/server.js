import "dotenv/config";
import { app } from "./app.js";
import { isV1Retired } from "./v1.js";
import { assertDbConnection, pool } from "./db.js";
import { validApiKeyCount } from "./middleware/apiKey.js";
import { mediaStorage } from "./storage.js";
import { startReminderScheduler } from "./reminders.js";
import { startMediaCleanupScheduler } from "./mediaCleanup.js";

// server.js only starts things. The routes, middleware and the two API
// versions live in app.js, which is exported without listening so the test
// suite can import it (see __tests__/versions.test.js).

const PORT = process.env.PORT || 5000;
assertDbConnection()
  .then(() => {
    const server = app.listen(PORT, () => {
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
      console.log(
        mediaStorage.enabled
          ? "Post photos: on (S3-compatible storage configured)"
          : "Post photos: off (set R2/S3 storage variables in server/.env to enable)"
      );
      if (publicUrl) console.log(`Public URL: ${publicUrl}/api`);
      startReminderScheduler();
      startMediaCleanupScheduler();
      // Same line every time until the sunset; after it, say plainly that v1
      // is gone, because that is now the server's behaviour and not a plan.
      console.log(
        isV1Retired()
          ? "API versions: /api/v2 (current); v1 retired at its 2026-11-30 sunset and now answers 404"
          : "API versions: /api/v2 (current) and /api/v1 = /api (deprecated, sunsets 2026-11-30)"
      );
    });

    // Containers send SIGTERM on deploy/restart. Stop accepting new requests,
    // let in-flight ones finish, then close the pool so MySQL is not left with
    // half-dead connections. The force timer prevents a stuck request from
    // blocking a deploy forever.
    let shuttingDown = false;
    async function shutdown(signal) {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`${signal} received; shutting down`);
      const force = setTimeout(() => process.exit(1), 10_000);
      force.unref();
      server.close(async (error) => {
        try {
          await pool.end();
        } finally {
          clearTimeout(force);
          process.exit(error ? 1 : 0);
        }
      });
    }
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((err) => {
    console.error("\nCouldn't connect to MySQL. Is XAMPP's MySQL running,");
    console.error("and does server/.env match your setup?\n");
    console.error(err.message);
    process.exit(1);
  });
