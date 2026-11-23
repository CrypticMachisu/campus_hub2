import { test, expect } from "@playwright/test";
import { gate, installWorkspaceApi, openWorkspace, TEST_MEMBER } from "./workspace-fixture";

test("a member sees club-wide pins but no pin controls", async ({ page }) => {
  await installWorkspaceApi(page, {
    user: TEST_MEMBER,
    pins: [{ itemType: "comment", itemId: "c1", pinnedAt: "2026-11-21T13:00:00.000Z" }],
  });
  await openWorkspace(page);
  await expect(page.locator("[data-feed-item]")).toHaveCount(3);

  await expect(page.locator("[data-feed-item]").first()).toHaveAttribute(
    "data-feed-item",
    "comment-c1"
  );
  await expect(page.locator('[data-feed-item="comment-c1"]')).toContainText("Pinned");
  await expect(page.getByText("3 items · 1 pinned")).toBeVisible();

  await expect(
    page.getByRole("button", { name: /(Pin|Unpin) (Announcement|Discussion).* for the club/ })
  ).toHaveCount(0);
});

test("a manager pins a feed item for the whole club", async ({ page }) => {
  const { pinRequests } = await installWorkspaceApi(page);
  await openWorkspace(page);
  await expect(page.locator("[data-feed-item]")).toHaveCount(3);

  const firstItem = page.locator("[data-feed-item]").first();
  await expect(firstItem).toHaveAttribute("data-feed-item", "announcement-a1");

  await page.getByRole("button", { name: /Pin Discussion from Priya Nair for the club/ }).click();

  await expect(firstItem).toHaveAttribute("data-feed-item", "comment-c1");
  await expect(page.locator('[data-feed-item="comment-c1"]')).toContainText("Pinned");
  await expect(page.getByRole("status").filter({ hasText: "pinned for everyone" })).toHaveText(
    "Discussion from Priya Nair pinned for everyone in the club."
  );
  expect(pinRequests).toHaveLength(1);
  expect(pinRequests[0]).toMatchObject({
    method: "POST",
    body: { clubId: "club-01", itemType: "comment", itemId: "c1" },
  });
});

test("a failed pin rolls the feed order back and announces the failure", async ({ page }) => {
  const pinGate = gate();
  const { pinRequests } = await installWorkspaceApi(page, {
    pinGate,
    pinFailure: "Pin storage is unavailable.",
  });
  await openWorkspace(page);
  await expect(page.locator("[data-feed-item]")).toHaveCount(3);

  const firstItem = page.locator("[data-feed-item]").first();
  await page.getByRole("button", { name: /Pin Discussion from Priya Nair for the club/ }).click();

  // Optimistic reorder happens before the API answers.
  await expect(firstItem).toHaveAttribute("data-feed-item", "comment-c1");
  expect(pinRequests).toHaveLength(1);

  pinGate.release();
  await expect(firstItem).toHaveAttribute("data-feed-item", "announcement-a1");
  await expect(page.getByRole("status").filter({ hasText: "Pin failed" })).toHaveText(
    "Pin failed: Pin storage is unavailable. The previous order was restored."
  );
  await expect(page.locator('[data-feed-item="comment-c1"]')).not.toContainText("Pinned");
});
