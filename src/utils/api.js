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
export async function apiFetch(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" };
  if (API_KEY) headers["X-API-Key"] = API_KEY;
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

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
        ? "The server didn't respond in time. Try again."
        : "Can't reach the server. Check that the API is running."
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
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
  return data;
}
