// Week 9 (Part B): API key authentication.
//
// Every consumer (ring partner, our own team) gets its own key. Keys are
// comma-separated in the API_KEYS environment variable — never in source
// code — and a request without a valid `X-API-Key` header gets a 401
// before any handler runs.
import crypto from "crypto";

const HEADER_NAME = "X-API-Key";

/** Number of valid keys currently loaded (for the startup log only). */
export const validApiKeyCount = () =>
  (process.env.API_KEYS || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean).length;

/** Load the configured keys. Kept in one place so the count and the check can't drift apart. */
function validKeys() {
  return (process.env.API_KEYS || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
}

/**
 * Asks the caller to prove it knows one of the configured keys without
 * revealing the key itself (timing-safe comparison of SHA-256 digests,
 * so the raw key string never has to sit in a variable for comparison).
 */
function knowsKey(presented, valid) {
  const a = crypto.createHash("sha256").update(presented).digest();
  const b = crypto.createHash("sha256").update(valid).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Stable, non-reversible identity for one key, for dashboards/logs:
 * a short SHA-256 prefix plus a masked tail. Never emits the key itself.
 */
export function fingerprintApiKey(key) {
  return {
    keyId: crypto.createHash("sha256").update(key).digest("hex").slice(0, 12),
    maskedKey: key.length > 8 ? `${key.slice(0, 3)}…${key.slice(-4)}` : "…",
  };
}

/** Every configured key as a fingerprint, in config order. */
export function configuredKeyFingerprints() {
  return validKeys().map(fingerprintApiKey);
}

/**
 * Rejects with 401 unless the X-API-Key header matches one of API_KEYS.
 * On success attaches the presented key to req.apiKey so the rate
 * limiter can count requests per consumer. 401 (not 403) because with
 * one access level there is no "known but forbidden" case.
 */
export function requireApiKey(req, res, next) {
  const presented = req.get(HEADER_NAME);
  const ok = Boolean(presented) && validKeys().some((valid) => knowsKey(presented, valid));

  if (!ok) {
    return res.status(401).json({ error: "Missing or invalid API key." });
  }
  req.apiKey = presented;
  next();
}
