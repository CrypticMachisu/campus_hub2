// Week 9 (Part C): in-memory rate limiting.
//
// Counts requests per consumer (their API key, or their IP if no key was
// attached) in a simple time window and replies 429 with a Retry-After
// header once they exceed `max`. It also remembers, per consumer, the
// last IP it was seen from; the tier1 dashboard endpoint (GET /api/admin)
// reads both via `limiter.stats()`.
//
// Honest limits of this limiter: it lives in this server's memory, so
// it resets on restart and doesn't coordinate across several server
// copies. Fine for this course; production uses a shared store (Redis).
import { fingerprintApiKey, configuredKeyFingerprints } from "./apiKey.js";

export function rateLimit({ windowMs = 60_000, max = 100 } = {}) {
  // id -> { count, resetAt, fingerprint, lastIp, lastSeenAt }
  const hits = new Map();

  const middleware = (req, res, next) => {
    const id = req.apiKey || req.ip;
    const now = Date.now();

    let entry = hits.get(id);
    if (!entry || now >= entry.resetAt) {
      // A rolled-over window resets the tally but KEEPS the last-seen
      // IP — that's history, not quota. Fingerprints are precomputed so
      // stats() never has to hold or hash the raw key on the way out.
      entry = {
        count: 0,
        resetAt: now + windowMs,
        fingerprint: req.apiKey ? fingerprintApiKey(req.apiKey) : null,
        lastIp: entry?.lastIp ?? null,
        lastSeenAt: entry?.lastSeenAt ?? null,
      };
      hits.set(id, entry);
    }
    entry.count += 1;
    entry.lastIp = req.ip;
    entry.lastSeenAt = new Date(now).toISOString();

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "Too many requests.", retryAfter });
    }

    next();
  };

  /**
   * Live per-consumer status for GET /api/admin. Entries whose window
   * has already passed report their LAST window's tally with active:
   * false — the counters only roll forward on that consumer's next
   * request, exactly like the enforcement above. Raw keys are never
   * included: every key shows up as its fingerprint (hashed id + tail).
   */
  middleware.stats = () => {
    const now = Date.now();
    const consumers = [];
    const seenKeyIds = new Set();

    for (const entry of hits.values()) {
      const active = now < entry.resetAt;
      if (entry.fingerprint) seenKeyIds.add(entry.fingerprint.keyId);
      consumers.push({
        keyId: entry.fingerprint?.keyId ?? null, // null for keyless/IP consumers
        maskedKey: entry.fingerprint?.maskedKey ?? null,
        byIp: !entry.fingerprint,
        active,
        count: entry.count,
        max,
        remaining: Math.max(max - entry.count, 0),
        limited: active && entry.count > max,
        resetAt: new Date(entry.resetAt).toISOString(),
        secondsUntilReset: active ? Math.ceil((entry.resetAt - now) / 1000) : 0,
        lastIp: entry.lastIp,
        lastSeenAt: entry.lastSeenAt,
      });
    }

    // Keys already handed out but never used still deserve a row.
    for (const fingerprint of configuredKeyFingerprints()) {
      if (seenKeyIds.has(fingerprint.keyId)) continue;
      consumers.push({
        keyId: fingerprint.keyId,
        maskedKey: fingerprint.maskedKey,
        byIp: false,
        active: false,
        count: 0,
        max,
        remaining: max,
        limited: false,
        resetAt: null,
        secondsUntilReset: 0,
        lastIp: null,
        lastSeenAt: null,
      });
    }

    // Used keys first, busiest one on top; unused keys after.
    consumers.sort((a, b) => b.count - a.count);

    return { windowMs, max, consumers };
  };

  return middleware;
}
