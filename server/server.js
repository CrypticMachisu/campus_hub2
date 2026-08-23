import "dotenv/config";
import express from "express";
import cors from "cors";
import { assertDbConnection } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { adminRequestsRouter } from "./routes/adminRequests.js";
import { clubsRouter } from "./routes/clubs.js";
import { eventsRouter } from "./routes/events.js";
import { signupsRouter } from "./routes/signups.js";
import { commentsRouter } from "./routes/comments.js";
import { announcementsRouter } from "./routes/announcements.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/admin-requests", adminRequestsRouter);
app.use("/api/clubs", clubsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/signups", signupsRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/announcements", announcementsRouter);

// Centralized error handler so a thrown/rejected error in any route
// returns clean JSON instead of an HTML stack trace or a hung request.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

const PORT = process.env.PORT || 5000;

assertDbConnection()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CampusHub API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("\nCouldn't connect to MySQL. Is XAMPP's MySQL running,");
    console.error("and does server/.env match your setup?\n");
    console.error(err.message);
    process.exit(1);
  });
