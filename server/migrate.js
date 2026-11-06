#!/usr/bin/env node
// Applies the SQL files in server/migrations in filename order and records each
// one in a `schema_migrations` table, so a database knows what it has already
// had. Before this existed, applying migrations was a human remembering to pipe
// the right files in the right order — and the files are not re-runnable
// (ALTER TABLE ... ADD COLUMN has no IF NOT EXISTS in MySQL).
//
//   npm run migrate            apply every pending migration
//   npm run migrate:status     list applied + pending, change nothing
//   npm run migrate:baseline   record every file as applied WITHOUT running it
//
// Baseline is for two cases only: a database built before tracking existed, and
// a fresh install from server/campushub_database.sql (which already contains
// everything the migrations add). It refuses to run once tracking has rows, so
// it can't silently skip real work.
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
const args = new Set(process.argv.slice(2));
const statusOnly = args.has("--status");
const baseline = args.has("--baseline");

const DB_LABEL = `${process.env.DB_NAME || "campushub"} @ ${process.env.DB_HOST || "127.0.0.1"}`;

function connectionOptions(multipleStatements = false) {
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "campushub",
    multipleStatements,
  };
}

/**
 * Every .sql file, sorted by name, with a guard against two files sharing the
 * same number — two migrations numbered 003 made the order ambiguous, and the
 * sort only worked by luck.
 */
async function loadMigrationFiles() {
  const names = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
  const byNumber = new Map();

  for (const name of names) {
    const match = /^(\d+)_/.exec(name);
    if (!match) {
      throw new Error(`Migration "${name}" must start with a number, e.g. 008_add_thing.sql.`);
    }
    if (byNumber.has(match[1])) {
      throw new Error(
        `Duplicate migration number ${match[1]}: "${byNumber.get(match[1])}" and "${name}". ` +
          "Renumber one so the apply order is unambiguous."
      );
    }
    byNumber.set(match[1], name);
  }

  return names;
}

async function main() {
  const files = await loadMigrationFiles();

  const conn = await mysql.createConnection(connectionOptions(!statusOnly && !baseline));

  try {
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename   VARCHAR(200) PRIMARY KEY,
         applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
       ) ENGINE=InnoDB`
    );

    const [appliedRows] = await conn.query("SELECT filename, applied_at FROM schema_migrations");
    const applied = new Map(appliedRows.map((row) => [row.filename, row.applied_at]));
    const pending = files.filter((name) => !applied.has(name));

    if (statusOnly) {
      console.log(`Migrations for ${DB_LABEL}`);
      for (const name of files) {
        const when = applied.get(name);
        console.log(
          `  ${when ? "applied" : "PENDING"}  ${name}${when ? `  (${when.toISOString()})` : ""}`
        );
      }
      console.log(`${applied.size} applied, ${pending.length} pending.`);
      return;
    }

    if (baseline) {
      if (applied.size > 0) {
        throw new Error(
          `schema_migrations already has ${applied.size} row(s). Baseline is only for a database ` +
            "with no migration history — use `npm run migrate` instead."
        );
      }
      for (const name of files) {
        // Positional placeholders: this connection doesn't set namedPlaceholders.
        await conn.query("INSERT INTO schema_migrations (filename) VALUES (?)", [name]);
      }
      console.log(`Baselined ${files.length} migrations on ${DB_LABEL} (recorded, not run).`);
      return;
    }

    if (pending.length === 0) {
      console.log(`Up to date: ${files.length} migrations already applied to ${DB_LABEL}.`);
      return;
    }

    for (const name of pending) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, name), "utf8");
      console.log(`Applying ${name}…`);
      try {
        await conn.query(sql);
      } catch (err) {
        console.error(`\nFailed on ${name}: ${err.message}`);
        console.error(
          "Nothing was recorded for this file. Fix it, or restore the database, then re-run."
        );
        process.exitCode = 1;
        return;
      }
      await conn.query("INSERT INTO schema_migrations (filename) VALUES (?)", [name]);
      console.log(`  applied ${name}`);
    }

    console.log(`Done: applied ${pending.length} migration(s) to ${DB_LABEL}.`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
