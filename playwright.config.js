import { defineConfig } from "@playwright/test";

// Locally the suite uses the installed Chrome, matching the existing smoke
// workflow. CI installs Playwright's pinned Chromium instead, so the browser
// version is reproducible on the runner.
const channel = process.env.PLAYWRIGHT_CHANNEL || (process.env.CI ? undefined : "chrome");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
