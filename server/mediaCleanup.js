// Remove photo uploads that were reserved but never published.
//
// A pending row is created before the browser uploads, then attached to a post
// within the hour. Anything still pending after a day cannot be attached (the
// publish route rejects reservations older than one hour), so it is safe to
// delete the object and its row. The sweep is bounded and idempotent: a failed
// bucket delete leaves the row for the next pass, and deleting an object twice
// is harmless.
import { pool } from "./db.js";
import { mediaStorage } from "./storage.js";

export const DEFAULT_MEDIA_PURGE_HOURS = 24;
const MAX_PER_SWEEP = 200;
const SWEEP_INTERVAL_MS = 6 * 60 * 60_000;

function purgeHoursFromEnv() {
  const value = Number(process.env.MEDIA_PURGE_HOURS || DEFAULT_MEDIA_PURGE_HOURS);
  return Number.isFinite(value) && value >= 1 && value <= 24 * 30
    ? value
    : DEFAULT_MEDIA_PURGE_HOURS;
}

/**
 * One purge pass. Returns counts so the scheduler and tests can assert what
 * happened without scraping logs. With storage disabled the rows are left
 * alone: deleting them would lose the only pointer to an object that cannot be
 * removed from the bucket.
 */
export async function runMediaPurge({
  olderThanHours = DEFAULT_MEDIA_PURGE_HOURS,
  storage = mediaStorage,
} = {}) {
  if (!storage.enabled) {
    return { removed: 0, failed: 0, reason: "storage-disabled" };
  }

  const hours = Number(olderThanHours);
  if (!Number.isFinite(hours) || hours < 1 || hours > 24 * 30) {
    throw new Error("Media purge age must be between 1 hour and 30 days.");
  }

  const [rows] = await pool.query(
    `SELECT media_id, storage_key
     FROM post_media
     WHERE status = 'pending' AND post_id IS NULL
       AND created_at < DATE_SUB(NOW(), INTERVAL :hours HOUR)
     ORDER BY created_at ASC
     LIMIT ${MAX_PER_SWEEP}`,
    { hours }
  );

  let removed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      // Remove the object first. If this fails, the row stays and the next
      // sweep retries; a row without an object is worse than a no-op delete.
      await storage.remove(row.storage_key);
      await pool.query(
        `DELETE FROM post_media
         WHERE media_id = :mediaId AND status = 'pending' AND post_id IS NULL`,
        { mediaId: row.media_id }
      );
      removed += 1;
    } catch (err) {
      failed += 1;
      console.error(`Could not purge abandoned photo ${row.media_id}:`, err.message);
    }
  }

  return { removed, failed, reason: null };
}

/**
 * Run the purge now and every six hours. Started from server.js only. The
 * timers are unref'd so they never keep a test process alive.
 */
export function startMediaCleanupScheduler() {
  if (!mediaStorage.enabled) {
    console.log("Photo cleanup: off (photo storage is off)");
    return null;
  }
  if (process.env.MEDIA_CLEANUP === "off") {
    console.log("Photo cleanup: off (MEDIA_CLEANUP=off)");
    return null;
  }

  const hours = purgeHoursFromEnv();
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const result = await runMediaPurge({ olderThanHours: hours });
      if (result.removed || result.failed) {
        console.log(`Photo cleanup: ${result.removed} removed, ${result.failed} failed`);
      }
    } catch (err) {
      console.error("Photo cleanup sweep failed:", err.message);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(tick, SWEEP_INTERVAL_MS);
  timer.unref();
  const first = setTimeout(tick, 30_000);
  first.unref();
  console.log(`Photo cleanup: abandoned uploads older than ${hours}h, every 6h`);
  return timer;
}
