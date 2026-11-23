import { test, expect } from "@playwright/test";
import { installWorkspaceApi } from "./workspace-fixture";

// A runtime visual check rather than pixel snapshots: it catches the dark-mode
// regression we actually care about (a page or card reverting to a light
// surface) without tying the suite to one OS font rasterizer.
const MAIN_PAGES = [
  ["this week", "/discover"],
  ["club workspace", "/workspace/club-01"],
  ["club profile", "/clubs/club-01"],
  ["club desk", "/dashboard/club-01"],
  ["my network", "/network"],
];

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });

for (const [name, path] of MAIN_PAGES) {
  test(`dark surfaces stay dark on ${name}`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("campushub_theme", "dark");
      localStorage.setItem("campushub_token", "browser-test-token");
    });
    await installWorkspaceApi(page);
    await page.goto(path, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Switch to light mode" }).first()).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toMatch(
      /^oklch\(0\.175\s/
    );

    const brightSurfaces = await page.evaluate(() => {
      const found = [];
      for (const element of document.querySelectorAll("body *")) {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (
          rect.width * rect.height < 2_500 ||
          style.visibility === "hidden" ||
          style.display === "none"
        ) {
          continue;
        }
        const match = style.backgroundColor.match(
          /rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[, /]+([\d.]+))?\)/
        );
        if (!match) continue;
        const alpha = match[4] === undefined ? 1 : Number(match[4]);
        const luminance =
          (0.2126 * Number(match[1]) + 0.7152 * Number(match[2]) + 0.0722 * Number(match[3])) / 255;
        if (alpha > 0.5 && luminance > 0.72) {
          found.push({
            tag: element.tagName,
            className: String(element.className).slice(0, 60),
            background: style.backgroundColor,
            text: element.innerText?.trim().slice(0, 40),
          });
        }
      }
      return found.slice(0, 8);
    });

    expect(brightSurfaces, "large light surfaces found in dark mode").toEqual([]);
  });
}
