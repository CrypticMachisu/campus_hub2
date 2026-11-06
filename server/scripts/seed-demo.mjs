// Seeds the content the presentation actually shows: announcements, a club
// discussion with replies and reactions, signups that fill event-01 so the
// demo login lands on a real waitlist, and one pending admin request.
//
// Idempotent: it clears its own demo-* rows first, then re-inserts them.
// It also removes the two leftovers from the automated route tests, which
// otherwise show up as "Route test ..." entries in the live feed.
//
// Run with: npm run seed:demo   (inside server/)
// Back up first: mysqldump -u root campushub > campushub-backup.sql

import "dotenv/config";
import { pool, assertDbConnection } from "../db.js";

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

const announcements = [
  [
    "demo-ann-01",
    "club-01",
    "Room change: this week we are in the Seminar Hall, second floor.",
    daysAgo(2),
  ],
  [
    "demo-ann-02",
    "club-01",
    "Mentor sign-ups are open — reply in the thread if you can coach a novice pair.",
    daysAgo(1),
  ],
  [
    "demo-ann-03",
    "club-07",
    "Open Day on the 13th: we will walk through the AgroConnect listings and visit two farms.",
    daysAgo(0),
  ],
];

const comments = [
  [
    "demo-cm-01",
    "club",
    "club-01",
    "user-07",
    "Yuki Tanaka",
    "Bring your opening statement — novices get paired with a mentor this week.",
    null,
    1,
    daysAgo(3),
  ],
  [
    "demo-cm-02",
    "club",
    "club-01",
    "user-05",
    "Sofia Ramirez",
    "Can I bring a friend who has never debated before?",
    "demo-cm-01",
    0,
    daysAgo(2),
  ],
  [
    "demo-cm-03",
    "club",
    "club-01",
    "user-02",
    "Leo Fischer",
    "Yes — guests are welcome. We run a two-minute practice round first.",
    "demo-cm-01",
    0,
    daysAgo(2),
  ],
  [
    "demo-cm-04",
    "club",
    "club-01",
    "user-06",
    "Jamal Green",
    "Is it still the seminar hall this week?",
    null,
    0,
    daysAgo(1),
  ],
  [
    "demo-cm-05",
    "club",
    "club-01",
    "user-02",
    "Leo Fischer",
    "Same room, second floor. Look for the red door.",
    "demo-cm-04",
    0,
    daysAgo(0),
  ],
  [
    "demo-cm-06",
    "event",
    "event-01",
    "user-08",
    "Nadia Haddad",
    "First time — is there anything to prepare?",
    null,
    0,
    daysAgo(5),
  ],
  [
    "demo-cm-07",
    "event",
    "event-01",
    "user-02",
    "Leo Fischer",
    "Just bring a notebook. We hand out the motion on the night.",
    "demo-cm-06",
    0,
    daysAgo(4),
  ],
];

const reactions = [
  ["demo-cm-01", "user-05", "👍"],
  ["demo-cm-01", "user-06", "❤️"],
  ["demo-cm-01", "user-08", "🎉"],
  ["demo-cm-02", "user-07", "👍"],
];

// event-01 is capped at 4 below, so these four fill it and Sofia's live RSVP
// becomes a waitlist entry.
const signups = [
  ["demo-su-01", "event-01", "user-02", daysAgo(5)],
  ["demo-su-02", "event-01", "user-06", daysAgo(4)],
  ["demo-su-03", "event-01", "user-07", daysAgo(3)],
  ["demo-su-04", "event-01", "user-08", daysAgo(2)],
  ["demo-su-05", "event-02", "user-05", daysAgo(2)],
  ["demo-su-06", "event-13", "user-07", daysAgo(1)],
  ["demo-su-07", "event-13", "user-08", daysAgo(1)],
];

