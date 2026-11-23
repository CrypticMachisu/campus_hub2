import { test, expect } from "@playwright/test";
import { FEED_COMMENTS, installWorkspaceApi, openWorkspace, TEST_USER } from "./workspace-fixture";

test("Discover filters hydrate from the URL and survive Back and reload", async ({ page }) => {
  await installWorkspaceApi(page);
  await page.addInitScript(() => localStorage.setItem("campushub_token", "browser-test-token"));

  await page.goto("/discover?q=debate&category=Academic&view=events");
  const search = page.locator("#edition-search");

  await expect(search).toHaveValue("debate");
  await expect(page.getByRole("button", { name: "Academic", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByRole("button", { name: "Events", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page).not.toHaveURL(/category=/);
  await page.goBack();
  await expect(page).toHaveURL(/category=Academic/);
  await expect(page.getByRole("button", { name: "Academic", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await search.fill("robot");
  await expect(page).toHaveURL(/q=robot/);
  await page.reload();
  await expect(page.locator("#edition-search")).toHaveValue("robot");
});

test("the offline strip is in flow, clears after reconnect, and never covers chrome", async ({
  page,
}) => {
  await installWorkspaceApi(page);
  await openWorkspace(page);

  const context = page.context();
  await context.setOffline(true);
  const strip = page.locator('[data-state="offline"]');
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("Offline · changes may not save");

  const layout = await page.evaluate(() => {
    const status = document.querySelector('[data-state="offline"]');
    const main = [...document.querySelectorAll("main")].find(
      (element) => element.getBoundingClientRect().height > 0
    );
    if (!status || !main) return null;
    const statusRect = status.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    return {
      position: getComputedStyle(status).position,
      statusTop: statusRect.top,
      statusBottom: statusRect.bottom,
      mainTop: mainRect.top,
    };
  });

  expect(layout).not.toBeNull();
  expect(layout.position).not.toBe("fixed");
  expect(layout.position).not.toBe("absolute");
  expect(layout.statusTop).toBeGreaterThanOrEqual(0);
  expect(layout.statusBottom).toBeLessThanOrEqual(layout.mainTop + 1);

  await context.setOffline(false);
  await expect(page.getByText("Back online · connection restored")).toBeVisible();
  await expect(page.locator('[data-state="restored"]')).toHaveCount(0, { timeout: 5_000 });
});

test("an unpublished club update blocks link navigation until confirmed", async ({ page }) => {
  await installWorkspaceApi(page);
  await page.addInitScript(() => localStorage.setItem("campushub_token", "browser-test-token"));
  await page.goto("/clubs/club-01");

  await page.getByRole("button", { name: "Write a post" }).click();
  const draft = page.getByPlaceholder("What should the club know?");
  await draft.fill("A draft that must survive a dismissed navigation.");

  const before = page.url();
  let prompt = "";
  page.once("dialog", async (dialog) => {
    prompt = dialog.message();
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "This week's edition" }).click();

  await expect(page).toHaveURL(before);
  await expect(draft).toHaveValue("A draft that must survive a dismissed navigation.");
  expect(prompt).toContain("unpublished club update");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("link", { name: "This week's edition" }).click();
  await expect(page).toHaveURL(/\/discover$/);
});

test("re-authenticating after session expiry keeps the open draft", async ({ page }) => {
  await installWorkspaceApi(page);
  await page.addInitScript(() => localStorage.setItem("campushub_token", "browser-test-token"));
  await page.route("**/api/v2/auth/login", async (route) => {
    const body = route.request().postDataJSON();
    if (body.password !== "correct-horse") {
      return route.fulfill({ status: 401, json: { error: "Invalid credentials" } });
    }
    return route.fulfill({ json: { token: "restored-token", user: TEST_USER } });
  });

  await page.goto("/clubs/club-01");
  await page.getByRole("button", { name: "Write a post" }).click();
  const draft = page.getByPlaceholder("What should the club know?");
  await draft.fill("This draft must survive re-authentication.");

  await page.evaluate(() => window.dispatchEvent(new CustomEvent("campushub:session-expired")));
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await page.locator("#session-expiry-password").fill("wrong");
  await page.getByRole("button", { name: "Log in again" }).click();
  await expect(page.getByRole("alert")).toContainText("draft is still here");
  await expect(draft).toHaveValue("This draft must survive re-authentication.");

  await page.locator("#session-expiry-password").fill("correct-horse");
  await page.getByRole("button", { name: "Log in again" }).click();
  await expect(dialog).toBeHidden();
  await expect(draft).toHaveValue("This draft must survive re-authentication.");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("campushub_token")))
    .toBe("restored-token");
});

test("the request that expired is retried after re-authentication", async ({ page }) => {
  await installWorkspaceApi(page);
  await page.addInitScript(() => localStorage.setItem("campushub_token", "browser-test-token"));

  const commentRequests = [];
  let expired = false;
  await page.route("**/api/v2/comments*", async (route) => {
    commentRequests.push(route.request().url());
    if (!expired) {
      expired = true;
      return route.fulfill({ status: 401, json: { error: "Session expired" } });
    }
    return route.fulfill({ json: { comments: FEED_COMMENTS } });
  });
  await page.route("**/api/v2/auth/login", (route) =>
    route.fulfill({ json: { token: "restored-token", user: TEST_USER } })
  );

  await page.goto("/clubs/club-01");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await page.locator("#session-expiry-password").fill("correct-horse");
  await page.getByRole("button", { name: "Log in again" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText("Can we start the workshop half an hour earlier?")).toBeVisible();
  await expect.poll(() => commentRequests.length).toBeGreaterThanOrEqual(2);
});

test("a second expiry after a retry opens a fresh re-authentication cycle", async ({ page }) => {
  await installWorkspaceApi(page);
  await page.addInitScript(() => {
    localStorage.setItem("campushub_token", "browser-test-token");
    window.__expiryEvents = 0;
    window.addEventListener("campushub:session-expired", () => {
      window.__expiryEvents += 1;
    });
  });

  const commentRequests = [];
  let loginRequests = 0;
  await page.route("**/api/v2/comments*", async (route) => {
    commentRequests.push(route.request().url());
    // Two mounts in development StrictMode mean two requests per attempt:
    // initial 401s, then 401s again after the first re-auth, then success.
    if (commentRequests.length <= 4) {
      return route.fulfill({ status: 401, json: { error: "Session expired" } });
    }
    return route.fulfill({ json: { comments: FEED_COMMENTS } });
  });
  await page.route("**/api/v2/auth/login", (route) => {
    loginRequests += 1;
    return route.fulfill({
      json: { token: `restored-token-${loginRequests}`, user: TEST_USER },
    });
  });

  await page.goto("/clubs/club-01");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await page.locator("#session-expiry-password").fill("first-password");
  await page.getByRole("button", { name: "Log in again" }).click();
  await expect.poll(() => page.evaluate(() => window.__expiryEvents)).toBeGreaterThanOrEqual(4);
  await expect(dialog).toBeVisible();

  await page.locator("#session-expiry-password").fill("second-password");
  await page.getByRole("button", { name: "Log in again" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Can we start the workshop half an hour earlier?")).toBeVisible();
  expect(loginRequests).toBe(2);
  await expect.poll(() => commentRequests.length).toBeGreaterThanOrEqual(5);
});

test("the OS theme updates live until the user chooses one", async ({ page }) => {
  await page.route("**/api/v2/auth/me", (route) =>
    route.fulfill({ status: 401, json: { error: "Not signed in" } })
  );
  await page.addInitScript(() => localStorage.removeItem("campushub_theme"));
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("campushub_theme"))).toBeNull();

  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => localStorage.getItem("campushub_theme"))).toBe("light");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Follow system theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("campushub_theme"))).toBeNull();
  await expect(page.getByRole("button", { name: "Follow system theme" })).toHaveCount(0);
});

test("the theme choice persists across reloads", async ({ page }) => {
  await installWorkspaceApi(page);
  await openWorkspace(page);

  const toggle = page.getByRole("button", { name: "Switch to dark mode" }).first();
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Switch to light mode" }).first()).toBeVisible();
});
