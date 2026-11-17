// End-to-end photo flow without a cloud account.
//
// A tiny S3-compatible HTTP server stands in for R2. Presigning is real, the
// browser-style PUT is real, and the API's HeadObject verification is real —
// only the bucket is local. The app is imported after setting S3_* because the
// storage adapter reads its configuration at import time.
import "dotenv/config";
import { createServer } from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../db.js";

const PASSWORD = process.env.TEST_PASSWORD || "campushub123";
const API_KEY = (process.env.API_KEYS || "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean)[0];

if (!API_KEY) {
  console.error("No API key found. Set API_KEYS in server/.env.");
  process.exit(1);
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function startFakeS3() {
  const objects = new Map();
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const key = decodeURIComponent(url.pathname.split("/").slice(2).join("/"));

    if (req.method === "PUT") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        objects.set(key, {
          body: Buffer.concat(chunks),
          mime: req.headers["content-type"] || "",
        });
        res.writeHead(200, { ETag: '"test"' }).end();
      });
      return;
    }

    if (req.method === "HEAD" || req.method === "GET") {
      const object = objects.get(key);
      if (!object) {
        res.writeHead(404).end();
        return;
      }
      const headers = {
        "Content-Type": object.mime,
        "Content-Length": object.body.length,
      };
      if (req.method === "GET") {
        res.writeHead(200, headers).end(object.body);
      } else {
        res.writeHead(200, headers).end();
      }
      return;
    }

    if (req.method === "DELETE") {
      objects.delete(key);
      res.writeHead(204).end();
      return;
    }

    res.writeHead(405).end();
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, objects, port: server.address().port });
    });
  });
}

test("post photos: reserve, upload, verify, render and remove", { timeout: 60_000 }, async (t) => {
  const s3 = await startFakeS3();
  process.env.S3_ENDPOINT = `http://127.0.0.1:${s3.port}`;
  process.env.S3_BUCKET = "kesho-test";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_REGION = "us-east-1";
  process.env.S3_FORCE_PATH_STYLE = "true";
  delete process.env.R2_ACCOUNT_ID;
  delete process.env.R2_PUBLIC_BASE_URL;
  process.env.S3_PUBLIC_BASE_URL = "";

  const { app } = await import("../app.js");
  const api = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => {
      resolve({
        base: `http://127.0.0.1:${listener.address().port}/api/v2`,
        close: () => new Promise((done) => listener.close(done)),
      });
    });
  });

  const postIds = [];

  t.after(async () => {
    for (const id of postIds) {
      await pool.query("DELETE FROM posts WHERE post_id = ?", [id]);
    }
    await pool.end();
    await api.close();
    await new Promise((done) => s3.server.close(done));
  });

  async function call(path, { method = "GET", token, body } = {}) {
    const headers = { "X-API-Key": API_KEY };
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${api.base}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }

  async function login(email) {
    const result = await call("/auth/login", {
      method: "POST",
      body: { email, password: PASSWORD },
    });
    return result.body?.token || null;
  }

  const admin = await login(process.env.TEST_ADMIN_EMAIL || "amara.okafor@campus.edu");
  const member = await login(process.env.TEST_MEMBER_EMAIL || "sofia.ramirez@campus.edu");
  if (!admin || !member) {
    t.skip("seed logins unavailable — run npm run set-password first");
    return;
  }

  async function reserve({ altText = "", decorative = false, mimeType = "image/png" } = {}) {
    return call("/posts/media", {
      method: "POST",
      token: admin,
      body: {
        clubId: "club-01",
        mimeType,
        size: PNG.length,
        altText,
        decorative,
        width: 1,
        height: 1,
      },
    });
  }

  async function put(upload, body = PNG, mimeType = "image/png") {
    const response = await fetch(upload.url, {
      method: "PUT",
      headers: { ...upload.headers, "Content-Type": mimeType },
      body,
    });
    assert.equal(response.status, 200);
  }

  // Only managers reserve an upload, and alt text is required.
  const memberReserve = await call("/posts/media", {
    method: "POST",
    token: member,
    body: { clubId: "club-01", mimeType: "image/png", size: PNG.length, altText: "x" },
  });
  assert.equal(memberReserve.status, 403);
  const noAlt = await reserve({ altText: "" });
  assert.equal(noAlt.status, 400);
  assert.match(noAlt.body.error, /describe|decorative/i);

  const first = await reserve({ altText: "A single green seedling in a tray." });
  assert.equal(first.status, 201);
  assert.match(first.body.upload.url, /^http:\/\/127\.0\.0\.1:/);
  await put(first.body.upload);

  const second = await reserve({ decorative: true });
  assert.equal(second.status, 201);
  await put(second.body.upload);

  const created = await call("/posts", {
    method: "POST",
    token: admin,
    body: {
      clubId: "club-01",
      text: "Seedlings are ready for Saturday's planting day.",
      mediaIds: [first.body.media.id, second.body.media.id],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const post = created.body.post;
  postIds.push(post.id);
  assert.equal(post.photoCount, 2);
  assert.equal(post.media.length, 2);
  assert.equal(post.media[0].altText, "A single green seedling in a tray.");
  assert.equal(post.media[0].decorative, false);
  assert.equal(post.media[1].decorative, true);
  assert.equal(post.media[1].altText, "");

  const image = await fetch(post.media[0].url);
  assert.equal(image.status, 200);
  assert.equal(Buffer.from(await image.arrayBuffer()).toString("base64"), PNG.toString("base64"));

  const edited = await call(`/posts/${post.id}`, {
    method: "PATCH",
    token: admin,
    body: { text: "Edited: seedlings are ready for Saturday." },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.post.media.length, 2, "editing text must keep the photos");

  const feed = await call("/posts?clubId=club-01");
  assert.equal(feed.status, 200);
  assert.equal(feed.body.mediaEnabled, true);
  assert.equal(feed.body.posts.find((entry) => entry.id === post.id).media.length, 2);

  // A signed upload is not enough: the stored object must match the declaration.
  const lie = await reserve({ altText: "A photo that is not really a JPEG." });
  assert.equal(lie.status, 201);
  await put(lie.body.upload, Buffer.from("not an image"), "text/plain");
  const rejected = await call("/posts", {
    method: "POST",
    token: admin,
    body: {
      clubId: "club-01",
      text: "This post must not be created.",
      mediaIds: [lie.body.media.id],
    },
  });
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.error, /didn't upload correctly/i);
  const discarded = await call(`/posts/media/${lie.body.media.id}`, {
    method: "DELETE",
    token: admin,
  });
  assert.equal(discarded.status, 204);

  // Four photos are rejected before any lookup.
  const tooMany = await call("/posts", {
    method: "POST",
    token: admin,
    body: { clubId: "club-01", text: "Too many.", mediaIds: ["a", "b", "c", "d"] },
  });
  assert.equal(tooMany.status, 400);
  assert.match(tooMany.body.error, /at most 3/i);

  // Removing a photo deletes it from storage and leaves the post readable.
  const removed = await call(`/posts/${post.id}/media/${post.media[0].id}`, {
    method: "DELETE",
    token: admin,
  });
  assert.equal(removed.status, 200);
  const after = await call(`/posts/${post.id}`);
  assert.equal(after.status, 200);
  assert.equal(after.body.post.media.length, 1);
  assert.equal(after.body.post.photoCount, 1);
});
