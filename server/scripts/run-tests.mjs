#!/usr/bin/env node
// Runs the whole API suite with one command: `npm test`.
//
// The route tests are functional checks, but every file sends its requests
// through the same API key. Against a default 100 requests/minute window the
// later files spend their 60s budget sleeping on Retry-After and time out,
// even though nothing is broken. The suite is therefore split in two:
//
//   1. every functional suite, against an API whose limit is raised so the
//      assertions measure behaviour rather than the limiter;
//   2. the security suite alone, against a freshly started API with the
//      configured limit, so its 429/Retry-After contract is real.
//
// Each phase gets its own server process, so the rate-limit window is empty at
// the start of the phase and the developer's own dev server is never touched
// (a free port is chosen and passed through TEST_BASE_URL).
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = join(serverDir, "tests");
const RATE_LIMIT_SUITE = "api-security.test.mjs";
const LOG_TAIL = 25;

const suites = readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort();
const functionalSuites = suites.filter((name) => name !== RATE_LIMIT_SUITE);

if (!functionalSuites.length && !suites.includes(RATE_LIMIT_SUITE)) {
  console.error("No test files found in server/tests.");
  process.exit(1);
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}

async function waitForHealth(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return true;
    } catch {
      // Not listening yet.
    }
    await new Promise((wait) => setTimeout(wait, 250));
  }
  return false;
}

function startApi(port, extraEnv) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines = [];
  const capture = (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (!line.trim()) continue;
      lines.push(line);
      if (lines.length > 200) lines.shift();
    }
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  return { child, lines };
}

async function stopApi({ child }) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  child.kill();
  const timedOut = await Promise.race([
    exited.then(() => false),
    new Promise((resolveWait) => setTimeout(() => resolveWait(true), 5_000)),
  ]);
  if (timedOut) child.kill("SIGKILL");
}

function runSuite(files, port) {
  return new Promise((resolveExit) => {
    const child = spawn(
      process.execPath,
      ["--test", "--test-concurrency=1", ...files.map((file) => join("tests", file))],
      {
        cwd: serverDir,
        stdio: "inherit",
        env: { ...process.env, TEST_BASE_URL: `http://127.0.0.1:${port}/api` },
      }
    );
    child.on("exit", (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
  });
}

function printTail(label, lines) {
  if (!lines.length) return;
  console.error(`\n--- ${label} (last ${Math.min(lines.length, LOG_TAIL)} lines) ---`);
  for (const line of lines.slice(-LOG_TAIL)) console.error(line);
}

let activeApi = null;

async function phase({ name, files, env, label }) {
  const port = await freePort();
  console.log(`\n=== ${name} — ${files.length} file(s), API on port ${port} ===`);
  activeApi = startApi(port, env);
  if (!(await waitForHealth(port))) {
    console.error(`${label} API did not become healthy within 30s.`);
    printTail(label, activeApi.lines);
    await stopApi(activeApi);
    activeApi = null;
    return 1;
  }

  const api = activeApi;
  const code = await runSuite(files, port);
  await stopApi(api);
  activeApi = null;
  if (code !== 0) printTail(label, api.lines);
  return code;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    if (activeApi) await stopApi(activeApi);
    process.exit(130);
  });
}

let failed = false;

if (functionalSuites.length) {
  const code = await phase({
    name: "Functional suites",
    files: functionalSuites,
    env: { RATE_LIMIT_MAX: "100000" },
    label: "functional-suite",
  });
  if (code !== 0) failed = true;
}

if (suites.includes(RATE_LIMIT_SUITE)) {
  const code = await phase({
    name: "Rate-limit suite",
    files: [RATE_LIMIT_SUITE],
    env: {},
    label: "rate-limit-suite",
  });
  if (code !== 0) failed = true;
}

if (failed) {
  console.error("\nAPI test suite failed.");
  process.exit(1);
}
console.log("\nAPI test suite passed.");