async function run() {
  await assertDbConnection();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[event]] = await conn.query("SELECT event_id FROM events WHERE event_id = 'event-01'");
    if (!event) throw new Error("event-01 is missing — load the seed schema first.");

    // Leftovers from tests/api tests, visible in the feed until removed.
    await conn.query("DELETE FROM comments WHERE comment_id = ?", ["comment-1793959839666"]);
    await conn.query("DELETE FROM events WHERE event_id = ?", ["custom-1793959839359"]);

    // Clear previous demo rows so a re-run cannot duplicate content.
    await conn.query("DELETE FROM comment_reactions WHERE comment_id LIKE 'demo-%'");
    await conn.query("DELETE FROM comments WHERE comment_id LIKE 'demo-%'");
    await conn.query("DELETE FROM announcements WHERE announcement_id LIKE 'demo-%'");
    await conn.query("DELETE FROM event_signups WHERE signup_id LIKE 'demo-%'");
    await conn.query("DELETE FROM admin_requests WHERE request_id LIKE 'demo-%'");

    // Keep the earliest event two days out, so "Next up" is never empty.
    const [[{ shift }]] = await conn.query(
      "SELECT DATEDIFF(CURDATE(), (SELECT MIN(event_date) FROM events)) + 2 AS shift"
    );
    if (Number(shift) > 0) {
      await conn.query("UPDATE events SET event_date = DATE_ADD(event_date, INTERVAL ? DAY)", [
        Number(shift),
      ]);
      console.log(`Shifted event dates forward by ${shift} day(s).`);
    }

    // Four seats, four seeded signups: the demo login joins the waitlist.
    await conn.query("UPDATE events SET capacity = 4 WHERE event_id = 'event-01'");

    for (const [id, clubId, text, createdAt] of announcements) {
      await conn.query(
        `INSERT INTO announcements (announcement_id, club_id, announcement_text, created_at)
         VALUES (?, ?, ?, ?)`,
        [id, clubId, text, createdAt]
      );
    }

    for (const comment of comments) {
      await conn.query(
        `INSERT INTO comments
           (comment_id, target_type, target_id, user_id, user_name_snapshot, comment_text, parent_id, pinned, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        comment
      );
    }

    for (const [commentId, userId, emoji] of reactions) {
      await conn.query(
        `INSERT INTO comment_reactions (comment_id, user_id, emoji, created_at)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE emoji = emoji`,
        [commentId, userId, emoji, daysAgo(1)]
      );
    }

    for (const [id, eventId, userId, createdAt] of signups) {
      await conn.query(
        `INSERT INTO event_signups
           (signup_id, event_id, user_id, name_snapshot, email_snapshot, created_at)
         SELECT ?, ?, ?, name, email, ? FROM users WHERE user_id = ?
         ON DUPLICATE KEY UPDATE signup_id = signup_id`,
        [id, eventId, userId, createdAt, userId]
      );
    }

    await conn.query(
      `INSERT INTO admin_requests (request_id, user_id, club_id, status, created_at)
       VALUES (?, ?, ?, 'pending', ?)
       ON DUPLICATE KEY UPDATE status = 'pending'`,
      ["demo-req-01", "user-07", "club-01", daysAgo(1)]
    );

    await conn.commit();

    const [[counts]] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM announcements WHERE announcement_id LIKE 'demo-%') AS announcements,
         (SELECT COUNT(*) FROM comments WHERE comment_id LIKE 'demo-%') AS comments,
         (SELECT COUNT(*) FROM event_signups WHERE event_id = 'event-01') AS event_01_signups,
         (SELECT COUNT(*) FROM admin_requests WHERE status = 'pending') AS pending_requests,
         (SELECT COUNT(*) FROM events WHERE event_id LIKE 'custom-%') AS test_events`
    );
    console.log("Demo data ready:", counts);
    console.log("Sofia joining event-01 now lands on the waitlist (capacity 4, 4 going).");
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Demo seed failed:", err.message);
  process.exit(1);
});
