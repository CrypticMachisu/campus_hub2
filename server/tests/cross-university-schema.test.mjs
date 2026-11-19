// The Phase 5 schema lands before its feature flag. This test proves the
// foundation exists without requiring the API routes to be mounted.
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../db.js";

test("cross-university schema: families, chapter links and family admins", async (t) => {
  t.after(async () => {
    await pool.end();
  });

  const [tableRows] = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN ('club_families', 'club_family_admins')`
  );
  const tables = tableRows.map((row) => row.table_name || row.TABLE_NAME);
  assert.ok(tables.includes("club_families"));
  assert.ok(tables.includes("club_family_admins"));

  const [columnRows] = await pool.query(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'clubs'
       AND column_name = 'family_id'`
  );
  const nullable = columnRows[0]?.is_nullable ?? columnRows[0]?.IS_NULLABLE;
  assert.equal(nullable, "YES", "existing clubs must keep a null family link");

  const [indexRows] = await pool.query(
    `SELECT index_name FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'clubs'
       AND index_name = 'uq_club_family_campus'`
  );
  assert.ok(indexRows.length >= 1, "family/campus unique index is missing");

  // The foundation is additive: deploying the migration does not invent a
  // family or attach the seeded Strathmore clubs to one.
  const [[families]] = await pool.query("SELECT COUNT(*) AS count FROM club_families");
  assert.equal(Number(families.count), 0);
  const [[linked]] = await pool.query(
    "SELECT COUNT(*) AS count FROM clubs WHERE family_id IS NOT NULL"
  );
  assert.equal(Number(linked.count), 0);

  const [audienceRows] = await pool.query(
    `SELECT table_name, column_default, is_nullable
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND column_name = 'audience'
       AND table_name IN ('events', 'posts', 'commitments')`
  );
  assert.equal(audienceRows.length, 3, "all portable content tables need an audience column");
  for (const row of audienceRows) {
    const table = row.table_name || row.TABLE_NAME;
    assert.equal(
      String(row.column_default ?? row.COLUMN_DEFAULT).replace(/^'|'$/g, ""),
      "campus",
      `${table}.audience defaults to campus`
    );
    assert.equal(row.is_nullable ?? row.IS_NULLABLE, "NO", `${table}.audience is required`);
  }
});
