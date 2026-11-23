import { test, expect } from "@playwright/test";
import { gate, installWorkspaceApi, openWorkspace } from "./workspace-fixture";

test("workspace plates settle independently without waiting for the feed", async ({ page }) => {
  const feedGate = gate();
  const rosterGate = gate();
  await installWorkspaceApi(page, { feedGate, rosterGate });
  await openWorkspace(page);

  // The next event and agenda are their own requests, so they are already done.
  await expect(page.locator('[data-workspace-plate="next"]')).toHaveAttribute("aria-busy", "false");
  await expect(page.locator('[data-workspace-plate="agenda"]')).toHaveCount(0);

  // The held panels keep their plates even though the rest of the page is usable.
  await expect(page.locator('[data-workspace-plate="feed"]')).toHaveAttribute("aria-busy", "true");
  await expect(page.locator('[data-workspace-plate="roster"]')).toHaveAttribute(
    "aria-busy",
    "true"
  );

  rosterGate.release();
  await expect(page.locator('[data-workspace-plate="roster"]')).toHaveAttribute(
    "aria-busy",
    "false"
  );
  await expect(page.getByText("2 people")).toBeVisible();
  await expect(page.locator('[data-workspace-plate="feed"]')).toHaveAttribute("aria-busy", "true");

  feedGate.release();
  await expect(page.locator('[data-workspace-plate="feed"]')).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("[data-feed-item]")).toHaveCount(3);
});

test("cached feed and roster sizes shape the first loading plates", async ({ page }) => {
  const feedGate = gate();
  const rosterGate = gate();
  await installWorkspaceApi(page, { feedGate, rosterGate });
  await openWorkspace(page, { plateCounts: { feed: 4, roster: 6 } });

  await expect(
    page.locator('[data-workspace-plate="feed"] ul[aria-hidden="true"] > li')
  ).toHaveCount(4);
  await expect(
    page.locator('[data-workspace-plate="roster"] [aria-hidden="true"] > div')
  ).toHaveCount(6);

  rosterGate.release();
  feedGate.release();
  await expect(page.locator("[data-feed-item]")).toHaveCount(3);
  await expect(page.getByText("2 people")).toBeVisible();
});
