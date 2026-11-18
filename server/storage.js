// Object storage for post photos.
//
// The app speaks the S3 API, so the same code works with Cloudflare R2 (the
// default when R2_* variables are set) or any compatible store via S3_*.
// Browsers upload straight to the bucket with a short-lived presigned PUT;
// the API never receives image bytes. Every uploaded object is inspected with
// HeadObject before it is attached to a post, because a presigned URL alone
// does not prove what was written.
//
// With no credentials the rest of the noticeboard keeps working and the media
// endpoints answer 503. That is deliberate: photos are optional infrastructure,
// not a reason for text posts to stop.
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
export const MAX_POST_MEDIA = 3;
export const UPLOAD_URL_TTL_SECONDS = 10 * 60;
export const MEDIA_URL_TTL_SECONDS = 60 * 60;

const MIME_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export function allowedMediaMime(mime) {
  return MIME_EXTENSIONS.has(mime);
}

export function extensionForMime(mime) {
  return MIME_EXTENSIONS.get(mime) || null;
}

/** R2 settings win; S3_* can point at R2 or another compatible store. */
export function storageConfigFromEnv(env = process.env) {
  const accountId = env.R2_ACCOUNT_ID || "";
  const endpoint =
    env.S3_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  const bucket = env.S3_BUCKET || env.R2_BUCKET_NAME || "";
  const accessKeyId = env.S3_ACCESS_KEY_ID || env.R2_ACCESS_KEY_ID || "";
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY || env.R2_SECRET_ACCESS_KEY || "";
  const publicBaseUrl = env.S3_PUBLIC_BASE_URL || env.R2_PUBLIC_BASE_URL || "";
  const region = env.S3_REGION || "auto";
  const forcePathStyle = env.S3_FORCE_PATH_STYLE === "true";

  return { endpoint, bucket, accessKeyId, secretAccessKey, publicBaseUrl, region, forcePathStyle };
}

export function createMediaStorage(config = storageConfigFromEnv()) {
  const enabled = Boolean(
    config.endpoint && config.bucket && config.accessKeyId && config.secretAccessKey
  );

  if (!enabled) {
    return {
      enabled: false,
      reason: "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME.",
      async getUrl() {
        return null;
      },
      async remove() {},
    };
  }

  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    // The presigner otherwise puts an empty-body CRC32 into the URL, which is
    // wrong for the file the browser is about to send. R2 does not require it.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const bucket = config.bucket;

  return {
    enabled: true,
    reason: null,

    /** A PUT the browser can send directly, with the exact Content-Type signed. */
    async createUploadUrl(key, mime) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: mime,
      });
      const url = await getSignedUrl(client, command, {
        expiresIn: UPLOAD_URL_TTL_SECONDS,
      });
      return {
        url,
        method: "PUT",
        headers: { "Content-Type": mime },
        expiresIn: UPLOAD_URL_TTL_SECONDS,
      };
    },

    /** What actually landed in the bucket, not what the browser claimed. */
    async inspect(key) {
      const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return {
        size: Number(result.ContentLength || 0),
        mime: (result.ContentType || "").split(";")[0].trim().toLowerCase(),
      };
    },

    /**
     * A public bucket domain when configured; otherwise a one-hour signed GET.
     * Signed URLs keep a private bucket workable without a second CDN setup.
     */
    async getUrl(key) {
      if (config.publicBaseUrl) {
        const path = key
          .split("/")
          .map((part) => encodeURIComponent(part))
          .join("/");
        return `${config.publicBaseUrl.replace(/\/+$/, "")}/${path}`;
      }
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      return getSignedUrl(client, command, { expiresIn: MEDIA_URL_TTL_SECONDS });
    },

    /** Read an object for a one-time derivative, such as a thumbnail. */
    async getObject(key) {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!result.Body) throw new Error(`Object ${key} had no body.`);
      return Buffer.from(await result.Body.transformToByteArray());
    },

    /** Write a generated object directly; uploads still use presigned PUTs. */
    async putObject(
      key,
      body,
      contentType,
      { cacheControl = "public, max-age=31536000, immutable" } = {}
    ) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: cacheControl,
        })
      );
    },

    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

export const mediaStorage = createMediaStorage();
