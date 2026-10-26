// Week 9 (Part C): in-memory rate limiting.
//
// Counts requests per consumer (their API key, or their IP for the
// health check if it ever needed one) in a rolling simple time window
// and replies 429 with a Retry-After header once they exceed `max`.
//
// Honest limits of this limiter: it lives in this server's memory, so
// it resets on restart and doesn't coordinate across several server
// copies. Fine for this course; production uses a shared store (Redis).
export function rateLimit({ windowMs = 60_000, max = 100 } = {}) {
  const hits = new Map(); // id -> { count, resetAt }

  return (req, res, next) => {
    const id = req.apiKey || req.ip;
    const now = Date.now();

    let entry = hits.get(id);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(id, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "Too many requests.", retryAfter });
    }

    next();
  };
}
