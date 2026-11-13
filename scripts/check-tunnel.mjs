#!/usr/bin/env node
/**
 * Verifies that the public tunnel is serving the CampusHub API, not ngrok's
 * own inspector page.
 *
 * The failure this catches:
 *   ngrok http 4040
 *
 * Port 4040 is ngrok's local web UI. A tunnel pointed there answers every
 * /api/... request with plain-text "404 page not found" before Express runs,
 * so a correct API key cannot help.
 *
 * Usage:
 *   npm run check:tunnel
 *   PUBLIC_API_URL=https://example.ngrok-free.dev/api npm run check:tunnel
 *   npm run check:tunnel -- https://example.ngrok-free.dev/api
 */

const DEFAULT_BASE = "https://movable-eastcoast-showman.ngrok-free.dev/api";
const LOCAL_HEALTH = "http://127.0.0.1:5000/api/health";
const NGROK_AGENT = "http://127.0.0.1:4040/api/tunnels";

const base = (process.env.PUBLIC_API_URL || process.argv[2] || DEFAULT_BASE).replace(/\/+$/, "");
const healthUrl = `${base}/health`;

function fail(message, details = []) {
  console.error(`FAIL ${message}`);
  for (const detail of details) console.error(`     ${detail}`);
  process.exitCode = 1;
}

async function get(url, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "ngrok-skip-browser-warning": "true" },
      signal: controller.signal,
    });
    return { res, text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

async function getTunnel() {
  try {
    const { res, text } = await get(NGROK_AGENT, 2_000);
    if (!res.ok) return null;
    const data = JSON.parse(text);
    const tunnels = Array.isArray(data.tunnels) ? data.tunnels : [];
    return tunnels.find((t) => t.public_url && base.startsWith(t.public_url)) || tunnels[0] || null;
  } catch {
    // The check may run from another machine; the public probe still matters.
    return null;
  }
}

function portOf(addr) {
  if (!addr) return null;
  const raw = String(addr).trim();
  const withProtocol = /^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const url = new URL(withProtocol);
    return url.port || (url.protocol === "https:" ? "443" : "80");
  } catch {
    return null;
  }
}

async function localDiagnostic() {
  try {
    const { res, text } = await get(LOCAL_HEALTH, 2_000);
    return `${res.status} ${text}`;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`Checking ${healthUrl}`);

  let result;
  try {
    result = await get(healthUrl, 10_000);
  } catch (err) {
    fail(
      `Could not reach the public URL (${err.name === "AbortError" ? "timed out" : err.message}).`
    );
    const local = await localDiagnostic();
    if (local) {
      console.error(`     The local API is responding: ${local}`);
      console.error("     The tunnel is not forwarding to it. Check the ngrok target.");
    } else {
      console.error("     The local API is also not responding on port 5000.");
      console.error("     Start it with ./run.sh before starting or checking the tunnel.");
    }
    return;
  }

  const { res, text } = result;
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const tunnel = await getTunnel();
  const target = tunnel?.config?.addr;

  if (res.status === 404 && contentType.includes("text/plain")) {
    fail("The public URL returned ngrok's own 404 page, not CampusHub.");
    if (target) console.error(`     ngrok is forwarding to ${target}`);
    console.error("     Port 4040 is ngrok's inspector, not the API.");
    console.error("     Start the tunnel against port 5000: ngrok http 5000");
    return;
  }

  if (res.status === 404 && contentType.includes("application/json")) {
    fail(`The API returned a JSON 404 for ${healthUrl}.`);
    console.error("     Check that PUBLIC_API_URL is the /api base URL, not a deeper path.");
    return;
  }

  if (!res.ok) {
    fail(`Health check returned ${res.status} ${res.statusText}.`);
    if (text) console.error(`     ${text.slice(0, 200)}`);
    return;
  }

  if (contentType.includes("text/html")) {
    fail("The public URL returned HTML instead of JSON.");
    console.error("     If this is ngrok's warning page, send ngrok-skip-browser-warning: true.");
    return;
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    fail(`Health response was not JSON: ${text.slice(0, 200)}`);
    return;
  }

  if (body?.ok !== true) {
    fail(`Health response was not {"ok":true}: ${text.slice(0, 200)}`);
    return;
  }

  console.log(`PASS public health: ${res.status} ${text.trim()}`);

  if (!target) {
    console.log("NOTE could not read the local ngrok agent; public health passed.");
    return;
  }

  console.log(`ngrok target: ${target}`);
  const port = portOf(target);
  if (port && port !== "5000") {
    fail(`ngrok is forwarding to ${target}, but CampusHub listens on port 5000.`);
    console.error("     Point the tunnel at 5000, not 4040 or another port.");
    return;
  }

  console.log("PASS tunnel target: port 5000");
}

main().catch((err) => {
  fail(err?.message || String(err));
});
