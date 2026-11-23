// Storage adapter tests. These do not touch a bucket: presigning is local
// signing, and the point here is the configuration/URL contract the posts
// routes rely on. Real upload verification needs configured R2 credentials.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedMediaMime,
  createMediaStorage,
  extensionForMime,
  storageConfigFromEnv,
} from "../storage.js";

const CONFIG = {
  endpoint: "https://example.r2.cloudflarestorage.com",
  bucket: "kesho-photos",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  publicBaseUrl: "",
  region: "auto",
  forcePathStyle: false,
};

test("storage: accepts only the three supported image types", () => {
  assert.equal(allowedMediaMime("image/jpeg"), true);
  assert.equal(allowedMediaMime("image/png"), true);
  assert.equal(allowedMediaMime("image/webp"), true);
  assert.equal(allowedMediaMime("image/gif"), false);
  assert.equal(allowedMediaMime("text/html"), false);
  assert.equal(extensionForMime("image/webp"), "webp");
  assert.equal(extensionForMime("image/gif"), null);
});

test("storage: R2 variables are the default, S3 variables override them", () => {
  const r2 = storageConfigFromEnv({
    R2_ACCOUNT_ID: "account-123",
    R2_ACCESS_KEY_ID: "r2-key",
    R2_SECRET_ACCESS_KEY: "r2-secret",
    R2_BUCKET_NAME: "r2-bucket",
    R2_PUBLIC_BASE_URL: "https://photos.example.com/",
  });
  assert.equal(r2.endpoint, "https://account-123.r2.cloudflarestorage.com");
  assert.equal(r2.bucket, "r2-bucket");
  assert.equal(r2.publicBaseUrl, "https://photos.example.com/");

  const s3 = storageConfigFromEnv({
    R2_ACCOUNT_ID: "ignored",
    S3_ENDPOINT: "http://127.0.0.1:9000",
    S3_BUCKET: "local-bucket",
    S3_ACCESS_KEY_ID: "s3-key",
    S3_SECRET_ACCESS_KEY: "s3-secret",
    S3_REGION: "us-east-1",
    S3_FORCE_PATH_STYLE: "true",
  });
  assert.equal(s3.endpoint, "http://127.0.0.1:9000");
  assert.equal(s3.bucket, "local-bucket");
  assert.equal(s3.region, "us-east-1");
  assert.equal(s3.forcePathStyle, true);
});

test("storage: disabled without complete credentials", async () => {
  const storage = createMediaStorage({});
  assert.equal(storage.enabled, false);
  assert.equal(await storage.getUrl("clubs/club-01/posts/a.jpg"), null);
  assert.equal(storage.createUploadUrl, undefined);
});

test("storage: signs a PUT with the exact content type the browser must send", async () => {
  const storage = createMediaStorage(CONFIG);
  assert.equal(storage.enabled, true);
  const upload = await storage.createUploadUrl("clubs/club-01/posts/media-1.jpg", "image/jpeg");
  assert.equal(upload.method, "PUT");
  assert.equal(upload.headers["Content-Type"], "image/jpeg");
  assert.equal(upload.expiresIn, 600);
  assert.match(upload.url, /^https:\/\/kesho-photos\.example\.r2\.cloudflarestorage\.com\//);
  assert.match(upload.url, /X-Amz-Signature=/);
  assert.match(upload.url, /X-Amz-Expires=600/);
  assert.doesNotMatch(upload.url, /checksum/i);
});

test("storage: public domains produce stable, encoded URLs", async () => {
  const storage = createMediaStorage({
    ...CONFIG,
    publicBaseUrl: "https://photos.example.com/",
  });
  const url = await storage.getUrl("clubs/club 01/posts/media-1.webp");
  assert.equal(url, "https://photos.example.com/clubs/club%2001/posts/media-1.webp");
});

test("storage: a private bucket gets a signed GET", async () => {
  const storage = createMediaStorage(CONFIG);
  const url = await storage.getUrl("clubs/club-01/posts/media-1.jpg");
  assert.match(url, /X-Amz-Signature=/);
  assert.match(url, /X-Amz-Expires=3600/);
});
