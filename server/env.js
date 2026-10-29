// Fail-fast startup validation for server/.env (Week 10 hardening).
//
// The server used to boot with missing config and only explain itself
// later, per request: a missing JWT_SECRET made every login 500 deep
// inside jsonwebtoken, zero API_KEYS made every request 401, and a bad
// DB_* value surfaced as a raw mysql2 error after XAMPP debugging.
// This module checks ALL of it up front — before Express is even
// configured — refuses to start, and prints one "✗ NAME — what it does
// and how to fix it" line per problem, so a cold start fails once,
// loudly, with the fix in hand. Values are never echoed back.
//
// DB_PASSWORD is deliberately NOT in the required set: XAMPP's MySQL
// normally runs root with an empty password, and an empty-but-set
// DB_PASSWORD is valid for the same reason.
//
// PARTNER_URL / PARTNER_API_KEY / SEED_PASSWORD / RATE_LIMIT_* are also
// optional: the partner routes already return a clean 502 when unset,
// set-passwords.js falls back to a documented default, and the limiter
// has its own defaults in server.js. When PARTNER_URL or RATE_LIMIT_* ARE
// set they are still shape-checked — partner.js builds URLs by string
// concatenation (garbage would TypeError per request instead of 502ing)
// and the limiter's Number() silently NaNs on garbage, which means the
// rate limit quietly stops existing.

// The example value in .env.example — signing real tokens with it would
// let anyone who read the README forge accounts, so it counts as unset.
import fs from "fs";

const JWT_SECRET_PLACEHOLDER = "change-this-to-something-long-and-random";

/**
 * Collects every config problem, not just the first one, so a fresh
 * clone on a new machine prints the complete shopping list in one run.
 * Returns an array of { name, problem } — name only, value never.
 */
export function findEnvProblems({ env = process.env } = {}) {
  const problems = [];

  const isSet = (v) => typeof v === "string" && v.trim() !== "";

  // --- Database connection ---
  // Checked even when a value is missing only to keep the pool from
  // silently falling back to its defaults in db.js.
  if (!isSet(env.DB_HOST)) {
    problems.push({
      name: "DB_HOST",
      problem: "not set — which host MySQL runs on (XAMPP default: 127.0.0.1)",
    });
  }
  const dbPort = Number(env.DB_PORT);
  if (!isSet(env.DB_PORT)) {
    problems.push({
      name: "DB_PORT",
      problem: "not set — the port MySQL listens on (XAMPP default: 3306)",
    });
  } else if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) {
    problems.push({
      name: "DB_PORT",
      problem: `must be a port number 1-65535 (the value in server/.env is not, so the pool would dial the wrong place)`,
    });
  }
  if (!isSet(env.DB_USER)) {
    problems.push({
      name: "DB_USER",
      problem: "not set — which MySQL user to connect as (XAMPP default: root)",
    });
  }
  if (!isSet(env.DB_NAME)) {
    problems.push({
      name: "DB_NAME",
      problem:
        "not set — which database schema to use (export from campushub_database.sql if it doesn't exist)",
    });
  }
  // DB_PASSWORD: see the module comment — empty is allowed on purpose.

  // --- Token signing ---
  if (!isSet(env.JWT_SECRET)) {
    problems.push({
      name: "JWT_SECRET",
      problem: "not set — login tokens can't be signed, so /auth/login would 500 on every attempt",
    });
  } else if (env.JWT_SECRET.trim() === JWT_SECRET_PLACEHOLDER) {
    problems.push({
      name: "JWT_SECRET",
      problem:
        "is still the .env.example placeholder — anyone who read the README could forge accounts. Generate one: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    });
  } else if (env.JWT_SECRET.trim().length < 16) {
    problems.push({
      name: "JWT_SECRET",
      problem:
        "is too short (needs at least 16 characters) — short secrets are brute-forceable. Generate one: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    });
  }

  // --- Consumer API keys ---
  // Zero valid keys means every request 401s; that's a misconfiguration,
  // not a mode, so refuse instead of booting into a dead server.
  if (!isSet(env.API_KEYS)) {
    problems.push({
      name: "API_KEYS",
      problem:
        "not set — every request would get 401. Comma-separated, one per consumer: API_KEYS=<partner-key>,<own-team-key>",
    });
  } else {
    const keyCount = env.API_KEYS.split(",")
      .map((key) => key.trim())
      .filter(Boolean).length;
    if (keyCount === 0) {
      problems.push({
        name: "API_KEYS",
        problem:
          "contains no actual keys (only blanks/separators) — every request would get 401. Comma-separated, one per consumer: API_KEYS=<partner-key>,<own-team-key>",
      });
    }
  }

  // --- Partner bridge (optional; shape-checked when present) ---
  // The partner routes validate nothing themselves: they string-concatenate
  // this base onto /produce, /farmers and /auth/login and hand it to new
  // URL(), so a garbage value there means a raw TypeError mid-request
  // instead of a clean 502. http/https only — FILE:: and friends would
  // also make fetch() blow up rather than fail.
  if (isSet(env.PARTNER_URL)) {
    let parsed = null;
    try {
      parsed = new URL(env.PARTNER_URL.trim());
    } catch {
      // falls through to the problem below
    }
    if (!parsed || !parsed.protocol.startsWith("http")) {
      problems.push({
        name: "PARTNER_URL",
        problem:
          "is not an http(s):// URL — the partner routes build `${PARTNER_URL}/produce` and would crash per request instead of failing cleanly. Example: PARTNER_URL=https://farmers-agroconnect.onrender.com/api",
      });
    }
  }

  // --- Rate limit per API key (optional; defaults live in server.js) ---
  // Number() on garbage silently yields NaN, which disables the limit
  // entirely — a misconfiguration that looks like a working server.
  const positiveInt = (name, example) => ({
    name,
    problem: `must be a whole number >= 1 if set (the value in server/.env is not, and a NaN limit means the limiter quietly stops limiting) — e.g. ${example}. Unset is fine: the limiter falls back to its default.`,
  });
  if (isSet(env.RATE_LIMIT_MAX)) {
    const max = Number(env.RATE_LIMIT_MAX);
    if (!Number.isInteger(max) || max < 1) {
      problems.push(positiveInt("RATE_LIMIT_MAX", "RATE_LIMIT_MAX=100"));
    }
  }
  if (isSet(env.RATE_LIMIT_WINDOW_MS)) {
    const windowMs = Number(env.RATE_LIMIT_WINDOW_MS);
    if (!Number.isInteger(windowMs) || windowMs < 1) {
      problems.push(positiveInt("RATE_LIMIT_WINDOW_MS", "RATE_LIMIT_WINDOW_MS=60000"));
    }
  }

  return problems;
}

/**
 * Prints all problems with one actionable line each (and a note when it
 * looks like .env was never written at all), then exits 1. Called at the
 * top of server.js, before anything else touches the environment.
 */
export function validateEnvOrExit({
  env = process.env,
  envFile = ".env",
  exampleFile = ".env.example",
} = {}) {
  const problems = findEnvProblems({ env });
  if (problems.length === 0) return;

  console.error(
    `\nRefusing to start: server/.env is missing or invalid (${problems.length} problem${problems.length === 1 ? "" : "s"}).\n`
  );
  for (const { name, problem } of problems) {
    console.error(`  ✗ ${name} — ${problem}`);
  }
  console.error(
    `\nFix each line above in server/.env and run the server again.` +
      (fs.existsSync(envFile)
        ? ""
        : ` (Note: no server/${envFile} file was found in this directory — copy server/${exampleFile} to server/${envFile} and fill it in.)`)
  );
  process.exit(1);
}
