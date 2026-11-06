// Tests for server/migrate.js.
//
// These run the real CLI in a child process against a throwaway database, with
// MIGRATIONS_DIR pointed at fixture folders. That matters: an earlier manual
// check pointed the runner at the live database and replayed migrations, so the
// suite uses a database named after this process and drops it afterwards.
//
// Run from server/ with:  npm test
import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const SERVER_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DB_NAME = `campushub_migrate_test_${process.pid}`;

const connectionBase = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
};

let admin;
let db;
const tempDirs = [];

/** Run the runner against the scratch database and one fixture folder. */
function runMigrate(migrationsDir, ...args) {
  return spawnSync(process.execPath, ["migrate.js", ...args], {
    cwd: SERVER_DIR,
    encoding: "utf8",
    env: { ...process.env, DB_NAME, MIGRATIONS_DIR: migrationsDir },
  });
}

/** Create a temp folder of migration SQL files. */
async function fixtureDir(files) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "campushub-migrations-"));
  tempDirs.push(dir);
  for (const [name, sql] of Object.entries(files)) {
    await writeFile(path.join(dir, name), sql, "utf8");
  }
  return dir;
}

async function tableNames() {
  const [rows] = await db.query(
    "SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = ?",
    [DB_NAME]
  );
  return rows.map((row) => row.name);
}

async function recordedCount() {
  const [rows] = await db.query("SELECT COUNT(*) AS n FROM schema_migrations");
  return Number(rows[0].n);
}

/** Empty the scratch database so each test starts from nothing. */
async function reset() {
  const tables = await tableNames();
  await db.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of tables) await db.query(`DROP TABLE IF EXISTS \`${table}\``);
  await db.query("SET FOREIGN_KEY_CHECKS = 1");
}

before(async () => {
  admin = await mysql.createConnection(connectionBase);
  await admin.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
  await admin.query(`CREATE DATABASE \`${DB_NAME}\``);
  db = await mysql.createConnection({ ...connectionBase, database: DB_NAME });
});

after(async () => {
  await db?.end();
  await admin?.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
  await admin?.end();
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});

test("--status lists every file as pending without touching the schema", async () => {
  await reset();
  const dir = await fixtureDir({
    "001_create_probe.sql": "CREATE TABLE explore_probe (id INT PRIMARY KEY);",
    "002_noop.sql": "SELECT 1;",
  });

  const result = runMigrate(dir, "--status");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /0 applied, 2 pending/);
  assert.ok(!(await tableNames()).includes("explore_probe"));
});

test("--baseline records migrations instead of running them", async () => {
  await reset();
  const dir = await fixtureDir({
    "001_create_probe.sql": "CREATE TABLE baseline_probe (id INT PRIMARY KEY);",
    "002_noop.sql": "SELECT 1;",
  });

  const baseline = runMigrate(dir, "--baseline");

  assert.equal(baseline.status, 0, baseline.stderr);
  assert.match(baseline.stdout, /Baselined 2 migrations/);
  assert.equal(await recordedCount(), 2);
  assert.ok(
    !(await tableNames()).includes("baseline_probe"),
    "baseline must record files without executing their SQL"
  );
});

test("--baseline refuses once the database has migration history", async () => {
  await reset();
  const dir = await fixtureDir({
    "001_create_probe.sql": "CREATE TABLE refusal_probe (id INT PRIMARY KEY);",
  });

  assert.equal(runMigrate(dir, "--baseline").status, 0);
  const second = runMigrate(dir, "--baseline");

  assert.equal(second.status, 1);
  assert.match(second.stderr, /already has 1 row/);
  assert.equal(await recordedCount(), 1);
});

test("applies pending migrations in order and is a no-op when re-run", async () => {
  await reset();
  const dir = await fixtureDir({
    "001_create_a.sql": "CREATE TABLE apply_probe_a (id INT PRIMARY KEY);",
    "002_create_b.sql": "CREATE TABLE apply_probe_b (id INT PRIMARY KEY);",
  });

  const first = runMigrate(dir);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /applied 2 migration\(s\)/);

  const tables = await tableNames();
  assert.ok(tables.includes("apply_probe_a"));
  assert.ok(tables.includes("apply_probe_b"));
  assert.equal(await recordedCount(), 2);

  const second = runMigrate(dir);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Up to date: 2 migrations already applied/);
  assert.equal(await recordedCount(), 2);
});

test("re-applies a migration whose record was deleted", async () => {
  await reset();
  const dir = await fixtureDir({
    "001_create_a.sql": "CREATE TABLE replay_probe_a (id INT PRIMARY KEY);",
    "002_create_b.sql": "CREATE TABLE replay_probe_b (id INT PRIMARY KEY);",
  });

  assert.equal(runMigrate(dir).status, 0);
  await db.query("DROP TABLE replay_probe_b");
  await db.query("DELETE FROM schema_migrations WHERE filename = '002_create_b.sql'");

  const replay = runMigrate(dir);
  assert.equal(replay.status, 0, replay.stderr);
  assert.match(replay.stdout, /applied 002_create_b\.sql/);
  assert.ok((await tableNames()).includes("replay_probe_b"));
  assert.equal(await recordedCount(), 2);
});

test("a failing migration is reported and not recorded", async () => {
  await reset();
  const dir = await fixtureDir({
    "001_broken.sql": "CREATE TABLE broken (;",
  });

  const result = runMigrate(dir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Failed on 001_broken\.sql/);
  assert.match(result.stderr, /Nothing was recorded/);
  assert.equal(await recordedCount(), 0);
});

test("refuses two migrations sharing a number", async () => {
  await reset();
  const dir = await fixtureDir({
    "003_first.sql": "SELECT 1;",
    "003_second.sql": "SELECT 2;",
  });

  const result = runMigrate(dir, "--status");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Duplicate migration number 003/);
  assert.match(result.stderr, /003_second\.sql/);
});

test("refuses a migration file without a leading number", async () => {
  await reset();
  const dir = await fixtureDir({
    "create_something.sql": "SELECT 1;",
  });

  const result = runMigrate(dir, "--status");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must start with a number/);
});
