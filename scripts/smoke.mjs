#!/usr/bin/env node
/**
 * CampusHub browser smoke test.
 *
 * Drives the real app in headless Chrome over the DevTools protocol, so it
 * adds no dependencies and needs Node 22+ (global WebSocket).
 *
 * It covers:
 *   1. logging in through the login form
 *   2. RSVPing to an event with free seats, then cancelling
 *   3. joining a full event's waitlist, then leaving it
 *   4. failing API requests on My Events and Event Detail, then recovering
 *      with the retry button
 *
 * The test account must have no existing RSVPs. The default is the seeded
 * tier 1 demo admin (Amara, 0 signups). Any RSVPs created by the run are
 * removed again, including after a failure.
 *
 * Usage:
 *   npm run smoke
 *   SMOKE_BASE_URL=http://localhost:5173 npm run smoke
 *
 * Environment:
 *   SMOKE_BASE_URL       frontend URL      (default http://localhost:5173)
 *   SMOKE_API_HEALTH_URL API health URL    (default http://localhost:5000/api/health)
 *   SMOKE_EMAIL          test account      (default amara.okafor@campus.edu)
 *   SMOKE_PASSWORD       test password     (default campushub123)
 *   SMOKE_RSVP_EVENT_ID  event with seats  (default event-13)
 *   SMOKE_FULL_EVENT_ID  event at capacity (default event-01)
 *   CHROME_PATH          Chrome binary, if it is not in a standard location
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CONFIG = {
  baseUrl: (process.env.SMOKE_BASE_URL || "http://localhost:5173").replace(/\/$/, ""),
  apiHealthUrl: process.env.SMOKE_API_HEALTH_URL || "http://localhost:5000/api/health",
  email: process.env.SMOKE_EMAIL || "amara.okafor@campus.edu",
  password: process.env.SMOKE_PASSWORD || "campushub123",
  rsvpEventId: process.env.SMOKE_RSVP_EVENT_ID || "event-13",
  fullEventId: process.env.SMOKE_FULL_EVENT_ID || "event-01",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(fn, timeout, label) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeout) {
    try {
      if (await fn()) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(120);
  }
  throw new Error(
    `Timed out after ${timeout}ms waiting for ${label}${lastError ? ` (${lastError.message})` : ""}`
  );
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
      : null,
    process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe")
      : null,
    process.env["PROGRAMFILES(X86)"]
      ? path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe")
      : null,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      "Chrome was not found. Install Chrome or set CHROME_PATH to the browser binary."
    );
  }
  return found;
}

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

const PRIMARY_LABELS = ["I'm going", "Cancel my RSVP", "Join the waitlist", "Leave waitlist"];

function buttonExistsExpression(label) {
  return `Array.from(document.querySelectorAll("button")).some((node) => node.textContent.trim() === ${JSON.stringify(label)})`;
}

function primaryLabelExpression() {
  return `(() => {
    const labels = ${JSON.stringify(PRIMARY_LABELS)};
    const button = Array.from(document.querySelectorAll("button")).find((node) =>
      labels.includes(node.textContent.trim())
    );
    return button ? button.textContent.trim() : "";
  })()`;
}

async function main() {
  const runStarted = Date.now();

  if (typeof WebSocket !== "function" || Number(process.versions.node.split(".")[0]) < 22) {
    throw new Error("This smoke test needs Node 22 or newer (for the built-in WebSocket).");
  }

  if (!(await reachable(CONFIG.baseUrl))) {
    throw new Error(
      `The web app is not reachable at ${CONFIG.baseUrl}. Start \`npm run dev\` first.`
    );
  }
  if (!(await reachable(CONFIG.apiHealthUrl))) {
    throw new Error(`The API is not reachable at ${CONFIG.apiHealthUrl}. Start the server first.`);
  }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "campushub-smoke-"));
  const browser = spawn(
    findChrome(),
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--hide-scrollbars",
      "--window-size=1440,1000",
      ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  let ws = null;
  let nextId = 0;
  const pending = new Map();
  const pageProblems = [];
  let currentPage = "";
  let loggedIn = false;

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || "Page evaluation failed");
    }
    return result.result.value;
  };

  const pageText = () => evaluate("document.body.innerText");

  async function goto(url, readyExpression, timeout = 20000) {
    currentPage = url;
    await send("Page.navigate", { url });
    await waitFor(
      () => evaluate('document.readyState === "complete"'),
      timeout,
      `${url} to finish loading`
    );
    if (readyExpression) {
      await waitFor(() => evaluate(readyExpression), timeout, readyExpression);
    }
    await evaluate("document.fonts ? document.fonts.ready.then(() => true) : true");
    await sleep(500);
  }

  async function waitForButton(label, timeout = 15000) {
    await waitFor(() => evaluate(buttonExistsExpression(label)), timeout, `button "${label}"`);
  }

  async function clickButton(label) {
    const clicked = await evaluate(`
      (() => {
        const button = Array.from(document.querySelectorAll("button")).find(
          (node) => node.textContent.trim() === ${JSON.stringify(label)}
        );
        if (!button) return false;
        button.click();
        return true;
      })()
    `);
    if (!clicked) throw new Error(`Button "${label}" was not found.`);
  }

  async function assertText(needle, label) {
    const text = (await pageText()).toLowerCase();
    if (!text.includes(needle.toLowerCase())) {
      throw new Error(`${label || `"${needle}"`} was not shown on ${currentPage}.`);
    }
  }

  async function waitForText(needle, timeout = 15000) {
    await waitFor(
      async () => (await pageText()).toLowerCase().includes(needle.toLowerCase()),
      timeout,
      `"${needle}"`
    );
  }

  async function step(name, fn) {
    const started = Date.now();
    process.stdout.write(`- ${name} ... `);
    try {
      await fn();
      console.log(`ok (${Date.now() - started}ms)`);
    } catch (error) {
      console.log("FAILED");
      throw error;
    }
  }

  async function cleanupSignups() {
    if (!loggedIn || !ws) return;
    try {
      await send("Network.setBlockedURLs", { urls: [] });
    } catch {
      return;
    }

    for (const eventId of [CONFIG.rsvpEventId, CONFIG.fullEventId]) {
      try {
        await goto(`${CONFIG.baseUrl}/events/${eventId}`, null, 10000);
        await waitFor(
          () => evaluate(`Boolean(${primaryLabelExpression()})`),
          10000,
          "event action button"
        );
        const label = await evaluate(primaryLabelExpression());
        if (label === "Leave waitlist") {
          await clickButton("Leave waitlist");
          await waitForButton("Join the waitlist", 10000);
          console.log(`  cleanup: left the ${eventId} waitlist`);
        } else if (label === "Cancel my RSVP") {
          await clickButton("Cancel my RSVP");
          await waitForButton("I'm going", 10000);
          console.log(`  cleanup: cancelled the ${eventId} RSVP`);
        }
      } catch (error) {
        console.warn(`  cleanup: could not reset ${eventId}: ${error.message}`);
      }
    }
  }

  async function screenshotFailure() {
    if (!ws) return;
    try {
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      const file = path.join(os.tmpdir(), `campushub-smoke-failure-${Date.now()}.png`);
      fs.writeFileSync(file, Buffer.from(data, "base64"));
      console.error(`\nFailure screenshot: ${file}`);
      console.error(`Page: ${await evaluate("location.href")}`);
      console.error((await pageText()).slice(0, 700));
    } catch {
      /* best effort */
    }
  }

  try {
    const activePortFile = path.join(profile, "DevToolsActivePort");
    await waitFor(() => fs.existsSync(activePortFile), 15000, "Chrome to open its debugging port");
    const debugPort = Number(fs.readFileSync(activePortFile, "utf8").split(/\r?\n/)[0]);

    await waitFor(
      async () => {
        const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
        return response.ok;
      },
      15000,
      "Chrome DevTools"
    );

    const target = await (
      await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })
    ).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const entry = pending.get(message.id);
        if (!entry) return;
        pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error.message));
        else entry.resolve(message.result);
        return;
      }
      if (message.method === "Runtime.exceptionThrown") {
        pageProblems.push(
          message.params.exceptionDetails?.exception?.description || "Uncaught page exception"
        );
      }
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");

    await step("Log in through the login form", async () => {
      await goto(`${CONFIG.baseUrl}/login`, 'Boolean(document.querySelector("input[type=email]"))');
      await evaluate(`
        (() => {
          const setValue = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
          ).set;
          const email = document.querySelector("input[type=email]");
          const password = document.querySelector("input[type=password]");
          setValue.call(email, ${JSON.stringify(CONFIG.email)});
          email.dispatchEvent(new Event("input", { bubbles: true }));
          setValue.call(password, ${JSON.stringify(CONFIG.password)});
          password.dispatchEvent(new Event("input", { bubbles: true }));
          document.querySelector('form button[type="submit"]').click();
          return true;
        })()
      `);
      await waitFor(() => evaluate('location.pathname !== "/login"'), 20000, "login redirect");
      await waitFor(
        async () => !(await pageText()).includes("Opening your workspace"),
        15000,
        "the app shell"
      );
      loggedIn = true;
    });

    await step("Confirm the test account starts with no RSVPs", async () => {
      await goto(`${CONFIG.baseUrl}/my-events`, 'document.body.innerText.includes("My Events")');
      try {
        await waitForText("No events on your calendar", 10000);
      } catch {
        throw new Error(
          `The smoke account (${CONFIG.email}) already has RSVPs. Use an account with none, or cancel them first.`
        );
      }
    });

    await step(`RSVP to ${CONFIG.rsvpEventId}, then cancel`, async () => {
      await goto(
        `${CONFIG.baseUrl}/events/${CONFIG.rsvpEventId}`,
        `Boolean(${primaryLabelExpression()})`
      );
      const label = await evaluate(primaryLabelExpression());
      if (label !== "I'm going") {
        throw new Error(
          `Expected "${CONFIG.rsvpEventId}" to have free seats, but its action reads "${label}". Set SMOKE_RSVP_EVENT_ID to an event with capacity available.`
        );
      }
      await clickButton("I'm going");
      await waitForButton("Cancel my RSVP");
      await assertText("You're going", "RSVP confirmation");
      await clickButton("Cancel my RSVP");
      await waitForButton("I'm going");
    });

    await step(`Join and leave the ${CONFIG.fullEventId} waitlist`, async () => {
      await goto(
        `${CONFIG.baseUrl}/events/${CONFIG.fullEventId}`,
        `Boolean(${primaryLabelExpression()})`
      );
      const label = await evaluate(primaryLabelExpression());
      if (label !== "Join the waitlist") {
        throw new Error(
          `Expected "${CONFIG.fullEventId}" to be at capacity, but its action reads "${label}". Set SMOKE_FULL_EVENT_ID to a full event.`
        );
      }
      await clickButton("Join the waitlist");
      await waitForButton("Leave waitlist");
      await waitForText("position");
      await clickButton("Leave waitlist");
      await waitForButton("Join the waitlist");
    });

    await step("Show and recover My Events when the API fails", async () => {
      await send("Network.setBlockedURLs", {
        urls: ["*/api/events*", "*/api/signups*"],
      });
      try {
        await goto(
          `${CONFIG.baseUrl}/my-events`,
          `Boolean(document.querySelector('[role="alert"]'))`
        );
        await assertText("Your events didn't load", "My Events error");
        await waitForButton("Try again");
      } finally {
        await send("Network.setBlockedURLs", { urls: [] });
      }
      await clickButton("Try again");
      await waitForText("No events on your calendar", 20000);
    });

    await step("Show and recover Event Detail when the API fails", async () => {
      await send("Network.setBlockedURLs", { urls: ["*/api/events*"] });
      try {
        await goto(
          `${CONFIG.baseUrl}/events/${CONFIG.rsvpEventId}`,
          `Boolean(document.querySelector('[role="alert"]'))`
        );
        await assertText("This event didn't load", "Event Detail error");
        await waitForButton("Try again");
      } finally {
        await send("Network.setBlockedURLs", { urls: [] });
      }
      await clickButton("Try again");
      await waitForButton("I'm going", 20000);
    });

    await step("Verify the test account is clean again", async () => {
      await goto(`${CONFIG.baseUrl}/my-events`, 'document.body.innerText.includes("My Events")');
      await waitForText("No events on your calendar", 15000);
    });

    if (pageProblems.length > 0) {
      console.warn(`\nPage warnings (${pageProblems.length}):`);
      pageProblems.forEach((problem) => console.warn(`  ${problem.split("\n")[0]}`));
    }

    console.log(`\nSmoke passed in ${Date.now() - runStarted}ms.`);
  } catch (error) {
    console.error(`\nSmoke failed: ${error.message}`);
    await screenshotFailure();
    process.exitCode = 1;
  } finally {
    await cleanupSignups();
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    browser.kill();
    await Promise.race([new Promise((resolve) => browser.once("exit", resolve)), sleep(3000)]);
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch {
      /* Windows can hold the profile briefly. */
    }
  }
}

main().catch((error) => {
  console.error(`\nSmoke failed: ${error.message}`);
  process.exitCode = 1;
});
