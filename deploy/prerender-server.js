// Crawler-facing HTML for the SPA.
//
// nginx serves the built assets directly. Any document request that has no
// file on disk is proxied here instead of falling straight through to
// index.html, so social scrapers and search crawlers receive route-specific
// <title>, description, canonical and Open Graph tags before React runs.
//
// The public pages are filled from the same API the browser uses. When the API
// is unavailable (or a route is private), the shell still serves with sensible
// route-level metadata rather than failing the page.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const SITE_NAME = "Kesho";
const DEFAULT_DESCRIPTION =
  "Find clubs and events across your campus, RSVP, and keep every commitment in one place.";
const DEFAULT_IMAGE = "/previews/gsap/discover.png";

const STATIC_ROUTES = new Map([
  ["/", { title: "This week on campus", description: DEFAULT_DESCRIPTION }],
  ["/discover", { title: "This week on campus", description: DEFAULT_DESCRIPTION }],
  [
    "/login",
    {
      title: "Log in",
      description: "Log in to your Kesho account.",
    },
  ],
  [
    "/forgot-password",
    {
      title: "Reset your password",
      description: "Get help resetting your Kesho password.",
    },
  ],
  [
    "/reset-password",
    {
      title: "Set a new password",
      description: "Choose a new password for your Kesho account.",
      private: true,
    },
  ],
  [
    "/my-events",
    {
      title: "My commitments",
      description: "Your RSVPs and commitments across campus.",
      private: true,
    },
  ],
  [
    "/network",
    {
      title: "My network",
      description: "Events, commitments and posts shared across your club network.",
      private: true,
    },
  ],
  [
    "/families",
    {
      title: "Club families",
      description: "Shared identities that connect chapters across campuses.",
      private: true,
    },
  ],
  [
    "/campus-access",
    {
      title: "Campus access",
      description: "Request access to another campus in your club network.",
      private: true,
    },
  ],
  [
    "/settings/campuses",
    {
      title: "Campus settings",
      description: "Campus identity and registration domains.",
      private: true,
    },
  ],
  [
    "/settings/families",
    {
      title: "Family settings",
      description: "Shared identity for a club family.",
      private: true,
    },
  ],
  [
    "/dashboard",
    {
      title: "Club dashboard",
      description: "Manage your club's events, commitments and posts.",
      private: true,
    },
  ],
  [
    "/workspace",
    {
      title: "Club workspace",
      description: "Your club's private workspace.",
      private: true,
    },
  ],
]);

const PRIVATE_PREFIXES = [
  "/dashboard/",
  "/workspace/",
  "/settings/",
  "/my-events",
  "/campus-access",
  "/network",
];

const cache = new Map();
const CACHE_TTL_MS = 60_000;

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, length = 160) {
  const text = cleanText(value);
  return text.length > length ? `${text.slice(0, length - 3)}…` : text;
}

