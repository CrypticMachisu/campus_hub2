// Week 11 (Parts B & C): one place for every partner call's failure
// behaviour. A timeout cuts a slow partner off; capped, spaced retries
// give a momentary blip a second chance without hammering anyone.
//
// The rules:
// - Retry ONLY on timeouts/connection failures and on 429/5xx.
// - 429: wait the Retry-After the partner asks for (capped at 5 s).
// - Never retry 4xx such as 401/403/404 — resending the same hand gains nothing.
// - Never retry writes: POST/PUT/PATCH/DELETE have retries = 0, because
//   a retry could place the partner's order twice.
// - Never retry forever: at most `retries` retries (we use 2), each wait
//   doubling (200 ms, then 400 ms).

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch with a hard timeout and capped, spaced retries.
 * Resolves with the response (even a failing one) once retries are
 * exhausted for retryable statuses; throws only when the LAST attempt
 * itself errored (timeout / network) or an early attempt hits a
 * non-retryable network error.
 *
 * @param {string} url
 * @param {object} options      plain fetch options (no signal — we set it)
 * @param {object} config       { timeoutMs: 1500, retries: 2, delayMs: 200 }
 */
export async function fetchWithRetry(url, options = {}, config = {}) {
  const { timeoutMs = 1500, retries = 2, delayMs = 200 } = config;

  const method = (options.method || "GET").toUpperCase();
  // Never retry writes (Week 3's idempotency idea).
  const maxRetries = method === "GET" ? retries : 0;

  for (let attempt = 0; ; attempt++) {
    // 200 ms, then 400 ms, ... — each wait longer than the last.
    let wait = delayMs * 2 ** attempt;

    try {
      const res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(timeoutMs),
      });

      // Not a retryable status (or out of retries): hand it straight to
      // the caller. A 404 or 401 returns here immediately instead of looping.
      if (!RETRY_STATUSES.has(res.status) || attempt >= maxRetries) {
        return res;
      }

      // 429: wait what the partner asked us to wait, up to 5 s.
      const retryAfter = Number(res.headers.get("Retry-After"));
      if (res.status === 429 && retryAfter > 0) {
        wait = Math.min(retryAfter * 1000, 5000);
      }
    } catch (err) {
      // Out of retries: bubble the error up (TimeoutError keeps its name).
      if (attempt >= maxRetries) throw err;
    }

    console.warn(`partner attempt ${attempt + 1} failed, retrying in ${wait} ms`);
    await sleep(wait);
  }
}
