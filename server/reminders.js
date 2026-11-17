// Commitment reminders by email, sent through Resend's HTTPS API.
//
// Why Resend: one request, no SDK, and a free transactional tier. The worker is
// off unless both RESEND_API_KEY and REMINDER_FROM are set, so a checkout with
// demo data can never email real students by accident. EMAIL_REMINDERS=off is
// an explicit kill switch even when keys exist.
//
// The sweep is deliberately idempotent: a signup is stamped reminder_sent_at
// only after Resend accepts the message, and the query only picks unstamped
// rows. A restart or overlapping timer therefore retries at most once, never
// twice for the same send.
import { pool } from "./db.js";

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_WINDOW_HOURS = 24;

export function reminderEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.REMINDER_FROM);
}

export function reminderEmailEnabled() {
  return reminderEmailConfigured() && process.env.EMAIL_REMINDERS !== "off";
}

function publicAppUrl() {
  return (process.env.PUBLIC_URL || "http://localhost:5173").replace(/\/+$/, "");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build the reminder for one person. Exported so the wording can be tested
 * without a network call or a database.
 */
/** "Thu 19 Nov, 08:00" from the stored East Africa wall clock. */
function formatWhen(startsLocal) {
  const [date, time = ""] = String(startsLocal).split("T");
  const [year, month, day] = date.split("-").map(Number);
  const label = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return `${label}, ${time.slice(0, 5)}`;
}

export function buildReminderEmail({ name, commitment, signupEmail }) {
  const when = formatWhen(commitment.startsLocal);
  const noticeUrl = `${publicAppUrl()}/commitments/${commitment.id}`;
  const subject = `Coming up: ${commitment.title}`;
  const text = [
    `Hi ${name || "there"},`,
    "",
    `${commitment.title} is coming up on ${when}.`,
    `Where: ${commitment.location}`,
    ...(commitment.hostName ? [`Host: ${commitment.hostName}`] : []),
    "",
    "You're receiving this because you signed up through Kesho.",
    `If your plans changed, withdraw here so someone on the waitlist can take the place: ${noticeUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family: Georgia, serif; color: #1a1a1a; line-height: 1.5; max-width: 560px">
      <p>Hi ${escapeHtml(name || "there")},</p>
      <p><strong>${escapeHtml(commitment.title)}</strong> is coming up on ${escapeHtml(when)}.</p>
      <p>Where: ${escapeHtml(commitment.location)}${
        commitment.hostName ? `<br />Host: ${escapeHtml(commitment.hostName)}` : ""
      }</p>
      <p>You&rsquo;re receiving this because you signed up through Kesho.</p>
      <p><a href="${escapeHtml(noticeUrl)}">View the notice</a> — if your plans changed, withdraw there so someone on the waitlist can take the place.</p>
    </div>
  `.trim();

  return { from: process.env.REMINDER_FROM, to: signupEmail, subject, text, html };
}

async function sendWithResend(message) {
  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend rejected the reminder (${response.status}): ${detail.slice(0, 200)}`);
  }
}

/**
 * One pass over commitments starting inside the reminder window.
 * Returns counts so a caller (or a test) can assert without reading logs.
 */
export async function runReminderSweep({ now = new Date(), windowHours } = {}) {
  if (!reminderEmailEnabled()) {
    return { sent: 0, failed: 0, reason: "disabled" };
  }

  const hours = Number(windowHours ?? process.env.REMINDER_HOURS ?? DEFAULT_WINDOW_HOURS);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 168) {
    throw new Error("REMINDER_HOURS must be between 1 and 168.");
  }

  const [commitments] = await pool.query(
    `SELECT c.commitment_id, c.title, c.location, c.host_name, c.capacity,
            DATE_FORMAT(c.starts_at, '%Y-%m-%dT%H:%i') AS starts_local
     FROM commitments c
     WHERE c.starts_at >= :now
       AND c.starts_at <= DATE_ADD(:now, INTERVAL :hours HOUR)
     ORDER BY c.starts_at, c.commitment_id`,
    { now, hours }
  );

  let sent = 0;
  let failed = 0;

  for (const row of commitments) {
    const [signups] = await pool.query(
      `SELECT signup_id, user_id, name_snapshot, email_snapshot
       FROM commitment_signups
       WHERE commitment_id = :id
         AND reminder_sent_at IS NULL
         AND email_snapshot <> ''
       ORDER BY created_at, signup_id`,
      { id: row.commitment_id }
    );

    const capacity = row.capacity == null ? null : Number(row.capacity);
    const going = capacity == null ? signups : signups.slice(0, capacity);

    for (const person of going) {
      const message = buildReminderEmail({
        name: person.name_snapshot,
        signupEmail: person.email_snapshot,
        commitment: {
          id: row.commitment_id,
          title: row.title,
          location: row.location,
          hostName: row.host_name,
          startsLocal: row.starts_local,
        },
      });

      try {
        await sendWithResend(message);
        await pool.query(
          "UPDATE commitment_signups SET reminder_sent_at = NOW() WHERE signup_id = :id",
          { id: person.signup_id }
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        console.error(`Reminder failed for ${person.email_snapshot}:`, err.message);
      }
    }
  }

  return { sent, failed, reason: null };
}

/**
 * Run a sweep now and then on an interval. Started from server.js only; the
 * timer is unref'd so it never keeps a test process alive.
 */
export function startReminderScheduler() {
  if (!reminderEmailConfigured()) {
    console.log(
      "Email reminders: off (set RESEND_API_KEY and REMINDER_FROM in server/.env to enable)"
    );
    return null;
  }
  if (process.env.EMAIL_REMINDERS === "off") {
    console.log("Email reminders: off (EMAIL_REMINDERS=off)");
    return null;
  }

  const minutes = Math.max(1, Number(process.env.REMINDER_INTERVAL_MINUTES || 10));
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const result = await runReminderSweep();
      if (result.sent || result.failed) {
        console.log(`Email reminders: ${result.sent} sent, ${result.failed} failed`);
      }
    } catch (err) {
      console.error("Email reminder sweep failed:", err.message);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(tick, minutes * 60_000);
  timer.unref();
  const first = setTimeout(tick, 15_000);
  first.unref();
  console.log(
    `Email reminders: on, every ${minutes} min, ${process.env.REMINDER_HOURS || 24}h window`
  );
  return timer;
}