export function pageTitle(title) {
  return title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — This week on campus`;
}

function isPrivate(pathname) {
  return PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix)
  );
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function absoluteUrl(value, origin) {
  const image = text(value);
  if (!image) return `${origin}${DEFAULT_IMAGE}`;
  if (/^https?:\/\//i.test(image)) return image;
  return `${origin}${image.startsWith("/") ? image : `/${image}`}`;
}

/**
 * Build Event structured data only when the record has the two fields Google
 * requires: a name and a parseable start date. Partial Event markup is worse
 * than none because it reports errors in Search Console, so malformed rows get
 * the normal page metadata without a JSON-LD block.
 */
function eventJsonLd(event, pageUrl, origin, fallbackDescription) {
  const name = text(event?.title);
  const startDate = text(event?.startTime);
  const startTime = Date.parse(startDate);
  if (!name || !startDate || Number.isNaN(startTime)) return null;

  const campusName = text(event.campusName);
  const clubName = text(event.clubName);
  const clubId = text(event.clubId);
  const image = text(event.imageUrl);
  const end = new Date(startTime + 2 * 60 * 60 * 1000);
  const description = text(event.description) || text(fallbackDescription);

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name,
    ...(description ? { description } : {}),
    startDate,
    ...(Number.isNaN(end.getTime()) ? {} : { endDate: end.toISOString() }),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: pageUrl,
    location: {
      "@type": "Place",
      name: text(event.location) || campusName || "Campus",
      ...(campusName ? { address: campusName } : {}),
    },
    ...(clubName
      ? {
          organizer: {
            "@type": "Organization",
            name: clubName,
            ...(clubId ? { url: `${origin}/clubs/${encodeURIComponent(clubId)}` } : {}),
          },
        }
      : {}),
    ...(image ? { image: absoluteUrl(image, origin) } : {}),
  };
}

function metadata({
  title,
  description,
  pathname,
  origin,
  private: privatePage = false,
  image,
  jsonLd = null,
}) {
  const page = {
    title: pageTitle(title),
    description: truncate(description || DEFAULT_DESCRIPTION),
    pathname,
    origin,
    private: privatePage || isPrivate(pathname),
    image: absoluteUrl(image, origin),
    jsonLd,
  };
  return page;
}

async function defaultFetchJson(pathname) {
  const base = (process.env.API_INTERNAL_URL || "http://api:5000").replace(/\/$/, "");
  const key = process.env.PRERENDER_API_KEY || "";
  const response = await fetch(`${base}${pathname}`, {
    headers: key ? { "X-API-Key": key } : {},
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) return null;
  return response.json();
}

/**
 * Resolve a document route to its head metadata. Dynamic public pages read the
 * same records the React page will read; every failure falls back to a generic
 * route title so a crawler never gets the home-page description on a club URL.
 */
export async function resolveMetadata(pathname, origin, fetchJson = defaultFetchJson) {
  const cleanPath = pathname.replace(/\/+$/, "") || "/";
  const cacheKey = `${origin}${cleanPath}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const finish = (value) => {
    cache.set(cacheKey, { at: Date.now(), value });
    return value;
  };

  const staticRoute = STATIC_ROUTES.get(cleanPath);
  if (staticRoute) {
    return finish(metadata({ ...staticRoute, pathname: cleanPath, origin }));
  }

  let match = cleanPath.match(/^\/clubs\/([^/]+)$/);
  if (match) {
    try {
      const body = await fetchJson(`/api/v2/clubs/${encodeURIComponent(match[1])}`);
      if (body?.club) {
        const club = body.club;
        const description =
          club.description ||
          `${club.name} on ${club.campusName || "campus"} — events, commitments and posts.`;
        const pageUrl = `${origin}${cleanPath}`;
        return finish(
          metadata({
            title: club.name,
            description,
            pathname: cleanPath,
            origin,
            image: club.logoUrl,
            jsonLd: {
              "@context": "https://schema.org",
              "@type": "Organization",
              name: club.name,
              description: cleanText(description),
              url: pageUrl,
              ...(club.logoUrl ? { logo: absoluteUrl(club.logoUrl, origin) } : {}),
              ...(club.campusName ? { address: club.campusName } : {}),
            },
          })
        );
      }
    } catch {
      // Fall through to the generic club metadata.
    }
    return finish(
      metadata({
        title: "Club",
        description: "View a campus club's events, commitments and posts on Kesho.",
        pathname: cleanPath,
        origin,
      })
    );
  }

  match = cleanPath.match(/^\/events\/([^/]+)$/);
  if (match) {
    try {
      const body = await fetchJson("/api/v2/events");
      const event = body?.events?.find((candidate) => candidate.id === match[1]);
      if (event) {
        const start = text(event.startTime).replace("T", " ").slice(0, 16);
        const description = [
          text(event.clubName),
          start,
          text(event.location),
          text(event.description),
        ]
          .filter(Boolean)
          .join(" · ");
        const pageUrl = `${origin}${cleanPath}`;
        return finish(
          metadata({
            title: text(event.title) || "Event",
            description,
            pathname: cleanPath,
            origin,
            image: text(event.imageUrl),
            jsonLd: eventJsonLd(event, pageUrl, origin, description),
          })
        );
      }
    } catch {
      // Fall through to the generic event metadata.
    }
    return finish(
      metadata({
        title: "Event",
        description: "View event details and RSVP on Kesho.",
        pathname: cleanPath,
        origin,
      })
    );
  }

  match = cleanPath.match(/^\/commitments\/([^/]+)$/);
  if (match) {
    try {
      const body = await fetchJson(`/api/v2/commitments/${encodeURIComponent(match[1])}`);
      if (body?.commitment) {
        const commitment = body.commitment;
        return finish(
          metadata({
            title: commitment.title,
            description: [commitment.clubName, commitment.location, commitment.description]
              .filter(Boolean)
              .join(" · "),
            pathname: cleanPath,
            origin,
          })
        );
      }
    } catch {
      // Fall through to the generic commitment metadata.
    }
    return finish(
      metadata({
        title: "Commitment",
        description: "View a club commitment and join on Kesho.",
        pathname: cleanPath,
        origin,
      })
    );
  }

  match = cleanPath.match(/^\/posts\/([^/]+)$/);
  if (match) {
    try {
      const body = await fetchJson(`/api/v2/posts/${encodeURIComponent(match[1])}`);
      if (body?.post) {
        return finish(
          metadata({
            title: `Post from ${body.post.clubName}`,
            description: body.post.body,
            pathname: cleanPath,
            origin,
          })
        );
      }
    } catch {
      // Fall through to the generic post metadata.
    }
    return finish(
      metadata({
        title: "Post",
        description: "Read a post from a campus club on Kesho.",
        pathname: cleanPath,
        origin,
      })
    );
  }

  match = cleanPath.match(/^\/families\/([^/]+)(?:\/chapters\/[^/]+)?$/);
  if (match) {
    return finish(
      metadata({
        title: "Club family",
        description: "A shared club identity connecting chapters across campuses.",
        pathname: cleanPath,
        origin,
        private: true,
      })
    );
  }

  if (/^\/workspace\/[^/]+$/.test(cleanPath)) {
    return finish(
      metadata({
        title: "Club workspace",
        description: "Your club's private workspace.",
        pathname: cleanPath,
        origin,
        private: true,
      })
    );
  }

  if (/^\/dashboard\/[^/]+$/.test(cleanPath)) {
    return finish(
      metadata({
        title: "Club dashboard",
        description: "Manage your club's events, commitments and posts.",
        pathname: cleanPath,
        origin,
        private: true,
      })
    );
  }

  return finish(
    metadata({
      title: "Page not found",
      description: "The page you're looking for doesn't exist or may have been removed.",
      pathname: cleanPath,
      origin,
      private: true,
    })
  );
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonLdScript(value) {
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
}

/**
 * Replace the static head copy with one complete set of metadata. Removing the
 * old OG tags first prevents duplicate descriptions on repeat requests.
 */
export function injectMetadata(template, page) {
  const tags = [
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    `<meta name="robots" content="${page.private ? "noindex, nofollow" : "index, follow"}">`,
    `<link rel="canonical" href="${escapeHtml(page.origin + page.pathname)}">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:title" content="${escapeHtml(page.title)}">`,
    `<meta property="og:description" content="${escapeHtml(page.description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${escapeHtml(page.origin + page.pathname)}">`,
    `<meta property="og:image" content="${escapeHtml(page.image)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(page.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(page.image)}">`,
    ...(page.jsonLd ? [jsonLdScript(page.jsonLd)] : []),
  ];

  return template
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/[ \t]*<meta\s+name="description"[\s\S]*?>/gi, "")
    .replace(/[ \t]*<meta\s+property="og:[^"]+"[\s\S]*?>/gi, "")
    .replace("</head>", `    ${tags.join("\n    ")}\n  </head>`);
}

