// Week 13 (Part B): v2 of the events resource.
//
// v2 is a different view of the same data, not a second copy of the routes.
// The handlers mounted at the bottom are v1's own (validation, permissions,
// queries, status codes), so the two versions cannot drift apart. The only
// thing v2 changes is the response shape, and that lives in one function:
// toV2Event.
//
// The change: v1 sends `date` ("YYYY-MM-DD") and `time` ("HH:MM") as separate
// strings. v2 sends one ISO 8601 timestamp, `startTime`, with an explicit
// +03:00 offset (East Africa Time, the zone the stored dates are in), so a
// consumer can sort and compare events without gluing two fields together.
//
// It does NOT repair the known off-by-one in the day itself: `date` comes from
// v1's mapper (rowMappers.js, which formats a local-midnight Date with
// toISOString()), so on a host east of UTC it is already a day early, and
// startTime is built from that same string. Fixing the mapper changes v1's
// values too, so it stays a separate, announced change — see
// VERSIONING_NOTES.md §12.
import { Router } from "express";
import { eventsRouter } from "./events.js";

/** Stored event (v1 shape) -> v2 shape. The one place the breaking change lives. */
export function toV2Event(event) {
  const { date, time, ...rest } = event;
  const clock = time || "00:00";
  return { ...rest, startTime: `${date}T${clock}:00+03:00` };
}

/**
 * Rewrites a whole events response body.
 * Error bodies (`{ error }`, `{ message }`) and 204s have no `event`/`events`
 * key, so they pass through byte-for-byte unchanged.
 */
export function toV2Body(body) {
  if (!body || typeof body !== "object") return body;
  if (Array.isArray(body.events)) return { ...body, events: body.events.map(toV2Event) };
  if (body.event) return { ...body, event: toV2Event(body.event) };
  return body;
}

export const eventsV2Router = Router();

// v1's handlers call res.json with their old shape; this adapter hands the
// same body to the caller in the v2 shape. Everything else about the response
// (status, other headers) is untouched.
eventsV2Router.use((req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (body) => sendJson(toV2Body(body));
  next();
});

// The unchanged handlers, still carrying the API-key and rate-limit guards.
eventsV2Router.use(eventsRouter);
