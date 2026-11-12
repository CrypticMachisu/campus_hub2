// Week 13 (Part B): v1 — the API exactly as it was before versioning.
//
// FROZEN. Do not change the shape of anything in this file. The routers below
// are the ones the app already served; this file only decides where they are
// mounted. A caller that used /api/events yesterday keeps getting the same
// bytes today from /api/events, /api/v1/events and every other v1 resource.
//
// v1 is deprecated (see DEPRECATION_NOTICE.md). Every events response carries
// Deprecation / Sunset / Link headers, on the old unversioned URLs too,
// because those callers are the ones most likely not to have read the notice.
import { Router } from "express";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { adminRequestsRouter } from "./routes/adminRequests.js";
import { clubsRouter } from "./routes/clubs.js";
import { eventsRouter } from "./routes/events.js";
import { signupsRouter } from "./routes/signups.js";
import { commentsRouter } from "./routes/comments.js";
import { announcementsRouter } from "./routes/announcements.js";
import { partnerRouter } from "./routes/partner.js";
import { createAdminRouter } from "./routes/admin.js";
import { limiter } from "./middleware/apiGuards.js";
import { deprecated } from "./deprecate.js";

// The promise made in DEPRECATION_NOTICE.md. Kept in code (not .env) so the
// header, the notice and the tests cannot drift apart.
export const EVENTS_SUNSET = "2026-11-30";
export const EVENTS_SUCCESSOR = "/api/v2/events";

const old = deprecated({ sunset: EVENTS_SUNSET, successor: EVENTS_SUCCESSOR });

export const v1Router = Router();

// Mounted with `old` rather than edited inside the router: the handlers stay
// untouched, and v2 can mount the very same router without inheriting v1's
// deprecation headers.
v1Router.use("/events", old, eventsRouter);
v1Router.use("/auth", authRouter);
v1Router.use("/users", usersRouter);
v1Router.use("/admin-requests", adminRequestsRouter);
v1Router.use("/clubs", clubsRouter);
v1Router.use("/signups", signupsRouter);
v1Router.use("/comments", commentsRouter);
v1Router.use("/announcements", announcementsRouter);
v1Router.use("/partner", partnerRouter);
v1Router.use("/admin", createAdminRouter(limiter));
