import { test, expect } from "@playwright/test";
import { installWorkspaceApi } from "./workspace-fixture";

const NEXT_EVENT = {
  id: "event-01",
  clubId: "club-01",
  clubName: "Debate & Rhetoric Society",
  campusName: "Strathmore University",
  title: "Friday night debate",
  description: "Two rounds, open floor after.",
  category: "Academic",
  startTime: "2026-12-04T17:00:00+03:00",
  location: "Auditorium B",
  imageUrl: "",
  bringNote: "",
  capacity: 60,
  audience: "campus",
  signupCount: 12,
  isSeed: true,
};

test("event cards use the branded fallback when no image is set", async ({ page }) => {
  await installWorkspaceApi(page);

  await page.goto("/clubs/club-01");
  const image = page.locator("#events img").first();

  await expect(image).toHaveAttribute("src", "/event-fallback.svg");
});

test("event cards use the branded fallback when an image fails to load", async ({ page }) => {
  await page.route("**/broken-event-image.jpg", (route) =>
    route.fulfill({ status: 404, body: "" })
  );
  await installWorkspaceApi(page, {
    events: [{ ...NEXT_EVENT, imageUrl: "/broken-event-image.jpg" }],
  });

  await page.goto("/clubs/club-01");
  const image = page.locator("#events img").first();

  await expect(image).toHaveAttribute("src", "/event-fallback.svg");
});

test("route metadata updates title, description and Open Graph tags", async ({ page }) => {
  await installWorkspaceApi(page);

  await page.goto("/login");
  await expect(page).toHaveTitle("Log in — Kesho");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Log in to your Kesho account."
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Log in — Kesho"
  );

  await page.goto("/clubs/club-01");
  await expect(page).toHaveTitle("Debate & Rhetoric Society — Kesho");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Weekly debates, public speaking practice and inter-campus tournaments."
  );

  await page.goto("/events/event-01");
  await expect(page).toHaveTitle("Friday night debate — Kesho");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Two rounds, open floor after."
  );
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    "content",
    "Two rounds, open floor after."
  );
});
