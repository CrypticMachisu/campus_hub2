#!/usr/bin/env node
/**
 * External production checks for Kesho.
 *
 * Checks:
 *   1. the web health endpoint
 *   2. the API readiness endpoint (including MySQL)
 *   3. the TLS certificate trust and expiry
 *   4. the age of the newest local database backup
 *
 * Usage:
 *   MONITOR_BASE_URL=https://kesho.example.com \
 *   MONITOR_BACKUP_DIR=/var/backups/kesho \
 *   ALERT_WEBHOOK_URL=https://hooks.example.com/kesho \
 *   node scripts/monitor.mjs
 *
 * Environment:
 *   MONITOR_BASE_URL              public origin, required
 *   MONITOR_WEB_URL               default: ${MONITOR_BASE_URL}/healthz
 *   MONITOR_API_READY_URL         default: ${MONITOR_BASE_URL}/api/ready
 *   MONITOR_TIMEOUT_MS            default: 5000
 *   MONITOR_CERT_MIN_DAYS         default: 14
 *   MONITOR_TLS_ALLOW_SELF_SIGNED set to 1 only for a local Caddy test
 *   MONITOR_BACKUP_DIR            optional; enables the backup-age check
 *   MONITOR_BACKUP_MAX_AGE_HOURS  default: 36
 *   ALERT_WEBHOOK_URL             optional JSON alert webhook
 */

import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";

const ENV = process.env;
const BASE_URL = (ENV.MONITOR_BASE_URL || "").replace(/\/+$/, "");
const TIMEOUT_MS = Number(ENV.MONITOR_TIMEOUT_MS || 5000);
const CERT_MIN_DAYS = Number(ENV.MONITOR_CERT_MIN_DAYS || 14);
const BACKUP_MAX_AGE_HOURS = Number(ENV.MONITOR_BACKUP_MAX_AGE_HOURS || 36);
const ALLOW_SELF_SIGNED = ENV.MONITOR_TLS_ALLOW_SELF_SIGNED === "1";
const HOST_LABEL = ENV.MONITOR_NAME || "kesho";

const failures = [];
const results = [];

async function sendAlert(message) {
  if (!ENV.ALERT_WEBHOOK_URL) return;
  const payload = JSON.stringify({ text: message, content: message });
  try {
    const response = await fetch(ENV.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`webhook returned ${response.status}`);
    }
  } catch {
    console.error("Could not deliver the monitor alert.");
  }
}

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "ok" : "FAIL"}  ${name}: ${detail}`);
  if (!ok) failures.push(`${name}: ${detail}`);
}

async function checkWeb() {
  const url = ENV.MONITOR_WEB_URL || `${BASE_URL}/healthz`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await response.text();
    record(
      "web",
      response.ok && body.trim().toLowerCase().startsWith("ok"),
      `${response.status} ${url}`
    );
  } catch (error) {
    record("web", false, `${url}: ${error.message}`);
  }
}

async function checkApi() {
  const url = ENV.MONITOR_API_READY_URL || `${BASE_URL}/api/ready`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await response.json().catch(() => null);
    record(
      "api readiness",
      response.ok && body?.ok === true && body?.db === "up",
      `${response.status} db=${body?.db ?? "unknown"} ${url}`
    );
  } catch (error) {
    record("api readiness", false, `${url}: ${error.message}`);
  }
}

function checkCertificate() {
  if (!BASE_URL.startsWith("https://")) {
    record("tls certificate", true, "skipped (base URL is not HTTPS)");
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok, detail) => {
      if (settled) return;
      settled = true;
      record("tls certificate", ok, detail);
      resolve();
    };

    const url = new URL(BASE_URL);
    const socket = tls.connect(
      {
        host: url.hostname,
        port: Number(url.port || 443),
        servername: url.hostname,
        rejectUnauthorized: false,
      },
      () => {
        const certificate = socket.getPeerCertificate();
        const authorized = socket.authorized;
        socket.end();

        if (!certificate?.valid_to) {
          finish(false, "no peer certificate");
          return;
        }

        const days = (new Date(certificate.valid_to).getTime() - Date.now()) / 86_400_000;
        if (!authorized && !ALLOW_SELF_SIGNED) {
          finish(false, `certificate is not trusted (${days.toFixed(1)} days remaining)`);
          return;
        }
        if (!Number.isFinite(days) || days < CERT_MIN_DAYS) {
          finish(false, `certificate expires in ${days.toFixed(1)} days`);
          return;
        }
        finish(
          true,
          `${days.toFixed(1)} days remaining${authorized ? "" : " (self-signed allowed)"}`
        );
      }
    );

    socket.setTimeout(TIMEOUT_MS, () => {
      socket.destroy();
      finish(false, `TLS connection timed out after ${TIMEOUT_MS}ms`);
    });
    socket.once("error", (error) => {
      finish(false, error.message);
    });
  });
}

function checkBackupAge() {
  const dir = ENV.MONITOR_BACKUP_DIR;
  if (!dir) {
    record("backup age", true, "skipped (MONITOR_BACKUP_DIR is not set)");
    return;
  }

  try {
    const files = fs
      .readdirSync(dir)
      .filter((name) => /^campushub-.*\.sql\.gz$/.test(name))
      .map((name) => {
        const file = path.join(dir, name);
        return { name, mtimeMs: fs.statSync(file).mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (files.length === 0) {
      record("backup age", false, `no campushub-*.sql.gz in ${dir}`);
      return;
    }

    const ageHours = (Date.now() - files[0].mtimeMs) / 3_600_000;
    record(
      "backup age",
      ageHours <= BACKUP_MAX_AGE_HOURS,
      `${files[0].name} is ${ageHours.toFixed(1)}h old`
    );
  } catch (error) {
    record("backup age", false, `${dir}: ${error.message}`);
  }
}

async function main() {
  if (!BASE_URL) {
    console.error("MONITOR_BASE_URL is required, e.g. https://kesho.example.com");
    process.exit(2);
  }

  await checkWeb();
  await checkApi();
  await checkCertificate();
  checkBackupAge();

  if (failures.length === 0) {
    console.log(`\nAll ${results.length} checks passed.`);
    return;
  }

  const message = `Kesho monitor FAILED on ${HOST_LABEL}: ${failures.join("; ")}`;
  console.error(`\n${message}`);
  await sendAlert(message);
  process.exitCode = 1;
}

main().catch(async (error) => {
  const message = `Kesho monitor CRASHED on ${HOST_LABEL}: ${error.message}`;
  console.error(message);
  await sendAlert(message);
  process.exitCode = 1;
});
