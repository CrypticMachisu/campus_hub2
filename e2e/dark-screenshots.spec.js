import { test, expect } from "@playwright/test";
import { installWorkspaceApi } from "./workspace-fixture";

const MAIN_PAGES = [
  ["dark-discover", "/discover"],
  ["dark-workspace", "/workspace/club-01"],
  ["dark-club-profile", "/clubs/club-01"],
  ["dark-club-desk", "/dashboard/club-01"],
  ["dark-network", "/network"],
];

test.describe("dark mode pixel baselines", () => {
  // The committed baselines are generated on Linux so CI and contributors
  // compare against the same font rasterizer. The computed-surface spec still
  // runs everywhere.
  test.skip(process.platform !== "linux", "Dark pixel baselines are generated on Linux");

  test.use({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "dark",
    reducedMotion: "reduce",
    timezoneId: "UTC",
  });

  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date("2026-11-22T12:00:00Z") });
    await page.addInitScript(() => {
      localStorage.setItem("campushub_theme", "dark");
      localStorage.setItem("campushub_token", "browser-test-token");
    });
    await installWorkspaceApi(page);
  });

  for (const [name, path] of MAIN_PAGES) {
    test(name, async ({ page }) => {
      await page.goto(path, { waitUntil: "networkidle" });
      await page.addStyleTag({
        content: "html { scrollbar-width: none; } html::-webkit-scrollbar { display: none; }",
      });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);

      await expect(page).toHaveScreenshot(`${name}.png`, {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.005,
      });
    });
  }
});