function requestOrigin(request) {
  const configured = process.env.SITE_URL || process.env.PUBLIC_URL;
  if (configured) return configured.replace(/\/$/, "");
  const proto = request.headers["x-forwarded-proto"] || "http";
  const host = request.headers["x-forwarded-host"] || request.headers.host || "localhost";
  return `${proto}://${host}`;
}

function send(response, status, body, method) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=0, must-revalidate",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(method === "HEAD" ? undefined : body);
}

export async function createPrerenderServer({
  htmlPath = path.join(process.cwd(), "dist/index.html"),
} = {}) {
  const template = await readFile(htmlPath, "utf8");

  return createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }

    const requestUrl = new URL(request.url, "http://prerender.local");
    if (requestUrl.pathname === "/healthz") {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("ok\n");
      return;
    }

    try {
      const origin = requestOrigin(request);
      const page = await resolveMetadata(requestUrl.pathname, origin);
      const body = injectMetadata(template, page);
      const cleanPath = requestUrl.pathname.replace(/\/+$/, "") || "/";
      const knownRoute = STATIC_ROUTES.has(cleanPath);
      const dynamicRoute =
        /^\/(clubs|events|commitments|posts|families|workspace|dashboard)\/[^/]+/.test(cleanPath);
      send(response, knownRoute || dynamicRoute ? 200 : 404, body, request.method);
    } catch (error) {
      console.error("Prerender failed:", error.message);
      send(response, 500, template, request.method);
    }
  });
}
