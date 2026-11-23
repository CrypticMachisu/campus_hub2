// Reminder emails without sending one: wording, escaping and the guard that
// keeps a checkout with demo data from emailing anybody.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReminderEmail,
  reminderEmailConfigured,
  reminderEmailEnabled,
  runReminderSweep,
} from "../reminders.js";

test("reminder email names the commitment, time and notice link", () => {
  const previous = process.env.PUBLIC_URL;
  process.env.PUBLIC_URL = "https://kesho.example";
  try {
    const mail = buildReminderEmail({
      name: "Sofia & Co <sofia@campus.edu>",
      signupEmail: "sofia@campus.edu",
      commitment: {
        id: "agro-opp-01",
        title: "Farm visit: Grace's tomato plot",
        location: "Kiambu",
        hostName: "Daniel Kamau",
        startsLocal: "2026-11-19T08:00",
      },
    });

    assert.equal(mail.subject, "Coming up: Farm visit: Grace's tomato plot");
    assert.equal(mail.to, "sofia@campus.edu");
    assert.match(mail.text, /Thu 19 Nov, 08:00/);
    assert.match(mail.text, /Where: Kiambu/);
    assert.match(mail.text, /https:\/\/kesho\.example\/commitments\/agro-opp-01/);
    assert.match(mail.html, /Sofia &amp; Co &lt;sofia@campus\.edu&gt;/);
    assert.doesNotMatch(mail.html, /Sofia & Co </);
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_URL;
    else process.env.PUBLIC_URL = previous;
  }
});

test("the sweep stays off until Resend and a sender are configured", async () => {
  const previous = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    REMINDER_FROM: process.env.REMINDER_FROM,
    EMAIL_REMINDERS: process.env.EMAIL_REMINDERS,
  };
  try {
    delete process.env.RESEND_API_KEY;
    delete process.env.REMINDER_FROM;
    assert.equal(reminderEmailConfigured(), false);
    assert.deepEqual(await runReminderSweep(), { sent: 0, failed: 0, reason: "disabled" });

    process.env.RESEND_API_KEY = "re_test";
    process.env.REMINDER_FROM = "Kesho <reminders@kesho.example>";
    assert.equal(reminderEmailConfigured(), true);
    process.env.EMAIL_REMINDERS = "off";
    assert.equal(reminderEmailEnabled(), false);
    assert.deepEqual(await runReminderSweep(), { sent: 0, failed: 0, reason: "disabled" });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
