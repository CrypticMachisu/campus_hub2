// Week 13 (Part B): v2 — the same API, with the new events shape.
//
// Every resource below is v1's own router, mounted again under /api/v2 so a
// consumer can point one base URL at v2 instead of mixing versions per
// endpoint. Only /events differs: it uses the v2 view, which returns one
// `startTime` timestamp instead of `date` + `time`.
//
// Keep this list in step with v1.js. If a future change adds a second
// breaking change, it gets its own v3 — v2 is frozen the day it ships.
import { Router } from "express";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { adminRequestsRouter } from "./routes/adminRequests.js";
import { clubsRouter } from "./routes/clubs.js";
import { eventsV2Router } from "./routes/eventsV2.js";
import { signupsRouter } from "./routes/signups.js";
import { commentsRouter } from "./routes/comments.js";
import { announcementsRouter } from "./routes/announcements.js";
import { agroRouter } from "./routes/agro.js";
import { commitmentsRouter } from "./routes/commitments.js";
import { notificationsRouter } from "./routes/notifications.js";
import { postsRouter } from "./routes/posts.js";
import { reportsRouter } from "./routes/reports.js";
import { createAdminRouter } from "./routes/admin.js";
import { limiter } from "./middleware/apiGuards.js";

export const v2Router = Router();

v2Router.use("/events", eventsV2Router);
v2Router.use("/auth", authRouter);
v2Router.use("/users", usersRouter);
v2Router.use("/admin-requests", adminRequestsRouter);
v2Router.use("/clubs", clubsRouter);
v2Router.use("/signups", signupsRouter);
v2Router.use("/comments", commentsRouter);
v2Router.use("/announcements", announcementsRouter);
// New resource, so it ships in v2 only: v1 is frozen and a v1 caller must
// never see a resource that was not there yesterday.
v2Router.use("/agro", agroRouter);
// Phase 2: commitments supersede agro opportunities for new clients. The agro
// routes stay mounted so nothing breaks mid-migration, but no UI calls them.
v2Router.use("/commitments", commitmentsRouter);
v2Router.use("/notifications", notificationsRouter);
v2Router.use("/posts", postsRouter);
v2Router.use("/reports", reportsRouter);
v2Router.use("/admin", createAdminRouter(limiter));
