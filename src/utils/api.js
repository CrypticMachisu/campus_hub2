// Thin fetch wrapper around the CampusHub Express/MySQL API.
// Every other utils/*Store.js file goes through this instead of
// touching localStorage directly.

// Week 13: the app talks to the current version only. v1 (/api) is frozen
// and sunsets 2026-11-30, so the version segment is applied once, here,
// instead of in every store. VITE_API_URL stays the host-level base
// ("…/api"); a value that already ends in /v1 or /v2 is left alone.
const API_ROOT = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const API_BASE = `${API_ROOT.replace(/\/+$/, "").replace(/\/v\d+$/, "")}/v2`;
// Week 9: the API now requires our consumer's API key on every request
// (except the health check). The team test key is read at build time
// from VITE_API_KEY — a browser can't keep a secret, so this key is
// per-consumer and rate-limited/revocable server-side.
const API_KEY = import.meta.env.VITE_API_KEY || "";
const TOKEN_KEY = "campushub_token";
const MAX_SESSION_RETRIES = 2;

// Requests that hit an expired session wait here for the re-auth modal, then
// run again with the replacement token. The original caller never sees the 401.
let sessionRetry = null;

function waitForReauthentication(error) {
  if (!sessionRetry) {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    sessionRetry = { promise, resolve, reject, error };
  }
  return sessionRetry.promise;
}

export function resolveSessionRetry() {
  const pending = sessionRetry;
  sessionRetry = null;
  pending?.resolve();
}

export function rejectSessionRetry() {
  const pending = sessionRetry;
  sessionRetry = null;
  pending?.reject(pending.error);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Calls the API and returns the parsed JSON body.
 * Throws an Error with a readable message (from the API's { error }
 * field when present) on any non-2xx response.
 */
export async function apiFetch(
  path,
  { method = "GET", body, auth = true, retryOnExpiry = true, _authRetries = 0 } = {}
) {
  const headers = { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" };
  if (API_KEY) headers["X-API-Key"] = API_KEY;
  const hadToken = auth ? getToken() : null;
  if (hadToken) headers.Authorization = `Bearer ${hadToken}`;

  // A dead API should surface as an error state, not a skeleton that never
  // resolves. 10s is generous for a local/ngrok API but bounded.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      err.name === "AbortError"
        ? "That took too long. Try again."
        : "We can't connect right now. Check your connection and try again."
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return null;

  let data = null;
  try {
    data = await response.json();
  } catch {
    // No JSON body (shouldn't normally happen outside 204s).
  }

  if (!response.ok) {
    const error = new Error(data?.error || "Something went wrong. Try again in a moment.");
    error.status = response.status;

    if (
      response.status === 401 &&
      hadToken &&
      retryOnExpiry &&
      _authRetries < MAX_SESSION_RETRIES &&
      typeof window !== "undefined"
    ) {
      const reauthenticated = waitForReauthentication(error);
      window.dispatchEvent(
        new CustomEvent("campushub:session-expired", {
          detail: { message: error.message },
        })
      );
      await reauthenticated;
      return apiFetch(path, {
        method,
        body,
        auth,
        retryOnExpiry,
        _authRetries: _authRetries + 1,
      });
    }

    if (response.status === 401 && _authRetries >= MAX_SESSION_RETRIES) {
      error.message = "Your session expired again. Reload the page and log in.";
    }
    throw error;
  }
  return data;
}
