import test, { after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { pool } from "../db.js";

// Readiness opens a MySQL connection when a database is available. Close the
// pool so the test process exits instead of hanging after the assertions.
after(async () => {
  await pool.end();
});

test("health is public, cheap and carries hardening headers", async () => {
  const app = createApp();
  const response = await request(app).get("/api/health");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
  assert.match(response.headers["x-request-id"], /^[0-9a-f-]{36}$/);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-powered-by"], undefined);
  assert.equal(response.headers["cache-control"], "no-store");
});

test("readiness is public but reports a database failure without details", async () => {
  const app = createApp();
  const response = await request(app).get("/api/ready");

  // In a unit run there may be no MySQL. Either answer is valid; the important
  // part is that the body never leaks a host, user or driver error.
  assert.ok([200, 503].includes(response.status));
  assert.equal(typeof response.body.ok, "boolean");
  assert.ok(["up", "down"].includes(response.body.db));
  assert.equal(response.body.error, undefined);
});
