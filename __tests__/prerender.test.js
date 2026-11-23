import { createServer } from "node:http";
import path from "node:path";
import {
  createPrerenderServer,
  injectMetadata,
  resolveMetadata,
} from "../deploy/prerender-server.js";

const TEMPLATE = `<!doctype html>
<html>
  <head>
    <meta name="description" content="Old description">
    <meta property="og:title" content="Old title">
    <meta property="og:description" content="Old description">
    <title>Old title</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

function jsonLdFrom(html) {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (scripts.length === 0) return null;
  expect(scripts).toHaveLength(1);
  return JSON.parse(scripts[0][1]);
}

function expectValidEventJsonLd(value) {
  expect(value).toMatchObject({
    "@context": "https://schema.org",
    "@type": "Event",
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place" },
  });
  expect(typeof value.name).toBe("string");
  expect(value.name.trim()).not.toBe("");
  expect(Number.isNaN(Date.parse(value.startDate))).toBe(false);
  expect(typeof value.location.name).toBe("string");
  expect(value.location.name.trim()).not.toBe("");
}

describe("prerender metadata", () => {
  test("injects one complete set of crawler tags and escapes values", () => {
    const html = injectMetadata(TEMPLATE, {
      title: 'Cooking & "Culture" — Kesho',
      description: "A club & its <events>",
      pathname: "/clubs/club-01",
      origin: "https://kesho.example",
      private: false,
      image: "https://kesho.example/images/club.jpg",
    });

    expect(html).toContain("<title>Cooking &amp; &quot;Culture&quot; — Kesho</title>");
    expect(html).toContain('content="A club &amp; its &lt;events&gt;"');
    expect(html).toContain('rel="canonical" href="https://kesho.example/clubs/club-01"');
    expect(html).toContain('name="robots" content="index, follow"');
    expect(html).toContain('property="og:image" content="https://kesho.example/images/club.jpg"');
    expect(html).not.toContain("Old description");
    expect(html).not.toContain("Old title");
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
  });

  test("marks private routes noindex", async () => {
    const page = await resolveMetadata("/dashboard/club-01", "https://kesho.example", async () => {
      throw new Error("private routes must not call the API");
    });

    expect(page.private).toBe(true);
    expect(page.title).toBe("Club dashboard — Kesho");
  });

  test("uses the public club record for a club URL", async () => {
    const page = await resolveMetadata("/clubs/club-01", "https://kesho.example", async (path) => {
      expect(path).toBe("/api/v2/clubs/club-01");
      return {
        club: {
          name: "Debate & Rhetoric Society",
          category: "Academic",
          description: "Weekly debates and public speaking practice.",
          campusName: "Strathmore University",
          logoUrl: "/images/clubs/club-01.jpg",
        },
      };
    });

    expect(page.title).toBe("Debate & Rhetoric Society — Kesho");
    expect(page.description).toBe("Weekly debates and public speaking practice.");
    expect(page.image).toBe("https://kesho.example/images/clubs/club-01.jpg");
    expect(page.jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Debate & Rhetoric Society",
      url: "https://kesho.example/clubs/club-01",
      logo: "https://kesho.example/images/clubs/club-01.jpg",
      address: "Strathmore University",
    });
  });

  test("uses the public event record and emits Event structured data", async () => {
    const page = await resolveMetadata(
      "/events/event-01",
      "https://kesho.example",
      async (path) => {
        expect(path).toBe("/api/v2/events");
        return {
          events: [
            {
              id: "event-01",
              clubId: "club-01",
              clubName: "Debate & Rhetoric Society",
              campusName: "Strathmore University",
              title: "Friday night debate",
              description: "Two rounds, open floor after.",
              startTime: "2026-12-04T17:00:00+03:00",
              location: "Auditorium B",
              imageUrl: "/images/events/event-01.jpg",
            },
          ],
        };
      }
    );

    expect(page.title).toBe("Friday night debate — Kesho");
    expect(page.description).toContain("Auditorium B");
    expectValidEventJsonLd(page.jsonLd);
    expect(page.jsonLd).toMatchObject({
      "@type": "Event",
      name: "Friday night debate",
      startDate: "2026-12-04T17:00:00+03:00",
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: {
        "@type": "Place",
        name: "Auditorium B",
        address: "Strathmore University",
      },
      organizer: {
        "@type": "Organization",
        name: "Debate & Rhetoric Society",
        url: "https://kesho.example/clubs/club-01",
      },
      image: "https://kesho.example/images/events/event-01.jpg",
    });

    const html = injectMetadata(TEMPLATE, page);
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('"@type":"Event"');
  });

  test.each([
    ["an unparseable date", "malformed-date", "not-a-date"],
    ["a non-string date", "malformed-number", 1770000000000],
    ["a missing date", "malformed-missing", undefined],
  ])("omits Event JSON-LD for %s", async (_label, id, startTime) => {
    const page = await resolveMetadata(`/events/${id}`, "https://kesho.example", async (path) => {
      expect(path).toBe("/api/v2/events");
      return {
        events: [
          {
            id,
            title: "Broken date event",
            description: "The date cannot be trusted.",
            startTime,
            location: "Auditorium B",
          },
        ],
      };
    });

    expect(page.title).toBe("Broken date event — Kesho");
    expect(page.jsonLd).toBeNull();
    expect(injectMetadata(TEMPLATE, page)).not.toContain("application/ld+json");
  });

  test("omits Event JSON-LD when the event has no name", async () => {
    const page = await resolveMetadata(
      "/events/malformed-title",
      "https://kesho.example",
      async () => ({
        events: [
          {
            id: "malformed-title",
            title: "   ",
            startTime: "2026-12-04T17:00:00+03:00",
            location: "Auditorium B",
          },
        ],
      })
    );

    expect(page.title).toBe("Event — Kesho");
    expect(page.jsonLd).toBeNull();
    expect(injectMetadata(TEMPLATE, page)).not.toContain("application/ld+json");
  });

  test("omits an organizer URL when the event has no club id", async () => {
    const page = await resolveMetadata(
      "/events/malformed-organizer",
      "https://kesho.example",
      async () => ({
        events: [
          {
            id: "malformed-organizer",
            title: "Friday night debate",
            startTime: "2026-12-04T17:00:00+03:00",
            location: "Auditorium B",
            clubName: "Debate & Rhetoric Society",
            clubId: null,
          },
        ],
      })
    );

    expectValidEventJsonLd(page.jsonLd);
    expect(page.jsonLd.organizer).toEqual({
      "@type": "Organization",
      name: "Debate & Rhetoric Society",
    });
    expect(JSON.stringify(page.jsonLd)).not.toContain("/clubs/undefined");
  });

  test("keeps hostile event text inside a parseable JSON-LD script", async () => {
    const title = 'Friday </script><script>alert("debate")</script> night';
    const page = await resolveMetadata(
      "/events/hostile-text",
      "https://kesho.example",
      async () => ({
        events: [
          {
            id: "hostile-text",
            title,
            description: 'Two rounds </script><script>alert("description")</script>.',
            startTime: "2026-12-04T17:00:00+03:00",
            location: "Auditorium B",
          },
        ],
      })
    );

    const html = injectMetadata(TEMPLATE, page);
    const jsonLd = jsonLdFrom(html);

    expectValidEventJsonLd(jsonLd);
    expect(jsonLd.name).toBe(title);
    expect(jsonLd.description).toContain("</script><script>");
    expect(html).not.toContain("</script><script>");
    expect(html).toContain("\\u003c/script>");
  });

  test("uses the public commitment record for a commitment URL", async () => {
    const page = await resolveMetadata(
      "/commitments/commit-01",
      "https://kesho.example",
      async (path) => {
        expect(path).toBe("/api/v2/commitments/commit-01");
        return {
          commitment: {
            title: "Tree planting morning",
            clubName: "Agri-Business & Farming",
            location: "Karura Forest",
            description: "Bring gloves and a water bottle.",
          },
        };
      }
    );

    expect(page.title).toBe("Tree planting morning — Kesho");
    expect(page.description).toContain("Karura Forest");
    expect(page.jsonLd).toBeNull();
  });

  test("falls back to generic event metadata when the API is unavailable", async () => {
    const page = await resolveMetadata(
      "/events/offline-event",
      "https://kesho.example",
      async () => {
        throw new Error("API offline");
      }
    );

    expect(page.title).toBe("Event — Kesho");
    expect(page.description).toBe("View event details and RSVP on Kesho.");
    expect(page.private).toBe(false);
  });

  test("the gateway serves club metadata and marks the dashboard private", async () => {
    const api = createServer((request, response) => {
      if (request.url === "/api/v2/clubs/club-01") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            club: {
              name: "Debate & Rhetoric Society",
              category: "Academic",
              description: "Weekly debates and public speaking practice.",
              logoUrl: "/images/clubs/club-01.jpg",
            },
          })
        );
        return;
      }
      if (request.url === "/api/v2/events") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            events: [
              {
                id: "event-01",
                clubId: "club-01",
                clubName: "Debate & Rhetoric Society",
                title: "Friday night debate",
                description: "Two rounds, open floor after.",
                startTime: "2026-12-04T17:00:00+03:00",
                location: "Auditorium B",
                imageUrl: "/images/events/event-01.jpg",
              },
            ],
          })
        );
        return;
      }
      if (request.url === "/api/v2/commitments/commit-01") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            commitment: {
              title: "Tree planting morning",
              clubName: "Agri-Business & Farming",
              location: "Karura Forest",
              description: "Bring gloves and a water bottle.",
            },
          })
        );
        return;
      }
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Not found." }));
    });
    await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
    const apiAddress = api.address();

    const previousApiUrl = process.env.API_INTERNAL_URL;
    const previousKey = process.env.PRERENDER_API_KEY;
    process.env.API_INTERNAL_URL = `http://127.0.0.1:${apiAddress.port}`;
    process.env.PRERENDER_API_KEY = "test-key";

    const gateway = await createPrerenderServer({ htmlPath: path.resolve("index.html") });
    await new Promise((resolve) => gateway.listen(0, "127.0.0.1", resolve));
    const gatewayAddress = gateway.address();
    const base = `http://127.0.0.1:${gatewayAddress.port}`;

    try {
      const clubResponse = await fetch(`${base}/clubs/club-01`);
      const clubHtml = await clubResponse.text();
      expect(clubResponse.status).toBe(200);
      expect(clubHtml).toContain("<title>Debate &amp; Rhetoric Society — Kesho</title>");
      expect(clubHtml).toContain('name="robots" content="index, follow"');
      expect(clubHtml).toContain("application/ld+json");

      const eventResponse = await fetch(`${base}/events/event-01`);
      const eventHtml = await eventResponse.text();
      expect(eventResponse.status).toBe(200);
      expect(eventHtml).toContain("<title>Friday night debate — Kesho</title>");
      expect(eventHtml).toContain('"@type":"Event"');

      const commitmentResponse = await fetch(`${base}/commitments/commit-01`);
      const commitmentHtml = await commitmentResponse.text();
      expect(commitmentResponse.status).toBe(200);
      expect(commitmentHtml).toContain("<title>Tree planting morning — Kesho</title>");
      expect(commitmentHtml).toContain("Karura Forest");

      const dashboardResponse = await fetch(`${base}/dashboard/club-01`);
      const dashboardHtml = await dashboardResponse.text();
      expect(dashboardResponse.status).toBe(200);
      expect(dashboardHtml).toContain('name="robots" content="noindex, nofollow"');
    } finally {
      await new Promise((resolve) => gateway.close(resolve));
      await new Promise((resolve) => api.close(resolve));
      if (previousApiUrl === undefined) delete process.env.API_INTERNAL_URL;
      else process.env.API_INTERNAL_URL = previousApiUrl;
      if (previousKey === undefined) delete process.env.PRERENDER_API_KEY;
      else process.env.PRERENDER_API_KEY = previousKey;
    }
  });
});
