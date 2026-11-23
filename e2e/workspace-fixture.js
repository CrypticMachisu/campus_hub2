// Shared API fixtures for the workspace browser tests. The UI, pin store and
// rollback logic run for real; only the network is mocked so the tests do not
// depend on a seeded MySQL database or a running API.
import { expect } from "@playwright/test";

export const TEST_USER = {
  id: "user-02",
  name: "Leo Fischer",
  email: "leo.fischer@campus.edu",
  role: "tier2",
  campusId: "campus-01",
  campusName: "Strathmore University",
  campusSlug: "strathmore",
  adminForClubs: ["club-01"],
  memberOfClubs: ["club-01"],
  familyAdminOf: [],
};

export const TEST_MEMBER = {
  ...TEST_USER,
  id: "user-05",
  name: "Sofia Ramirez",
  email: "sofia.ramirez@campus.edu",
  role: "member",
  adminForClubs: [],
};

export const TEST_CLUB = {
  id: "club-01",
  campusId: "campus-01",
  campusName: "Strathmore University",
  familyId: null,
  familyName: "",
  familySlug: "",
  name: "Debate & Rhetoric Society",
  category: "Academic",
  description: "Weekly debates, public speaking practice and inter-campus tournaments.",
  logoUrl: "/favicon.svg",
  meetingTime: "Thu 17:00",
  meetingLocation: "Auditorium B",
  tags: ["debate", "public-speaking"],
  playbookOverrides: {},
};

export const FEED_ANNOUNCEMENTS = [
  {
    id: "a1",
    clubId: "club-01",
    text: "Volunteer day briefing moved to the auditorium.",
    createdAt: "2026-11-21T12:00:00.000Z",
  },
  {
    id: "a2",
    clubId: "club-01",
    text: "Bring your speaker notes to Thursday's practice.",
    createdAt: "2026-11-20T09:00:00.000Z",
  },
];

export const FEED_COMMENTS = [
  {
    id: "c1",
    targetType: "club",
    targetId: "club-01",
    userId: "user-04",
    userName: "Priya Nair",
    text: "Can we start the workshop half an hour earlier?",
    parentId: null,
    pinned: false,
    createdAt: "2026-11-21T10:00:00.000Z",
    reactions: [],
    canModerate: true,
  },
];

export const ROSTER = [
  {
    id: "user-02",
    name: "Leo Fischer",
    email: "leo.fischer@campus.edu",
    role: "tier2",
  },
  {
    id: "user-04",
    name: "Priya Nair",
    email: "priya.nair@campus.edu",
    role: "member",
  },
];

const NEXT_EVENT = {
  id: "event-01",
  clubId: "club-01",
  clubName: TEST_CLUB.name,
  campusName: TEST_CLUB.campusName,
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

/**
 * Serve every request the member workspace makes. Gates let a test hold one
 * panel's response while proving that the other panels already settled.
 */
export async function installWorkspaceApi(page, options = {}) {
  const pinRequests = [];
  const pins = options.pins ? [...options.pins] : [];
  const user = options.user || TEST_USER;
  const events = options.events || [NEXT_EVENT];
  const canModerate = user.role === "tier1" || user.adminForClubs.includes("club-01");
  const comments = FEED_COMMENTS.map((comment) => ({ ...comment, canModerate }));

  await page.route("**/api/v2/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api\/v2/, "");
    const method = request.method();

    if (path === "/auth/me") {
      return route.fulfill({ json: { user } });
    }

    if (path === "/clubs" && method === "GET") {
      return route.fulfill({ json: { clubs: [TEST_CLUB] } });
    }

    if (path === "/clubs/club-01/members") {
      if (options.rosterGate) await options.rosterGate.promise;
      return route.fulfill({ json: { members: ROSTER } });
    }

    if (path === "/events") {
      return route.fulfill({ json: { events } });
    }

    if (path === "/signups/mine") {
      return route.fulfill({ json: { signups: [] } });
    }

    if (path === "/announcements") {
      if (options.feedGate) await options.feedGate.promise;
      return route.fulfill({ json: { announcements: FEED_ANNOUNCEMENTS } });
    }

    if (path === "/comments" && method === "GET") {
      if (options.feedGate) await options.feedGate.promise;
      return route.fulfill({ json: { comments } });
    }

    if (path === "/commitments") {
      return route.fulfill({ json: { commitments: [] } });
    }

    if (path === "/workspace-pins" && method === "GET") {
      return route.fulfill({ json: { pins } });
    }

    if (path === "/workspace-pins" && method === "POST") {
      pinRequests.push({ method, body: request.postDataJSON() });
      if (options.pinGate) await options.pinGate.promise;
      if (options.pinFailure) {
        return route.fulfill({
          status: 500,
          json: { error: options.pinFailure },
        });
      }
      const body = request.postDataJSON();
      return route.fulfill({
        json: {
          pin: {
            itemType: body.itemType,
            itemId: body.itemId,
            pinnedAt: new Date().toISOString(),
          },
        },
      });
    }

    if (path === "/workspace-pins" && method === "DELETE") {
      pinRequests.push({ method, url: request.url() });
      return route.fulfill({ status: 204, body: "" });
    }

    return route.fulfill({
      status: 404,
      json: { error: `No workspace fixture for ${method} ${path}` },
    });
  });

  return { pinRequests, pins };
}

/** Fresh browser context with a token and an optional cached plate-size pair. */
export async function openWorkspace(page, { plateCounts } = {}) {
  await page.addInitScript((counts) => {
    localStorage.setItem("campushub_token", "browser-test-token");
    if (counts) {
      localStorage.setItem(
        "campushub_workspace_plate_counts:user-02:club-01",
        JSON.stringify(counts)
      );
    }
  }, plateCounts);

  await page.goto("/workspace/club-01");
  await expect(page.getByRole("heading", { name: TEST_CLUB.name })).toBeVisible();
}

/** Resolvable promise used to hold a panel response inside a route handler. */
export function gate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
}
